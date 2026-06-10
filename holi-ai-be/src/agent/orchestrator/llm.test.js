/* eslint-disable max-lines-per-function */
const { executeAgentTurn } = require('./llm');
const Groq = require('groq-sdk');
const tools = require('./tools');

jest.mock('groq-sdk');
jest.mock('./tools');

describe('llm.js - executeAgentTurn', () => {
  let mockCreate;
  
  beforeEach(() => {
    mockCreate = jest.fn();
    Groq.mockImplementation(() => ({
      chat: { completions: { create: mockCreate } }
    }));
    tools.getAgentTools.mockReturnValue([]);
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('should recover from json tool hallucination via error.error.failed_generation', async () => {
    const error = new Error('Bad request');
    const failedGen = JSON.stringify({
      name: 'json',
      arguments: { chat_message: 'Recovered message' }
    });
    error.error = { failed_generation: failedGen };
    mockCreate.mockRejectedValue(error);

    const result = await executeAgentTurn({ groqKey: 'test' }, [{ role: 'user', content: 'hello' }]);

    expect(result.choices[0].message.tool_calls[0].function.name).toBe('send_response');
    expect(result.choices[0].message.tool_calls[0].function.arguments).toContain('Recovered message');
    expect(console.log).toHaveBeenCalledWith('[AI] Recovering from Groq "json" tool hallucination');
  });

  it('should recover from json tool hallucination via error.message match', async () => {
    const failedGen = JSON.stringify({
      name: 'json',
      arguments: { chat_message: 'Recovered msg' }
    });
    const error = new Error(`some error {"failed_generation":"${failedGen.replace(/"/g, '\\"')}"}`);
    mockCreate.mockRejectedValue(error);

    const result = await executeAgentTurn({ groqKey: 'test' }, [{ role: 'user', content: 'hello' }]);
    
    expect(result.choices[0].message.tool_calls[0].function.name).toBe('send_response');
    expect(result.choices[0].message.tool_calls[0].function.arguments).toContain('Recovered msg');
  });

  it('should not recover if failed_generation does not match json/chat_message pattern', async () => {
    const error = new Error('Bad request');
    error.error = { failed_generation: JSON.stringify({ name: 'other_tool', arguments: {} }) };
    
    // Simulate rate limit so it throws immediately and doesn't retry endlessly
    error.message = '429 rate limit';
    mockCreate.mockRejectedValue(error);

    await expect(executeAgentTurn({ groqKey: 'test' }, [], null, 'en', null, {}, {})).rejects.toThrow('429 rate limit');
  });

  it('should invoke trace and status callbacks on error', async () => {
    const error = new Error('Network error');
    mockCreate.mockRejectedValueOnce(error).mockResolvedValueOnce({ choices: [{ message: { content: 'success' } }] });
    
    const onStatus = jest.fn();
    const onTrace = jest.fn();
    
    const res = await executeAgentTurn({ groqKey: 'test', debugMode: true }, [], onStatus, 'en', onTrace, {}, {});
    
    expect(onStatus).toHaveBeenCalledWith('Network glitch, retrying (attempt 2)...');
    expect(onTrace).toHaveBeenCalled();
    expect(res.choices[0].message.content).toBe('success');
  });
});
