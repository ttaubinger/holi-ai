const { getPgPool, getSbClient } = require('./core');

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

const updateEpisodicMemoryEmbedding = async (keys, memoryId, embedding) => {
  if (!embedding) return;
  const embStr = `[${embedding.join(',')}]`;
  const pool = getPgPool(keys);
  if (pool) {
    await pool.query('UPDATE episodic_memory SET embedding = $1 WHERE id = $2', [embStr, memoryId]);
    return;
  }
  const { error } = await getSbClient(keys).from('episodic_memory').update({ embedding: embStr }).eq('id', memoryId);
  if (error) throw new Error(error.message);
};

const isTransientMessage = (msgStr) => {
  if (!msgStr) return false;
  return msgStr.includes('Reading memory') || msgStr.includes('Čtení paměti') || 
         msgStr.includes('Calling tools') || msgStr.includes('Volám nástroje') || 
         msgStr.includes('Network glitch') || msgStr.includes('Síťová chyba') || 
         msgStr.includes('AI capacity limit') || msgStr.includes('limit kapacity AI') ||
         msgStr.includes('Loading AI model') || msgStr.includes('Nahrávání AI modelu');
};

const upsertSystemMessagePg = async (pool, userId, jsonMessage, _isTransient) => {
  const res = await pool.query("INSERT INTO episodic_memory (user_id, role, message) VALUES ($1, 'system', $2) RETURNING *", [userId, jsonMessage]);
  return res.rows[0];
};

const upsertSystemMessageSb = async (sbClient, userId, jsonMessage, _isTransient) => {
  const { data, error } = await sbClient.from('episodic_memory').insert([{ user_id: userId, role: 'system', message: jsonMessage }]).select();
  if (error) throw new Error(error.message);
  return data[0];
};

const upsertSystemMessage = async (keys, userId, messageText) => {
  const pool = getPgPool(keys);
  const jsonMessage = JSON.stringify({ chat_message: messageText });
  const isTransient = isTransientMessage(messageText);
  if (pool) return await upsertSystemMessagePg(pool, userId, jsonMessage, isTransient);
  return await upsertSystemMessageSb(getSbClient(keys), userId, jsonMessage, isTransient);
};

const deleteTransientSystemMessagesPg = async (pool, userId) => {
  const res = await pool.query("SELECT id, message FROM episodic_memory WHERE user_id = $1 AND role = 'system'", [userId]);
  const idsToDelete = res.rows.filter(r => isTransientMessage(r.message)).map(r => r.id);
  if (idsToDelete.length > 0) {
    await pool.query("DELETE FROM episodic_memory WHERE id = ANY($1)", [idsToDelete]);
  }
};

const deleteTransientSystemMessagesSb = async (sbClient, userId) => {
  const { data } = await sbClient.from('episodic_memory').select('id, message').eq('user_id', userId).eq('role', 'system');
  if (data && data.length > 0) {
    const idsToDelete = data.filter(r => isTransientMessage(r.message)).map(r => r.id);
    if (idsToDelete.length > 0) {
      await sbClient.from('episodic_memory').delete().in('id', idsToDelete);
    }
  }
};

const deleteTransientSystemMessages = async (keys, userId) => {
  const pool = getPgPool(keys);
  if (pool) return await deleteTransientSystemMessagesPg(pool, userId);
  return await deleteTransientSystemMessagesSb(getSbClient(keys), userId);
};

const fetchEpisodicMemory = async (keys, userId, limit = 10, offset = 0) => {
  const pool = getPgPool(keys);
  if (pool) {
    const res = await pool.query('SELECT id, role, message, created_at FROM episodic_memory WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3', [userId, limit, offset]);
    return res.rows.reverse();
  }
  const { data, error } = await getSbClient(keys).from('episodic_memory').select('id, role, message, created_at').eq('user_id', userId).order('created_at', { ascending: false }).range(offset, offset + limit - 1);
  if (error) throw new Error(error.message);
  return data.reverse();
};

const getNextUserResponse = async (keys, pool, userId, createdAt) => {
  if (pool) {
    return (await pool.query('SELECT id, role, message, created_at FROM episodic_memory WHERE user_id = $1 AND role = $2 AND created_at > $3 ORDER BY created_at ASC LIMIT 1', [userId, 'user', createdAt])).rows[0];
  }
  return (await getSbClient(keys).from('episodic_memory').select('id, role, message, created_at').eq('user_id', userId).eq('role', 'user').gt('created_at', createdAt).order('created_at', { ascending: true }).limit(1)).data?.[0];
};

const getPreviousAssistantResponse = async (keys, pool, userId, createdAt) => {
  if (pool) {
    return (await pool.query('SELECT id, role, message, created_at FROM episodic_memory WHERE user_id = $1 AND role = $2 AND created_at < $3 ORDER BY created_at DESC LIMIT 1', [userId, 'assistant', createdAt])).rows[0];
  }
  return (await getSbClient(keys).from('episodic_memory').select('id, role, message, created_at').eq('user_id', userId).eq('role', 'assistant').lt('created_at', createdAt).order('created_at', { ascending: false }).limit(1)).data?.[0];
};

const parseAssistantMessage = (message) => {
  try {
    const parsed = JSON.parse(message);
    if (parsed.chat_message) return parsed.chat_message;
  } catch (_e) { void 0; }
  return message;
};

const getAssistantInteraction = async (keys, pool, userId, row) => {
  const nextRow = await getNextUserResponse(keys, pool, userId, row.created_at);
  return { id: row.id, time: row.created_at, ast: row.message, usr: nextRow?.message || null };
};

const getUserInteraction = async (keys, pool, userId, row) => {
  const prevRow = await getPreviousAssistantResponse(keys, pool, userId, row.created_at);
  return prevRow 
    ? { id: prevRow.id, time: prevRow.created_at, ast: prevRow.message, usr: row.message }
    : { id: row.id, time: row.created_at, ast: null, usr: row.message };
};

const getInteractionData = async (keys, pool, userId, row) => {
  if (row.role === 'assistant') return getAssistantInteraction(keys, pool, userId, row);
  if (row.role === 'user') return getUserInteraction(keys, pool, userId, row);
  return null;
};

const mapEpisodicResult = async (keys, pool, userId, row) => {
  const data = await getInteractionData(keys, pool, userId, row);
  if (!data) return row;


  return {
    id: data.id,
    role: 'interaction',
    assistant_question: data.ast ? parseAssistantMessage(data.ast) : null,
    user_response: data.usr,
    created_at: data.time
  };
};

const getUniqueEpisodicResults = async (keys, userId, rows) => {
  const pool = getPgPool(keys);
  const results = await Promise.all(rows.map(row => mapEpisodicResult(keys, pool, userId, row)));
  return Array.from(new Map(results.map(r => [r.id, r])).values());
};

const { cosineDistance } = require('./utils');

const searchSupabaseEpisodic = async (keys, userId, embedding, threshold, limit) => {
  const { data, error } = await getSbClient(keys).from('episodic_memory').select('id, role, message, created_at, embedding').eq('user_id', userId).neq('role', 'system');
  if (error || !data) return [];
  return data.filter(r => r.embedding)
    .map(r => ({ ...r, distance: cosineDistance(embedding, typeof r.embedding === 'string' ? JSON.parse(r.embedding) : r.embedding) }))
    .filter(r => r.distance < threshold).sort((a, b) => a.distance - b.distance).slice(0, limit)
    .map(r => { delete r.embedding; delete r.distance; return r; });
};

const matchEpisodicEmbeddings = async (keys, pool, userId, embedding, limit) => {
  const threshold = parseFloat(keys?.ragThreshold || '0.55');
  if (pool) {
    const res = await pool.query('SELECT id, role, message, created_at FROM episodic_memory WHERE user_id = $1 AND role != $2 AND embedding <=> $3 < $4 ORDER BY embedding <=> $3 LIMIT $5', [userId, 'system', `[${embedding.join(',')}]`, threshold, limit]);
    return res.rows;
  }
  return searchSupabaseEpisodic(keys, userId, embedding, threshold, limit);
};

const searchEpisodicMemory = async (keys, userId, embedding, limit = 5) => {
  if (!embedding) return [];
  const matchedRows = await matchEpisodicEmbeddings(keys, getPgPool(keys), userId, embedding, limit);
  if (matchedRows.length === 0) return [];
  return getUniqueEpisodicResults(keys, userId, matchedRows);
};

module.exports = {
  insertEpisodicMemory, updateEpisodicMemoryEmbedding, upsertSystemMessage, deleteTransientSystemMessages,
  fetchEpisodicMemory, searchEpisodicMemory
};
