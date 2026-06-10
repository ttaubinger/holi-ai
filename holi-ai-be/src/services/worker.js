const { Worker, DelayedError } = require('bullmq');
const { redisConnection } = require('./queue');
const database = require('./db');
const { executeAgentWorkflow } = require('../agent/orchestrator');
const embeddings = require('./embeddings');

const handleFetchGarminLogs = async (apiKeys, userId, toolArgs) => {
  return await database.fetchGarminLogs(apiKeys, userId, toolArgs.days || 3);
};

const handleFetchActionModules = async (apiKeys, userId) => {
  return await database.fetchActionModules(apiKeys, userId);
};

const handleFetchUserCrons = async (apiKeys, userId) => {
  return await database.fetchUserCrons(apiKeys, userId);
};



const handleSearchEpisodicMemory = async (apiKeys, userId, toolArgs) => {
  const queryEmbedding = await embeddings.generateEmbedding(toolArgs.query);
  return await database.searchEpisodicMemory(apiKeys, userId, queryEmbedding, 5);
};

const handleUpsertActionModule = async (apiKeys, userId, toolArgs) => {
  await database.upsertActionModules(apiKeys, userId, [toolArgs]);
  return { success: true };
};

const handleUpsertUserCron = async (apiKeys, userId, toolArgs) => {
  const cronRecord = { ...toolArgs, cron_id: `c_${Date.now()}`, is_active: true };
  await database.upsertCrons(apiKeys, userId, [cronRecord]);
  return { success: true };
};

const handleEvolveCoachPrompt = async (apiKeys, userId, toolArgs) => {
  await database.upsertCoachPrompt(apiKeys, userId, toolArgs.evolved_prompt);
  return { success: true };
};

const handleUpsertUserFact = async (apiKeys, userId, toolArgs) => {
  await database.upsertUserFacts(apiKeys, userId, [toolArgs]);
  return { success: true };
};

const handleQueueAssessmentQuestions = async (apiKeys, userId, toolArgs) => {
  const queueData = await database.fetchQuestionQueue(apiKeys, userId);
  const updatedQueue = [...(queueData.queue || []), ...(toolArgs.questions || [])];
  await database.upsertQuestionQueue(apiKeys, userId, updatedQueue, queueData.context || '');
  return { success: true };
};

const dispatchToolCall1 = async (apiKeys, userId, functionName, toolArgs) => {
  if (functionName === 'fetch_garmin_logs') return await handleFetchGarminLogs(apiKeys, userId, toolArgs);
  if (functionName === 'fetch_action_modules') return await handleFetchActionModules(apiKeys, userId);
  if (functionName === 'fetch_user_crons') return await handleFetchUserCrons(apiKeys, userId);

  if (functionName === 'search_episodic_memory') return await handleSearchEpisodicMemory(apiKeys, userId, toolArgs);
  return null;
};

const dispatchToolCall2 = async (apiKeys, userId, functionName, toolArgs) => {
  if (functionName === 'upsert_action_module') return await handleUpsertActionModule(apiKeys, userId, toolArgs);
  if (functionName === 'upsert_user_cron') return await handleUpsertUserCron(apiKeys, userId, toolArgs);
  if (functionName === 'evolve_coach_prompt') return await handleEvolveCoachPrompt(apiKeys, userId, toolArgs);
  if (functionName === 'upsert_user_fact') return await handleUpsertUserFact(apiKeys, userId, toolArgs);
  if (functionName === 'queue_assessment_questions') return await handleQueueAssessmentQuestions(apiKeys, userId, toolArgs);
  return null;
};

const handleToolCall = async (apiKeys, userId, functionName, toolArgs) => {
  const result1 = await dispatchToolCall1(apiKeys, userId, functionName, toolArgs);
  if (result1 !== null) return result1;
  const result2 = await dispatchToolCall2(apiKeys, userId, functionName, toolArgs);
  if (result2 !== null) return result2;
  return { error: 'Tool not found' };
};

const buildAugmentedMessage = (userMessage, questionToAsk) => {
  if (!questionToAsk) return userMessage;
  return `${userMessage}\n\n[SYSTEM: naturally ask the user the following interview question (Category: ${questionToAsk.category}):\n${questionToAsk.question}]`;
};

const saveAgentResponse = async (apiKeys, userId, responseString) => {
  const responseEmbedding = await embeddings.generateEmbedding(responseString);
  await database.insertEpisodicMemory(apiKeys, userId, 'assistant', responseString, responseEmbedding);
};

const createToolExecutor = (apiKeys, userId) => {
  return async (functionName, toolArgs) => {
    return await handleToolCall(apiKeys, userId, functionName, toolArgs);
  };
};

const shiftQuestionQueue = async (apiKeys, userId, askedQuestion) => {
  const latestQueueData = await database.fetchQuestionQueue(apiKeys, userId);
  const latestQueue = latestQueueData.queue || [];
  const remainingQueue = latestQueue.filter(q => q.question !== askedQuestion.question);
  await database.upsertQuestionQueue(apiKeys, userId, remainingQueue, latestQueueData.context || '');
};

const processAgentWorkflow = async (apiKeys, payload, prompt, history, queueData, facts) => {
  const queuedQuestions = queueData.queue || [];
  const questionToAsk = queuedQuestions.length > 0 ? queuedQuestions[0] : null;
  const augmentedMessage = buildAugmentedMessage(payload.message, questionToAsk);
  const toolExecutor = createToolExecutor(apiKeys, payload.userId);
  const responseString = await executeAgentWorkflow(apiKeys, augmentedMessage, prompt, history, payload.lang, toolExecutor, facts);
  await saveAgentResponse(apiKeys, payload.userId, responseString);
  if (questionToAsk) await shiftQuestionQueue(apiKeys, payload.userId, questionToAsk);
  return responseString;
};

const runAgent = async (jobId, payload, apiKeys) => {
  const prompt = await database.fetchCoachPrompt(apiKeys, payload.userId);
  const history = await database.fetchEpisodicMemory(apiKeys, payload.userId, 10);
  const queueData = await database.fetchQuestionQueue(apiKeys, payload.userId);
  const facts = await database.fetchUserFacts(apiKeys, payload.userId);
  const responseString = await processAgentWorkflow(apiKeys, payload, prompt, history, queueData, facts);
  await database.updateJobStatus(apiKeys, jobId, 'completed', { chat_message: responseString });
};

const calculateDelayMilliseconds = (errorMessage, attemptsMade) => {
  let delayMilliseconds = 60000;
  const match = errorMessage.match(/try again in (?:(\d+)h)?(?:(\d+)m)?(?:(\d+(?:\.\d+)?)s)?/);
  if (match) {
    delayMilliseconds = (parseFloat(match[1] || 0) * 3600 + parseFloat(match[2] || 0) * 60 + parseFloat(match[3] || 0)) * 1000;
  }
  if (delayMilliseconds <= 0) delayMilliseconds = 60000;
  if (attemptsMade > 0) delayMilliseconds = delayMilliseconds * Math.pow(2, attemptsMade);
  return delayMilliseconds;
};

const getRateLimitMessage = (language, minutes) => {
  if (language === 'cs') return `Omlouvám se, narazil jsem na limit kapacity AI. Požadavek automaticky zpracuji za cca ${minutes} minut.`;
  return `I hit an AI capacity limit. I will automatically process this request in about ${minutes} minutes.`;
};

const handleRateLimitError = async (apiKeys, job, payload, errorMessage) => {
  const delayMilliseconds = calculateDelayMilliseconds(errorMessage, job.attemptsMade);
  const minutes = Math.ceil(delayMilliseconds / 60000);
  const languageMessage = getRateLimitMessage(payload.lang, minutes);
  const resumeAt = Date.now() + delayMilliseconds;
  if (job.attemptsMade === 0) {
    await database.insertEpisodicMemory(apiKeys, payload.userId, 'system', JSON.stringify({ chat_message: languageMessage }));
  }
  await database.updateJobStatus(apiKeys, job.id, 'delayed', { message: languageMessage, resumeAt });
  await job.moveToDelayed(resumeAt, job.token);
  throw new DelayedError();
};

const extractAiGenerationError = (errorMessage) => {
  try {
    const index = errorMessage.indexOf('{');
    if (index >= 0) {
      const parsedError = JSON.parse(errorMessage.substring(index));
      if (parsedError?.error?.failed_generation) return parsedError.error.failed_generation;
    }
  } catch (_e) {
    return '';
  }
  return '';
};

const handleSafetyFilterError = async (apiKeys, jobId, payload) => {
  const localizedMessage = payload.lang === 'cs' ? 'Omlouvám se, ale na tento požadavek nemohu odpovědět z důvodu bezpečnostních filtrů.' : 'I apologize, but I cannot fulfill this request due to safety filters.';
  await database.insertEpisodicMemory(apiKeys, payload.userId, 'assistant', JSON.stringify({ chat_message: localizedMessage }));
  await database.updateJobStatus(apiKeys, jobId, 'failed', { error: JSON.stringify({ error: { failed_generation: localizedMessage } }) });
};

const checkAndHandleLlmError = async (apiKeys, job, payload, errorMessage) => {
  const isRateLimit = errorMessage.includes('429') || errorMessage.includes('413') || errorMessage.includes('rate_limit') || errorMessage.includes('TPM');
  if (isRateLimit) await handleRateLimitError(apiKeys, job, payload, errorMessage);
  const aiReply = extractAiGenerationError(errorMessage);
  if (aiReply) {
    await handleSafetyFilterError(apiKeys, job.data.jobId, payload);
    return true;
  }
  return false;
};

const processLlmTask = async (job) => {
  const { jobId, payload, apiKeys } = job.data;
  try {
    await runAgent(jobId, payload, apiKeys);
  } catch (error) {
    const errorMessage = error.message || String(error);
    const wasSafetyFilter = await checkAndHandleLlmError(apiKeys, job, payload, errorMessage);
    if (wasSafetyFilter) throw error;
    await database.updateJobStatus(apiKeys, jobId, 'failed', { error: errorMessage });
    throw error;
  }
};

const onJobFailed = (job, error) => {
  console.error(`Job ${job.id} failed:`, error.message);
};

const createWorker = () => {
  const workerOptions = { connection: redisConnection, limiter: { max: 10, duration: 60000 } };
  const worker = new Worker('llm-tasks', processLlmTask, workerOptions);
  worker.on('failed', onJobFailed);
  return worker;
};

module.exports = { createWorker };
