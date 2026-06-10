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

it('uses pgPool', async () => {
      mockQuery.mockResolvedValueOnce({});
      await db.deleteUserCron({ neonUrl: 'test' }, 'u', 'c');
    })

it('uses supabase', async () => {
      const mockMatch = jest.fn().mockResolvedValue({ error: null });
      mockSbFrom.mockReturnValue({ delete: jest.fn().mockReturnValue({ match: mockMatch }) });
      await db.deleteUserCron({}, 'u', 'c');
      expect(mockMatch).toHaveBeenCalled();
    })

it('throws error', async () => {
      const mockMatch = jest.fn().mockResolvedValue({ error: { message: 'err' } });
      mockSbFrom.mockReturnValue({ delete: jest.fn().mockReturnValue({ match: mockMatch }) });
      await expect(db.deleteUserCron({}, 'u', 'c')).rejects.toThrow('err');
    })

it('upsertCrons uses pgPool', async () => {
      mockQuery.mockResolvedValue({ rows: [] });
      await db.upsertCrons({ neonUrl: 'test' }, 'u', [{ cron_id: '1', title: 't', schedule: 's', cron_expression: 'e', is_active: true }]);
    })

it('upsertCrons deletes if inactive', async () => {
      mockQuery.mockResolvedValue({ rows: [] });
      await db.upsertCrons({ neonUrl: 'test' }, 'u', [{ cron_id: '1', is_active: false }]);
    })

it('fetchUserCrons uses pgPool', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ cron_id: '1' }] });
      const res = await db.fetchUserCrons({ neonUrl: 'test' }, 'u');
      expect(res).toEqual([{ cron_id: '1' }]);
    })

it('fetchUserCrons uses supabase', async () => {
      mockSbFrom.mockReturnValue({ select: jest.fn().mockReturnValue({ eq: jest.fn().mockResolvedValue({ data: [{ cron_id: '2' }], error: null }) }) });
      const res = await db.fetchUserCrons({}, 'u');
      expect(res).toEqual([{ cron_id: '2' }]);
    })

it('fetchUserCrons throws error', async () => {
      mockSbFrom.mockReturnValue({ select: jest.fn().mockReturnValue({ eq: jest.fn().mockResolvedValue({ data: null, error: { message: 'err' } }) }) });
      await expect(db.fetchUserCrons({}, 'u')).rejects.toThrow('err');
    })

it('toggleUserCron uses pgPool', async () => {
      const mockQuery = jest.fn().mockResolvedValue({});
      require('pg').Pool.mockImplementation(() => ({ query: mockQuery }));
      await db.toggleUserCron({ neonUrl: 't' }, 'u', 'c', false);
    })

it('toggleUserCron uses supabase', async () => {
      const mockEq2 = jest.fn().mockResolvedValue({ error: null });
      const mockEq1 = jest.fn().mockReturnValue({ eq: mockEq2 });
      mockSbFrom.mockReturnValue({ update: jest.fn().mockReturnValue({ eq: mockEq1 }) });
      await db.toggleUserCron({}, 'u', 'c', false);
      expect(mockSbFrom).toHaveBeenCalledWith('user_crons');
    })

it('upsertCrons uses supabase', async () => {
  mockSbFrom.mockReturnValue({ upsert: jest.fn().mockResolvedValue({ error: null }) });
  await db.upsertCrons({}, 'u', [{ cron_id: '1', title: 't', schedule: 's', cron_expression: 'e', is_active: true }]);
  expect(mockSbFrom).toHaveBeenCalled();
})
