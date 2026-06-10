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

it('upsertQuestionQueue uses pgPool', async () => {
      mockQuery.mockResolvedValueOnce({});
      await db.upsertQuestionQueue({ neonUrl: 't' }, 'u', ['q']);
    })

it('upsertQuestionQueue uses supabase', async () => {
      mockSbFrom.mockReturnValue({ upsert: jest.fn().mockResolvedValue({ error: null }) });
      await db.upsertQuestionQueue({}, 'u', ['q']);
      expect(mockSbFrom).toHaveBeenCalled();
    })

it('upsertQuestionQueue throws error', async () => {
      mockSbFrom.mockReturnValue({ upsert: jest.fn().mockResolvedValue({ error: { message: 'e' } }) });
      await expect(db.upsertQuestionQueue({}, 'u', ['q'])).rejects.toThrow('e');
    })

it('fetchQuestionQueue uses pgPool', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ question_queue: ['q'] }] });
      const res = await db.fetchQuestionQueue({ neonUrl: 't' }, 'u');
      expect(res).toEqual({ queue: ['q'] });
    })

it('fetchQuestionQueue uses supabase', async () => {
      const mockSingle = jest.fn().mockResolvedValue({ data: { question_queue: ['s'] }, error: null });
      mockSbFrom.mockReturnValue({ select: jest.fn().mockReturnValue({ eq: jest.fn().mockReturnValue({ single: mockSingle }) }) });
      const res = await db.fetchQuestionQueue({}, 'u');
      expect(res).toEqual({ queue: ['s'] });
    })

it('fetchQuestionQueue throws error', async () => {
      const mockSingle = jest.fn().mockResolvedValue({ data: null, error: { message: 'e', code: '1' } });
      mockSbFrom.mockReturnValue({ select: jest.fn().mockReturnValue({ eq: jest.fn().mockReturnValue({ single: mockSingle }) }) });
      await expect(db.fetchQuestionQueue({}, 'u')).rejects.toThrow('e');
    })

it('fetchRagEnabled uses pgPool', async () => {
  mockQuery.mockResolvedValueOnce({ rows: [{ rag_enabled: true }] });
  expect(await db.fetchRagEnabled({ neonUrl: 't' }, 'u')).toBe(true);
})

it('fetchRagEnabled uses supabase', async () => {
  const mS = jest.fn().mockResolvedValue({ data: { rag_enabled: true }, error: null });
  mockSbFrom.mockReturnValue({ select: jest.fn().mockReturnValue({ eq: jest.fn().mockReturnValue({ single: mS }) }) });
  expect(await db.fetchRagEnabled({}, 'u')).toBe(true);
})

it('enableRag uses pgPool', async () => {
  mockQuery.mockResolvedValueOnce({});
  await db.enableRag({ neonUrl: 't' }, 'u');
})

it('enableRag uses supabase', async () => {
  const mEq = jest.fn().mockResolvedValue({ error: null });
  mockSbFrom.mockReturnValue({ update: jest.fn().mockReturnValue({ eq: mEq }) });
  await db.enableRag({}, 'u');
})

it('upsertQuestionQueue returns early if queue is invalid', async () => {
  await db.upsertQuestionQueue({}, 'u', null);
  await db.upsertQuestionQueue({}, 'u', "not an array");
  expect(mockSbFrom).not.toHaveBeenCalled();
})

it('fetchQuestionQueue pgPool returns empty queue if no rows', async () => {
  mockQuery.mockResolvedValueOnce({ rows: [] });
  const res = await db.fetchQuestionQueue({ neonUrl: 't' }, 'u');
  expect(res).toEqual({ queue: [] });
})

it('fetchQuestionQueue supabase returns empty queue if no data', async () => {
  const mockSingle = jest.fn().mockResolvedValue({ data: null, error: { code: 'PGRST116' } });
  mockSbFrom.mockReturnValue({ select: jest.fn().mockReturnValue({ eq: jest.fn().mockReturnValue({ single: mockSingle }) }) });
  const res = await db.fetchQuestionQueue({}, 'u');
  expect(res).toEqual({ queue: [] });
})

it('fetchRagEnabled pgPool returns false if no rows', async () => {
  mockQuery.mockResolvedValueOnce({ rows: [] });
  expect(await db.fetchRagEnabled({ neonUrl: 't' }, 'u')).toBe(false);
})

it('fetchRagEnabled supabase returns false if no data', async () => {
  const mS = jest.fn().mockResolvedValue({ data: null, error: { code: 'PGRST116' } });
  mockSbFrom.mockReturnValue({ select: jest.fn().mockReturnValue({ eq: jest.fn().mockReturnValue({ single: mS }) }) });
  expect(await db.fetchRagEnabled({}, 'u')).toBe(false);
})

it('enableRag throws error if supabase fails', async () => {
  const mEq = jest.fn().mockResolvedValue({ error: { message: 'e' } });
  mockSbFrom.mockReturnValue({ update: jest.fn().mockReturnValue({ eq: mEq }) });
  await expect(db.enableRag({}, 'u')).rejects.toThrow('e');
})
