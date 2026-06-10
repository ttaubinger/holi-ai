/* eslint-disable max-lines-per-function */
const { handleProcessLlmError } = require('./errorHandler');
const database = require('../db');

jest.mock('../db');
jest.mock('../../agent/orchestrator');

describe('errorHandler', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    database.updateJobStatus.mockResolvedValue();
    database.insertLlmTrace.mockResolvedValue();
  });

  it('handleProcessLlmError covers traceJobFailure success', async () => {
    const job = { data: { jobId: '123' }, updateData: jest.fn() };
    const apiKeys = { debugMode: true };
    const error = new Error('Test API error');
    
    // checkAndHandleLlmError returns false for generic error
    await expect(handleProcessLlmError(error, job, { userId: 'u1' }, apiKeys)).rejects.toThrow('Test API error');
    
    expect(database.insertLlmTrace).toHaveBeenCalled();
  });

  it('handleProcessLlmError covers traceJobFailure failure', async () => {
    const job = { data: { jobId: '123' }, updateData: jest.fn() };
    const apiKeys = { debugMode: true };
    const error = new Error('Test API error');
    
    database.insertLlmTrace.mockRejectedValue(new Error('db trace error'));
    
    // checkAndHandleLlmError returns false for generic error
    await expect(handleProcessLlmError(error, job, { userId: 'u1' }, apiKeys)).rejects.toThrow('Test API error');
    
    expect(database.insertLlmTrace).toHaveBeenCalled();
  });

  it('handleProcessLlmError covers checkAndHandleLlmError internal generic error', async () => {
    const job = { data: { jobId: '123' }, updateData: jest.fn() };
    const error = new Error('rate_limit triggered internal error');
    
    // We mock checkAndHandleLlmError throwing an error internally (which isn't DelayedError).
    // The easiest way is to mock handleRateLimitError or similar, but checkAndHandleLlmError isn't exported directly.
    // However, if we pass an error with '429', it calls handleRateLimitError. If we mock db to throw, it throws.
    // We mock database.upsertSystemMessage to throw so handleRateLimitError throws.
    database.upsertSystemMessage.mockRejectedValue(new Error('Internal check error'));
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    await expect(handleProcessLlmError(error, job, { userId: 'u1' }, null)).rejects.toThrow('rate_limit triggered internal error');

    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Error inside checkAndHandleLlmError for job 123:'), expect.any(Error));
    consoleSpy.mockRestore();
  });
});
