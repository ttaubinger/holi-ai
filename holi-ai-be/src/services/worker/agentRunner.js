const database = require('../db');
const embeddings = require('../embeddings');
const { executeAgentWorkflow } = require('../../agent/orchestrator');
const { handleToolCall } = require('./toolHandlers');
const { createStatusHandler, createTraceHandler } = require('./errorHandler');
const { stopKeepAlive, startKeepAlive } = require('../keepAlive');

const saveAgentResponse = async (apiKeys, userId, responseObj) => {
  const responseEmbedding = await embeddings.generateEmbedding(responseObj.chat_message);
  await database.insertEpisodicMemory(apiKeys, userId, 'assistant', JSON.stringify(responseObj), responseEmbedding);
};

const processAgentWorkflow = async (jobId, apiKeys, payload, prompt, history, facts, questionQueue, hasActivePlan, savedMessages = null, savedContext = null) => {
  const toolExecutor = (name, args, context) => handleToolCall(apiKeys, payload.userId, name, args, history, jobId, context);
  const onStatus = createStatusHandler(apiKeys, payload.userId, jobId);
  const onTrace = createTraceHandler(apiKeys, payload.userId, jobId);
  const res = await executeAgentWorkflow(apiKeys, payload.message, prompt, history, payload.lang, toolExecutor, facts, questionQueue, hasActivePlan, onStatus, savedMessages, onTrace, savedContext);
  await saveAgentResponse(apiKeys, payload.userId, res);
  await database.deleteTransientSystemMessages(apiKeys, payload.userId);
  return res;
};

const sendLoadingStatus = async (payload, apiKeys) => {
  if (embeddings.isModelLoaded()) return;
  const msg = payload.lang === 'cs' ? 'Nahrávání AI modelu (může to chvíli trvat)...' : 'Loading AI model (this might take a while)...';
  await database.upsertSystemMessage(apiKeys, payload.userId, msg);
};

const compileHistory = (semanticHistory, immediateHistory) => {
  const historyMap = new Map();
  for (const h of [...semanticHistory, ...immediateHistory]) {
    const key = h.id ? String(h.id) : JSON.stringify(h);
    historyMap.set(key, h);
  }
  const sortedHistory = Array.from(historyMap.values()).sort((a, b) => {
    const timeA = a.created_at ? new Date(a.created_at).getTime() : 0;
    const timeB = b.created_at ? new Date(b.created_at).getTime() : 0;
    return timeA - timeB;
  });
  return sortedHistory.map(h => ({ role: h.role, message: h.message }));
};

const getUnitRule = async (apiKeys) => {
  const unitSystem = await database.fetchConfig(apiKeys, 'UNIT_SYSTEM');
  return unitSystem === 'Imperial'
    ? 'Default to using the Imperial system (lbs, inches, gallons) for all measurements, questions, and plans unless the user explicitly provides metric units.'
    : 'Default to using the metric system (kg, cm, liters) for all measurements, questions, and plans unless the user explicitly provides imperial units.';
};

const loadAgentContext = async (apiKeys, userId) => {
  let prompt = await database.fetchCoachPrompt(apiKeys, userId);
  if (prompt === null || prompt === undefined) prompt = '';
  const unitRule = await getUnitRule(apiKeys);
  prompt = prompt ? `${prompt}\n\n${unitRule}` : unitRule;
  
  const facts = await database.fetchUserFacts(apiKeys, userId);
  const queueData = await database.fetchQuestionQueue(apiKeys, userId);
  const modules = await database.fetchActionModules(apiKeys, userId, true);
  return { prompt, facts, queue: queueData.queue, hasActivePlan: modules.length > 0 };
};

const getAgentHistory = async (apiKeys, payload) => {
  const rawHistory = await database.fetchEpisodicMemory(apiKeys, payload.userId, 3);
  const assistantMessages = rawHistory.filter(h => h.id !== payload.memoryId && h.role === 'assistant');
  const lastAssistant = assistantMessages.length > 0 ? [assistantMessages[assistantMessages.length - 1]] : [];
  return compileHistory([], lastAssistant);
};

const resumeAgentJob = async (jobId, payload, apiKeys, job) => {
  startKeepAlive();
  console.log(`[AI] Resuming job ${jobId} from saved messages...`);
  const ctx = await loadAgentContext(apiKeys, payload.userId);
  const res = await processAgentWorkflow(jobId, apiKeys, payload, ctx.prompt, [], ctx.facts, ctx.queue, ctx.hasActivePlan, job.data.savedMessages, job.data.savedContext);
  await database.updateJobStatus(apiKeys, jobId, 'completed', res);
  stopKeepAlive();
};

const runFreshAgentJob = async (jobId, payload, apiKeys) => {
  startKeepAlive();
  await sendLoadingStatus(payload, apiKeys);
  const ctx = await loadAgentContext(apiKeys, payload.userId);
  const emb = await embeddings.generateEmbedding(payload.message);
  if (payload.memoryId) await database.updateEpisodicMemoryEmbedding(apiKeys, payload.memoryId, emb);
  const history = await getAgentHistory(apiKeys, payload);
  const res = await processAgentWorkflow(jobId, apiKeys, payload, ctx.prompt, history, ctx.facts, ctx.queue, ctx.hasActivePlan);
  await database.updateJobStatus(apiKeys, jobId, 'completed', res);
  stopKeepAlive();
};

const runAgent = async (jobId, payload, apiKeys, job) => {
  const dbJob = await database.fetchJob(apiKeys, jobId);
  if (!dbJob) {
    console.log(`[AI] Job ${jobId} not found in DB (wiped). Aborting.`);
    return;
  }
  if (job?.data?.savedMessages) return await resumeAgentJob(jobId, payload, apiKeys, job);
  return await runFreshAgentJob(jobId, payload, apiKeys);
};

module.exports = { runAgent };
