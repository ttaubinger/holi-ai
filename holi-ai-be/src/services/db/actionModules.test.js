const { createClient } = require('@supabase/supabase-js');
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

it('deleteActionModule uses pgPool', async () => {
      mockQuery.mockResolvedValueOnce({});
      await db.deleteActionModule({ neonUrl: 't' }, 'u', 'm');
    })

it('deleteActionModule uses supabase', async () => {
      const mockMatch = jest.fn().mockResolvedValue({ error: null });
      mockSbFrom.mockReturnValue({ delete: jest.fn().mockReturnValue({ match: mockMatch }) });
      await db.deleteActionModule({}, 'u', 'm');
      expect(mockMatch).toHaveBeenCalled();
    })

it('deleteActionModule throws error', async () => {
      const mockMatch = jest.fn().mockResolvedValue({ error: { message: 'e' } });
      mockSbFrom.mockReturnValue({ delete: jest.fn().mockReturnValue({ match: mockMatch }) });
      await expect(db.deleteActionModule({}, 'u', 'm')).rejects.toThrow('e');
    })

it('upsertActionModules uses pgPool', async () => {
      mockQuery.mockResolvedValue({ rows: [] });
      await db.upsertActionModules({ neonUrl: 't' }, 'u', [{ module_title: 'm' }]);
    })

it('fetchActionModules uses pgPool', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ module_title: 'm' }] });
      const res = await db.fetchActionModules({ neonUrl: 't' }, 'u');
      expect(res).toEqual([{ module_title: 'm' }]);
    })

it('fetchActionModules uses supabase', async () => {
      mockSbFrom.mockReturnValue({ select: jest.fn().mockReturnValue({ eq: jest.fn().mockReturnValue({ eq: jest.fn().mockResolvedValue({ data: [{ module_title: 'm' }], error: null }) }) }) });
      const res = await db.fetchActionModules({}, 'u');
      expect(res).toEqual([{ module_title: 'm' }]);
    })

it('fetchActionModules throws error', async () => {
      mockSbFrom.mockReturnValue({ select: jest.fn().mockReturnValue({ eq: jest.fn().mockReturnValue({ eq: jest.fn().mockResolvedValue({ data: null, error: { message: 'e' } }) }) }) });
      await expect(db.fetchActionModules({}, 'u')).rejects.toThrow('e');
    })

it('upsertActionModules uses supabase', async () => {
  const mEq = jest.fn().mockReturnValue({ eq: jest.fn().mockResolvedValue({ data: [{ module_title: 'm' }], error: null }) });
  mockSbFrom.mockReturnValueOnce({ select: jest.fn().mockReturnValue({ eq: mEq }) });
  mockSbFrom.mockReturnValueOnce({ upsert: jest.fn().mockResolvedValue({ error: null }) });
  await db.upsertActionModules({}, 'u', [{ module_title: 'm' }]);
})

it('fetchActionModules uses pgPool summaryOnly', async () => {
  mockQuery.mockResolvedValueOnce({ rows: [{ module_title: 'm' }] });
  await db.fetchActionModules({ neonUrl: 't' }, 'u', true);
})
