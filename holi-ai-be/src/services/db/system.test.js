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

it('uses pgPool if available', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ id: 1 }] });
      const res = await db.insertJob({ neonUrl: 'postgres://test' }, 'task', { p: 1 });
      expect(res).toEqual({ id: 1 });
    })

it('uses supabase if no pool', async () => {
      const mockSelect = jest.fn().mockResolvedValue({ data: [{ id: 2 }], error: null });
      mockSbFrom.mockReturnValue({ insert: jest.fn().mockReturnValue({ select: mockSelect }) });
      const res = await db.insertJob({}, 'task', { p: 1 });
      expect(res).toEqual({ id: 2 });
    })

it('throws error if supabase fails', async () => {
      const mockSelect = jest.fn().mockResolvedValue({ data: null, error: { message: 'err' } });
      mockSbFrom.mockReturnValue({ insert: jest.fn().mockReturnValue({ select: mockSelect }) });
      await expect(db.insertJob({}, 'task', {})).rejects.toThrow('err');
    })

it('uses pgPool if available', async () => {
      mockQuery.mockResolvedValueOnce({});
      await db.updateJobStatus({ neonUrl: 'postgres://test' }, 'job_1', 'done', { res: 'ok' });
    })

it('uses supabase if no pool', async () => {
      const mockEq = jest.fn().mockResolvedValue({ error: null });
      const mockUpdate = jest.fn().mockReturnValue({ eq: mockEq });
      mockSbFrom.mockReturnValue({ update: mockUpdate });
      await db.updateJobStatus({}, 'job_1', 'done');
      expect(mockUpdate).toHaveBeenCalled();
    })

it('throws error if supabase fails', async () => {
      const mockEq = jest.fn().mockResolvedValue({ error: { message: 'err' } });
      mockSbFrom.mockReturnValue({ update: jest.fn().mockReturnValue({ eq: mockEq }) });
      await expect(db.updateJobStatus({}, 'j', 'd')).rejects.toThrow('err');
    })

it('uses pgPool', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ id: 1 }] });
      const res = await db.fetchJob({ neonUrl: 'postgres://test' }, 'job_1');
      expect(res).toEqual({ id: 1 });
    })

it('uses supabase', async () => {
      const mockSingle = jest.fn().mockResolvedValue({ data: { id: 2 }, error: null });
      const mockEq = jest.fn().mockReturnValue({ single: mockSingle });
      const mockSelect = jest.fn().mockReturnValue({ eq: mockEq });
      mockSbFrom.mockReturnValue({ select: mockSelect });
      
      const res = await db.fetchJob({}, 'job_1');
      expect(res).toEqual({ id: 2 });
    })

it('throws on supabase error', async () => {
      const mockSingle = jest.fn().mockResolvedValue({ data: null, error: { message: 'err' } });
      mockSbFrom.mockReturnValue({ select: jest.fn().mockReturnValue({ eq: jest.fn().mockReturnValue({ single: mockSingle }) }) });
      await expect(db.fetchJob({}, 'job_1')).rejects.toThrow('err');
    })

it('uses pgPool', async () => {
      mockQuery.mockResolvedValueOnce({});
      await db.insertConfig({ neonUrl: 'postgres://test' }, 'key1', 'val1');
    })

it('uses supabase', async () => {
      mockSbFrom.mockReturnValue({ upsert: jest.fn().mockResolvedValue({ error: null }) });
      await db.insertConfig({}, 'key1', 'val1');
      expect(mockSbFrom).toHaveBeenCalledWith('system_config');
    })

it('throws on supabase error', async () => {
      mockSbFrom.mockReturnValue({ upsert: jest.fn().mockResolvedValue({ error: { message: 'err' } }) });
      await expect(db.insertConfig({}, 'k', 'v')).rejects.toThrow('err');
    })

it('uses pgPool', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ value: 'val' }] });
      const res = await db.fetchConfig({ neonUrl: 'postgres://test' }, 'key1');
      expect(res).toBe('val');
    })

it('uses supabase', async () => {
      const mockSingle = jest.fn().mockResolvedValue({ data: { value: 'sval' }, error: null });
      mockSbFrom.mockReturnValue({ select: jest.fn().mockReturnValue({ eq: jest.fn().mockReturnValue({ single: mockSingle }) }) });
      const res = await db.fetchConfig({}, 'key1');
      expect(res).toBe('sval');
    })

it('throws on supabase error', async () => {
      const mockSingle = jest.fn().mockResolvedValue({ data: null, error: { message: 'err', code: '123' } });
      mockSbFrom.mockReturnValue({ select: jest.fn().mockReturnValue({ eq: jest.fn().mockReturnValue({ single: mockSingle }) }) });
      await expect(db.fetchConfig({}, 'k')).rejects.toThrow('err');
    })

it('upsertCoachPrompt uses pgPool', async () => {
      mockQuery.mockResolvedValueOnce({});
      await db.upsertCoachPrompt({ neonUrl: 'test' }, 'u', 'prompt');
      expect(deleteCache).toHaveBeenCalledWith('prompt:u');
    })

it('upsertCoachPrompt uses supabase', async () => {
      mockSbFrom.mockReturnValue({ upsert: jest.fn().mockResolvedValue({ error: null }) });
      await db.upsertCoachPrompt({}, 'u', 'p');
      expect(mockSbFrom).toHaveBeenCalled();
    })

it('upsertCoachPrompt throws error', async () => {
      mockSbFrom.mockReturnValue({ upsert: jest.fn().mockResolvedValue({ error: { message: 'err' } }) });
      await expect(db.upsertCoachPrompt({}, 'u', 'p')).rejects.toThrow('err');
    })

it('fetchCoachPrompt uses cache', async () => {
      getCache.mockResolvedValueOnce('cached prompt');
      const res = await db.fetchCoachPrompt({}, 'u');
      expect(res).toBe('cached prompt');
    })

it('fetchCoachPrompt fetches pgPool and sets cache', async () => {
      getCache.mockResolvedValueOnce(null);
      mockQuery.mockResolvedValueOnce({ rows: [{ prompt: 'db p' }] });
      const res = await db.fetchCoachPrompt({ neonUrl: 'test' }, 'u');
      expect(res).toBe('db p');
      expect(setCache).toHaveBeenCalledWith('prompt:u', 'db p');
    })

it('fetchCoachPrompt fetches supabase', async () => {
      getCache.mockResolvedValueOnce(null);
      const mockSingle = jest.fn().mockResolvedValue({ data: { prompt: 'sb p' }, error: null });
      mockSbFrom.mockReturnValue({ select: jest.fn().mockReturnValue({ eq: jest.fn().mockReturnValue({ single: mockSingle }) }) });
      const res = await db.fetchCoachPrompt({}, 'u');
      expect(res).toBe('sb p');
    })

it('fetchCoachPrompt throws error', async () => {
      getCache.mockResolvedValueOnce(null);
      const mockSingle = jest.fn().mockResolvedValue({ data: null, error: { message: 'err', code: '1' } });
      mockSbFrom.mockReturnValue({ select: jest.fn().mockReturnValue({ eq: jest.fn().mockReturnValue({ single: mockSingle }) }) });
      await expect(db.fetchCoachPrompt({}, 'u')).rejects.toThrow('err');
    })

it('insertLlmTrace uses pgPool', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ id: 1 }] });
      const res = await db.insertLlmTrace({ neonUrl: 't', debugMode: true }, 'u', { model: 'm' });
      expect(res).toEqual({ id: 1 });
    })

it('insertLlmTrace uses supabase with JSON parsing', async () => {
      const mockSelect = jest.fn().mockResolvedValue({ data: { id: 2 }, error: null });
      mockSbFrom.mockReturnValue({ insert: jest.fn().mockReturnValue({ select: jest.fn().mockReturnValue({ single: mockSelect }) }) });
      const res = await db.insertLlmTrace({ debugMode: true }, 'u', { model: 'm', payload_input: '{"a":1}', payload_output: '{"b":2}' });
      expect(res).toEqual({ id: 2 });
    })

it('insertLlmTrace throws error on supabase', async () => {
      mockSbFrom.mockReturnValue({ insert: jest.fn().mockReturnValue({ select: jest.fn().mockReturnValue({ single: jest.fn().mockResolvedValue({ error: { message: 'err' } }) }) }) });
      await expect(db.insertLlmTrace({ debugMode: true }, 'u', { model: 'm' })).rejects.toEqual({ message: 'err' });
    })

it('fetchLlmTraces uses pgPool', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ id: 1 }] });
      const res = await db.fetchLlmTraces({ neonUrl: 't' }, 'u');
      expect(res).toEqual([{ id: 1 }]);
    })

it('fetchLlmTraces uses supabase', async () => {
      const mockRange = jest.fn().mockResolvedValue({ data: [{ id: 2 }], error: null });
      mockSbFrom.mockReturnValue({ select: jest.fn().mockReturnValue({ eq: jest.fn().mockReturnValue({ order: jest.fn().mockReturnValue({ range: mockRange }) }) }) });
      const res = await db.fetchLlmTraces({}, 'u');
      expect(res).toEqual([{ id: 2 }]);
    })

it('fetchLlmTraces handles supabase error', async () => {
      const mockRange = jest.fn().mockResolvedValue({ data: null, error: { message: 'e' } });
      mockSbFrom.mockReturnValue({ select: jest.fn().mockReturnValue({ eq: jest.fn().mockReturnValue({ order: jest.fn().mockReturnValue({ range: mockRange }) }) }) });
      await expect(db.fetchLlmTraces({}, 'u')).rejects.toEqual({ message: 'e' });
    })

it('uses pgPool', async () => {
      mockQuery.mockResolvedValue({ rows: [] });
      await db.wipeDatabase({ neonUrl: 't' }, 'u');
      expect(deleteCache).toHaveBeenCalledTimes(2);
    })

it('uses supabase', async () => {
      const mockContains = jest.fn().mockResolvedValue({ error: null });
      const mockEq = jest.fn().mockResolvedValue({ error: null });
      mockSbFrom.mockReturnValue({ delete: jest.fn().mockReturnValue({ eq: mockEq, contains: mockContains }) });
      await db.wipeDatabase({}, 'u');
      expect(mockEq).toHaveBeenCalledTimes(9);
      expect(mockContains).toHaveBeenCalledTimes(1);
      expect(deleteCache).toHaveBeenCalledTimes(2);
    })
