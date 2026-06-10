const { createClient } = require('@supabase/supabase-js');
const { getCache, setCache, deleteCache } = require('../cache');

const { Pool } = require('pg');

const db = require('./index');

jest.mock('@supabase/supabase-js');
jest.mock('pg');
jest.mock('../cache');

  const mockQuery = jest.fn().mockResolvedValue({ rows: [] });
  const mockSbFrom = jest.fn();
  
  beforeEach(() => {
    jest.clearAllMocks();
    
    mockQuery.mockResolvedValue({ rows: [] });
    Pool.mockImplementation(() => ({ query: mockQuery }));
    
    createClient.mockReturnValue({ from: mockSbFrom });

    process.env.SUPABASE_URL = 'http://supa';
    process.env.SUPABASE_KEY = 'key';

    process.env.USE_LOCAL_DB = 'false';
  });

it('upsertUserFacts uses pgPool', async () => {
      mockQuery.mockResolvedValue({ rows: [] });
      await db.upsertUserFacts({ neonUrl: 't' }, 'u', [{ key: 'k', value: 'v' }]);
      expect(deleteCache).toHaveBeenCalledWith('facts:u');
    })

it('upsertUserFacts uses supabase', async () => {
      mockSbFrom.mockReturnValue({ upsert: jest.fn().mockResolvedValue({ error: null }) });
      await db.upsertUserFacts({}, 'u', [{ key: 'k', value: 'v' }]);
      expect(mockSbFrom).toHaveBeenCalled();
    })

it('fetchUserFacts uses cache', async () => {
      getCache.mockResolvedValueOnce([{ key: 'k', value: 'v' }]);
      const res = await db.fetchUserFacts({}, 'u');
      expect(res).toEqual([{ key: 'k', value: 'v' }]);
    })

it('fetchUserFacts uses pgPool and sets cache', async () => {
      getCache.mockResolvedValueOnce(null);
      mockQuery.mockResolvedValueOnce({ rows: [{ fact_key: 'k', fact_value: 'v' }] });
      const res = await db.fetchUserFacts({ neonUrl: 't' }, 'u');
      expect(res).toEqual([{ key: 'k', value: 'v', updated_at: undefined }]);
      expect(setCache).toHaveBeenCalled();
    })

it('fetchUserFacts uses supabase', async () => {
      getCache.mockResolvedValueOnce(null);
      mockSbFrom.mockReturnValue({ select: jest.fn().mockReturnValue({ eq: jest.fn().mockResolvedValue({ data: [{ fact_key: 'k', fact_value: 'v' }], error: null }) }) });
      const res = await db.fetchUserFacts({}, 'u');
      expect(res).toEqual([{ key: 'k', value: 'v', updated_at: undefined }]);
    })

it('fetchUserFacts throws error', async () => {
      getCache.mockResolvedValueOnce(null);
      mockSbFrom.mockReturnValue({ select: jest.fn().mockReturnValue({ eq: jest.fn().mockResolvedValue({ data: null, error: { message: 'e' } }) }) });
      await expect(db.fetchUserFacts({}, 'u')).rejects.toThrow('e');
    })

it('searchUserFacts uses supabase correctly', async () => {
      const mockEq = jest.fn().mockReturnValue({ data: [{ fact_key: 'weight', fact_value: '104 kg', updated_at: '2024-01-01', embedding: '[1,0,0]' }], error: null });
      const mockSelect = jest.fn().mockReturnValue({ eq: mockEq });
      
      const mockSbFromLocal = jest.fn();
      mockSbFromLocal.mockReturnValue({ select: mockSelect });
      
      require('@supabase/supabase-js').createClient.mockReturnValue({ from: mockSbFromLocal });
      
      const res = await db.searchUserFacts({}, 'u', [1,0,0], 5);
      expect(res).toEqual([{ key: 'weight', value: '104 kg', updated_at: '2024-01-01' }]);
    })

it('searchUserFacts uses pgPool correctly', async () => {
  mockQuery.mockResolvedValueOnce({ rows: [{ fact_key: 'weight', fact_value: '104 kg', updated_at: '2024-01-01', embedding: '[1,0,0]' }] });
  const res = await db.searchUserFacts({ neonUrl: 't' }, 'u', [1,0,0], 5);
  expect(res).toEqual([{ key: 'weight', value: '104 kg', updated_at: '2024-01-01' }]);
})
