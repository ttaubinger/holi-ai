const { schemaEngine, KNOWN_TOOLS } = require('./tools');
const { executeAgentTurn } = require('./llm');
const { handleRouterFallback } = require('./router');
const { safeJsonParse } = require('../utils/json');

const extractSendResponse = (toolCalls) => {
  const call = toolCalls.find(tc => tc.function.name === 'send_response');
  if (!call) return null;
  try {
    const parsed = safeJsonParse(call.function.arguments);
    if (parsed && typeof parsed.chat_message === 'string' && parsed.chat_message.length > 500) {
      parsed.chat_message = parsed.chat_message.substring(0, 500) + '... [Message truncated. Check Plans and Routines for details.]';
    }
    return parsed;
  } catch {
    return null;
  }
};

const getToolStatusMessage = (name, lang) => {
  if (!KNOWN_TOOLS.has(name)) return null;
  return lang === 'cs' ? 'Volám nástroje...' : 'Calling tools...';
};

const handleToolError = (error, toolCall, messages, functionName) => {
  const errorMsg = (error.message || String(error)).includes('429')
    ? 'API capacity limit reached. You MUST retry the exact same tool call with the exact same arguments in your next turn.'
    : error.message || String(error);
  messages.push({
    role: 'tool',
    tool_call_id: toolCall.id,
    name: functionName,
    content: JSON.stringify({ error: errorMsg })
  });
};

const parseFunctionArguments = (toolCall) => {
  try {
    return safeJsonParse(toolCall.function.arguments);
  } catch (_e) {
    return { error: 'Failed to parse JSON arguments', raw: toolCall.function.arguments };
  }
};

const processToolCall = async (toolCall, toolExecutor, messages, onStatus, lang) => {
  const functionName = toolCall.function.name;
  console.log(`[AI] Executing tool: ${functionName}`);
  const statusMessage = getToolStatusMessage(functionName, lang);
  if (onStatus && statusMessage) await onStatus(statusMessage);

  const functionArguments = parseFunctionArguments(toolCall);
  try {
    const result = await toolExecutor(functionName, functionArguments);
    messages.push({ role: 'tool', tool_call_id: toolCall.id, name: functionName, content: JSON.stringify(result) });
    return { name: functionName, success: !result?.error };
  } catch (error) {
    handleToolError(error, toolCall, messages, functionName);
  }
};

const getToolOrder = (name) => {
  const order = { 'upsert_user_facts': 1, 'enqueue_questions': 2, 'evaluate_current_question': 3 };
  return order[name] || 99;
};

const executeInterceptorActions = async (interceptor, toolExecutor) => {
  for (const executeAction of interceptor.execute) {
    if (executeAction.action === 'dequeue_question') {
      await toolExecutor('dequeue_question', {});
    } else if (executeAction.action === 'transition_route') {
      return { transition: executeAction.target, contextPatch: { transitionRoute: executeAction.target } };
    }
  }
};

const executeInterceptors = async (toolCalls, activeStep, toolExecutor) => {
  if (!activeStep?.interceptors?.on_tool_call) return;
  let finalResult;
  for (const toolCall of toolCalls) {
    const evalContext = { tool: { name: toolCall.function.name, arguments: toolCall.function.arguments } };
    for (const interceptor of activeStep.interceptors.on_tool_call) {
      if (schemaEngine.evaluateCondition(interceptor.match, evalContext)) {
        const result = await executeInterceptorActions(interceptor, toolExecutor);
        if (result) finalResult = result;
      }
    }
  }
  return finalResult;
};

const processAgentToolCalls = async (toolCalls, toolExecutor, messages, onStatus, lang, activeStep) => {
  console.log(`[AI] Tools requested: ${toolCalls.map(tc => tc.function.name).join(', ')}`);
  const sortedCalls = [...toolCalls].sort((a, b) => getToolOrder(a.function.name) - getToolOrder(b.function.name));
  const interceptResult = await executeInterceptors(sortedCalls, activeStep, toolExecutor);
  for (const toolCall of sortedCalls) {
    if (toolCall.function.name !== 'send_response') {
      await processToolCall(toolCall, toolExecutor, messages, onStatus, lang);
    }
  }
  return interceptResult;
};

const injectActiveStepTools = (msg, activeStep, context) => {
  let tc = msg.tool_calls || [];
  if (activeStep.hooks?.pre_execution) {
    const toolsInjected = tc.map(t => t.function.name);
    for (const hook of activeStep.hooks.pre_execution) {
      const evalContext = { ...context, tools_injected: toolsInjected };
      if (schemaEngine.evaluateCondition(hook.if, evalContext)) {
        console.log(`[AI] Auto-injecting ${hook.inject_tool_call.name} into tool calls`);
        tc.push({ id: `call_auto_inject_${Date.now()}`, type: 'function', function: { name: hook.inject_tool_call.name, arguments: '{}' } });
      }
    }
  }
  if (tc.length > 0) msg.tool_calls = tc;
};

const executeToolCallsSafely = async (msg, toolExecutor, mainMessages, onStatus, lang, activeStep, context) => {
  try {
    const interceptResult = await processAgentToolCalls(msg.tool_calls, toolExecutor, mainMessages, onStatus, lang, activeStep);
    if (interceptResult?.transition !== undefined) {
      context.lastToolCall = msg.tool_calls[msg.tool_calls.length - 1].function.name;
      if (interceptResult.contextPatch) Object.assign(context, interceptResult.contextPatch);
    }
    return interceptResult;
  } catch (e) { e.savedMessages = mainMessages; throw e; }
};

const handleStashedGreeting = (msg, sendRes, context) => {
  const finalHasEval = msg.tool_calls?.some(tc => tc.function.name === 'evaluate_current_question');
  if (finalHasEval && sendRes && !context.isQueueRouter) {
    console.log('[AI] WARNING: Agent called evaluate_current_question and send_response simultaneously. Stashing greeting and ignoring send_response to allow router to execute.');
    context.stashedGreeting = sendRes;
  }
};

const executeTurnSafely = async (apiKeys, mainMessages, apiMessages, callbacks, activeStep, context) => {
  const { onStatus, lang, onTrace } = callbacks;
  try { return await executeAgentTurn(apiKeys, apiMessages, onStatus, lang, onTrace, activeStep, context); }
  catch (e) { e.savedMessages = mainMessages; throw e; }
};

const handleAgentTurnOutput = async (msg, apiMessages, toolExecutor, mainMessages, callbacks, activeStep, context) => {
  const { onStatus, lang } = callbacks;
  const routerFallback = handleRouterFallback(msg, apiMessages, context);
  if (routerFallback) return routerFallback;
  if (!msg.tool_calls?.length) return { isDone: true, response: null };

  const sendRes = extractSendResponse(msg.tool_calls);
  handleStashedGreeting(msg, sendRes, context);
  const interceptResult = await executeToolCallsSafely(msg, toolExecutor, mainMessages, onStatus, lang, activeStep, context);
  if (interceptResult?.transition !== undefined) return { isDone: false, response: null };
  
  if (sendRes && context.stashedGreeting === sendRes) return { isDone: false, response: null };
  
  return { isDone: !!sendRes, response: sendRes || null };
};

const processAgentTurn = async (apiKeys, mainMessages, apiMessages, toolExecutor, callbacks, context, activeStep) => {
  const response = await executeTurnSafely(apiKeys, mainMessages, apiMessages, callbacks, activeStep, context);
  const msg = response.choices[0]?.message;
  injectActiveStepTools(msg, activeStep, context);
  mainMessages.push(msg);
  return await handleAgentTurnOutput(msg, apiMessages, toolExecutor, mainMessages, callbacks, activeStep, context);
};

module.exports = { processAgentTurn };
