const { getPgPool, getSbClient } = require('./core');
const { cosineDistance } = require('./utils');
const { getCache, setCache, deleteCache } = require('../cache');

const upsertUserFacts = async (keys, userId, facts) => {
  if (!facts || !facts.length) return;
  const pool = getPgPool(keys);
  for (const f of facts) {
    if (!f.key || !f.value) continue;
    const embStr = f.embedding ? `[${f.embedding.join(',')}]` : null;
    if (pool) {
      const q = embStr 
        ? 'INSERT INTO user_facts (user_id, fact_key, fact_value, embedding) VALUES ($1, $2, $3, $4) ON CONFLICT (user_id, fact_key) DO UPDATE SET fact_value=EXCLUDED.fact_value, embedding=EXCLUDED.embedding, updated_at=CURRENT_TIMESTAMP'
        : 'INSERT INTO user_facts (user_id, fact_key, fact_value) VALUES ($1, $2, $3) ON CONFLICT (user_id, fact_key) DO UPDATE SET fact_value=EXCLUDED.fact_value, updated_at=CURRENT_TIMESTAMP';
      await pool.query(q, embStr ? [userId, f.key, f.value, embStr] : [userId, f.key, f.value]);
    } else await getSbClient(keys).from('user_facts').upsert({ user_id: userId, fact_key: f.key, fact_value: f.value, embedding: embStr, updated_at: new Date() }, { onConflict: 'user_id,fact_key' });
  }
  await deleteCache(`facts:${userId}`);
};

const fetchDbUserFacts = async (keys, userId) => {
  const pool = getPgPool(keys);
  if (pool) {
    const res = await pool.query('SELECT fact_key, fact_value, updated_at FROM user_facts WHERE user_id = $1', [userId]);
    return res.rows.map(r => ({ key: r.fact_key, value: r.fact_value, updated_at: r.updated_at }));
  }
  const { data, error } = await getSbClient(keys).from('user_facts').select('fact_key, fact_value, updated_at').eq('user_id', userId);
  if (error) throw new Error(error.message);
  return (data || []).map(r => ({ key: r.fact_key, value: r.fact_value, updated_at: r.updated_at }));
};


const fetchUserFacts = async (keys, userId) => {
  const cacheKey = `facts:${userId}`;
  const cached = await getCache(cacheKey);
  if (cached) return cached;
  const facts = await fetchDbUserFacts(keys, userId);
  if (facts) await setCache(cacheKey, facts);
  return facts || [];
};

const searchUserFacts = async (keys, userId, embedding, limit = 5) => {
  if (!embedding) return [];
  const pool = getPgPool(keys);
  const threshold = parseFloat(keys?.ragThreshold || '0.55');
  if (pool) {
    const res = await pool.query('SELECT fact_key, fact_value, updated_at FROM user_facts WHERE user_id = $1 AND embedding <=> $2 < $3 ORDER BY embedding <=> $2 LIMIT $4', [userId, `[${embedding.join(',')}]`, threshold, limit]);
    return res.rows.map(r => ({ key: r.fact_key, value: r.fact_value, updated_at: r.updated_at }));
  }
  const { data, error } = await getSbClient(keys).from('user_facts').select('fact_key, fact_value, updated_at, embedding').eq('user_id', userId);
  if (error || !data) return [];
  return data.filter(r => r.embedding).map(r => ({ key: r.fact_key, value: r.fact_value, updated_at: r.updated_at, distance: cosineDistance(embedding, typeof r.embedding === 'string' ? JSON.parse(r.embedding) : r.embedding) })).filter(r => r.distance < threshold).sort((a, b) => a.distance - b.distance).slice(0, limit).map(r => ({ key: r.key, value: r.value, updated_at: r.updated_at }));
};

module.exports = { upsertUserFacts, fetchUserFacts, searchUserFacts };
