const database = require('../../db');
const embeddings = require('../../embeddings');

const traceRAGQueue = (apiKeys, userId, t0, query, facts, memory) => {
  database.insertLlmTrace(apiKeys, userId, {
    model: 'RAG-Queue',
    latency_ms: Date.now() - t0,
    payload_input: JSON.stringify({ query }),
    payload_output: JSON.stringify({ facts, memory })
  }).catch(e => console.error('[AI] Failed to save RAG trace:', e.message));
};

const searchRAG = async (apiKeys, userId, query) => {
  const emb = await embeddings.generateEmbedding(query);
  const m = await database.searchEpisodicMemory(apiKeys, userId, emb, 5);
  const f = await database.searchUserFacts(apiKeys, userId, emb, 5);
  return [f, m];
};

const handleEnqueueQuestions = async (apiKeys, userId, toolArgs) => {
  const currentQueueData = await database.fetchQuestionQueue(apiKeys, userId);
  const currentQueue = currentQueueData.queue || [];
  const parsedQuestions = (toolArgs.questions || []).map(q => typeof q === 'string' ? q : q.question).filter(Boolean);
  const newQueue = [...parsedQuestions, ...currentQueue];
  await database.upsertQuestionQueue(apiKeys, userId, newQueue);
  return { success: true, message: 'Questions enqueued.' };
};

const handleDequeueQuestion = async (apiKeys, userId) => {
  const queueData = await database.fetchQuestionQueue(apiKeys, userId);
  const currentQueue = queueData.queue || [];
  if (currentQueue.length > 0) {
    const newQueue = currentQueue.slice(1);
    await database.upsertQuestionQueue(apiKeys, userId, newQueue);
    return { success: true, message: 'Dequeued.' };
  }
  return { success: true, message: 'Queue was already empty.' };
};

const handleEvaluateCurrentQuestion = async (apiKeys, userId) => {
  const t0 = Date.now();
  const { queue } = await database.fetchQuestionQueue(apiKeys, userId);
  if (!queue || queue.length === 0) return { empty: true, message: 'Queue is empty.' };
  const ragEnabled = await database.fetchRagEnabled(apiKeys, userId);
  if (!ragEnabled) {
    await database.enableRag(apiKeys, userId);
  }
  const [f, m] = await searchRAG(apiKeys, userId, queue[0]);
  traceRAGQueue(apiKeys, userId, t0, queue[0], f, m);
  return { question: queue[0], retrieved_facts: f, retrieved_memory: m };
};

module.exports = {
  handleEnqueueQuestions,
  handleDequeueQuestion,
  handleEvaluateCurrentQuestion
};
