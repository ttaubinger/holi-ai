const database = require('../db');
const embeddings = require('../embeddings');
const { executeAgentWorkflow } = require('../../agent/orchestrator');
const { handleToolCall } = require('./toolHandlers');
const { createStatusHandler, createTraceHandler } = require('./errorHandler');

const saveAgentResponse = async (apiKeys, userId, responseObj) => {
  const responseEmbedding = await embeddings.generateEmbedding(responseObj.chat_message);
  await database.insertEpisodicMemory(apiKeys, userId, 'assistant', JSON.stringify(responseObj), responseEmbedding);
};

const processAgentWorkflow = async (jobId, apiKeys, payload, prompt, history, facts, questionQueue, savedMessages = null) => {
  const toolExecutor = (name, args) => handleToolCall(apiKeys, payload.userId, name, args, history);
  const onStatus = createStatusHandler(apiKeys, payload.userId, jobId);
  const onTrace = createTraceHandler(apiKeys, payload.userId, jobId);
  const res = await executeAgentWorkflow(apiKeys, payload.message, prompt, history, payload.lang, toolExecutor, facts, questionQueue, onStatus, savedMessages, onTrace);
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

const loadAgentContext = async (apiKeys, userId) => {
  const prompt = await database.fetchCoachPrompt(apiKeys, userId);
  const facts = await database.fetchUserFacts(apiKeys, userId);
  const queueData = await database.fetchQuestionQueue(apiKeys, userId);
  return { prompt, facts, queue: queueData.queue };
};

const getAgentHistory = async (apiKeys, payload) => {
  const rawHistory = await database.fetchEpisodicMemory(apiKeys, payload.userId, 3);
  const assistantMessages = rawHistory.filter(h => h.id !== payload.memoryId && h.role === 'assistant');
  const lastAssistant = assistantMessages.length > 0 ? [assistantMessages[assistantMessages.length - 1]] : [];
  return compileHistory([], lastAssistant);
};

const resumeAgentJob = async (jobId, payload, apiKeys, job) => {
  console.log(`[AI] Resuming job ${jobId} from saved messages...`);
  const ctx = await loadAgentContext(apiKeys, payload.userId);
  const res = await processAgentWorkflow(jobId, apiKeys, payload, ctx.prompt, [], ctx.facts, ctx.queue, job.data.savedMessages);
  await database.updateJobStatus(apiKeys, jobId, 'completed', res);
};

const runAgent = async (jobId, payload, apiKeys, job) => {
  if (job?.data?.savedMessages) return await resumeAgentJob(jobId, payload, apiKeys, job);
  await sendLoadingStatus(payload, apiKeys);
  const ctx = await loadAgentContext(apiKeys, payload.userId);
  const emb = await embeddings.generateEmbedding(payload.message);
  if (payload.memoryId) await database.updateEpisodicMemoryEmbedding(apiKeys, payload.memoryId, emb);
  const history = await getAgentHistory(apiKeys, payload);
  const res = await processAgentWorkflow(jobId, apiKeys, payload, ctx.prompt, history, ctx.facts, ctx.queue);
  await database.updateJobStatus(apiKeys, jobId, 'completed', res);
};

module.exports = { runAgent };
