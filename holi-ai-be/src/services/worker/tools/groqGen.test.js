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
    
    const res = await executeGroqTool(mockClient, 'model', 'prompt', 'toolName', {});
    expect(res).toEqual({ success: true });
  });

  it('should throw original error if API call fails', async () => {
    const error = new Error('Timeout');
    mockCreate.mockRejectedValue(error);

    await expect(executeGroqTool(mockClient, 'model', 'p', 't', {})).rejects.toThrow('Timeout');
  });
});
