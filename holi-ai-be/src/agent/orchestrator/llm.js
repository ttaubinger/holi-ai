const Groq = require('groq-sdk');
const { getAgentTools } = require('./tools');
const { safeJsonParse } = require('../utils/json');

const getGroqClient = (apiKeys) => {
  return new Groq({ apiKey: apiKeys.groqKey || process.env.GROQ_API_KEY });
};

const onGroqTrace = async (response, messages, selectedModel, latency, onTrace) => {
  if (!onTrace) return;
  await onTrace({
    model: selectedModel,
    latency_ms: latency,
    prompt_tokens: response.usage?.prompt_tokens,
    completion_tokens: response.usage?.completion_tokens,
    total_tokens: response.usage?.total_tokens,
    payload_input: JSON.stringify(messages),
    payload_output: JSON.stringify(response.choices[0]?.message)
  });
};

const traceGroqError = async (error, attempt, errorMessage, onTrace, apiKeys, tools) => {
  if (!onTrace || !apiKeys?.debugMode) return;
  error.hasBeenTraced = true;
  const allowedTools = tools ? tools.map(t => t.function.name).join(', ') : 'None';
  await onTrace({
    model: 'error',
    latency_ms: 0,
    prompt_tokens: 0,
    completion_tokens: 0,
    total_tokens: 0,
    payload_input: JSON.stringify([{ role: 'system', content: `API Error Stack Trace. Allowed Tools: ${allowedTools}` }]),
    payload_output: JSON.stringify({ error: `ERROR (attempt ${attempt}): ${errorMessage}\n\nStack:\n${error.stack || 'No stack trace'}` })
  });
};

const checkRateLimitError = (errorMessage, attempt, maxAttempts, error, messages) => {
  const isRateLimit = errorMessage.includes('429') || errorMessage.includes('413') || errorMessage.includes('rate_limit') || errorMessage.includes('TPM');
  if (isRateLimit || attempt === maxAttempts) {
    error.isRateLimit = isRateLimit;
    error.savedMessages = messages;
    throw error;
  }
};

const handleGroqError = async (error, messages, attempt, maxAttempts, lang, onStatus, onTrace, apiKeys, tools) => {
  const errorMessage = error.message || String(error);
  await traceGroqError(error, attempt, errorMessage, onTrace, apiKeys, tools);
  checkRateLimitError(errorMessage, attempt, maxAttempts, error, messages);
  console.warn(`[AI] Groq API error on attempt ${attempt}:`, errorMessage);
  if (onStatus) {
    const retryMsg = lang === 'cs' ? `Síťová chyba, zkouším to znovu (pokus ${attempt + 1})...` : `Network glitch, retrying (attempt ${attempt + 1})...`;
    await onStatus(retryMsg);
  }
  await new Promise(r => setTimeout(r, attempt * 2000));
};

const createRecoveryResponse = (args) => ({
  choices: [{ message: { role: 'assistant', content: null, tool_calls: [{ id: `call_rec_${Date.now()}`, type: 'function', function: { name: 'send_response', arguments: JSON.stringify(args) } }] } }]
});

const extractFailedGeneration = (error) => {
  const fg = error?.error?.failed_generation;
  if (fg) return fg;
  const match = error.message?.match(/"failed_generation":"(.*)"}/);
  return match ? safeJsonParse(`"${match[1]}"`) : null;
};

const logAndRecover = (msg, data) => {
  console.log(`[AI] Recovering from Groq ${msg}`);
  return createRecoveryResponse(data);
};

const recoverFromHallucination = (error) => {
  const failedStr = extractFailedGeneration(error);
  if (!failedStr) return null;
  try {
    const parsed = safeJsonParse(failedStr);
    if (parsed.name === 'json' && parsed.arguments?.chat_message) return logAndRecover('"json" tool hallucination', parsed.arguments);
    if (parsed.chat_message) return logAndRecover('missing-tool hallucination', parsed);
  } catch (_e) { /* Ignore */ }
  return null;
};

const patchMissingToolCall = (msg) => {
  if (!msg || !msg.content || (msg.tool_calls?.length > 0)) return;
  try {
    const parsed = typeof msg.content === 'string' ? JSON.parse(msg.content) : null;
    if (parsed && typeof parsed === 'object' && ('chat_message' in parsed || 'headline' in parsed)) {
      msg.tool_calls = [{ id: `call_${Date.now()}_patched`, type: 'function', function: { name: 'send_response', arguments: msg.content } }];
      msg.content = null;
    }
  } catch (_e) { /* Ignore */ }
};

const createGroqCompletion = (client, model, messages, tools, tool_choice) => {
  return client.chat.completions.create(
    { messages, model, tools, tool_choice, max_tokens: 4096 },
    { timeout: 30000, maxRetries: 0 }
  );
};

const executeAttempt = async (client, model, attempt, apiKeys, messages, onStatus, lang, onTrace, activeStep, ctx) => {
  const startTime = Date.now();
  const tools = getAgentTools(activeStep, ctx, lang);
  try {
    const response = await createGroqCompletion(client, model, messages, tools, activeStep?.force_tool_choice || 'auto');
    patchMissingToolCall(response.choices[0]?.message);
    await onGroqTrace(response, messages, model, Date.now() - startTime, onTrace);
    return response;
  } catch (error) { 
    const recovered = recoverFromHallucination(error);
    if (recovered) return recovered;
    await handleGroqError(error, messages, attempt, 3, lang, onStatus, onTrace, apiKeys, tools); 
    return null;
  }
};

const executeAgentTurn = async (apiKeys, messages, onStatus, lang, onTrace, activeStep, context) => {
  const client = getGroqClient(apiKeys);
  const selectedModel = apiKeys.groqModel || 'llama-3.3-70b-versatile';
  for (let attempt = 1; attempt <= 3; attempt++) {
    const res = await executeAttempt(client, selectedModel, attempt, apiKeys, messages, onStatus, lang, onTrace, activeStep, context);
    if (res) return res;
  }
};

module.exports = { getGroqClient, executeAgentTurn };
