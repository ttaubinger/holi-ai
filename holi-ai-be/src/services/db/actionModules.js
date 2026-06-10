const { getPgPool, getSbClient } = require('./core');

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
    await pool.query('INSERT INTO user_action_modules (user_id, module_title, description, key_metrics, categories, is_active) VALUES ($1, $2, $3, $4, $5, true) ON CONFLICT (user_id, module_title) DO UPDATE SET description=EXCLUDED.description, key_metrics=EXCLUDED.key_metrics, categories=EXCLUDED.categories, is_active=true', [userId, m.module_title, m.description || '', JSON.stringify(m.key_metrics || []), JSON.stringify(m.categories || [])]);
    return;
  }
  await getSbClient(keys).from('user_action_modules').upsert({ user_id: userId, module_title: m.module_title, description: m.description || '', key_metrics: m.key_metrics || [], categories: m.categories || [], is_active: true }, { onConflict: 'user_id,module_title' });
};

const fetchActionModules = async (keys, userId, summaryOnly = false) => {
  const pool = getPgPool(keys);
  const selectClause = summaryOnly ? 'module_title, description, is_active' : 'module_title, description, key_metrics, categories, is_active';
  if (pool) {
    const res = await pool.query(`SELECT ${selectClause} FROM user_action_modules WHERE user_id = $1 AND is_active = true`, [userId]);
    return res.rows;
  }
  const { data, error } = await getSbClient(keys).from('user_action_modules').select(selectClause).eq('user_id', userId).eq('is_active', true);
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

module.exports = { deleteActionModule, fetchActionModules, upsertActionModules };
