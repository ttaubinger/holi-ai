const database = require('../../db');
const { getGroqClient } = require('../../../agent/orchestrator');
const { safeJsonParse } = require('../../../agent/utils/json');
const { getValidModel } = require('../../../agent/orchestrator/llm');
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
  const content = res.choices[0]?.message?.content;
  if (!content) {
    const call = res.choices[0]?.message?.tool_calls?.[0];
    if (call) return safeJsonParse(call.function.arguments);
    throw new Error('Groq returned no content or tool call in response.');
  }
  try {
    return safeJsonParse(content);
  } catch (e) {
    throw new Error(`Failed to parse Groq response as JSON: ${e.message}`, { cause: e });
  }
};

const extractJsonFromFunctionTags = (failedGen) => {
  let jsonStr = failedGen;
  if (failedGen.includes('<function=') && failedGen.includes('</function>')) {
    const match = failedGen.match(/<function=[^>]+>([\s\S]*?)<\/function>/);
    if (match && match[1]) {
      jsonStr = match[1];
    }
  }
  return jsonStr;
};

const recoverGroqToolError = (err) => {
  const f = err.error?.failed_generation || err.error?.error?.failed_generation;
  if (!f) throw err;
  try {
    const parsed = safeJsonParse(extractJsonFromFunctionTags(f));
    if (parsed) {
      if (parsed.arguments) return typeof parsed.arguments === 'string' ? safeJsonParse(parsed.arguments) : parsed.arguments;
      return parsed;
    }
  } catch (_e) {
    /* ignore */
  }
  throw err;
};

const getGroqToolRequest = (model, prompt, toolName, toolParams, maxTokens = 4096) => ({
  model,
  messages: [{ role: 'system', content: prompt + `\n\nCRITICAL: You MUST return a pure JSON object that satisfies this schema: ${JSON.stringify(toolParams)}\nIMPORTANT: Output raw JSON only. Do NOT wrap your response in markdown code blocks (e.g. \`\`\`json). Do NOT add any conversational text.` }],
  response_format: { type: 'json_object' },
  max_tokens: maxTokens
});

const buildTracePayload = (model, prompt, response, latencyMs) => ({
  model,
  latency_ms: latencyMs,
  prompt_tokens: response?.usage?.prompt_tokens || 0,
  completion_tokens: response?.usage?.completion_tokens || 0,
  total_tokens: response?.usage?.total_tokens || 0,
  payload_input: JSON.stringify([{ role: 'system', content: prompt }]),
  payload_output: JSON.stringify(response)
});

const traceGroqTool = async (apiKeys, userId, model, prompt, response, latencyMs) => {
  if (!apiKeys?.debugMode) return;
  try {
    await database.insertLlmTrace(apiKeys, userId, buildTracePayload(model, prompt, response, latencyMs));
  } catch (e) {
    console.error('Failed to trace groq tool:', e);
  }
};

const traceGroqToolError = async (apiKeys, userId, error, attempt, toolsName) => {
  if (!apiKeys.debugMode) return;
  await database.insertLlmTrace(apiKeys, userId, {
    model: 'error',
    latency_ms: 0,
    prompt_tokens: 0,
    completion_tokens: 0,
    total_tokens: 0,
    payload_input: JSON.stringify([{ role: 'system', content: `API Error Stack Trace. Allowed Tools: ${toolsName || 'None'}` }]),
    payload_output: JSON.stringify({ error: `ERROR (attempt ${attempt}): ${error.message || String(error)}\n\nStack:\n${error.stack || 'No stack trace'}` })
  }).catch(() => {});
};

const executeGroqToolAttempt = async (apiKeys, userId, client, req, attempt, toolName) => {
  try {
    const t0 = Date.now();
    const res = await client.chat.completions.create(req, { timeout: 60000, maxRetries: 0 });
    await traceGroqTool(apiKeys, userId, req.model, req.messages[0].content, res, Date.now() - t0);
    return { success: true, data: parseGroqToolResult(res) };
  } catch (err) {
    await traceGroqToolError(apiKeys, userId, err, attempt, toolName);
    try { return { success: true, data: recoverGroqToolError(err) }; }
    catch (e) {
      if (attempt === 3 || err.message?.includes('429') || err.message?.includes('rate limit')) throw e;
      return { success: false };
    }
  }
};

const handleGroqToolAttempt = async (apiKeys, userId, client, req, attempt, validator, toolName) => {
  const res = await executeGroqToolAttempt(apiKeys, userId, client, req, attempt, toolName);
  if (!res.success) throw new Error(`LLM Failed to generate valid tool call for ${toolName}`);
  if (validator) validator(res.data);
  return res.data;
};

const executeGroqTool = async (apiKeys, userId, client, model, prompt, toolName, toolParams, validator, maxTokens = 4096) => {
  const req = getGroqToolRequest(model, prompt, toolName, toolParams, maxTokens);
  let lastErr = null;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      return await handleGroqToolAttempt(apiKeys, userId, client, req, attempt, validator, toolName);
    } catch (err) {
      lastErr = err;
      if (err.message?.includes('429') || err.message?.includes('rate limit')) throw err;
      await traceGroqToolError(apiKeys, userId, err, attempt, toolName);
    }
    if (attempt < 3) await new Promise(r => setTimeout(r, attempt * 2000));
  }
  throw lastErr || new Error(`Failed to execute ${toolName} after 3 attempts`);
};

const parseRateLimitWait = (errorMessage) => {
  let waitMs = 0;
  const matchH = errorMessage.match(/(\d+\.?\d*)h/);
  if (matchH) waitMs += parseFloat(matchH[1]) * 3600000;
  const matchM = errorMessage.match(/(\d+\.?\d*)m(?!s)/);
  if (matchM) waitMs += parseFloat(matchM[1]) * 60000;
  const matchS = errorMessage.match(/(\d+\.?\d*)s(?!\w)/);
  if (matchS) waitMs += parseFloat(matchS[1]) * 1000;
  const minFloorMs = 65000;
  if (waitMs > 0) return Math.max(Math.ceil(waitMs) + 1000, minFloorMs);
  return minFloorMs;
};

const getRateLimitMessage = (waitMs, phase) => {
  const seconds = Math.ceil(waitMs / 1000);
  const label = phase || 'planning';
  if (seconds < 60) {
    return `I hit an AI capacity limit during ${label}. I will automatically resume in about ${seconds} seconds.`;
  }
  return `I hit an AI capacity limit during ${label}. I will automatically resume in about ${Math.ceil(seconds / 60)} minutes.`;
};

const isRateLimitError = (errorMessage) => {
  if (!errorMessage) return false;
  return errorMessage.includes('429') || errorMessage.includes('rate limit');
};

const _updateWaitStatus = async (apiKeys, jobId, status, msgOrPhase) => {
  if (!jobId) return;
  const job = await database.fetchJob(apiKeys, jobId).catch(() => null);
  if (!job && status === 'processing') throw new Error('JOB_WIPED');
  const progress = job?.result?.progress || null;
  const system_message = status === 'delayed' ? msgOrPhase : `Resuming ${msgOrPhase || 'generation'}...`;
  await database.updateJobStatus(apiKeys, jobId, status, { system_message, progress }).catch(() => {});
};

const waitForRateLimit = async (apiKeys, jobId, errorMessage, phase) => {
  const waitMs = parseRateLimitWait(errorMessage);
  await _updateWaitStatus(apiKeys, jobId, 'delayed', getRateLimitMessage(waitMs, phase));
  await new Promise(resolve => setTimeout(resolve, waitMs));
  await _updateWaitStatus(apiKeys, jobId, 'processing', phase);
};

const handleAttemptError = async (apiKeys, err, jobId, phase) => {
  const errorMessage = err.message || String(err);
  if (!isRateLimitError(errorMessage)) {
    throw new Error(`Execution failed: ${errorMessage}`, { cause: err });
  }
  await waitForRateLimit(apiKeys, jobId, errorMessage, phase);
};

const executeWithRateLimitHandling = async (apiKeys, userId, client, model, prompt, toolName, params, validator, jobId, phase, maxTokens = 4096) => {
  let attempt = 0;
  while (attempt < 10) {
    try {
      return await executeGroqTool(apiKeys, userId, client, model, prompt, toolName, params, validator, maxTokens);
    } catch (err) {
      attempt++;
      await handleAttemptError(apiKeys, err, jobId, phase);
    }
  }
  throw new Error(`Failed to execute ${toolName} after 10 rate limit retries`);
};

const buildPlanOutlinePrompt = (toolArgs) => `You are an elite, world-class coach and AI planner. Your task is to design a highly structured, comprehensive, and scientifically-backed curriculum to help the user achieve their exact goal.
Topic: ${toolArgs.topic || 'General Plan'}
Context: ${toolArgs.user_goals_and_context || ''}

CRITICAL INSTRUCTIONS:
1. You must default to using the metric system (kg, cm, liters) for all measurements, unless the user explicitly provides imperial units.
2. Extract ALL gathered user facts and summarize them clearly as a markdown bullet list in the 'user_profile_summary' field.
3. The 'description' field MUST provide a concise, 1-2 sentence high-level summary of the overall strategy. Do NOT outline all the phases here.
4. The 'plan_title' MUST be short, punchy, and concise (max 3-5 words). Example: "Rapid Weight-Loss Protocol" or "Hypertrophy Program".
5. The 'category_names' MUST be an array of distinct, actionable phases, modules, or pillars of the curriculum. You MUST break the plan down into multiple distinct categories. Do NOT return a single monolithic category representing the whole plan.`;

const validatePlanOutline = (args) => {
  if (!args || !args.plan_title || !args.description || !args.category_names || !args.user_profile_summary) {
    throw new Error('Invalid outline arguments generated');
  }
};

const buildCategoryPrompt = (catName, outline, toolArgs) => `You are an elite, world-class coach generating exhaustive, highly specific curriculum content for plan category: ${catName}.
Plan Topic: ${outline.plan_title}
Plan Context: ${toolArgs.user_goals_and_context || ''}

CRITICAL INSTRUCTIONS:
1. You must default to using the metric system (kg, cm, liters) for all measurements, unless the user explicitly provides imperial units.
2. Provide a step-by-step, actionable curriculum for this category. Give precise instructions, sets, reps, timings, dietary macros, or daily schedules as applicable. Avoid generic advice; tell the user EXACTLY what to do.
3. Use highly structured Markdown formatting. Use Headers (###), bullet points, and bold text to organize the content clearly.
4. DO NOT repeat the user's base profile facts inside this category unless specifically explaining an accommodation. Focus entirely on the actionable curriculum and routines.
5. Ensure the content directly addresses the user's specific context, preferences, and limitations.`;

const validateCategory = (args) => {
  if (!args || !args.name || !args.content) {
    throw new Error('Invalid category arguments generated');
  }
};

const getCategoryParams = () => ({
  type: 'object',
  properties: {
    name: { type: 'string' },
    content: { type: 'string' }
  },
  required: ['name', 'content']
});

const generatePlanCategories = async (apiKeys, userId, client, model, outline, factsStr, toolArgs, jobId, context) => {
  if (!context.planState.categories) context.planState.categories = [];
  const categories = context.planState.categories;
  const totalCats = outline.category_names.length || 1;
  for (let i = categories.length; i < outline.category_names.length; i++) {
    const catName = outline.category_names[i];
    const progress = 20 + Math.round((i / totalCats) * 80);
    if (jobId) await database.updateJobStatus(apiKeys, jobId, 'processing', { system_message: `Generating plan phase: ${catName}...`, progress });
    const prompt = buildCategoryPrompt(catName, outline, toolArgs) + `\n\nUSER FACTS:\n${factsStr}`;
    const catContent = await executeWithRateLimitHandling(apiKeys, userId, client, model, prompt, 'generate_category_content', getCategoryParams(), validateCategory, jobId, 'plan generation', 3000);
    categories.push(catContent);
  }
  return categories;
};

const getOutlineParams = () => ({
  type: 'object',
  properties: {
    plan_title: { type: 'string' },
    description: { type: 'string' },
    user_profile_summary: { type: 'string', description: 'A formatted summary (MUST BE A MARKDOWN BULLET LIST) of all known relevant facts about the user to place at the top of the plan.' },
    category_names: { type: 'array', items: { type: 'string' } }
  },
  required: ['plan_title', 'description', 'user_profile_summary', 'category_names']
});

const executePlanGeneration = async (apiKeys, userId, toolArgs, jobId, context) => {
  if (!context.planState) context.planState = {};
  const factsStr = (await database.fetchUserFacts(apiKeys, userId)).map(f => `- ${f.key}: ${f.value}`).join('\n');
  const client = getGroqClient(apiKeys), model = getValidModel(apiKeys.groqModel);
  let outline = context.planState.outline;
  if (!outline) {
    if (jobId) await database.updateJobStatus(apiKeys, jobId, 'processing', { system_message: 'Generating high-level plan outline...', progress: 5 });
    const outlinePrompt = buildPlanOutlinePrompt(toolArgs) + `\n\nUSER FACTS:\n${factsStr}`;
    outline = await executeWithRateLimitHandling(apiKeys, userId, client, model, outlinePrompt, 'generate_plan_outline', getOutlineParams(), validatePlanOutline, jobId, 'plan generation', 1500);
    context.planState.outline = outline;
  }
  const categories = await generatePlanCategories(apiKeys, userId, client, model, outline, factsStr, toolArgs, jobId, context);
  if (jobId) await database.updateJobStatus(apiKeys, jobId, 'processing', { system_message: 'Plan generated.', progress: 100 });
  return { plan_title: outline.plan_title, description: `${outline.user_profile_summary}\n\n${outline.description}`, categories };
};

const setPlanPendingFlag = async (apiKeys, userId, value) => {
  await database.upsertUserFacts(apiKeys, userId, [
    { key: '_plan_generation_pending', value }
  ]);
};

const finalizePlanGeneration = async (apiKeys, userId, planArgs, context) => {
  await handleUpsertActionPlan(apiKeys, userId, planArgs);
  await setPlanPendingFlag(apiKeys, userId, '');
  const msg = { headline: 'Plan Created', diagnostic_summary: '', chat_message: `Your plan "${planArgs.plan_title}" has been generated successfully! I am now generating your routines.` };
  await database.insertEpisodicMemory(apiKeys, userId, 'assistant', JSON.stringify(msg));
  if (context) delete context.planState;
};

const handleGenerateUserPlan = async (apiKeys, userId, toolArgs, jobId, context) => {
  try {
    await setPlanPendingFlag(apiKeys, userId, 'true');
    if (jobId && !context.planState) await database.updateJobStatus(apiKeys, jobId, 'processing', { system_message: 'Starting plan generation...', progress: 0 });
    const planArgs = await executePlanGeneration(apiKeys, userId, toolArgs, jobId, context);
    await finalizePlanGeneration(apiKeys, userId, planArgs, context);
    return { success: true, message: `Plan generated successfully. You MUST now call generate_user_routines with plan_title: "${planArgs.plan_title}"` };
  } catch (err) {
    traceGroqGenError(apiKeys, userId, 'generate_user_plan', err);
    throw err;
  }
};

const getStepsParams = () => ({
  type: 'object', properties: { actionable_steps: { type: 'array', items: { type: 'string' } } },
  required: ['actionable_steps']
});

const buildExtractStepsPrompt = (category) => `You are an AI planner. Your ONLY task is to read the provided Category Content and extract EVERY single actionable step or task into a JSON object containing a 'steps' array of strings.
Category Content:
${category.content}`;

const getSingleCronParams = () => ({
  type: 'object',
  properties: {
    title: { type: 'string' },
    schedule: { type: 'string', description: 'Label, e.g. "06:45 daily".' },
    cron_expression: { type: 'string' },
    category: { type: 'string', enum: ['Daily', 'Weekly', 'Monthly', 'Custom'] },
    description: { type: 'string' },
    requires_logging: { type: 'boolean' },
    log_type: { type: 'string', enum: ['number', 'boolean', 'text'] },
    log_unit: { type: 'string' }
  },
  required: ['title', 'schedule', 'cron_expression', 'category', 'description']
});

const validateSingleRoutine = (args) => {
  if (!args || !args.title || !args.schedule || !args.cron_expression || !args.category || !args.description) {
    throw new Error('Invalid single routine arguments generated');
  }
};

const buildSingleRoutinePrompt = (planTitle, catName, step) => `Create EXACTLY ONE routine for the following step.
CRITICAL RULE: You must default to using the metric system (kg, cm, liters) for all measurements unless the user explicitly provides imperial units.
Plan: ${planTitle}
Category: ${catName}
Step: ${step}`;

const slugify = (s) => s ? s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim() : '';

const getPlanArgs = async (apiKeys, userId, title) => {
  const allModules = await database.fetchActionModules(apiKeys, userId, false);
  if (!allModules || allModules.length === 0) return null;
  let match = allModules.find(m => slugify(m.module_title) === slugify(title));
  if (!match) match = allModules[allModules.length - 1]; // Fallback to ensure consistency
  return match;
};


const extractCategorySteps = async (apiKeys, userId, client, model, cat, jobId) => {
  const args = await executeWithRateLimitHandling(
    apiKeys, userId, client, model,
    buildExtractStepsPrompt(cat),
    'extract_steps', getStepsParams(), null,
    jobId, 'routine generation', 1024
  );
  return args?.actionable_steps || [];
};

const generateRoutineForStep = async (apiKeys, userId, client, model, planTitle, catName, step, jobId) => {
  const prompt = buildSingleRoutinePrompt(
    planTitle, catName, step
  );
  return await executeWithRateLimitHandling(
    apiKeys, userId, client, model, prompt,
    'create_routine', getSingleCronParams(),
    validateSingleRoutine, jobId, 'routine generation', 1500
  );
};

const processCategoryRoutines = async (apiKeys, userId, client, model, planTitle, cat, jobId, context) => {
  const st = context.routinesState;
  if (!st.steps) Object.assign(st, { steps: await extractCategorySteps(apiKeys, userId, client, model, cat, jobId), stepIndex: 0, catRoutines: [] });
  for (let i = st.stepIndex; i < st.steps.length; i++) {
    const routine = await generateRoutineForStep(apiKeys, userId, client, model, planTitle, cat.name, st.steps[i], jobId);
    if (routine) st.catRoutines.push(routine);
    st.stepIndex = i + 1;
  }
  const routines = st.catRoutines;
  delete st.steps; delete st.stepIndex; delete st.catRoutines;
  return routines;
};

const executeRoutinesGeneration = async (apiKeys, userId, toolArgs, jobId, context) => {
  if (!context.routinesState) context.routinesState = { catIndex: 0, generatedRoutines: [] };
  const planArgs = await getPlanArgs(apiKeys, userId, toolArgs.plan_title);
  if (!planArgs) throw new Error(`Plan not found: ${toolArgs.plan_title}`);
  const client = getGroqClient(apiKeys), model = getValidModel(apiKeys.groqModel);
  const routines = context.routinesState.generatedRoutines, totalCats = planArgs.categories.length || 1;
  for (let i = context.routinesState.catIndex; i < planArgs.categories.length; i++) {
    const cat = planArgs.categories[i], progress = Math.round((i / totalCats) * 100);
    if (jobId) await database.updateJobStatus(apiKeys, jobId, 'processing', { system_message: `Generating routines for ${cat.name}...`, progress });
    routines.push(...(await processCategoryRoutines(apiKeys, userId, client, model, planArgs, cat, jobId, context)));
    context.routinesState.catIndex = i + 1;
  }
  if (jobId) await database.updateJobStatus(apiKeys, jobId, 'processing', { system_message: 'Routines generated.', progress: 100 });
  return routines;
};

const setRoutinePendingFlag = async (apiKeys, userId, value) => {
  await database.upsertUserFacts(apiKeys, userId, [
    { key: '_routine_generation_pending', value }
  ]);
};

const insertRoutinesCreatedMemory = async (apiKeys, userId, planTitle) => {
  const msg = { headline: 'Routines Created', diagnostic_summary: '', chat_message: `Your routines for "${planTitle}" have been generated and scheduled successfully!` };
  await database.insertEpisodicMemory(apiKeys, userId, 'assistant', JSON.stringify(msg));
};

const upsertRoutines = async (apiKeys, userId, routines, planTitle) => {
  if (!routines.length) throw new Error('No routines were generated by the AI.');
  await Promise.all(routines.map(r => handleUpsertUserCron(apiKeys, userId, { ...r, linked_module: planTitle })));
};

const handleGenerateUserRoutines = async (apiKeys, userId, toolArgs, jobId, context) => {
  if (!toolArgs.plan_title) return { error: 'plan_title is required' };
  try {
    await setRoutinePendingFlag(apiKeys, userId, 'true');
    if (jobId && !context.routinesState) await database.updateJobStatus(apiKeys, jobId, 'processing', { system_message: 'Starting routines...', progress: 0 });
    const routines = await executeRoutinesGeneration(apiKeys, userId, toolArgs, jobId, context);
    await upsertRoutines(apiKeys, userId, routines, toolArgs.plan_title);
    await setRoutinePendingFlag(apiKeys, userId, '');
    await insertRoutinesCreatedMemory(apiKeys, userId, toolArgs.plan_title);
    delete context.routinesState;
    return { success: true, message: 'Routines successfully generated and saved.' };
  } catch (err) { traceGroqGenError(apiKeys, userId, 'generate_user_routines', err); throw err; }
};

module.exports = {
  executeGroqTool,
  handleGenerateUserPlan,
  handleGenerateUserRoutines,
  parseRateLimitWait,
  getRateLimitMessage,
  isRateLimitError
};
