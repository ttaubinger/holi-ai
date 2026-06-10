const { getPgPool, getSbClient } = require('./core');
const { deleteCache, getCache, setCache } = require('../cache');

const insertJob = async (keys, type, payload) => {
  const pool = getPgPool(keys);
  if (pool) {
    const res = await pool.query('INSERT INTO llm_job_queue (task_type, status, payload) VALUES ($1, $2, $3) RETURNING *', [type, 'pending', JSON.stringify(payload)]);
    return res.rows[0];
  }
  const { data, error } = await getSbClient(keys).from('llm_job_queue').insert([{ task_type: type, status: 'pending', payload }]).select();
  if (error) throw new Error(error.message);
  return data[0];
};

const updateJobStatus = async (keys, jobId, status, result) => {
  const pool = getPgPool(keys);
  if (pool) {
    await pool.query('UPDATE llm_job_queue SET status = $1, result = $2 WHERE id = $3', [status, result ? JSON.stringify(result) : null, jobId]);
    return;
  }
  const { error } = await getSbClient(keys).from('llm_job_queue').update({ status, result }).eq('id', jobId);
  if (error) throw new Error(error.message);
};

const fetchJob = async (keys, jobId) => {
  const pool = getPgPool(keys);
  if (pool) {
    const res = await pool.query('SELECT * FROM llm_job_queue WHERE id = $1', [jobId]);
    return res.rows[0];
  }
  const { data, error } = await getSbClient(keys).from('llm_job_queue').select('*').eq('id', jobId).single();
  if (error) throw new Error(error.message);
  return data;
};

const insertConfig = async (keys, configKey, configValue) => {
  const pool = getPgPool(keys);
  if (pool) {
    await pool.query(
      'INSERT INTO system_config (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = CURRENT_TIMESTAMP',
      [configKey, configValue]
    );
    return;
  }
  const { error } = await getSbClient(keys).from('system_config').upsert({ key: configKey, value: configValue, updated_at: new Date() });
  if (error) throw new Error(error.message);
};

const fetchConfig = async (keys, configKey) => {
  const pool = getPgPool(keys);
  if (pool) {
    const res = await pool.query('SELECT value FROM system_config WHERE key = $1', [configKey]);
    return res.rows.length ? res.rows[0].value : null;
  }
  const { data, error } = await getSbClient(keys).from('system_config').select('value').eq('key', configKey).single();
  if (error && error.code !== 'PGRST116') throw new Error(error.message);
  return data ? data.value : null;
};

const upsertCoachPrompt = async (keys, userId, prompt) => {
  const pool = getPgPool(keys);
  if (pool) {
    await pool.query('INSERT INTO coach_prompts (user_id, prompt) VALUES ($1, $2) ON CONFLICT (user_id) DO UPDATE SET prompt = EXCLUDED.prompt, updated_at = CURRENT_TIMESTAMP', [userId, prompt]);
  } else {
    const { error } = await getSbClient(keys).from('coach_prompts').upsert({ user_id: userId, prompt, updated_at: new Date() });
    if (error) throw new Error(error.message);
  }
  await deleteCache(`prompt:${userId}`);
};

const fetchDbCoachPrompt = async (keys, userId) => {
  const pool = getPgPool(keys);
  if (pool) {
    const res = await pool.query('SELECT prompt FROM coach_prompts WHERE user_id = $1', [userId]);
    return res.rows.length ? res.rows[0].prompt : null;
  }
  const { data, error } = await getSbClient(keys).from('coach_prompts').select('prompt').eq('user_id', userId).single();
  if (error && error.code !== 'PGRST116') throw new Error(error.message);
  return data ? data.prompt : null;
};

const fetchCoachPrompt = async (keys, userId) => {
  const cacheKey = `prompt:${userId}`;
  const cached = await getCache(cacheKey);
  if (cached) return cached;
  const prompt = await fetchDbCoachPrompt(keys, userId);
  if (prompt) await setCache(cacheKey, prompt);
  return prompt;
};

const wipeDbTables = async (keys, userId, tables) => {
  const pool = getPgPool(keys);
  if (pool) {
    for (const t of tables) await pool.query(`DROP TABLE IF EXISTS ${t} CASCADE`);
    return;
  }
  const client = getSbClient(keys);
  for (const t of tables) await client.from(t).delete().eq('user_id', userId);
};

const wipeJobQueue = async (keys, userId) => {
  const pool = getPgPool(keys);
  if (pool) return pool.query(`DROP TABLE IF EXISTS llm_job_queue CASCADE`);
  return getSbClient(keys).from('llm_job_queue').delete().contains('payload', { userId });
};

const wipeDatabase = async (keys, userId) => {
  const tables = ['episodic_memory', 'coach_prompts', 'user_crons', 'user_queues', 'user_action_modules', 'user_facts', 'biometrics_logs', 'activity_logs', 'llm_traces'];
  await wipeDbTables(keys, userId, tables);
  await wipeJobQueue(keys, userId);
  await deleteCache(`prompt:${userId}`);
  await deleteCache(`facts:${userId}`);
  return true;
};

const insertLlmTracePg = async (pool, userId, trace) => {
  const q = 'INSERT INTO llm_traces (user_id, model, latency_ms, prompt_tokens, completion_tokens, total_tokens, payload_input, payload_output) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *';
  const v = [userId, trace.model, trace.latency_ms, trace.prompt_tokens, trace.completion_tokens, trace.total_tokens, trace.payload_input, trace.payload_output];
  return (await pool.query(q, v)).rows[0];
};

const insertLlmTraceSb = async (keys, userId, trace) => {
  const { data: inserted, error } = await getSbClient(keys).from('llm_traces').insert({
    user_id: userId, model: trace.model, latency_ms: trace.latency_ms,
    prompt_tokens: trace.prompt_tokens, completion_tokens: trace.completion_tokens,
    total_tokens: trace.total_tokens,
    payload_input: trace.payload_input ? JSON.parse(trace.payload_input) : null,
    payload_output: trace.payload_output ? JSON.parse(trace.payload_output) : null
  }).select().single();
  if (error) throw error;
  return inserted;
};

const insertLlmTrace = async (keys, userId, traceData) => {
  if (keys.debugMode !== true) return null;
  const pool = getPgPool(keys);
  if (pool) return insertLlmTracePg(pool, userId, traceData);
  return insertLlmTraceSb(keys, userId, traceData);
};

const fetchLlmTraces = async (keys, userId, limit = 50, offset = 0) => {
  const pool = getPgPool(keys);
  if (pool) {
    const res = await pool.query('SELECT * FROM llm_traces WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3', [userId, limit, offset]);
    return res.rows;
  }
  const { data, error } = await getSbClient(keys).from('llm_traces').select('*').eq('user_id', userId).order('created_at', { ascending: false }).range(offset, offset + limit - 1);
  if (error) throw error;
  return data || [];
};

module.exports = { insertJob, updateJobStatus, fetchJob, insertConfig, fetchConfig, upsertCoachPrompt, fetchCoachPrompt, wipeDatabase, insertLlmTrace, fetchLlmTraces };
