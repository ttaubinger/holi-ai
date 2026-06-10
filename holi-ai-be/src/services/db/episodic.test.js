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

it('uses pgPool if neonUrl provided', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ id: 1 }] });
      const res = await db.insertEpisodicMemory({ neonUrl: 'postgres://localhost/db' }, 'usr_1', 'user', 'msg', [0.1, 0.2]);
      expect(res).toEqual({ id: 1 });
    })

it('uses supabase if no pool provided', async () => {
      const mockSelect = jest.fn().mockResolvedValue({ data: [{ id: 2 }], error: null });
      const mockInsert = jest.fn().mockReturnValue({ select: mockSelect });
      mockSbFrom.mockReturnValue({ insert: mockInsert });
      
      const res = await db.insertEpisodicMemory({}, 'usr_1', 'user', 'msg');
      expect(mockSbFrom).toHaveBeenCalledWith('episodic_memory');
      expect(res).toEqual({ id: 2 });
    })

it('throws on supabase error', async () => {
      const mockSelect = jest.fn().mockResolvedValue({ data: null, error: { message: 'DB err' } });
      mockSbFrom.mockReturnValue({ insert: jest.fn().mockReturnValue({ select: mockSelect }) });
      
      await expect(db.insertEpisodicMemory({}, 'u', 'r', 'm')).rejects.toThrow('DB err');
    })

it('uses pgPool to insert if not transient', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ id: 1 }] });
      const res = await db.upsertSystemMessage({ neonUrl: 'postgres://localhost/db' }, 'usr_1', 'Saving facts...');
      expect(res).toEqual({ id: 1 });
    })

it('uses pgPool to insert if transient', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ id: 2 }] });
      const res = await db.upsertSystemMessage({ neonUrl: 'postgres://localhost/db' }, 'usr_1', 'Network glitch');
      expect(res).toEqual({ id: 2 });
    })

it('uses supabase to insert if not transient', async () => {
      const mockSelect = jest.fn().mockResolvedValue({ data: [{ id: 2 }], error: null });
      const mockInsert = jest.fn().mockReturnValue({ select: mockSelect });
      mockSbFrom.mockReturnValue({ insert: mockInsert });
      
      const res = await db.upsertSystemMessage({}, 'usr_1', 'Building action plan...');
      expect(mockSbFrom).toHaveBeenCalledWith('episodic_memory');
      expect(res).toEqual({ id: 2 });
    })

it('uses supabase to insert if transient', async () => {
      const mockSelect = jest.fn().mockResolvedValue({ data: [{ id: 3 }], error: null });
      const mockInsert = jest.fn().mockReturnValue({ select: mockSelect });
      mockSbFrom.mockReturnValue({ insert: mockInsert });
      const res = await db.upsertSystemMessage({}, 'usr_1', 'Network glitch');
      expect(mockSbFrom).toHaveBeenCalledWith('episodic_memory');
      expect(res).toEqual({ id: 3 });
    })

it('uses pgPool', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ role: 'u', message: 'm' }] });
      const res = await db.fetchEpisodicMemory({ neonUrl: 'test' }, 'u');
      expect(res).toEqual([{ role: 'u', message: 'm' }]);
    })

it('uses supabase', async () => {
      const mockRange = jest.fn().mockResolvedValue({ data: [{ role: 's', message: 'm' }], error: null });
      mockSbFrom.mockReturnValue({ select: jest.fn().mockReturnValue({ eq: jest.fn().mockReturnValue({ order: jest.fn().mockReturnValue({ range: mockRange }) }) }) });
      const res = await db.fetchEpisodicMemory({}, 'u');
      expect(res).toEqual([{ role: 's', message: 'm' }]);
    })

it('throws error', async () => {
      const mockRange = jest.fn().mockResolvedValue({ data: null, error: { message: 'err' } });
      mockSbFrom.mockReturnValue({ select: jest.fn().mockReturnValue({ eq: jest.fn().mockReturnValue({ order: jest.fn().mockReturnValue({ range: mockRange }) }) }) });
      await expect(db.fetchEpisodicMemory({}, 'u')).rejects.toThrow('err');
    })

it('uses pgPool', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ role: 'u', message: 'm', id: 1, created_at: '2023' }] });
      const res = await db.searchEpisodicMemory({ neonUrl: 'test' }, 'u', [0.1]);
      expect(res).toEqual([{ role: 'u', message: 'm', id: 1, created_at: '2023' }]);
    })

it('fetches subsequent assistant message', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ role: 'assistant', message: 'm1', id: 1, created_at: '2023' }] })
        .mockResolvedValueOnce({ rows: [{ role: 'user', message: 'm2', id: 2, created_at: '2024' }] });
      const res = await db.searchEpisodicMemory({ neonUrl: 'test' }, 'u', [0.1]);
      expect(res).toEqual([
        { role: 'interaction', assistant_question: 'm1', user_response: 'm2', id: 1, created_at: '2023' }
      ]);
    });

it('returns empty if no pool or emb', async () => {
      const res = await db.searchEpisodicMemory({}, 'u', null);
      expect(res).toEqual([]);
    })

it('returns early if no embedding', async () => {
      await db.updateEpisodicMemoryEmbedding({}, 'id', null);
    })

it('uses pgPool', async () => {
      mockQuery.mockResolvedValueOnce({});
      await db.updateEpisodicMemoryEmbedding({ neonUrl: 'test' }, 'id', [0.1]);
      expect(mockQuery).toHaveBeenCalled();
    })

it('uses supabase and handles error', async () => {
      const mockEq = jest.fn().mockResolvedValue({ error: { message: 'err' } });
      mockSbFrom.mockReturnValue({ update: jest.fn().mockReturnValue({ eq: mockEq }) });
      await expect(db.updateEpisodicMemoryEmbedding({}, 'id', [0.1])).rejects.toThrow('err');
    })

it('uses pgPool to delete transient messages', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ id: 1, message: 'Loading AI model' }] });
      mockQuery.mockResolvedValueOnce({});
      await db.deleteTransientSystemMessages({ neonUrl: 'test' }, 'u');
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining("SELECT id, message FROM episodic_memory WHERE user_id = $1 AND role = 'system'"),
        ['u']
      );
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining("DELETE FROM episodic_memory WHERE id = ANY($1)"),
        [[1]]
      );
    })

it('uses supabase to delete transient messages', async () => {
      const mockEq2 = jest.fn().mockReturnValue({ data: [{ id: 1, message: 'Loading AI model' }] });
      const mockEq1 = jest.fn().mockReturnValue({ eq: mockEq2 });
      const mockSelect = jest.fn().mockReturnValue({ eq: mockEq1 });
      
      const mockIn = jest.fn().mockReturnValue({ error: null });
      const mockDelete = jest.fn().mockReturnValue({ in: mockIn });

      mockSbFrom.mockReturnValueOnce({ select: mockSelect }).mockReturnValueOnce({ delete: mockDelete });
      await db.deleteTransientSystemMessages({}, 'u');
      
      expect(mockSbFrom).toHaveBeenCalledWith('episodic_memory');
      expect(mockSelect).toHaveBeenCalledWith('id, message');
      expect(mockIn).toHaveBeenCalledWith('id', [1]);
    })

it('searchEpisodicMemory uses supabase with getUniqueEpisodicResults', async () => {
      const mockEq2 = jest.fn().mockReturnValue({ gt: jest.fn().mockReturnValue({ order: jest.fn().mockReturnValue({ limit: jest.fn().mockReturnValue({ data: [], error: null }) }) }), lt: jest.fn().mockReturnValue({ order: jest.fn().mockReturnValue({ limit: jest.fn().mockReturnValue({ data: [], error: null }) }) }) });
      const mSel2 = jest.fn().mockReturnValue({ eq: jest.fn().mockReturnValue({ eq: mockEq2 }) });
      const mSel1 = jest.fn().mockReturnValue({ eq: jest.fn().mockReturnValue({ neq: jest.fn().mockReturnValue({ data: [{ id: 1, role: 'user', message: 'hello', created_at: '2024-01-01', embedding: '[1,0,0]' }], error: null }) }) });
      const mockSbFromLocal = jest.fn().mockReturnValueOnce({ select: mSel1 }).mockReturnValueOnce({ select: mSel2 });
      require('@supabase/supabase-js').createClient.mockReturnValue({ from: mockSbFromLocal });
      
      const res = await db.searchEpisodicMemory({}, 'u', [1,0,0], 5);
      expect(res).toEqual([{ id: 1, role: 'interaction', assistant_question: null, user_response: 'hello', created_at: '2024-01-01' }]);
    })
