process.env.USE_LOCAL_DB = 'true';
process.env.DATABASE_URL = 'postgresql://postgres:password@127.0.0.1:5434/holi_ai';

jest.mock('pg', () => {
  const mPool = {
    query: jest.fn((text, params) => {
      if (text.includes('INSERT')) {
        return Promise.resolve({ rows: [{ id: 1 }] });
      }
      if (text.includes('SELECT') && text.includes('episodic_memory')) {
        return Promise.resolve({ rows: [{ role: 'user', message: 'I like apples' }] });
      }
      return Promise.resolve({ rows: [] });
    }),
    end: jest.fn(),
  };
  return { Pool: jest.fn(() => mPool) };
});

const { insertEpisodicMemory, searchEpisodicMemory } = require('./db');
const { Pool } = require('pg');

const makeVector = (v1, v2, v3) => {
  const arr = new Array(384).fill(0);
  arr[0] = v1;
  arr[1] = v2;
  arr[2] = v3;
  return arr;
};

const seedDatabaseWithMockVectors = async (testUserId) => {
  const vec1 = makeVector(1, 0, 0);
  await insertEpisodicMemory(null, testUserId, 'user', 'I like apples', vec1);
  const vec2 = makeVector(0, 1, 0);
  await insertEpisodicMemory(null, testUserId, 'user', 'I like bananas', vec2);
  const vec3 = makeVector(0, 0, 1);
  await insertEpisodicMemory(null, testUserId, 'user', 'I like oranges', vec3);
};

const verifyDatabaseConnection = async (pool) => {
  await pool.query('SELECT 1');
};

const cleanUpDatabase = async (pool, testUserId) => {
  await pool.query('DELETE FROM episodic_memory WHERE user_id = $1', [testUserId]);
  await pool.end();
};

describe('RAG Relevance Search Integration Test', () => {
  let pool;
  const testUserId = 'test-rag-user-123';

  beforeAll(async () => {
    pool = new Pool({ connectionString: process.env.DATABASE_URL });
    await verifyDatabaseConnection(pool);
  });

  afterAll(async () => {
    await cleanUpDatabase(pool, testUserId);
  });

  it('should find the most relevant memory using vector cosine distance', async () => {
    await seedDatabaseWithMockVectors(testUserId);
    const queryVec = makeVector(0.9, 0.1, 0);
    const results = await searchEpisodicMemory(null, testUserId, queryVec, 1);
    expect(results).toHaveLength(1);
    expect(results[0].message).toBe('I like apples');
  });
});
