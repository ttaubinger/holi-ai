const { createClient } = require('@supabase/supabase-js');
const { Pool } = require('pg');
const { getCache, setCache, deleteCache } = require('./cache');

let pgPool = null;
if (process.env.USE_LOCAL_DB === 'true') {
  pgPool = new Pool({ connectionString: process.env.DATABASE_URL });
}

const neonPools = {};
const getPgPool = (keys) => {
  if (pgPool) return pgPool;
  const url = (keys && keys.neonUrl) ? keys.neonUrl : ((keys && keys.sbConnUrl && keys.sbConnUrl.startsWith('postgres')) ? keys.sbConnUrl : null);
  if (url) {
    if (!neonPools[url]) neonPools[url] = new Pool({ connectionString: url });
    return neonPools[url];
  }
  return null;
};

const getSbClient = (keys) => {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_KEY;
  if (!url || !key) throw new Error('Missing Supabase credentials (not in request keys or environment variables)');
  return createClient(url, key);
};

const insertEpisodicMemory = async (keys, userId, role, message, embedding = null) => {
  const embStr = embedding ? `[${embedding.join(',')}]` : null;
  const pool = getPgPool(keys);
  if (pool) {
    const res = await pool.query('INSERT INTO episodic_memory (user_id, role, message, embedding) VALUES ($1, $2, $3, $4) RETURNING *', [userId, role, message, embStr]);
    return res.rows[0];
  }
  const { data, error } = await getSbClient(keys).from('episodic_memory').insert([{ user_id: userId, role, message, embedding: embStr }]).select();
  if (error) throw new Error(error.message);
  return data[0];
};

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

const fetchEpisodicMemory = async (keys, userId, limit = 10, offset = 0) => {
  const pool = getPgPool(keys);
  if (pool) {
    const res = await pool.query('SELECT role, message FROM episodic_memory WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3', [userId, limit, offset]);
    return res.rows.reverse();
  }
  const { data, error } = await getSbClient(keys).from('episodic_memory').select('role, message').eq('user_id', userId).order('created_at', { ascending: false }).range(offset, offset + limit - 1);
  if (error) throw new Error(error.message);
  return data.reverse();
};

const searchEpisodicMemory = async (keys, userId, embedding, limit = 5) => {
  const pool = getPgPool(keys);
  if (!pool || !embedding) return [];
  const embStr = `[${embedding.join(',')}]`;
  const res = await pool.query('SELECT role, message FROM episodic_memory WHERE user_id = $1 ORDER BY embedding <-> $2 LIMIT $3', [userId, embStr, limit]);
  return res.rows;
};

const deleteUserCron = async (keys, userId, cronId) => {
  const pool = getPgPool(keys);
  if (pool) {
    await pool.query('DELETE FROM user_crons WHERE user_id = $1 AND cron_id = $2', [userId, cronId]);
    return;
  }
  const { error } = await getSbClient(keys).from('user_crons').delete().match({ user_id: userId, cron_id: cronId });
  if (error) throw new Error(error.message);
};

const upsertCronRow = async (keys, userId, c) => {
  const cat = c.category || 'Custom';
  const pool = getPgPool(keys);
  if (pool) {
    await pool.query('INSERT INTO user_crons (user_id, cron_id, title, schedule, cron_expression, description, is_active, category, linked_module) VALUES ($1, $2, $3, $4, $5, $6, true, $7, $8) ON CONFLICT (user_id, cron_id) DO UPDATE SET title=EXCLUDED.title, schedule=EXCLUDED.schedule, cron_expression=EXCLUDED.cron_expression, description=EXCLUDED.description, is_active=true, category=EXCLUDED.category, linked_module=EXCLUDED.linked_module', [userId, c.cron_id, c.title, c.schedule, c.cron_expression, c.description || '', cat, c.linked_module || null]);
    return;
  }
  await getSbClient(keys).from('user_crons').upsert({ user_id: userId, cron_id: c.cron_id, title: c.title, schedule: c.schedule, cron_expression: c.cron_expression, description: c.description || '', is_active: true, category: cat, linked_module: c.linked_module || null }, { onConflict: 'user_id,cron_id' });
};

const upsertCrons = async (keys, userId, crons) => {
  if (!crons || !crons.length) return;
  for (const c of crons) {
    if (!c.cron_id) continue;
    if (c.is_active === false || c.is_active === 'false') await deleteUserCron(keys, userId, c.cron_id);
    else if (c.cron_expression && c.schedule && c.title) await upsertCronRow(keys, userId, c);
  }
};

const fetchUserCrons = async (keys, userId) => {
  const pool = getPgPool(keys);
  if (pool) {
    const res = await pool.query('SELECT cron_id, title, schedule, cron_expression, description, is_active, category, linked_module FROM user_crons WHERE user_id = $1', [userId]);
    return res.rows;
  }
  const { data, error } = await getSbClient(keys).from('user_crons').select('cron_id, title, schedule, cron_expression, description, is_active, category, linked_module').eq('user_id', userId);
  if (error) throw new Error(error.message);
  return data || [];
};

const upsertQuestionQueue = async (keys, userId, queue, ctx) => {
  const c = ctx || '';
  if (!queue || !Array.isArray(queue)) return;
  const pool = getPgPool(keys);
  if (pool) {
    await pool.query('INSERT INTO user_queues (user_id, question_queue, question_context) VALUES ($1, $2, $3) ON CONFLICT (user_id) DO UPDATE SET question_queue=EXCLUDED.question_queue, question_context=EXCLUDED.question_context', [userId, JSON.stringify(queue), c]);
    return;
  }
  const { error } = await getSbClient(keys).from('user_queues').upsert({ user_id: userId, question_queue: queue, question_context: c });
  if (error) throw new Error(error.message);
};

const fetchQuestionQueue = async (keys, userId) => {
  const pool = getPgPool(keys);
  if (pool) {
    const res = await pool.query('SELECT question_queue, question_context FROM user_queues WHERE user_id = $1', [userId]);
    return res.rows.length ? { queue: res.rows[0].question_queue, context: res.rows[0].question_context || '' } : { queue: [], context: '' };
  }
  const { data, error } = await getSbClient(keys).from('user_queues').select('question_queue, question_context').eq('user_id', userId).single();
  if (error && error.code !== 'PGRST116') throw new Error(error.message);
  return data ? { queue: data.question_queue || [], context: data.question_context || '' } : { queue: [], context: '' };
};

const deleteActionModule = async (keys, userId, title) => {
  const pool = getPgPool(keys);
  if (pool) {
    await pool.query('DELETE FROM user_action_modules WHERE user_id = $1 AND module_title = $2', [userId, title]);
    return;
  }
  const { error } = await getSbClient(keys).from('user_action_modules').delete().match({ user_id: userId, module_title: title });
  if (error) throw new Error(error.message);
};

const upsertActionModRow = async (keys, userId, m) => {
  const pool = getPgPool(keys);
  if (pool) {
    await pool.query('INSERT INTO user_action_modules (user_id, module_title, description, key_metrics, items, is_active) VALUES ($1, $2, $3, $4, $5, true) ON CONFLICT (user_id, module_title) DO UPDATE SET description=EXCLUDED.description, key_metrics=EXCLUDED.key_metrics, items=EXCLUDED.items, is_active=true', [userId, m.module_title, m.description || '', JSON.stringify(m.key_metrics || []), JSON.stringify(m.items || [])]);
    return;
  }
  await getSbClient(keys).from('user_action_modules').upsert({ user_id: userId, module_title: m.module_title, description: m.description || '', key_metrics: m.key_metrics || [], items: m.items || [], is_active: true }, { onConflict: 'user_id,module_title' });
};

const fetchActionModules = async (keys, userId) => {
  const pool = getPgPool(keys);
  if (pool) {
    const res = await pool.query('SELECT module_title, description, key_metrics, items, is_active FROM user_action_modules WHERE user_id = $1 AND is_active = true', [userId]);
    return res.rows;
  }
  const { data, error } = await getSbClient(keys).from('user_action_modules').select('module_title, description, key_metrics, items, is_active').eq('user_id', userId).eq('is_active', true);
  if (error) throw new Error(error.message);
  return data || [];
};

const slugify = (s) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();

const upsertActionModules = async (keys, userId, modules) => {
  if (!modules || !modules.length) return;
  const exist = await fetchActionModules(keys, userId);
  for (const m of modules) {
    if (!m.module_title) continue;
    const match = exist.find(e => slugify(e.module_title) === slugify(m.module_title));
    if (match) m.module_title = match.module_title;
    await upsertActionModRow(keys, userId, m);
  }
};

const upsertUserFacts = async (keys, userId, facts) => {
  if (!facts || !facts.length) return;
  const pool = getPgPool(keys);
  for (const f of facts) {
    if (!f.key || !f.value) continue;
    if (pool) {
      await pool.query('INSERT INTO user_facts (user_id, fact_key, fact_value) VALUES ($1, $2, $3) ON CONFLICT (user_id, fact_key) DO UPDATE SET fact_value=EXCLUDED.fact_value, updated_at=CURRENT_TIMESTAMP', [userId, f.key, f.value]);
    } else {
      await getSbClient(keys).from('user_facts').upsert({ user_id: userId, fact_key: f.key, fact_value: f.value, updated_at: new Date() }, { onConflict: 'user_id,fact_key' });
    }
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

const insertGarminLog = async (keys, userId, data) => {
  const pool = getPgPool(keys);
  const logData = { user_id: userId, steps: data.steps, resting_hr: data.resting_hr, hrv_rmssd: data.hrv_rmssd, hrv_source: data.hrv_source, hrv_status: data.hrv_status, stress_score: data.stress_score, body_battery: data.body_battery, sleep_duration_seconds: data.sleep_duration_seconds, sleep_score: data.sleep_score, spo2: data.spo2, respiration_rate: data.respiration_rate, active_calories: data.active_calories };
  if (pool) {
    const fields = Object.keys(logData).filter(k => logData[k] !== undefined && logData[k] !== null);
    const placeholders = fields.map((_, i) => `$${i + 1}`).join(', ');
    const res = await pool.query(`INSERT INTO garmin_health_logs (${fields.join(', ')}) VALUES (${placeholders}) RETURNING *`, fields.map(k => logData[k]));
    return res.rows[0];
  }
  const cleanData = {};
  for (const [k, v] of Object.entries(logData)) { if (v !== undefined && v !== null) cleanData[k] = v; }
  const { data: result, error } = await getSbClient(keys).from('garmin_health_logs').insert(cleanData).select().single();
  if (error) throw new Error(error.message);
  return result;
};

const fetchGarminLogs = async (keys, userId, limit = 10, offset = 0) => {
  const pool = getPgPool(keys);
  if (pool) {
    const res = await pool.query('SELECT * FROM garmin_health_logs WHERE user_id = $1 ORDER BY logged_at DESC LIMIT $2 OFFSET $3', [userId, limit, offset]);
    return res.rows;
  }
  const { data, error } = await getSbClient(keys).from('garmin_health_logs').select('*').eq('user_id', userId).order('logged_at', { ascending: false }).range(offset, offset + limit - 1);
  if (error) throw new Error(error.message);
  return data || [];
};

const wipeDbTables = async (keys, userId, tables) => {
  const pool = getPgPool(keys);
  if (pool) {
    for (const t of tables) await pool.query(`DELETE FROM ${t} WHERE user_id = $1`, [userId]);
    return;
  }
  const client = getSbClient(keys);
  for (const t of tables) await client.from(t).delete().eq('user_id', userId);
};

const wipeDatabase = async (keys, userId) => {
  const tables = ['episodic_memory', 'coach_prompts', 'user_crons', 'user_queues', 'user_action_modules', 'user_facts', 'garmin_health_logs'];
  await wipeDbTables(keys, userId, tables);
  await deleteCache(`prompt:${userId}`);
  await deleteCache(`facts:${userId}`);
  return true;
};

module.exports = { insertEpisodicMemory, fetchEpisodicMemory, searchEpisodicMemory, insertJob, updateJobStatus, fetchJob, insertConfig, fetchConfig, upsertCoachPrompt, fetchCoachPrompt, upsertCrons, fetchUserCrons, deleteUserCron, upsertQuestionQueue, fetchQuestionQueue, upsertActionModules, fetchActionModules, deleteActionModule, upsertUserFacts, fetchUserFacts, insertGarminLog, fetchGarminLogs, wipeDatabase };
