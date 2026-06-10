const { insertConfig, fetchConfig } = require('../services/db');
const { encryptSecret, decryptSecret } = require('../services/crypto');

const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

const initDatabase = async (dbUrl) => {
  if (!dbUrl || (!dbUrl.startsWith('postgres://') && !dbUrl.startsWith('postgresql://'))) return;
  const initSql = fs.readFileSync(path.join(__dirname, '../../init.sql'), 'utf8');
  const tempPool = new Pool({ connectionString: dbUrl });
  try { await tempPool.query(initSql); } finally { await tempPool.end(); }
};

const handleSync = async (request, reply) => {
  try {
    const { keys, config } = request.body;
    if (!config) throw new Error('Missing config payload');
    await initDatabase(keys?.neonUrl || keys?.sbConnUrl);
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
    const keys = null; // Keys are checked from local environment for pgPool
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
    if (!userId) throw new Error('Missing userId');
    const { keys } = request.body || { keys: null };
    await require('../services/db').wipeDatabase(keys, userId);
    return reply.send({ success: true });
  } catch (e) {
    return reply.status(500).send({ error: e.message });
  }
};

async function configRoutes(fastify, options) {
  fastify.post('/config/sync', handleSync);
  fastify.get('/config/sync', handleGetSync);
  fastify.post('/config/wipe', handleWipe);
}

module.exports = configRoutes;
