const { processAgentTurn } = require('./turnProcessor');
const { executeAgentTurn } = require('./llm');

jest.mock('./llm');
jest.mock('./tools', () => ({
  schemaEngine: { evaluateCondition: jest.fn().mockReturnValue(true) },
  KNOWN_TOOLS: new Set(['test_tool', 'send_response', 'evaluate_current_question'])
}));
jest.mock('./router', () => ({
  handleRouterFallback: jest.fn().mockReturnValue(null)
}));

describe('turnProcessor interceptors', () => {
  it('handles interceptor dequeue_question', async () => {
    const msg = { tool_calls: [{ id: '1', function: { name: 'test_tool', arguments: '{}' } }] };
    executeAgentTurn.mockResolvedValueOnce({ choices: [{ message: msg }] });
    const activeStep = { interceptors: { on_tool_call: [{ match: 'true', execute: [{ action: 'dequeue_question' }, { action: 'transition_route', target: 'next' }] }] } };
    const executor = jest.fn();
    const context = {};
    await processAgentTurn({}, [], [], executor, { onStatus: jest.fn(), lang: 'en', onTrace: jest.fn() }, context, activeStep);
    expect(executor).toHaveBeenCalledWith('dequeue_question', {});
    expect(context.lastToolCall).toBe('test_tool');
  });
});

describe('turnProcessor interceptor order', () => {
  it('executes interceptors BEFORE the actual tool call', async () => {
    const msg = { tool_calls: [{ id: '1', function: { name: 'evaluate_current_question', arguments: '{}' } }] };
    executeAgentTurn.mockResolvedValueOnce({ choices: [{ message: msg }] });
    const activeStep = { interceptors: { on_tool_call: [{ match: 'true', execute: [{ action: 'dequeue_question' }] }] } };
    const execOrder = [];
    const executor = jest.fn().mockImplementation((n) => { execOrder.push(n); return Promise.resolve({}); });
    await processAgentTurn({}, [], [], executor, { onStatus: jest.fn(), lang: 'en', onTrace: null }, {}, activeStep);
    expect(execOrder).toEqual(['dequeue_question', 'evaluate_current_question']);
  });
});

describe('turnProcessor hooks', () => {
  it('injects tools from pre_execution hooks', async () => {
    const msg = { tool_calls: [{ id: '1', function: { name: 'test_tool', arguments: '{}' } }] };
    executeAgentTurn.mockResolvedValueOnce({ choices: [{ message: msg }] });
    const activeStep = { hooks: { pre_execution: [{ if: 'true', inject_tool_call: { name: 'injected_tool' } }] } };
    await processAgentTurn({}, [], [], jest.fn(), { onStatus: null, lang: 'en', onTrace: null }, {}, activeStep);
    expect(msg.tool_calls.length).toBe(2);
    expect(msg.tool_calls[1].function.name).toBe('injected_tool');
  });
});

describe('turnProcessor conflicts', () => {
  it('validates eval conflict', async () => {
    const calls = [{ id: '1', function: { name: 'evaluate_current_question', arguments: '{}' } }, { id: '2', function: { name: 'send_response', arguments: '{"headline":"t", "diagnostic_summary":"t", "chat_message":"t"}' } }];
    executeAgentTurn.mockResolvedValueOnce({ choices: [{ message: { tool_calls: calls } }] });
    const context = { isQueueRouter: false };
    const res = await processAgentTurn({}, [], [], jest.fn(), { onStatus: null, lang: 'en', onTrace: null }, context, {});
    expect(context.stashedGreeting).toBeDefined();
    expect(res.isDone).toBe(false); // We want loop to continue to let router execute
  });
});

describe('turnProcessor tool error handling', () => {
  it('does not crash when a tool throws an error', async () => {
    const msg = { tool_calls: [{ id: '1', function: { name: 'test_tool', arguments: '{}' } }] };
    executeAgentTurn.mockResolvedValueOnce({ choices: [{ message: msg }] });
    const executor = jest.fn().mockRejectedValue(new Error('Tool failed'));
    const messages = [];
    const context = {};
    const res = await processAgentTurn({}, messages, [], executor, { onStatus: jest.fn(), lang: 'en', onTrace: jest.fn() }, context, {});
    expect(res).toBeDefined();
    const toolResultMsg = messages.find(m => m.role === 'tool');
    expect(toolResultMsg).toBeDefined();
    expect(toolResultMsg.content).toContain('Tool failed');
  });
});
