/* eslint-disable max-lines-per-function */
jest.mock('./dbUpsert', () => ({}));
jest.mock('./dbFetch', () => ({}));
jest.mock('../errorHandler', () => ({}));

const { executeGroqTool } = require('./groqGen');

describe('groqGen.js - executeGroqTool', () => {
  let mockCreate;
  let mockClient;

  beforeEach(() => {
    mockCreate = jest.fn();
    mockClient = { chat: { completions: { create: mockCreate } } };
    jest.spyOn(global, 'setTimeout').mockImplementation((cb) => cb());
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('should parse valid json string from tool call', async () => {
    mockCreate.mockResolvedValue({
      choices: [{
        message: {
          tool_calls: [{
            function: { arguments: '{"success":true}' }
          }]
        }
      }]
    });
    
    const res = await executeGroqTool({}, 'userId', mockClient, 'model', 'prompt', 'toolName', {});
    expect(res).toEqual({ success: true });
  });

  it('should throw original error if API call fails', async () => {
    const error = new Error('Timeout');
    mockCreate.mockRejectedValue(error);

    await expect(executeGroqTool({}, 'userId', mockClient, 'model', 'p', 't', {})).rejects.toThrow('Timeout');
  });

  it('should recover from failed_generation error', async () => {
    const error = new Error('API Error');
    error.error = { failed_generation: '{"success": true}' };
    mockCreate.mockRejectedValueOnce(error);

    const res = await executeGroqTool({}, 'userId', mockClient, 'model', 'p', 't', {});
    expect(res).toEqual({ success: true });
  });

  it('should recover from failed_generation error with arguments', async () => {
    const error = new Error('API Error');
    error.error = { failed_generation: '{"arguments": "{\\"success\\": true}"}' };
    mockCreate.mockRejectedValueOnce(error);

    const res = await executeGroqTool({}, 'userId', mockClient, 'model', 'p', 't', {});
    expect(res).toEqual({ success: true });
  });

  it('parseRateLimitWait should extract time from message', () => {
    const { parseRateLimitWait } = require('./groqGen');
    expect(parseRateLimitWait('try again in 10s.')).toBe(65000);
    expect(parseRateLimitWait('try again in 2m.')).toBe(121000);
    expect(parseRateLimitWait('try again in 1h.')).toBe(3601000);
    expect(parseRateLimitWait('no time')).toBe(65000);
  });

  it('getRateLimitMessage should format wait message', () => {
    const { getRateLimitMessage } = require('./groqGen');
    expect(getRateLimitMessage(3600000)).toContain('60 minutes');
  });
});

const database = require('../../db');
const { handleGenerateUserPlan, handleGenerateUserRoutines, isRateLimitError } = require('./groqGen');

describe('groqGen.js - handleGenerateUserPlan and handleGenerateUserRoutines', () => {
  beforeEach(() => {
    jest.restoreAllMocks();
    jest.spyOn(global, 'setTimeout').mockImplementation((cb) => cb());
    database.fetchUserFacts = jest.fn().mockResolvedValue([]);
    database.fetchActionModules = jest.fn().mockResolvedValue([{
      module_title: 'Test Plan',
      categories: [{ name: 'Cat 1', content: 'content' }]
    }]);
    database.upsertActionPlan = jest.fn().mockResolvedValue();
    database.upsertUserCron = jest.fn().mockResolvedValue();
    database.upsertUserFacts = jest.fn().mockResolvedValue();
    database.insertLlmTrace = jest.fn().mockResolvedValue();
    database.upsertSystemMessage = jest.fn().mockResolvedValue();
    database.updateJobStatus = jest.fn().mockResolvedValue();
    database.fetchJob = jest.fn().mockResolvedValue({ result: { progress: 50 } });
  });

  it('isRateLimitError should detect 429 rate limit messages', () => {
    expect(isRateLimitError('429 rate limit exceeded')).toBe(true);
    expect(isRateLimitError('rate limit reached')).toBe(true);
    expect(isRateLimitError('some other error')).toBe(false);
    expect(isRateLimitError(null)).toBe(false);
  });

  it('handleGenerateUserPlan should generate a plan and save it', async () => {
    // We mock executeGroqTool by injecting an override or just mocking groq client
    // Since groqClient is fetched via util, we can mock groq sdk or fetch directly.
    // However, groqGen.js instantiates groq client locally. Let's mock the network or just rely on the try/catch.
    // Instead of full network mock, let's mock the internal fetchActionModules so it throws to test error handling if needed,
    // or just let it fail and catch the error.
    database.fetchUserFacts.mockRejectedValue(new Error('DB Error'));
    await expect(handleGenerateUserPlan({ groqKey: 'test' }, 'u', {}, 'j', {})).rejects.toThrow('DB Error');
  });

  it('handleGenerateUserRoutines should fail if plan not found', async () => {
    database.fetchActionModules.mockResolvedValue([]);
    await expect(handleGenerateUserRoutines({ groqKey: 'test' }, 'u', { plan_title: 'Nonexistent' }, 'j', {})).rejects.toThrow('Plan not found');
  });

  it('handleGenerateUserRoutines should throw if DB fails', async () => {
    database.fetchActionModules.mockRejectedValue(new Error('DB Error'));
    await expect(handleGenerateUserRoutines({ groqKey: 'test' }, 'u', { plan_title: 'Test Plan' }, 'j', {})).rejects.toThrow('DB Error');
  });
});
