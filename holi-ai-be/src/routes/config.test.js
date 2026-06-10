const fastify = require('fastify');
const configRoutes = require('./config');
const db = require('../services/db');

jest.mock('../services/db', () => ({
  insertConfig: jest.fn(),
  fetchConfig: jest.fn(),
  fetchCoachPrompt: jest.fn(),
  upsertCoachPrompt: jest.fn(),
  wipeDatabase: jest.fn(),
}));

jest.mock('node:fs', () => ({
  readFileSync: jest.fn().mockReturnValue('mock sql'),
}));

jest.mock('pg', () => ({
  Pool: jest.fn().mockImplementation(() => ({
    query: jest.fn().mockResolvedValue(true),
    end: jest.fn().mockResolvedValue(true),
  })),
}));

describe('config routes', () => {
  let app;

  beforeAll(async () => {
    app = fastify();
    app.register(configRoutes);
    await app.ready();
  });

  afterAll(() => app.close());

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('POST /config/sync should fail if config missing', async () => {
    const res = await app.inject({ method: 'POST', url: '/config/sync', payload: {} });
    expect(res.statusCode).toBe(400);
  });

  it('POST /config/sync should insert config', async () => {
    const payload = { config: { GROQ_KEY: 'test-key' } };
    const res = await app.inject({ method: 'POST', url: '/config/sync', payload });
    expect(res.statusCode).toBe(200);
    expect(db.insertConfig).toHaveBeenCalled();
  });

  it('GET /config/sync should return config', async () => {
    db.fetchConfig.mockResolvedValue('test-val');
    const res = await app.inject({ method: 'GET', url: '/config/sync' });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.payload)).toHaveProperty('config');
  });

  it('POST /config/wipe should fail without userId', async () => {
    const res = await app.inject({ method: 'POST', url: '/config/wipe' });
    expect(res.statusCode).toBe(400);
  });

  it('POST /config/wipe should wipe database', async () => {
    const res = await app.inject({ method: 'POST', url: '/config/wipe?userId=user123' });
    expect(res.statusCode).toBe(200);
    expect(db.wipeDatabase).toHaveBeenCalled();
  });

  it('GET /config/prompt should return prompt', async () => {
    db.fetchCoachPrompt.mockResolvedValue('test prompt');
    const res = await app.inject({ method: 'GET', url: '/config/prompt?userId=user123' });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.payload).prompt).toBe('test prompt');
  });
  
  it('GET /config/prompt should fail without userId', async () => {
    const res = await app.inject({ method: 'GET', url: '/config/prompt' });
    expect(res.statusCode).toBe(400);
  });

  it('POST /config/prompt should fail without userId', async () => {
    const res = await app.inject({ method: 'POST', url: '/config/prompt', payload: {} });
    expect(res.statusCode).toBe(400);
  });

  it('POST /config/prompt should upsert prompt', async () => {
    const res = await app.inject({ method: 'POST', url: '/config/prompt', payload: { userId: 'user123', prompt: 'test' } });
    expect(res.statusCode).toBe(200);
    expect(db.upsertCoachPrompt).toHaveBeenCalled();
  });
});
