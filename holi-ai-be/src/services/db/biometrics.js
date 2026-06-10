const { getPgPool, getSbClient } = require('./core');

const insertBiometricsLog = async (keys, userId, data) => {
  const pool = getPgPool(keys);
  const logData = { user_id: userId, steps: data.steps, resting_hr: data.resting_hr, hrv_rmssd: data.hrv_rmssd, hrv_source: data.hrv_source, hrv_status: data.hrv_status, stress_score: data.stress_score, body_battery: data.body_battery, sleep_duration_seconds: data.sleep_duration_seconds, sleep_score: data.sleep_score, spo2: data.spo2, respiration_rate: data.respiration_rate, active_calories: data.active_calories };
  if (pool) {
    const fields = Object.keys(logData).filter(k => logData[k] !== undefined && logData[k] !== null);
    const placeholders = fields.map((_, i) => `$${i + 1}`).join(', ');
    const res = await pool.query(`INSERT INTO biometrics_logs (${fields.join(', ')}) VALUES (${placeholders}) RETURNING *`, fields.map(k => logData[k]));
    return res.rows[0];
  }
  const cleanData = {};
  for (const [k, v] of Object.entries(logData)) { if (v !== undefined && v !== null) cleanData[k] = v; }
  const { data: result, error } = await getSbClient(keys).from('biometrics_logs').insert(cleanData).select().single();
  if (error) throw new Error(error.message);
  return result;
};

const fetchBiometricsLogs = async (keys, userId, limit = 10, offset = 0) => {
  const pool = getPgPool(keys);
  if (pool) {
    const res = await pool.query('SELECT * FROM biometrics_logs WHERE user_id = $1 ORDER BY logged_at DESC LIMIT $2 OFFSET $3', [userId, limit, offset]);
    return res.rows;
  }
  const { data, error } = await getSbClient(keys).from('biometrics_logs').select('*').eq('user_id', userId).order('logged_at', { ascending: false }).range(offset, offset + limit - 1);
  if (error) throw new Error(error.message);
  return data || [];
};

const insertActivityLogPg = async (pool, userId, data) => {
  const q = 'INSERT INTO activity_logs (user_id, cron_id, activity_title, log_type, number_value, boolean_value, text_value) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *';
  const vals = [userId, data.cron_id, data.activity_title, data.log_type, data.number_value, data.boolean_value, data.text_value];
  const res = await pool.query(q, vals);
  return res.rows[0];
};

const insertActivityLogSb = async (keys, userId, data) => {
  const { data: inserted, error } = await getSbClient(keys).from('activity_logs').insert({
    user_id: userId, cron_id: data.cron_id, activity_title: data.activity_title, log_type: data.log_type,
    number_value: data.number_value, boolean_value: data.boolean_value, text_value: data.text_value
  }).select().single();
  if (error) throw error;
  return inserted;
};

const insertActivityLog = async (keys, userId, data) => {
  const pool = getPgPool(keys);
  if (pool) return insertActivityLogPg(pool, userId, data);
  return insertActivityLogSb(keys, userId, data);
};

const fetchActivityLogs = async (keys, userId, limit = 50, offset = 0) => {
  const pool = getPgPool(keys);
  if (pool) {
    const res = await pool.query('SELECT * FROM activity_logs WHERE user_id = $1 ORDER BY logged_at DESC LIMIT $2 OFFSET $3', [userId, limit, offset]);
    return res.rows;
  }
  const { data, error } = await getSbClient(keys).from('activity_logs').select('*').eq('user_id', userId).order('logged_at', { ascending: false }).range(offset, offset + limit - 1);
  if (error) throw error;
  return data || [];
};

module.exports = { insertBiometricsLog, fetchBiometricsLogs, insertActivityLog, fetchActivityLogs };
