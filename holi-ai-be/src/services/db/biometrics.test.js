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

it('insertBiometricsLog uses pgPool', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ id: 1 }] });
      const res = await db.insertBiometricsLog({ neonUrl: 't' }, 'u', { steps: 1000 });
      expect(res).toEqual({ id: 1 });
    })

it('insertBiometricsLog uses supabase', async () => {
      const mockSingle = jest.fn().mockResolvedValue({ data: { id: 2 }, error: null });
      mockSbFrom.mockReturnValue({ insert: jest.fn().mockReturnValue({ select: jest.fn().mockReturnValue({ single: mockSingle }) }) });
      const res = await db.insertBiometricsLog({}, 'u', { steps: 1000 });
      expect(res).toEqual({ id: 2 });
    })

it('insertBiometricsLog throws error', async () => {
      const mockSingle = jest.fn().mockResolvedValue({ data: null, error: { message: 'e' } });
      mockSbFrom.mockReturnValue({ insert: jest.fn().mockReturnValue({ select: jest.fn().mockReturnValue({ single: mockSingle }) }) });
      await expect(db.insertBiometricsLog({}, 'u', {})).rejects.toThrow('e');
    })

it('fetchBiometricsLogs uses pgPool', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ id: 1 }] });
      const res = await db.fetchBiometricsLogs({ neonUrl: 't' }, 'u');
      expect(res).toEqual([{ id: 1 }]);
    })

it('fetchBiometricsLogs uses supabase', async () => {
      const mockRange = jest.fn().mockResolvedValue({ data: [{ id: 2 }], error: null });
      mockSbFrom.mockReturnValue({ select: jest.fn().mockReturnValue({ eq: jest.fn().mockReturnValue({ order: jest.fn().mockReturnValue({ range: mockRange }) }) }) });
      const res = await db.fetchBiometricsLogs({}, 'u');
      expect(res).toEqual([{ id: 2 }]);
    })

it('fetchBiometricsLogs throws error', async () => {
      const mockRange = jest.fn().mockResolvedValue({ data: null, error: { message: 'e' } });
      mockSbFrom.mockReturnValue({ select: jest.fn().mockReturnValue({ eq: jest.fn().mockReturnValue({ order: jest.fn().mockReturnValue({ range: mockRange }) }) }) });
      await expect(db.fetchBiometricsLogs({}, 'u')).rejects.toThrow('e');
    })

it('insertActivityLog uses pgPool', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ id: 1 }] });
      const res = await db.insertActivityLog({ neonUrl: 't' }, 'u', { activity_title: 't' });
      expect(res).toEqual({ id: 1 });
    })

it('insertActivityLog uses supabase', async () => {
      const mockSelect = jest.fn().mockResolvedValue({ data: { id: 2 }, error: null });
      mockSbFrom.mockReturnValue({ insert: jest.fn().mockReturnValue({ select: jest.fn().mockReturnValue({ single: mockSelect }) }) });
      const res = await db.insertActivityLog({}, 'u', { activity_title: 't' });
      expect(res).toEqual({ id: 2 });
    })

it('insertActivityLog throws error on supabase', async () => {
      mockSbFrom.mockReturnValue({ insert: jest.fn().mockReturnValue({ select: jest.fn().mockReturnValue({ single: jest.fn().mockResolvedValue({ error: { message: 'err' } }) }) }) });
      await expect(db.insertActivityLog({}, 'u', { activity_title: 't' })).rejects.toEqual({ message: 'err' });
    })

it('fetchActivityLogs uses pgPool', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ id: 1 }] });
      const res = await db.fetchActivityLogs({ neonUrl: 't' }, 'u');
      expect(res).toEqual([{ id: 1 }]);
    })

it('fetchActivityLogs uses supabase', async () => {
      const mockRange = jest.fn().mockResolvedValue({ data: [{ id: 2 }], error: null });
      mockSbFrom.mockReturnValue({ select: jest.fn().mockReturnValue({ eq: jest.fn().mockReturnValue({ order: jest.fn().mockReturnValue({ range: mockRange }) }) }) });
      const res = await db.fetchActivityLogs({}, 'u');
      expect(res).toEqual([{ id: 2 }]);
    })

it('fetchActivityLogs handles supabase error', async () => {
      const mockRange = jest.fn().mockResolvedValue({ data: null, error: { message: 'e' } });
      mockSbFrom.mockReturnValue({ select: jest.fn().mockReturnValue({ eq: jest.fn().mockReturnValue({ order: jest.fn().mockReturnValue({ range: mockRange }) }) }) });
      await expect(db.fetchActivityLogs({}, 'u')).rejects.toEqual({ message: 'e' });
    })
