const Groq = require('groq-sdk');

const getGroqClient = (apiKeys) => {
  if (!apiKeys) {
    throw new Error('Missing Groq API Key');
  }
  if (!apiKeys.groqKey) {
    throw new Error('Missing Groq API Key');
  }
  return new Groq({ apiKey: apiKeys.groqKey });
};

const buildToolDef = (name, description, parameters) => {
  return {
    type: 'function',
    function: { name, description, parameters }
  };
};



const createFetchGarminLogsTool = () => {
  return buildToolDef(
    'fetch_garmin_logs',
    'Fetch recent Garmin logs (sleep, stress, hrv, etc.)',
    {
      type: 'object',
      properties: { days: { type: 'number' } },
      required: ['days']
    }
  );
};

const createFetchActionModulesTool = () => {
  return buildToolDef(
    'fetch_action_modules',
    'Fetch active user plans/modules',
    { type: 'object', properties: {} }
  );
};

const createFetchUserCronsTool = () => {
  return buildToolDef(
    'fetch_user_crons',
    'Fetch active user routines/crons',
    { type: 'object', properties: {} }
  );
};

const createSearchEpisodicMemoryTool = () => {
  return buildToolDef(
    'search_episodic_memory',
    'Search past conversation history by semantic query',
    {
      type: 'object',
      properties: { query: { type: 'string' } },
      required: ['query']
    }
  );
};

const buildActionModuleParams = () => {
  return {
    type: 'object',
    properties: {
      module_title: { type: 'string' },
      description: { type: 'string' },
      items: { type: 'array', items: { type: 'string' } }
    },
    required: ['module_title', 'description', 'items']
  };
};

const createUpsertActionModuleTool = () => {
  return buildToolDef(
    'upsert_action_module',
    'Create/update a plan',
    buildActionModuleParams()
  );
};

const buildUserCronParams = () => {
  return {
    type: 'object',
    properties: {
      title: { type: 'string' },
      schedule: { type: 'string' },
      cron_expression: { type: 'string' },
      category: {
        type: 'string',
        enum: ['Daily', 'Weekly', 'Monthly', 'Custom'],
        description: 'Frequency category of the routine. Use Custom for anything else.'
      },
      description: { type: 'string' },
      linked_module: { type: 'string' }
    },
    required: ['title', 'schedule', 'cron_expression', 'category']
  };
};

const createUpsertUserCronTool = () => {
  return buildToolDef(
    'upsert_user_cron',
    'Create/update a routine',
    buildUserCronParams()
  );
};

const buildQuestionsItemDef = () => {
  return {
    type: 'object',
    properties: {
      category: { type: 'string' },
      question: { type: 'string' }
    },
    required: ['category', 'question']
  };
};

const buildQueueQuestionsParams = () => {
  return {
    type: 'object',
    properties: {
      questions: { type: 'array', items: buildQuestionsItemDef() }
    },
    required: ['questions']
  };
};

const createQueueAssessmentQuestionsTool = () => {
  return buildToolDef(
    'queue_assessment_questions',
    'Queue multiple questions to ask the user later, categorized by topic',
    buildQueueQuestionsParams()
  );
};

const createEvolveCoachPromptTool = () => {
  return buildToolDef(
    'evolve_coach_prompt',
    'Rewrite coach goals',
    {
      type: 'object',
      properties: { evolved_prompt: { type: 'string' } },
      required: ['evolved_prompt']
    }
  );
};

const createUpsertUserFactTool = () => {
  return buildToolDef(
    'upsert_user_fact',
    'Store a fact',
    {
      type: 'object',
      properties: { key: { type: 'string' }, value: { type: 'string' } },
      required: ['key', 'value']
    }
  );
};

const getAgentTools = () => {
  return [
    createFetchGarminLogsTool(),
    createFetchActionModulesTool(),
    createFetchUserCronsTool(),
    createSearchEpisodicMemoryTool(),
    createUpsertActionModuleTool(),
    createUpsertUserCronTool(),
    createQueueAssessmentQuestionsTool(),
    createEvolveCoachPromptTool(),
    createUpsertUserFactTool()
  ];
};

const executeAgentTurn = async (apiKeys, messages) => {
  const client = getGroqClient(apiKeys);
  const selectedModel = apiKeys.groqModel || 'llama-3.3-70b-versatile';
  return await client.chat.completions.create({
    messages: messages,
    model: selectedModel,
    tools: getAgentTools(),
    tool_choice: 'auto'
  });
};

const processToolCall = async (toolCall, toolExecutor, messages) => {
  const functionName = toolCall.function.name;
  const functionArguments = JSON.parse(toolCall.function.arguments);
  const result = await toolExecutor(functionName, functionArguments);
  messages.push({
    role: 'tool',
    tool_call_id: toolCall.id,
    name: functionName,
    content: JSON.stringify(result)
  });
};

const processAgentTurn = async (apiKeys, messages, toolExecutor) => {
  const response = await executeAgentTurn(apiKeys, messages);
  const assistantMessage = response.choices[0]?.message;
  messages.push(assistantMessage);
  if (!assistantMessage.tool_calls || assistantMessage.tool_calls.length === 0) {
    return { isDone: true, content: assistantMessage.content || '' };
  }
  for (const toolCall of assistantMessage.tool_calls) {
    await processToolCall(toolCall, toolExecutor, messages);
  }
  return { isDone: false, content: '' };
};

const executeToolLoop = async (apiKeys, messages, toolExecutor) => {
  for (let iteration = 0; iteration < 10; iteration++) {
    const turnResult = await processAgentTurn(apiKeys, messages, toolExecutor);
    if (turnResult.isDone) {
      return turnResult.content;
    }
  }
  return 'Agent loop limit reached.';
};

const formatUserFacts = (facts) => {
  if (!facts || facts.length === 0) return '';
  const factsList = facts.map(f => `- ${f.key}: ${f.value}`).join('\n');
  return `\nUSER KNOWLEDGE BASE:\n${factsList}\n`;
};

const buildSystemPrompt = (prompt, language, facts) => {
  const coachPrompt = prompt || 'You are an elite holistic coach.';
  const languageRule = language === 'cs' ? 'CRITICAL: output in Czech (Čeština).' : 'CRITICAL: output in English.';
  const factsContext = formatUserFacts(facts);
  const behaviorRule = "CRITICAL BEHAVIOR: Always consult your USER KNOWLEDGE BASE first. If the information is not there, use tools to search episodic memory or fetch garmin logs. Do not hallucinate metrics. If giving advice, use 'upsert_action_module' to save it as a plan. Before queueing assessment questions, you MUST check all relevant data sources. Only send final chat message after gathering context and taking actions.";
  return `${coachPrompt}\n${languageRule}${factsContext}\n${behaviorRule}`;
};

const buildMessages = (systemPrompt, history, userMessage) => {
  const historyMessages = history.map(h => ({ role: h.role, content: h.message }));
  return [
    { role: 'system', content: systemPrompt },
    ...historyMessages,
    { role: 'user', content: userMessage }
  ];
};

const executeAgentWorkflow = async (apiKeys, userMessage, prompt, history, language, toolExecutor, facts) => {
  const systemPrompt = buildSystemPrompt(prompt, language, facts);
  const messages = buildMessages(systemPrompt, history, userMessage);
  return await executeToolLoop(apiKeys, messages, toolExecutor);
};

module.exports = { executeAgentWorkflow };
