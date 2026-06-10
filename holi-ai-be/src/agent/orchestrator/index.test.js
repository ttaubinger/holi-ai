const { executeAgentWorkflow } = require('./index');
const Groq = require('groq-sdk');

jest.mock('groq-sdk');

beforeEach(() => {
  jest.clearAllMocks();
});

const makeToolCallResp = (id, name, args) => ({
  choices: [{ message: { tool_calls: [{ id, function: { name, arguments: args } }] } }]
});

const execMocks = async (mockCreate, mockExec = jest.fn(), onStatus = jest.fn(), lang = 'en', sMsgs = null, msg = 'M', prmpt = 'P', hist = []) => {
  Groq.mockImplementation(() => ({ chat: { completions: { create: mockCreate } } }));
  return executeAgentWorkflow({ groqKey: 'test-key' }, msg, prmpt, hist, lang, mockExec, [], [], onStatus, sMsgs);
};

it('should call Groq with tools and execute tool loop', async () => {
  const mockCreate = jest.fn()
    .mockResolvedValueOnce(makeToolCallResp('tc_1', 'fetch_action_plans', '{}'))
    .mockResolvedValueOnce(makeToolCallResp('tc_2', 'send_response', '{"headline":"U","diagnostic_summary":"S","chat_message":"Final response"}'));
  const mockExec = jest.fn().mockResolvedValue({ some: 'data' });
  const res = await execMocks(mockCreate, mockExec, jest.fn(), 'en', null, 'How is my plan?', 'You are a coach', [{ role: 'user', message: 'prev message' }]);
  expect(mockCreate).toHaveBeenCalledTimes(2);
  expect(mockExec).toHaveBeenCalledWith('fetch_action_plans', {});
  expect(res.headline).toBe('U');
  expect(res.chat_message).toBe('Final response');
});

it('should retry on 500 errors and trigger onStatus', async () => {
  const mockCreate = jest.fn()
    .mockRejectedValueOnce(new Error('500 Internal Server Error'))
    .mockResolvedValueOnce(makeToolCallResp('tc_1', 'send_response', '{"chat_message":"Retry success"}'));
  const mockOnStatus = jest.fn();
  const res = await execMocks(mockCreate, jest.fn(), mockOnStatus);
  expect(mockCreate).toHaveBeenCalledTimes(2);
  expect(mockOnStatus).toHaveBeenCalledWith(expect.stringContaining('Network glitch'));
  expect(res.chat_message).toBe('Retry success');
});

it('should immediately throw on 429 rate limit error', async () => {
  const mockCreate = jest.fn().mockRejectedValue(new Error('429 Rate Limit Exceeded'));
  await expect(execMocks(mockCreate)).rejects.toThrow('429');
  expect(mockCreate).toHaveBeenCalledTimes(1);
});

it('should truncate massive dumps in send_response chat_message', async () => {
  const mockCreate = jest.fn()
    .mockResolvedValueOnce(makeToolCallResp('tc_1', 'send_response', JSON.stringify({ chat_message: 'A'.repeat(600) })));
  const res = await execMocks(mockCreate);
  expect(mockCreate).toHaveBeenCalledTimes(1);
  expect(res.chat_message.length).toBeLessThan(600);
  expect(res.chat_message).toContain('[Message truncated.');
});

it('should handle fallback JSON parsing correctly', async () => {
  const mockCreate = jest.fn().mockResolvedValueOnce({
    choices: [{ message: { content: '{"chat_message": "Fallback JSON parsing works"}' } }]
  });
  const res = await execMocks(mockCreate);
  expect(res.chat_message).toBe('Fallback JSON parsing works');
});

it('should handle raw text fallback when max iterations are hit', async () => {
  const mockCreate = jest.fn().mockResolvedValue({
    choices: [{ message: { content: 'Just raw text without tools' } }]
  });
  const res = await execMocks(mockCreate);
  expect(res.chat_message).toBe('Just raw text without tools');
});



it('should return null when extractSendResponse fails to parse JSON', async () => {
  const mockCreate = jest.fn()
    .mockResolvedValueOnce(makeToolCallResp('tc_1', 'send_response', '{bad_json}'))
    .mockResolvedValueOnce({ choices: [{ message: { content: 'Just raw text without tools' } }] });
  const res = await execMocks(mockCreate);
  expect(res.chat_message).toBe('Just raw text without tools');
});



it('should resume using savedMessages if provided', async () => {
  const mockCreate = jest.fn().mockResolvedValueOnce(makeToolCallResp('tc_1', 'send_response', '{"chat_message":"Resumed message"}'));
  const savedMessages = [{ role: 'system', content: 'saved state' }];
  const res = await execMocks(mockCreate, jest.fn(), jest.fn(), 'en', savedMessages);
  expect(mockCreate).toHaveBeenCalledTimes(1);
  expect(res.chat_message).toBe('Resumed message');
});

it('should skip unhandled tool response correctly', async () => {
  const mockCreate = jest.fn()
    .mockResolvedValueOnce(makeToolCallResp('tc_1', 'unknown_tool_blabla', '{}'))
    .mockResolvedValueOnce(makeToolCallResp('tc_1', 'send_response', '{"chat_message":"Recovered"}'));
  const res = await execMocks(mockCreate);
  expect(mockCreate).toHaveBeenCalledTimes(2);
  expect(res.chat_message).toBe('Recovered');
});

it('should abort loop if fallback text is returned twice in a row', async () => {
  const mockCreate = jest.fn().mockResolvedValue({
    choices: [{ message: { content: 'Just raw text without tools' } }]
  });
  const res = await execMocks(mockCreate);
  expect(mockCreate).toHaveBeenCalledTimes(1);
  expect(res.chat_message).toBe('Just raw text without tools');
});

it('should execute fetch_facts correctly', async () => {
  const mockCreate = jest.fn()
    .mockResolvedValueOnce(makeToolCallResp('tc_1', 'fetch_facts', '{"query":"who am i"}'))
    .mockResolvedValueOnce(makeToolCallResp('tc_2', 'send_response', '{"chat_message":"A"}'));
  const mockExec = jest.fn().mockResolvedValue({ success: true, facts: [] });
  const res = await execMocks(mockCreate, mockExec);
  expect(mockCreate).toHaveBeenCalledTimes(2);
  expect(res.chat_message).toBe('A');
});

it('should execute schedule_cron correctly', async () => {
  const mockCreate = jest.fn()
    .mockResolvedValueOnce(makeToolCallResp('tc_1', 'schedule_cron', '{"schedule":"0 9 * * *"}'))
    .mockResolvedValueOnce(makeToolCallResp('tc_2', 'send_response', '{"chat_message":"A"}'));
  const mockExec = jest.fn().mockResolvedValue({ success: true, cron_id: 1 });
  const res = await execMocks(mockCreate, mockExec);
  expect(res.chat_message).toBe('A');
});



it('should handle getPendingQuestions missing argument gracefully', () => {
  const { getPendingQuestions } = require('./index');
  const pending = getPendingQuestions({ content: '{bad_json}' });
  expect(pending).toBe('Unknown');
});

it('should fallback to chat message if agent fails to dequeue or send response', async () => {
  const mockCreate = jest.fn().mockResolvedValueOnce(makeToolCallResp('tc_2', 'some_other_tool', '{}'));
  const savedMessages = [
    { role: 'user', content: 'Current pending question to evaluate: q1\n\nRetrieved facts: []' },
    { role: 'assistant', tool_calls: [{ id: 'tc_1', function: { name: 'evaluate_current_question', arguments: '{}' } }] },
    { role: 'tool', tool_call_id: 'tc_1', name: 'evaluate_current_question', content: '{"question":"q1","retrieved_facts":[]}' }
  ];
  const res = await execMocks(mockCreate, jest.fn(), jest.fn(), 'en', savedMessages);
  expect(mockCreate).toHaveBeenCalledTimes(1);
  expect(res.headline).toBe('Additional Info Needed');
  expect(res.chat_message).toBe('q1');
});

it('should continue if queue router sends response', async () => {
  const mockCreate = jest.fn()
    .mockResolvedValueOnce(makeToolCallResp('tc_2', 'send_response', '{"chat_message":"All answered"}'));
  const savedMessages = [
    { role: 'user', content: 'Current pending question to evaluate: q1\n\nRetrieved facts: []' },
    { role: 'assistant', tool_calls: [{ id: 'tc_1', function: { name: 'evaluate_current_question', arguments: '{}' } }] },
    { role: 'tool', tool_call_id: 'tc_1', name: 'evaluate_current_question', content: '{"question":"q1","retrieved_facts":[]}' }
  ];
  const mockExec = jest.fn().mockResolvedValue({ success: true, retrieved_facts: [] });
  const res = await execMocks(mockCreate, mockExec, jest.fn(), 'en', savedMessages);
  expect(mockCreate).toHaveBeenCalledTimes(1);
  expect(res.chat_message).toBe('All answered');
});

it('should continue if queue router dequeues question', async () => {
  const mockCreate = jest.fn()
    .mockResolvedValueOnce(makeToolCallResp('tc_2', 'dequeue_question', '{}'))
    .mockResolvedValueOnce(makeToolCallResp('tc_3', 'send_response', '{"chat_message":"Next"}'));
  const savedMessages = [
    { role: 'user', content: 'Current pending question to evaluate: q1\n\nRetrieved facts: []' },
    { role: 'assistant', tool_calls: [{ id: 'tc_1', function: { name: 'evaluate_current_question', arguments: '{}' } }] },
    { role: 'tool', tool_call_id: 'tc_1', name: 'evaluate_current_question', content: '{"question":"q1","retrieved_facts":[]}' }
  ];
  const mockExec = jest.fn().mockResolvedValue({ success: true, retrieved_facts: [] });
  const res = await execMocks(mockCreate, mockExec, jest.fn(), 'en', savedMessages);
  expect(mockCreate).toHaveBeenCalledTimes(2);
  expect(res.chat_message).toBe('Next');
});

it('should restrict tools to Discovery phase when primary_goal is missing', async () => {
  const mockCreate = jest.fn().mockResolvedValueOnce(makeToolCallResp('tc_1', 'send_response', '{"chat_message":"A"}'));
  const Groq = require('groq-sdk');
  Groq.mockImplementation(() => ({ chat: { completions: { create: mockCreate } } }));
  await executeAgentWorkflow({ groqKey: 'test-key' }, 'Msg', 'Prompt', [], 'en', jest.fn(), [], []);
  expect(mockCreate).toHaveBeenCalledTimes(1);
  const toolsPassed = mockCreate.mock.calls[0][0].tools;
  const toolNames = toolsPassed.map(t => t.function.name);
  expect(toolNames).toContain('enqueue_questions');
  expect(toolNames).not.toContain('fetch_action_plans');
  expect(toolNames).not.toContain('generate_user_plan');
});

const makePlanRoutinesMock = () => jest.fn()
  .mockResolvedValueOnce({ choices: [{ message: { content: 'leaked', tool_calls: [{ id: '1', function: { name: 'generate_user_plan', arguments: '{"topic":"Lose weight"}' } }] } }] })
  .mockResolvedValueOnce({ choices: [{ message: { content: '', tool_calls: [
    { id: '2', function: { name: 'generate_user_routines', arguments: '{"plan_title":"Lose weight"}' } },
    { id: '3', function: { name: 'send_response', arguments: '{"headline":"Ready","diagnostic_summary":"","chat_message":"Your plan and routines are ready. Check the Plans tab."}' } }
  ] } }] });

it('should chain generate_user_plan -> generate_user_routines and send brief response', async () => {
  const mockCreate = makePlanRoutinesMock();
  Groq.mockImplementation(() => ({ chat: { completions: { create: mockCreate } } }));
  const mockExec = jest.fn().mockResolvedValue({ success: true });
  const res = await executeAgentWorkflow({ groqKey: 'k' }, 'M', 'P', [], 'en', mockExec, [{ key: 'primary_goal', value: 'Lose weight' }], []);

  expect(mockExec).toHaveBeenCalledWith('generate_user_plan', expect.anything());
  expect(mockExec).toHaveBeenCalledWith('generate_user_routines', expect.anything());
  expect(mockCreate.mock.calls[0][0].tool_choice).toBe('required');
  expect(mockCreate.mock.calls[1][0].tool_choice).toBe('required');
  expect(res.chat_message.toLowerCase()).toContain('plan');
});

it('should NOT emit plan-ready when plan_generation enqueues questions instead', async () => {
  const mockCreate = jest.fn().mockResolvedValueOnce({ choices: [{ message: { content: 'leaked', tool_calls: [
    { id: '1', function: { name: 'enqueue_questions', arguments: '{"questions":[{"question":"Any injuries?"}]}' } },
    { id: '2', function: { name: 'send_response', arguments: '{"headline":"More Info","diagnostic_summary":"","chat_message":"Can you tell me more about your current fitness level?"}' } }
  ] } }] })
  .mockResolvedValue({ choices: [{ message: { content: 'mock router', tool_calls: [
    { id: '3', function: { name: 'send_response', arguments: '{"headline":"Question","diagnostic_summary":"","chat_message":"What is your age?"}' } }
  ] } }] });
  Groq.mockImplementation(() => ({ chat: { completions: { create: mockCreate } } }));
  const res = await executeAgentWorkflow({ groqKey: 'k' }, 'M', 'P', [], 'en', jest.fn().mockResolvedValue({ success: true }), [{ key: 'primary_goal', value: 'Lose weight' }], []);
  expect((res.chat_message || '').toLowerCase()).not.toContain('plan and routines are ready');
  expect((res.chat_message || '').toLowerCase()).not.toContain('plan is ready');
});

it('should surface send_response message when routines generation is skipped', async () => {
  const mockCreate = jest.fn()
    .mockResolvedValueOnce({ choices: [{ message: { content: '', tool_calls: [{ id: '1', function: { name: 'generate_user_plan', arguments: '{"topic":"Lose weight"}' } }] } }] })
    .mockResolvedValueOnce({ choices: [{ message: { content: '', tool_calls: [{ id: '2', function: { name: 'send_response', arguments: '{"headline":"Plan Ready","diagnostic_summary":"","chat_message":"Your plan is ready. Check the Plans tab."}' } }] } }] });
  Groq.mockImplementation(() => ({ chat: { completions: { create: mockCreate } } }));
  const res = await executeAgentWorkflow({ groqKey: 'k' }, 'M', 'P', [], 'en', jest.fn().mockResolvedValue({ success: true }), [{ key: 'primary_goal', value: 'Lose weight' }], []);
  expect(res.chat_message.toLowerCase()).toContain('plan is ready');
});

it('should NOT emit plan-ready when generate_user_plan tool returns error', async () => {
  const mockCreate = jest.fn()
    .mockResolvedValueOnce({ choices: [{ message: { content: '', tool_calls: [{ id: '1', function: { name: 'generate_user_plan', arguments: '{"topic":"X"}' } }] } }] })
    .mockResolvedValue({ choices: [{ message: { content: '', tool_calls: [{ id: '2', function: { name: 'send_response', arguments: '{"chat_message":"Sorry, retrying."}' } }] } }] });
  Groq.mockImplementation(() => ({ chat: { completions: { create: mockCreate } } }));
  const res = await executeAgentWorkflow({ groqKey: 'k' }, 'M', 'P', [], 'en', jest.fn().mockResolvedValue({ error: 'fail' }), [{ key: 'primary_goal', value: 'Lose weight' }], []);
  expect((res.chat_message || '').toLowerCase()).not.toContain('plan is ready');
  expect((res.chat_message || '').toLowerCase()).not.toContain('plan and routines are ready');
});

it('should unlock advanced tools when primary_goal is present (Planning phase)', async () => {
  const mockCreate = jest.fn().mockResolvedValueOnce(makeToolCallResp('tc_1', 'send_response', '{"chat_message":"A"}'));
  const Groq = require('groq-sdk');
  Groq.mockImplementation(() => ({ chat: { completions: { create: mockCreate } } }));
  const facts = [{ key: 'primary_goal', value: 'Lose weight' }];
  await executeAgentWorkflow({ groqKey: 'test-key' }, 'Msg', 'Prompt', [], 'en', jest.fn(), facts, []);
  expect(mockCreate).toHaveBeenCalledTimes(1);
  const toolsPassed = mockCreate.mock.calls[0][0].tools;
  const toolNames = toolsPassed.map(t => t.function.name);
  expect(toolNames).toContain('generate_user_plan');
  
});
