const database = require('../../db');
const { getGroqClient, buildActionPlanParams, buildUserCronParams } = require('../../../agent/orchestrator');
const { safeJsonParse } = require('../../../agent/utils/json');
const { handleUpsertActionPlan, handleUpsertUserCron } = require('./dbUpsert');

const traceGroqGenError = (apiKeys, userId, toolName, error) => {
  database.insertLlmTrace(apiKeys, userId, {
    model: `error-${toolName}`,
    latency_ms: 0,
    prompt_tokens: 0,
    completion_tokens: 0,
    total_tokens: 0,
    payload_input: JSON.stringify([{ role: 'system', content: `Secondary Groq call for ${toolName}` }]),
    payload_output: JSON.stringify({ error: `${error.message || String(error)}\n\nStack:\n${error.stack || 'No stack trace'}` })
  }).catch(e => console.error('[AI] Failed to save groqGen trace:', e.message));
};

const parseGroqToolResult = (res) => {
  const call = res.choices[0]?.message?.tool_calls?.[0];
  if (!call) throw new Error('Groq returned no tool call in response.');
  try {
    return safeJsonParse(call.function.arguments);
  } catch (e) {
    throw new Error(`Failed to parse Groq tool arguments: ${e.message}`, { cause: e });
  }
};

const recoverGroqToolError = (error) => {
  const failedGen = error.error?.failed_generation || error.error?.error?.failed_generation;
  if (!failedGen) throw error;
  try {
    const parsed = safeJsonParse(failedGen);
    if (parsed && parsed.arguments) {
      return typeof parsed.arguments === 'string' ? safeJsonParse(parsed.arguments) : parsed.arguments;
    }
  } catch (_e) {
    // ignore
  }
  throw error;
};

const getGroqToolRequest = (model, prompt, toolName, toolParams) => ({
  model,
  messages: [{ role: 'system', content: prompt }],
  tools: [{ type: 'function', function: { name: toolName, parameters: toolParams } }],
  tool_choice: { type: 'function', function: { name: toolName } },
  max_tokens: 4096
});

const executeGroqToolAttempt = async (client, req, attempt) => {
  try {
    const res = await client.chat.completions.create(req, { timeout: 60000, maxRetries: 0 });
    return { success: true, data: parseGroqToolResult(res) };
  } catch (error) {
    try {
      return { success: true, data: recoverGroqToolError(error) };
    } catch (recoveryError) {
      if (attempt === 3) throw recoveryError;
      return { success: false };
    }
  }
};

const executeGroqTool = async (client, model, prompt, toolName, toolParams) => {
  const req = getGroqToolRequest(model, prompt, toolName, toolParams);
  for (let attempt = 1; attempt <= 3; attempt++) {
    const res = await executeGroqToolAttempt(client, req, attempt);
    if (res.success) return res.data;
    await new Promise(r => setTimeout(r, attempt * 2000));
  }
};

const buildPlanPrompt = (toolArgs) => `You are a specialized AI planner. Create a comprehensive, massive plan from scratch based on the user's goals and context.
CRITICAL: Descriptions MUST be highly specific and actionable tasks detailing exactly what to do. Avoid vague descriptions.
Topic: ${toolArgs.topic || 'General Plan'}
Context: ${toolArgs.user_goals_and_context || ''}`;

const handleGenerateUserPlan = async (apiKeys, userId, toolArgs) => {
  try {
    const facts = await database.fetchUserFacts(apiKeys, userId);
    const factsStr = facts.map(f => `- ${f.key}: ${f.value}`).join('\n');
    const prompt = buildPlanPrompt(toolArgs) + `\n\nUSER FACTS:\n${factsStr}`;
    const model = apiKeys.groqModel || 'llama-3.3-70b-versatile';
    const planArgs = await executeGroqTool(getGroqClient(apiKeys), model, prompt, 'upsert_action_plan', buildActionPlanParams());
    await handleUpsertActionPlan(apiKeys, userId, planArgs);
    return { success: true, message: `Plan generated successfully. You MUST now call generate_user_routines with plan_title: "${planArgs.plan_title}"` };
  } catch (err) {
    traceGroqGenError(apiKeys, userId, 'generate_user_plan', err);
    throw err;
  }
};

const buildRoutinePrompt = (planArgs) => `You are a specialized AI routine creator. Your ONLY task is to create exhaustive routines based on the exact provided Plan.
CRITICAL: You MUST create at least one routine for EVERY SINGLE actionable step identified in the linked plan. Do not skip any.
CRITICAL: Descriptions must be at least 2-3 sentences explaining exactly what to do, how to do it, and why it matters.
Linked Plan Title: ${planArgs.module_title}

Plan Content:
${JSON.stringify(planArgs.categories, null, 2)}`;

const getPlanArgs = async (apiKeys, userId, title) => {
  const allModules = await database.fetchActionModules(apiKeys, userId, false);
  return allModules.find(m => m.module_title.toLowerCase() === title.toLowerCase());
};

const processRoutines = async (apiKeys, userId, planArgs, args) => {
  if (!args || !args.crons) throw new Error('Routine generation returned no crons.');
  if (args.crons.length === 0) return;
  args.crons = args.crons.map(c => ({ ...c, linked_module: planArgs.module_title }));
  await handleUpsertUserCron(apiKeys, userId, args);
};

const handleGenerateUserRoutines = async (apiKeys, userId, toolArgs) => {
  if (!toolArgs.plan_title) return { error: 'plan_title is required' };
  const planArgs = await getPlanArgs(apiKeys, userId, toolArgs.plan_title);
  if (!planArgs) return { error: `Plan not found: ${toolArgs.plan_title}` };
  try {
    const model = apiKeys.groqModel || 'llama-3.3-70b-versatile';
    const args = await executeGroqTool(getGroqClient(apiKeys), model, buildRoutinePrompt(planArgs), 'upsert_user_cron', buildUserCronParams());
    await processRoutines(apiKeys, userId, planArgs, args);
    return { success: true, message: 'Routines successfully generated and saved.' };
  } catch (err) {
    traceGroqGenError(apiKeys, userId, 'generate_user_routines', err);
    throw err;
  }
};

module.exports = {
  executeGroqTool,
  handleGenerateUserPlan,
  handleGenerateUserRoutines
};
