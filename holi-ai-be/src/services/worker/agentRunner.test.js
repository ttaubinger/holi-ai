/* eslint-disable max-lines-per-function */
const { runAgent } = require('./agentRunner');
const database = require('../db');
const embeddings = require('../embeddings');
const { executeAgentWorkflow } = require('../../agent/orchestrator');
const { startKeepAlive, stopKeepAlive } = require('../keepAlive');

jest.mock('../db', () => ({
  insertEpisodicMemory: jest.fn(),
  deleteTransientSystemMessages: jest.fn(),
  upsertSystemMessage: jest.fn(),
  fetchConfig: jest.fn(),
  fetchCoachPrompt: jest.fn(),
  fetchUserFacts: jest.fn(),
  fetchQuestionQueue: jest.fn(),
  fetchActionModules: jest.fn(),
  fetchEpisodicMemory: jest.fn(),
  updateJobStatus: jest.fn(),
  updateEpisodicMemoryEmbedding: jest.fn(),
  fetchJob: jest.fn()
}));

jest.mock('../embeddings', () => ({
  generateEmbedding: jest.fn(),
  isModelLoaded: jest.fn()
}));

jest.mock('../../agent/orchestrator', () => ({
  executeAgentWorkflow: jest.fn()
}));

jest.mock('./toolHandlers', () => ({ handleToolCall: jest.fn() }));
jest.mock('./errorHandler', () => ({ createStatusHandler: jest.fn(), createTraceHandler: jest.fn() }));
jest.mock('../keepAlive', () => ({ startKeepAlive: jest.fn(), stopKeepAlive: jest.fn() }));

describe('agentRunner', () => {
  const payload = { userId: 'u1', message: 'hello', lang: 'en', memoryId: 'm1' };
  
  beforeEach(() => {
    jest.clearAllMocks();
    database.fetchConfig.mockResolvedValue('Metric');
    database.fetchCoachPrompt.mockResolvedValue('prompt');
    database.fetchUserFacts.mockResolvedValue([]);
    database.fetchQuestionQueue.mockResolvedValue({ queue: [] });
    database.fetchActionModules.mockResolvedValue([]);
    database.fetchEpisodicMemory.mockResolvedValue([
      { id: 'm1', role: 'user', message: 'hello' },
      { id: 'm2', role: 'assistant', message: 'hi' },
      { id: 'm2', role: 'assistant', message: 'hi' } // duplicate to test compileHistory map
    ]);
    embeddings.isModelLoaded.mockReturnValue(false);
    embeddings.generateEmbedding.mockResolvedValue([1,2,3]);
    executeAgentWorkflow.mockResolvedValue({ chat_message: 'hi' });
  });

  it('should abort if job not found', async () => {
    database.fetchJob.mockResolvedValue(null);
    await runAgent('jobId', payload, {}, {});
    expect(database.fetchJob).toHaveBeenCalled();
    expect(executeAgentWorkflow).not.toHaveBeenCalled();
  });

  it('should resume agent job if savedMessages exists', async () => {
    database.fetchJob.mockResolvedValue({});
    await runAgent('jobId', payload, {}, { data: { savedMessages: [{role: 'user', content: 'test'}] } });
    expect(startKeepAlive).toHaveBeenCalled();
    expect(executeAgentWorkflow).toHaveBeenCalled();
    expect(stopKeepAlive).toHaveBeenCalled();
  });

  it('should run fresh agent job if no savedMessages', async () => {
    database.fetchJob.mockResolvedValue({});
    await runAgent('jobId', payload, {}, { data: {} });
    expect(database.upsertSystemMessage).toHaveBeenCalled(); // via sendLoadingStatus
    expect(database.updateEpisodicMemoryEmbedding).toHaveBeenCalled();
    expect(executeAgentWorkflow).toHaveBeenCalled();
  });

  it('should send correct loading status for cs language', async () => {
    database.fetchJob.mockResolvedValue({});
    await runAgent('jobId', { ...payload, lang: 'cs' }, {}, { data: {} });
    expect(database.upsertSystemMessage).toHaveBeenCalledWith(expect.anything(), 'u1', expect.stringContaining('Nahrávání'));
  });

  it('should compile history correctly without memoryId', async () => {
    database.fetchJob.mockResolvedValue({});
    database.fetchEpisodicMemory.mockResolvedValue([
      { id: '1', role: 'user', message: 'test1', created_at: '2023-01-01' },
      { id: '2', role: 'assistant', message: 'test2' },
      { id: '3', role: 'user', message: 'test3', created_at: '2023-01-02' }
    ]);
    await runAgent('jobId', { ...payload, memoryId: null }, {}, { data: {} });
    expect(executeAgentWorkflow).toHaveBeenCalled();
  });
});
