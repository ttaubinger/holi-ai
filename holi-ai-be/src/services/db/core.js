const { createClient } = require('@supabase/supabase-js');
const { Pool } = require('pg');

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

const getSbClient = (_keys) => {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_KEY;
  if (!url || !key) throw new Error('Missing Supabase credentials (not in request keys or environment variables)');
  return createClient(url, key);
};

module.exports = { getPgPool, getSbClient };
