const { enrichBiometricsEntry } = require('../services/biometricsHelpers');
const { insertBiometricsLog, fetchBiometricsLogs } = require('../services/db');

const handleLogBiometrics = async (request, reply) => {
  try {
    const { userId, ...data } = request.body;
    if (!userId) return reply.status(400).send({ error: 'userId is required' });
    const keys = request.headers['x-ecosystem-keys'] ? JSON.parse(request.headers['x-ecosystem-keys']) : {};
    const enriched = enrichBiometricsEntry(data);
    const result = await insertBiometricsLog(keys, userId, enriched);
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
    const logs = await fetchBiometricsLogs(keys, userId, parseInt(limit), parseInt(offset));
    return reply.status(200).send({ logs });
  } catch (e) {
    return reply.status(500).send({ error: e.message });
  }
};

async function biometricsRoutes(fastify, _options) {
  fastify.post('/biometrics/log', handleLogBiometrics);
  fastify.get('/biometrics/logs', handleGetLogs);
}

module.exports = biometricsRoutes;
