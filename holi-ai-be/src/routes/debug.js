const database = require('../services/db');

const fetchAndMergeTraces = async (keys, limit, offset) => {
  const [traces, msgs] = await Promise.all([
    database.fetchLlmTraces(keys, keys.userId, limit, offset),
    database.fetchEpisodicMemory(keys, keys.userId, limit, offset)
  ]);
  const chatMsgs = msgs
    .filter(m => m.role !== 'system')
    .map(m => ({ id: m.id, type: 'chat_message', role: m.role, message: m.message, created_at: m.created_at }));
  const combined = [...traces.map(t => ({ ...t, type: 'trace' })), ...chatMsgs];
  return combined.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()).slice(0, limit);
};

const handleGetTraces = async (request, reply) => {
  try {
    const head = request.headers['x-ecosystem-keys'];
    if (!head) return reply.code(401).send({ error: 'Missing credentials' });
    const keys = JSON.parse(head);
    if (!keys.userId) return reply.code(400).send({ error: 'Missing userId' });
    const limit = parseInt(request.query.limit) || 50;
    const offset = parseInt(request.query.offset) || 0;
    const traces = await fetchAndMergeTraces(keys, limit, offset);
    return { traces };
  } catch (error) {
    request.log.error(error);
    return reply.code(500).send({ error: 'Failed' });
  }
};

async function routes(fastify, _options) {
  fastify.get('/debug/traces', handleGetTraces);
}

module.exports = routes;
