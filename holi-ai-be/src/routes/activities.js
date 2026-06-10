const { insertActivityLog, fetchActivityLogs } = require('../services/db');

const handleLogActivity = async (request, reply) => {
  try {
    const { userId, ...data } = request.body;
    if (!userId) return reply.status(400).send({ error: 'userId is required' });
    const keys = request.headers['x-ecosystem-keys'] ? JSON.parse(request.headers['x-ecosystem-keys']) : {};
    const result = await insertActivityLog(keys, userId, data);
    return reply.status(200).send(result);
  } catch (e) {
    return reply.status(500).send({ error: e.message });
  }
};

const handleGetLogs = async (request, reply) => {
  try {
    const { userId, limit = 50, offset = 0 } = request.query;
    if (!userId) return reply.status(400).send({ error: 'userId is required' });
    const keys = request.headers['x-ecosystem-keys'] ? JSON.parse(request.headers['x-ecosystem-keys']) : {};
    const logs = await fetchActivityLogs(keys, userId, parseInt(limit), parseInt(offset));
    return reply.status(200).send({ logs });
  } catch (e) {
    return reply.status(500).send({ error: e.message });
  }
};

async function activitiesRoutes(fastify, _options) {
  fastify.post('/activities/log', handleLogActivity);
  fastify.get('/activities/logs', handleGetLogs);
}

module.exports = activitiesRoutes;
