const { getPgPool, getSbClient } = require('./core');

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
    await pool.query('INSERT INTO user_crons (user_id, cron_id, title, schedule, cron_expression, description, is_active, category, linked_module, requires_logging, log_type, log_unit) VALUES ($1, $2, $3, $4, $5, $6, true, $7, $8, $9, $10, $11) ON CONFLICT (user_id, cron_id) DO UPDATE SET title=EXCLUDED.title, schedule=EXCLUDED.schedule, cron_expression=EXCLUDED.cron_expression, description=EXCLUDED.description, is_active=true, category=EXCLUDED.category, linked_module=EXCLUDED.linked_module, requires_logging=EXCLUDED.requires_logging, log_type=EXCLUDED.log_type, log_unit=EXCLUDED.log_unit', [userId, c.cron_id, c.title, c.schedule, c.cron_expression, c.description || '', cat, c.linked_module || null, c.requires_logging || false, c.log_type || null, c.log_unit || null]);
    return;
  }
  await getSbClient(keys).from('user_crons').upsert({ user_id: userId, cron_id: c.cron_id, title: c.title, schedule: c.schedule, cron_expression: c.cron_expression, description: c.description || '', is_active: true, category: cat, linked_module: c.linked_module || null, requires_logging: c.requires_logging || false, log_type: c.log_type || null, log_unit: c.log_unit || null }, { onConflict: 'user_id,cron_id' });
};

const toggleUserCron = async (keys, userId, cronId, isActive) => {
  const pool = getPgPool(keys);
  if (pool) {
    await pool.query('UPDATE user_crons SET is_active = $1 WHERE user_id = $2 AND cron_id = $3', [isActive, userId, cronId]);
    return;
  }
  await getSbClient(keys).from('user_crons').update({ is_active: isActive }).eq('user_id', userId).eq('cron_id', cronId);
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
    const res = await pool.query('SELECT cron_id, title, schedule, cron_expression, description, is_active, category, linked_module, requires_logging, log_type, log_unit FROM user_crons WHERE user_id = $1', [userId]);
    return res.rows;
  }
  const { data, error } = await getSbClient(keys).from('user_crons').select('cron_id, title, schedule, cron_expression, description, is_active, category, linked_module, requires_logging, log_type, log_unit').eq('user_id', userId);
  if (error) throw new Error(error.message);
  return data || [];
};

module.exports = { upsertCrons, fetchUserCrons, deleteUserCron, toggleUserCron };
