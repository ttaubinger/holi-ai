const { getPgPool, getSbClient } = require('./core');

const upsertQuestionQueue = async (keys, userId, queue) => {
  if (!queue || !Array.isArray(queue)) return;
  const pool = getPgPool(keys);
  if (pool) {
    await pool.query('INSERT INTO user_queues (user_id, question_queue) VALUES ($1, $2) ON CONFLICT (user_id) DO UPDATE SET question_queue=EXCLUDED.question_queue', [userId, JSON.stringify(queue)]);
    return;
  }
  const { error } = await getSbClient(keys).from('user_queues').upsert({ user_id: userId, question_queue: queue });
  if (error) throw new Error(error.message);
};

const fetchQuestionQueue = async (keys, userId) => {
  const pool = getPgPool(keys);
  if (pool) {
    const res = await pool.query('SELECT question_queue FROM user_queues WHERE user_id = $1', [userId]);
    return res.rows.length ? { queue: res.rows[0].question_queue } : { queue: [] };
  }
  const { data, error } = await getSbClient(keys).from('user_queues').select('question_queue').eq('user_id', userId).single();
  if (error && error.code !== 'PGRST116') throw new Error(error.message);
  return data ? { queue: data.question_queue || [] } : { queue: [] };
};

const fetchRagEnabled = async (keys, userId) => {
  const pool = getPgPool(keys);
  if (pool) {
    const res = await pool.query('SELECT rag_enabled FROM user_queues WHERE user_id = $1', [userId]);
    return res.rows.length ? (res.rows[0].rag_enabled || false) : false;
  }
  const { data, error } = await getSbClient(keys).from('user_queues').select('rag_enabled').eq('user_id', userId).single();
  if (error && error.code !== 'PGRST116') throw new Error(error.message);
  return data ? (data.rag_enabled || false) : false;
};

const enableRag = async (keys, userId) => {
  const pool = getPgPool(keys);
  if (pool) {
    await pool.query('UPDATE user_queues SET rag_enabled = TRUE WHERE user_id = $1', [userId]);
    return;
  }
  const { error } = await getSbClient(keys).from('user_queues').update({ rag_enabled: true }).eq('user_id', userId);
  if (error) throw new Error(error.message);
};

module.exports = { upsertQuestionQueue, fetchQuestionQueue, fetchRagEnabled, enableRag };
