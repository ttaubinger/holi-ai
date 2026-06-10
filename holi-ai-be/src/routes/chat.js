const { insertJob, fetchJob, insertEpisodicMemory, fetchEpisodicMemory, fetchUserCrons, fetchQuestionQueue } = require('../services/db');
const { enqueueJob } = require('../services/queue');

const getKeys = (req) => {
  try {
    return JSON.parse(req.headers['x-ecosystem-keys'] || '{}');
  } catch (_e) {
    return {};
  }
};

const handleChatPost = async (req, reply) => {
  const { userId, message, lang } = req.body;
  const apiKeys = getKeys(req);
  if (!userId || !message) {
    return reply.status(400).send({ error: 'Missing userId or message' });
  }

  const memoryRow = await insertEpisodicMemory(apiKeys, userId, 'user', message, null);
  const jobRecord = await insertJob(apiKeys, 'chat_response', { userId, message, lang, memoryId: memoryRow.id });
  await enqueueJob(jobRecord.id, 'chat_response', { userId, message, lang, memoryId: memoryRow.id }, apiKeys);

  return reply.status(202).send({ jobId: jobRecord.id });
};

const handleChatStatus = async (req, reply) => {
  const { jobId } = req.query;
  const apiKeys = getKeys(req);
  if (!jobId) {
    return reply.status(400).send({ error: 'Missing jobId' });
  }

  const job = await fetchJob(apiKeys, jobId);
  if (!job) {
    return reply.status(404).send({ error: 'Job not found' });
  }

  return reply.send({ status: job.status, result: job.result });
};

const handleChatHistory = async (req, reply) => {
  const { userId, limit, offset } = req.query;
  const apiKeys = getKeys(req);
  if (!userId) return reply.status(400).send({ error: 'Missing userId' });
  const msgs = await fetchEpisodicMemory(apiKeys, userId, limit ? parseInt(limit) : 50, offset ? parseInt(offset) : 0);
  return reply.send({ messages: msgs });
};

const handleQueueGet = async (req, reply) => {
  const { userId } = req.query;
  const apiKeys = getKeys(req);
  if (!userId) return reply.status(400).send({ error: 'Missing userId' });
  const queueData = await fetchQuestionQueue(apiKeys, userId);
  return reply.send({ queue: queueData.queue || [] });
};

const handleCronsGet = async (req, reply) => {
  const { userId } = req.query;
  const apiKeys = getKeys(req);
  if (!userId) return reply.status(400).send({ error: 'Missing userId' });
  const crons = await fetchUserCrons(apiKeys, userId);
  return reply.send({ crons });
};

const handleCronDelete = async (req, reply) => {
  const { cronId } = req.params;
  const { userId } = req.query;
  const apiKeys = getKeys(req);
  if (!userId) return reply.status(400).send({ error: 'Missing userId' });
  await require('../services/db').deleteUserCron(apiKeys, userId, cronId);
  return reply.send({ success: true });
};

const handleCronToggle = async (req, reply) => {
  const { cronId } = req.params;
  const { userId, is_active } = req.body;
  const apiKeys = getKeys(req);
  if (!userId || is_active === undefined) return reply.status(400).send({ error: 'Missing userId or is_active' });
  await require('../services/db').toggleUserCron(apiKeys, userId, cronId, is_active);
  return reply.send({ success: true });
};

const handleModulesGet = async (req, reply) => {
  const { userId } = req.query;
  const apiKeys = getKeys(req);
  if (!userId) return reply.status(400).send({ error: 'Missing userId' });
  const modules = await require('../services/db').fetchActionModules(apiKeys, userId);
  return reply.send({ modules });
};

const handleModuleDelete = async (req, reply) => {
  const { title } = req.params;
  const { userId } = req.query;
  const apiKeys = getKeys(req);
  if (!userId || !title) return reply.status(400).send({ error: 'Missing userId or title' });
  await require('../services/db').deleteActionModule(apiKeys, userId, title);
  return reply.send({ success: true });
};

const chatRoutes = async (fastify) => {
  fastify.post('/chat', handleChatPost);
  fastify.get('/chat/status', handleChatStatus);
  fastify.get('/chat/history', handleChatHistory);
  fastify.get('/chat/queue', handleQueueGet);
  fastify.get('/chat/crons', handleCronsGet);
  fastify.delete('/chat/crons/:cronId', handleCronDelete);
  fastify.post('/chat/crons/:cronId/toggle', handleCronToggle);
  fastify.get('/chat/modules', handleModulesGet);
  fastify.delete('/chat/modules/:title', handleModuleDelete);
};

module.exports = chatRoutes;
