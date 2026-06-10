const { getGarminAuthUrl, processGarminWebhook } = require('../services/garmin');

const { enrichGarminEntry } = require('../services/garminHelpers');
const { insertGarminLog, fetchGarminLogs } = require('../services/db');

const handleAuth = async (request, reply) => {
  try {
    const url = await getGarminAuthUrl();
    return reply.send({ url });
  } catch (e) {
    return reply.status(500).send({ error: e.message });
  }
};

const handleWebhook = async (request, reply) => {
  try {
    await processGarminWebhook(request.body);
    return reply.status(200).send({ success: true });
  } catch (e) {
    return reply.status(500).send({ error: e.message });
  }
};

const handleLogGarmin = async (request, reply) => {
  try {
    const { userId, ...data } = request.body;
    if (!userId) return reply.status(400).send({ error: 'userId is required' });
    const keys = request.headers['x-ecosystem-keys'] ? JSON.parse(request.headers['x-ecosystem-keys']) : {};
    const enriched = enrichGarminEntry(data);
    const result = await insertGarminLog(keys, userId, enriched);
    return reply.status(200).send(result);
  } catch (e) {
    return reply.status(500).send({ error: e.message });
  }
};

const handleGetLogs = async (request, reply) => {
  try {
    const { userId, limit = 10, offset = 0 } = request.query;
    if (!userId) return reply.status(400).send({ error: 'userId is required' });
    const keys = request.headers['x-ecosystem-keys'] ? JSON.parse(request.headers['x-ecosystem-keys']) : {};
    const logs = await fetchGarminLogs(keys, userId, parseInt(limit), parseInt(offset));
    return reply.status(200).send({ logs });
  } catch (e) {
    return reply.status(500).send({ error: e.message });
  }
};

async function garminRoutes(fastify, options) {
  fastify.get('/garmin/auth', handleAuth);
  fastify.post('/garmin/webhook', handleWebhook);
  fastify.post('/garmin/log', handleLogGarmin);
  fastify.get('/garmin/logs', handleGetLogs);
}

module.exports = garminRoutes;
