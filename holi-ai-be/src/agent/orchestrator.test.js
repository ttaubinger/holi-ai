const { executeAgentWorkflow } = require('./orchestrator');
const Groq = require('groq-sdk');

jest.mock('groq-sdk');

describe('executeAgentWorkflow', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should call Groq with tools and execute tool loop', async () => {
    const mockCreate = jest.fn()
      .mockResolvedValueOnce({
        choices: [{ message: { tool_calls: [{ id: 'tc_1', function: { name: 'fetch_garmin_logs', arguments: '{"days":3}' } }] } }]
      })
      .mockResolvedValueOnce({
        choices: [{ message: { content: 'This is the final response based on Garmin logs.' } }]
      });

    Groq.mockImplementation(() => {
      return { chat: { completions: { create: mockCreate } } };
    });

    const mockToolExecutor = jest.fn().mockResolvedValue({ garmin: 'data' });

    const apiKeys = { groqKey: 'test-key' };
    const res = await executeAgentWorkflow(
      apiKeys, 
      'How is my sleep?', 
      'You are a coach', 
      [{ role: 'user', message: 'prev message' }], 
      'en', 
      mockToolExecutor
    );

    expect(mockCreate).toHaveBeenCalledTimes(2);
    expect(mockToolExecutor).toHaveBeenCalledWith('fetch_garmin_logs', { days: 3 });
    expect(res).toBe('This is the final response based on Garmin logs.');
  });
});
