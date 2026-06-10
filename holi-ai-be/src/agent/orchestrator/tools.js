const SchemaEngine = require('../schemaEngine');
const schemaEngine = new SchemaEngine();

const buildToolDef = (name, description, parameters) => ({ type: 'function', function: { name, description, parameters } });

const createFetchActionPlansTool = () => buildToolDef('fetch_action_plans', 'Fetch the user\'s current coaching plan modules. ALWAYS call this before adding or modifying a plan to understand their current setup and avoid duplicates.', { type: 'object', properties: {} });

const createFetchActionPlanCategoriesTool = () => buildToolDef('fetch_action_plan_categories', 'Fetch the list of category names for a specific plan. You must call this before fetching specific category content.', { type: 'object', properties: { plan_title: { type: 'string', description: 'Title of the action plan' } }, required: ['plan_title'] });

const createFetchActionPlanCategoryTool = () => buildToolDef('fetch_action_plan_category', 'Fetch the detailed text content for a specific category within a plan. Useful when you need to surgically update or append to an existing plan without losing data.', { type: 'object', properties: { plan_title: { type: 'string', description: 'Title of the action plan' }, category_name: { type: 'string', description: 'Name of the specific category to fetch' } }, required: ['plan_title', 'category_name'] });

const ACTION_PLAN_PARAMS = { type: 'object', properties: { plan_title: { type: 'string' }, description: { type: 'string', description: 'CRITICAL: Must not be vague. Must be an actionable task with a detailed description of what to do. Specificity is key so the user does not need to guess.' }, categories: { type: 'array', items: { type: 'object', properties: { name: { type: 'string', description: 'Name of the category' }, content: { type: 'string', description: 'Actionable steps formatted beautifully using Markdown tables, headers, and bullet points. NEVER just output a simple bulleted list. Keep chat messages brief — save detailed content here.' } }, required: ['name', 'content'] }, description: 'Categories of the plan.' } }, required: ['plan_title', 'description', 'categories'] };

const buildActionPlanParams = () => ACTION_PLAN_PARAMS;

const createUpsertActionPlanTool = () => buildToolDef('upsert_action_plan', 'CRITICAL: Use this to generate a comprehensive, massive new plan from scratch, OR to surgically update/merge changes into an existing plan. When generating a new plan, ensure descriptions are highly specific and actionable tasks detailing exactly what to do. Avoid vague descriptions. Reuse the exact same plan_title to update an existing plan. Call fetch_action_plan_category for specific categories you need to update so you can merge safely.', buildActionPlanParams());

const createFetchUserCronsTool = () => buildToolDef('fetch_user_crons', 'Fetch the user\'s currently scheduled routines, daily habits, and tracking tasks. ALWAYS call this before creating or updating crons.', { type: 'object', properties: {} });

const createEnqueueQuestionsTool = () => buildToolDef('enqueue_questions', 'Add new questions to the end of the question queue. Use this whenever you realize you need more information from the user.', { type: 'object', properties: { questions: { type: 'array', items: { type: 'object', properties: { question_id: { type: 'string' }, question: { type: 'string' } }, required: ['question'] } } }, required: ['questions'] });

const createEvaluateCurrentQuestionTool = () => buildToolDef('evaluate_current_question', 'Peek at the first question in the queue and run a memory search to see if it is already answered. Call this when you are ready to process the queue.', { type: 'object', properties: {} });

const USER_CRON_PARAMS = { type: 'object', properties: { crons: { type: 'array', items: { type: 'object', properties: { title: { type: 'string' }, schedule: { type: 'string' }, cron_expression: { type: 'string' }, category: { type: 'string', enum: ['Daily', 'Weekly', 'Monthly', 'Custom'], description: 'Frequency category of the routine.' }, description: { type: 'string', description: 'CRITICAL: Must not be vague. Must be an actionable task with a detailed description of what to do. Specificity is key so the user does not need to guess.' }, linked_module: { type: 'string' }, requires_logging: { type: 'boolean', description: 'Set to true if this routine requires the user to log a measurable activity.' }, log_type: { type: 'string', enum: ['number', 'boolean', 'text'], description: 'Type of value to log. Use number for counts, boolean for yes/no.' }, log_unit: { type: 'string', description: 'Unit for the log value. Leave empty for booleans.' } }, required: ['title', 'schedule', 'cron_expression', 'category'] } } }, required: ['crons'] };

const buildUserCronParams = () => USER_CRON_PARAMS;

const createUpsertUserCronTool = () => buildToolDef('upsert_user_cron', 'CRITICAL: Use this to create exhaustive routines for the user. You MUST create at least one routine for EVERY SINGLE actionable step identified in the linked plan (module). Descriptions must be at least 2-3 sentences explaining exactly what to do, how to do it, and why it matters. Set requires_logging=true with log_type and log_unit for any measurable habit. Also use this to tweak existing routines.', buildUserCronParams());

const createEvolveCoachPromptTool = () => buildToolDef('evolve_coach_prompt', 'Rewrite the coach personality and goals based on new information from the user.', { type: 'object', properties: { evolved_prompt: { type: 'string' } }, required: ['evolved_prompt'] });

const UPSERT_USER_FACTS_TOOL_PARAMS = { type: 'object', properties: { facts: { type: 'array', items: { type: 'object', properties: { key: { type: 'string' }, value: { type: 'string' } }, required: ['key', 'value'] } } }, required: ['facts'] };

const createUpsertUserFactsTool = () => buildToolDef('upsert_user_facts', 'Store persistent key-value facts about the user. You MUST use this to save ANY important or defining details about the user as soon as they mention it. You can save multiple facts at once.', UPSERT_USER_FACTS_TOOL_PARAMS);

const buildChatMessageDescription = (language) => `Your direct conversational reply to the user. CRITICAL: output strictly in ${language === 'cs' ? 'Czech (Čeština)' : 'English'}. Use markdown formatting where appropriate. CRITICAL: NEVER include massive plans or routines here. Keep this extremely brief and save the details using background tools.`;

const SEND_RESPONSE_TOOL_PARAMS = (language) => ({ type: 'object', properties: { headline: { type: 'string', description: 'A short dashboard headline reflecting the user\'s current coaching status.' }, diagnostic_summary: { type: 'string', description: 'A one-sentence dashboard summary of where the user stands.' }, chat_message: { type: 'string', description: buildChatMessageDescription(language) } }, required: ['headline', 'diagnostic_summary', 'chat_message'] });

const createSendResponseTool = (language) => buildToolDef('send_response', 'Send your final response to the user. Call this exactly ONCE at the end of your turn, after all other tool calls are complete. Never call this mid-turn.', SEND_RESPONSE_TOOL_PARAMS(language));

const GENERATE_USER_PLAN_PARAMS = { type: 'object', properties: { topic: { type: 'string', description: 'The main title or topic of the plan.' }, user_goals_and_context: { type: 'string', description: 'A comprehensive summary of the user\'s goals, preferences, and relevant facts to guide the plan generation.' } }, required: ['topic', 'user_goals_and_context'] };

const createGenerateUserPlanTool = () => buildToolDef('generate_user_plan', 'Generate a massive new plan from scratch based on the user goals. CRITICAL: Call this ONLY AFTER you have fully interviewed the user, gathered enough context, and the question queue is empty. You MUST call generate_user_routines immediately in the next step to finish.', GENERATE_USER_PLAN_PARAMS);

const GENERATE_USER_ROUTINES_PARAMS = { type: 'object', properties: { plan_title: { type: 'string', description: 'The title of the plan module to generate routines for.' } }, required: ['plan_title'] };

const createGenerateUserRoutinesTool = () => buildToolDef('generate_user_routines', 'Generate exhaustive routines based on a previously generated plan. Call this immediately after generate_user_plan succeeds.', GENERATE_USER_ROUTINES_PARAMS);

const toolFactory = {
  'fetch_action_plans': () => createFetchActionPlansTool(),
  'fetch_action_plan_categories': () => createFetchActionPlanCategoriesTool(),
  'fetch_action_plan_category': () => createFetchActionPlanCategoryTool(),
  'upsert_action_plan': () => createUpsertActionPlanTool(),
  'fetch_user_crons': () => createFetchUserCronsTool(),
  'upsert_user_cron': () => createUpsertUserCronTool(),
  'enqueue_questions': () => createEnqueueQuestionsTool(),
  'evaluate_current_question': () => createEvaluateCurrentQuestionTool(),
  'evolve_coach_prompt': () => createEvolveCoachPromptTool(),
  'upsert_user_facts': () => createUpsertUserFactsTool(),
  'send_response': (lang) => createSendResponseTool(lang),
  'generate_user_plan': () => createGenerateUserPlanTool(),
  'generate_user_routines': () => createGenerateUserRoutinesTool()
};

const KNOWN_TOOLS = new Set(Object.keys(toolFactory));

const resolveToolNames = (activeStep, context) => {
  let toolNames = [...(activeStep.tools.allow || [])];
  if (activeStep.tools.dynamic_allow) {
    toolNames = toolNames.concat(schemaEngine.evaluateDynamicTools(activeStep.tools.dynamic_allow, context));
  }
  return [...new Set(toolNames)];
};

const mapToolNameToDef = (name, lang) => {
  if (name === 'send_response') return toolFactory[name](lang);
  if (toolFactory[name]) return toolFactory[name]();
  throw new Error(`Tool not found in factory: ${name}`);
};

const getAgentTools = (activeStep, context, lang) => {
  if (!activeStep || !activeStep.tools) return [];
  return resolveToolNames(activeStep, context).map(name => mapToolNameToDef(name, lang));
};

module.exports = { buildActionPlanParams, buildUserCronParams, KNOWN_TOOLS, getAgentTools, schemaEngine };
