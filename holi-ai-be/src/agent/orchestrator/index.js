const { schemaEngine, buildActionPlanParams, buildUserCronParams } = require('./tools');
const { getGroqClient } = require('./llm');
const { processAgentTurn } = require('./turnProcessor');

const getPendingQuestions = (lastMsg) => {
  try {
    const data = JSON.parse(lastMsg.content);
    return data.question || 'Unknown';
  } catch {
    return 'Unknown';
  }
};

const { safeJsonParse } = require('../utils/json');

const parseAgentFallback = (fallbackText) => {
  try {
    const parsed = safeJsonParse(fallbackText);
    if (parsed && typeof parsed.chat_message === 'string') {
      if (parsed.chat_message.length > 500) {
        parsed.chat_message = parsed.chat_message.substring(0, 500) + '... [Message truncated. Check Plans and Routines for details.]';
      }
      return parsed;
    }
  } catch {
    return null;
  }
  return null;
};

const isRawToolCallDump = (text) => {
  return text.startsWith('{') && (text.includes('"name"') || text.includes('"arguments"'));
};


const resolveFallbackText = (fallbackText) => {
  if (isRawToolCallDump(fallbackText)) {
    const parsed = parseAgentFallback(fallbackText);
    return parsed || { headline: 'Update', diagnostic_summary: '', chat_message: 'I processed your request. Check Plans for details.' };
  }
  const parsedFallback = parseAgentFallback(fallbackText);
  return parsedFallback && parsedFallback.chat_message ? parsedFallback : { headline: 'Update', diagnostic_summary: '', chat_message: fallbackText || 'I processed your request.' };
};

const applyStashedGreeting = (context, finalRes) => {
  if (!context?.stashedGreeting || !finalRes) return finalRes;
  
  if (finalRes.chat_message && finalRes.chat_message.includes(context.stashedGreeting.chat_message)) {
    return finalRes;
  }

  finalRes.chat_message = context.stashedGreeting.chat_message + '\n\n' + finalRes.chat_message;
  if (context.stashedGreeting.headline && context.stashedGreeting.headline !== 'Update') {
    finalRes.headline = context.stashedGreeting.headline;
  }
  return finalRes;
};

const handleLoopDone = (turnResult, messages, context) => {
  let finalRes = turnResult.response;
  if (!finalRes) {
    const fallbackText = messages[messages.length - 1]?.content || '';
    finalRes = resolveFallbackText(fallbackText);
  }
  return applyStashedGreeting(context, finalRes);
};

const findEvaluateResponse = (messages) => {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m.role !== 'tool') break;
    if (m.name === 'evaluate_current_question' || m.name === 'dequeue_question') return m;
  }
  return null;
};

const updateNewFacts = (newFacts, args) => {
  if (!args.facts) return;
  for (const f of args.facts) {
    const existingIdx = newFacts.findIndex(x => x.key === f.key);
    if (existingIdx >= 0) newFacts[existingIdx] = f;
    else newFacts.push(f);
  }
};

const extractNewFactsFromMessages = (baseFacts, messages) => {
  const newFacts = [...(baseFacts || [])];
  for (const msg of messages) {
    if (msg.role !== 'assistant' || !msg.tool_calls) continue;
    for (const tc of msg.tool_calls) {
      if (tc.function.name === 'upsert_user_facts') {
        try { updateNewFacts(newFacts, safeJsonParse(tc.function.arguments)); } 
        catch (e) { console.error(e); }
      }
    }
  }
  return newFacts;
};

const processEnqueueArgs = (tc, newQueue) => {
  if (tc.function.name !== 'enqueue_questions') return;
  try {
    const args = safeJsonParse(tc.function.arguments);
    if (args?.questions) newQueue.push(...args.questions.map(q => typeof q === 'string' ? { question: q } : q));
  } catch (_) { /* ignore parse error */ }
};

const simulateQuestionQueue = (baseQueue, messages) => {
  let newQueue = [...(baseQueue || [])];
  for (const msg of messages) {
    if (msg.role === 'assistant' && msg.tool_calls) {
      msg.tool_calls.forEach(tc => processEnqueueArgs(tc, newQueue));
    } else if (msg.role === 'tool' && (msg.name === 'evaluate_current_question' || msg.name === 'dequeue_question')) {
      newQueue.shift();
    }
  }
  return newQueue;
};

const formatUserFacts = (facts) => {
  if (!facts || facts.length === 0) return '';
  return facts.map(f => `${f.key}: ${f.value}`).join('\n');
};

const getSystemContent = (globalPrompt, stepContent) => globalPrompt ? `${globalPrompt}\n\n${stepContent}` : stepContent;

const getIterationMessages = (messages, activeStep, context, iteration) => {
  if (activeStep.user_message_override) {
    const globalPrompt = (messages.length > 0 && messages[0].role === 'system') ? messages[0].content : '';
    return [
      { role: 'system', content: getSystemContent(globalPrompt, schemaEngine.renderTemplate(activeStep.prompt, context)) },
      { role: 'user', content: schemaEngine.renderTemplate(activeStep.user_message_override, context) }
    ];
  }
  const apiMessages = [...messages];
  const sysIdx = apiMessages.findIndex(m => m.role === 'system');
  if (sysIdx >= 0) apiMessages[sysIdx] = { role: 'system', content: getSystemContent(apiMessages[sysIdx].content, (iteration > 0 && activeStep.subsequent_turn_prompt) ? activeStep.subsequent_turn_prompt : schemaEngine.renderTemplate(activeStep.prompt, context)) };
  return apiMessages;
};

const applyEvalResponse = (context, evalMsg) => {
  if (!evalMsg?.content?.includes('retrieved_facts')) return;
  context.isQueueRouter = true;
  try { 
    const parsed = safeJsonParse(evalMsg.content);
    context.retrievedFacts = parsed.retrieved_facts ? JSON.stringify(parsed.retrieved_facts) : '';
    context.retrievedMemory = parsed.retrieved_memory ? JSON.stringify(parsed.retrieved_memory) : '';
    context.pendingQuestion = parsed.question || '';
  } catch (_) { /* ignore parse error */ }
};

const prepareIterationContext = (messages, currentFacts, baseContext) => {
  const context = { ...baseContext, isQueueRouter: false };
  context.questionQueue = simulateQuestionQueue(baseContext.questionQueue, messages);
  context.factsContext = formatUserFacts(currentFacts);
  context.hasGoal = currentFacts.some(f => f.key === 'primary_goal' && typeof f.value === 'string' && f.value.trim() !== '');
  context.planGenerationPending = currentFacts.some(f => f.key === '_plan_generation_pending' && f.value === 'true');
  context.routineGenerationPending = currentFacts.some(f => f.key === '_routine_generation_pending' && f.value === 'true');
  applyEvalResponse(context, findEvaluateResponse(messages));
  context.tools_called = messages.filter(m => m.role === 'tool').map(m => m.name);
  context.successful_tools = messages.filter(m => m.role === 'tool' && m.content && !m.content.includes('"error":')).map(m => m.name);
  return context;
};

const getNextTransitionRoute = (context, _currentRoute) => {
  if (context.transitionRoute === '') return null;
  return context.transitionRoute || null;
};

const runSingleIteration = async (apiKeys, msgs, exec, stat, lang, trace, ctx, facts, i, route) => {
  const context = prepareIterationContext(msgs, extractNewFactsFromMessages(facts, msgs), ctx);
  if (route) context.transitionRoute = route;
  const routeData = schemaEngine.getActiveRouteAndStep(context);
  if (!routeData) return { err: { headline: 'Error', diagnostic_summary: '', chat_message: 'Agent config error.' } };
  context.activeRoute = routeData.route.id;
  const turnResult = await processAgentTurn(apiKeys, msgs, getIterationMessages(msgs, routeData.step, context, i), exec, { onStatus: stat, lang, onTrace: trace }, context, routeData.step);
  return { turnResult, nextRoute: getNextTransitionRoute(context, route), context };
};

const propagateIterationContext = (currentContext, iterationContext) => {
  currentContext.transitionRoute = iterationContext.transitionRoute;
  if (iterationContext.stashedGreeting) currentContext.stashedGreeting = iterationContext.stashedGreeting;
  if (iterationContext.planState) currentContext.planState = iterationContext.planState;
  if (iterationContext.routinesState) currentContext.routinesState = iterationContext.routinesState;
};

const executeToolLoop = async (apiKeys, messages, toolExecutor, onStatus, lang, onTrace, baseContext, baseFacts) => {
  let route = null;
  let currentContext = { ...baseContext };
  for (let i = 0; i < 10; i++) {
    const res = await runSingleIteration(apiKeys, messages, toolExecutor, onStatus, lang, onTrace, currentContext, baseFacts, i, route);
    if (res.err) return res.err;
    route = res.nextRoute;
    propagateIterationContext(currentContext, res.context);
    if (res.turnResult.isDone) return handleLoopDone(res.turnResult, messages, res.context);
  }
  return { headline: 'Update', diagnostic_summary: '', chat_message: 'Agent loop limit reached.' };
};


const extractLastAssistantMessage = (history) => {
  for (let i = history.length - 1; i >= 0; i--) {
    if (history[i].role === 'assistant') return history[i];
  }
  return null;
};

const buildMessages = (history, userMessage) => {
  const lastAssistant = extractLastAssistantMessage(history);
  const contextMessages = lastAssistant
    ? [{ role: 'assistant', content: lastAssistant.message }]
    : [];
  return [
    ...contextMessages,
    { role: 'user', content: userMessage }
  ];
};

const buildWorkflowContext = (facts, questionQueue, hasActivePlan) => ({
  hasGoal: facts && facts.some(f => f.key === 'primary_goal' && typeof f.value === 'string' && f.value.trim() !== ''),
  isQueueRouter: false,
  questionQueue: questionQueue || [],
  hasActivePlan: hasActivePlan || false,
  lastToolCall: null,
  tools_called: [],
  factsContext: formatUserFacts(facts),
  pendingQuestion: '',
  retrievedFacts: '',
  retrievedMemory: '',
  stashedGreeting: null
});

const executeAgentWorkflow = async (apiKeys, userMessage, prompt, history, language, toolExecutor, facts, questionQueue, hasActivePlan, onStatus, savedMessages = null, onTrace = null, savedContext = null) => {
  let messages = (savedMessages && savedMessages.length > 0) ? savedMessages : buildMessages(history, userMessage);
  if (messages.length > 0 && messages[0].role !== 'system') {
    messages = [{ role: 'system', content: prompt }, ...messages];
  }
  const baseContext = buildWorkflowContext(facts, questionQueue, hasActivePlan);
  if (savedContext) Object.assign(baseContext, savedContext);
  return await executeToolLoop(apiKeys, messages, toolExecutor, onStatus, language, onTrace, baseContext, facts);
};

module.exports = { executeAgentWorkflow, getGroqClient, buildActionPlanParams, buildUserCronParams, executeToolLoop, getPendingQuestions };
