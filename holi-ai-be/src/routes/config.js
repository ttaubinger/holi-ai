const { insertConfig, fetchConfig, fetchCoachPrompt, upsertCoachPrompt } = require('../services/db');
const { encryptSecret, decryptSecret } = require('../services/crypto');

const fs = require('node:fs');
const path = require('node:path');
const { Pool } = require('pg');

const initDatabase = async (dbUrl) => {
  if (!dbUrl || (!dbUrl.startsWith('postgres://') && !dbUrl.startsWith('postgresql://'))) return;
  const initSql = fs.readFileSync(path.join(__dirname, '../../init.sql'), 'utf8');
  const tempPool = new Pool({ connectionString: dbUrl });
  try { await tempPool.query(initSql); } finally { await tempPool.end(); }
};

const getDbUrl = (keys) => {
  return keys?.neonUrl || keys?.sbConnUrl || (process.env.USE_LOCAL_DB === 'true' ? process.env.DATABASE_URL : null);
};

const handleSync = async (request, reply) => {
  try {
    const { keys, config } = request.body;
    if (!config) return reply.status(400).send({ error: 'Missing config payload' });
    await initDatabase(getDbUrl(keys));
    for (const [k, v] of Object.entries(config)) {
      if (!v) continue;
      const encryptedValue = encryptSecret(v);
      await insertConfig(keys, k, encryptedValue);
    }
    return reply.send({ success: true });
  } catch (e) {
    return reply.status(500).send({ error: e.message });
  }
};

const handleGetSync = async (request, reply) => {
  try {
    const keys = null;
    const configMap = {};
    const configKeys = ['GROQ_KEY', 'GROQ_MODEL', 'GARMIN_CLIENT_ID', 'GARMIN_CLIENT_SECRET', 'DELETED_CRONS'];
    for (const k of configKeys) {
      const val = await fetchConfig(keys, k);
      if (val) configMap[k] = decryptSecret(val);
    }
    return reply.send({ config: configMap });
  } catch (e) {
    return reply.status(500).send({ error: e.message });
  }
};

const handleWipe = async (request, reply) => {
  try {
    const { userId } = request.query;
    if (!userId) return reply.status(400).send({ error: 'Missing userId' });
    const { keys } = request.body || { keys: null };
    await require('../services/db').wipeDatabase(keys, userId);
    await initDatabase(getDbUrl(keys));
    reply.header('Clear-Site-Data', '"cache", "cookies", "storage"');
    reply.header('Cache-Control', 'no-store');
    return reply.send({ success: true });
  } catch (e) {
    return reply.status(500).send({ error: e.message });
  }
};

const handleGetPrompt = async (request, reply) => {
  try {
    const { userId } = request.query;
    if (!userId) return reply.status(400).send({ error: 'Missing userId' });
    const keys = request.headers['x-ecosystem-keys'] ? JSON.parse(request.headers['x-ecosystem-keys']) : {};
    const prompt = await fetchCoachPrompt(keys, userId);
    return reply.send({ prompt });
  } catch (e) {
    return reply.status(500).send({ error: e.message });
  }
};

const handleSetPrompt = async (request, reply) => {
  try {
    const { userId, prompt } = request.body;
    if (!userId || !prompt) return reply.status(400).send({ error: 'Missing userId or prompt' });
    const keys = request.headers['x-ecosystem-keys'] ? JSON.parse(request.headers['x-ecosystem-keys']) : {};
    await upsertCoachPrompt(keys, userId, prompt);
    return reply.send({ success: true });
  } catch (e) {
    return reply.status(500).send({ error: e.message });
  }
};

async function configRoutes(fastify, _options) {
  fastify.post('/config/sync', handleSync);
  fastify.get('/config/sync', handleGetSync);
  fastify.post('/config/wipe', handleWipe);
  fastify.get('/config/prompt', handleGetPrompt);
  fastify.post('/config/prompt', handleSetPrompt);
}

module.exports = configRoutes;
