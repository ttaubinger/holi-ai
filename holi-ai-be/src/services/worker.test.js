let capturedProcessTask;
let capturedOnFailed;

jest.mock('bullmq', () => {
  class MockWorker {
    constructor(queueName, processFn) {
      capturedProcessTask = processFn;
    }
    on(event, handler) {
      if (event === 'failed') capturedOnFailed = handler;
    }
  }
  class MockQueue {}
  class MockDelayedError extends Error {}
  return { Worker: MockWorker, Queue: MockQueue, DelayedError: MockDelayedError };
});

jest.mock('./db');

const setupDbMock1 = () => {
  const db = require('./db');
  db.updateJobStatus.mockResolvedValue(true);
  db.insertEpisodicMemory.mockResolvedValue(true);
  db.upsertSystemMessage.mockResolvedValue(true);
  db.fetchCoachPrompt.mockResolvedValue('You are a coach.');
  db.upsertCoachPrompt.mockResolvedValue(true);
  db.fetchEpisodicMemory.mockResolvedValue([{ role: 'user', message: 'Hello' }]);
  db.searchEpisodicMemory.mockResolvedValue([{ role: 'assistant', message: 'Hi there' }]);
};

const setupDbMock2 = () => {
  const db = require('./db');
  db.upsertCrons.mockResolvedValue(true);
  db.fetchUserCrons.mockResolvedValue([]);
  db.fetchQuestionQueue.mockResolvedValue({ queue: [], context: '' });
  db.upsertQuestionQueue.mockResolvedValue(true);
  db.fetchActionModules.mockResolvedValue([]);
  db.upsertActionModules.mockResolvedValue(true);
};

const setupDbMock3 = () => {
  const db = require('./db');
  db.fetchUserFacts = jest.fn();
  db.searchUserFacts = jest.fn();
  db.fetchUserFacts.mockResolvedValue([{ fact: 'Likes coffee' }]);
  db.searchUserFacts.mockResolvedValue([{ fact: 'Likes coffee' }]);

  db.upsertUserFacts.mockResolvedValue(true);
  db.fetchBiometricsLogs.mockResolvedValue([{steps: 1000}]);
  db.insertLlmTrace.mockResolvedValue(true);
  db.deleteTransientSystemMessages.mockResolvedValue(true);
};

jest.mock('../agent/orchestrator', () => {
  return { 
    executeAgentWorkflow: jest.fn(),
    getGroqClient: jest.fn(),
    buildActionPlanParams: jest.fn().mockReturnValue({}),
    buildUserCronParams: jest.fn().mockReturnValue({})
  };
});

jest.mock('./embeddings', () => {
  return { 
    generateEmbedding: jest.fn().mockResolvedValue([0.1, 0.2]),
    isModelLoaded: jest.fn().mockReturnValue(true)
  };
});

const { createWorker } = require('./worker');
const orchestrator = require('../agent/orchestrator');
const database = require('./db');
const { DelayedError } = require('bullmq');

const generateTestJob = () => {
  return {
    id: 'job-123',
    token: 'token',
    attemptsMade: 0,
    moveToDelayed: jest.fn().mockResolvedValue(true),
    updateData: jest.fn().mockResolvedValue(true),
    data: {
      jobId: 'job-123',
      payload: { userId: 'u1', message: 'Hello', lang: 'en' },
      apiKeys: { groqKey: 'key' }
    }
  };
};

  beforeEach(() => {
    jest.clearAllMocks();
    setupDbMock1();
    setupDbMock2();
    setupDbMock3();
    createWorker();
  });

  const mockProcessTask = async (executor, onStatus, onTrace) => {
    await executor('upsert_user_facts', { facts: [{ key: 'weight', value: '80kg' }] });
    await onStatus('Thinking...');
    await onTrace({ model: 'x' });
    return { headline: 'h', diagnostic_summary: 'd', chat_message: 'Hi!' };
  };

  it('should process job, call tool executor with upsert_user_fact, and save final chat message', async () => {
    const job = generateTestJob();
    orchestrator.executeAgentWorkflow.mockImplementation(
      async (a, b, c, d, e, exec, f, q, stat, sMsgs, trace) => mockProcessTask(exec, stat, trace)
    );
    database.fetchEpisodicMemory.mockResolvedValueOnce([{ message: 'm1' }, { id: 1, created_at: '2020-01-01', message: 'm2' }]);
    require('./embeddings').isModelLoaded.mockReturnValueOnce(false);

    await capturedProcessTask(job);
    expect(orchestrator.executeAgentWorkflow).toHaveBeenCalledTimes(1);
    expect(database.upsertUserFacts).toHaveBeenCalledWith({ groqKey: 'key' }, 'u1', [{ key: 'weight', value: '80kg', embedding: [0.1, 0.2] }]);
    expect(database.updateJobStatus).toHaveBeenCalledWith({ groqKey: 'key' }, 'job-123', 'completed', { headline: 'h', diagnostic_summary: 'd', chat_message: 'Hi!' });
    expect(database.upsertSystemMessage).toHaveBeenCalledWith({ groqKey: 'key' }, 'u1', 'Thinking...');
  });

  it('handles onTrace failure', async () => {
    const job = generateTestJob();
    database.insertLlmTrace = jest.fn().mockRejectedValue(new Error('db err'));
    orchestrator.executeAgentWorkflow.mockImplementation(async (a, b, c, d, e, f, g, q, h, i, onTrace) => {
      await onTrace({ model: 'x' });
      return { chat_message: 'Hi' };
    });
    await capturedProcessTask(job);
    expect(database.insertLlmTrace).toHaveBeenCalled();
  });

  const mockToolsExec = async (executor) => {
    await executor('fetch_biometrics_logs', { days: 5 });
    await executor('fetch_action_plans', {});
    await executor('fetch_user_crons', {});
    await executor('enqueue_questions', { questions: ['q1'] });
    await executor('dequeue_question', {});
    await executor('evaluate_current_question', {});
    await executor('upsert_action_plan', { plan_title: 'm1' });
    await executor('upsert_user_cron', { crons: [{ title: 'c1', schedule: '0 8 * * *', cron_expression: '0 8 * * *' }] });
    await executor('upsert_user_cron', { title: 'c2', schedule: '0 9 * * *', cron_expression: '0 9 * * *' });
    await executor('evolve_coach_prompt', { evolved_prompt: 'new prompt' });
    expect(await executor('unknown_tool', {})).toEqual({ error: 'Tool not found' });
    return { chat_message: 'Done' };
  };

  const assertToolsExecuted = () => {
    expect(database.fetchBiometricsLogs).toHaveBeenCalledWith({ groqKey: 'key' }, 'u1', 5);
    expect(database.fetchActionModules).toHaveBeenCalledWith({ groqKey: 'key' }, 'u1', false);
    expect(database.fetchUserCrons).toHaveBeenCalledWith({ groqKey: 'key' }, 'u1');
    expect(database.upsertQuestionQueue).toHaveBeenCalledWith({ groqKey: 'key' }, 'u1', ['q1']);
    expect(database.upsertActionModules).toHaveBeenCalled();
    expect(database.upsertCrons).toHaveBeenCalledTimes(2);
    expect(database.upsertCoachPrompt).toHaveBeenCalledWith({ groqKey: 'key' }, 'u1', 'new prompt');
  };

  it('should execute various tools correctly', async () => {
    const job = generateTestJob();
    orchestrator.executeAgentWorkflow.mockImplementation(async (a, b, c, d, e, exec) => mockToolsExec(exec));
    await capturedProcessTask(job);
    assertToolsExecuted();
  });

  it('should test handleFetchActionModuleDetails and onStatus coverage', async () => {
    const job = generateTestJob();
    database.fetchActionModules.mockResolvedValue([{ module_title: 'm1' }]);
    orchestrator.executeAgentWorkflow.mockImplementation(async (apiKeys, message, prompt, history, language, executor, facts, queue, onStatus) => {
      await onStatus('updating');
      await executor('fetch_action_plans', {});
      await executor('fetch_action_plan_categories', { plan_title: 'm1' });
      const notFound = await executor('fetch_action_plan_categories', { plan_title: 'm2' });
      expect(notFound.error).toBe('Plan not found: m2');
      return { chat_message: 'Done' };
    });
    await capturedProcessTask(job);
    expect(database.updateJobStatus).toHaveBeenCalledWith(expect.anything(), 'job-123', 'processing', { system_message: 'updating' });
  });

  it('should cover extractAiGenerationError with malformed JSON', async () => {
    const job = generateTestJob();
    orchestrator.executeAgentWorkflow.mockRejectedValue(new Error('{"error":{"failed_generation":}}')); // Malformed JSON
    try {
      await capturedProcessTask(job);
    } catch(e) {
      expect(e).toBeDefined();
    }
  });

  it('should correctly handle rate limits (429)', async () => {
    const job = generateTestJob();
    orchestrator.executeAgentWorkflow.mockRejectedValue(new Error('429 Rate Limit Exceeded'));
    await expect(capturedProcessTask(job)).rejects.toThrow(DelayedError);
  });

  it('handles safety filter errors', async () => {
    const job = generateTestJob();
    orchestrator.executeAgentWorkflow.mockImplementation(async () => {
      throw new Error('{"error":{"failed_generation":"inappropriate"}}');
    });
    await capturedProcessTask(job);
    expect(database.updateJobStatus).toHaveBeenCalledWith(
      expect.anything(),
      'job-123',
      'completed',
      expect.objectContaining({ result: expect.objectContaining({ chat_message: expect.stringContaining('I apologize, but I cannot fulfill this request due to safety filters. Please adjust your request.') }) })
    );
  });

  it('handles safety filter errors for cs', async () => {
    const job = generateTestJob();
    job.data.payload.lang = 'cs';
    orchestrator.executeAgentWorkflow.mockImplementation(async () => {
      throw new Error('{"error":{"failed_generation":"inappropriate"}}');
    });
    await capturedProcessTask(job);
    expect(database.updateJobStatus).toHaveBeenCalledWith(
      expect.anything(),
      'job-123',
      'completed',
      expect.objectContaining({ result: expect.objectContaining({ chat_message: expect.stringContaining('nemohu tomuto požadavku vyhovět. Prosím upravte svůj požadavek.') }) })
    );
  });

  it('handles rate limit errors', async () => {
    const job = generateTestJob();
    job.attemptsMade = 0;
    orchestrator.executeAgentWorkflow.mockImplementation(async () => {
      throw new Error('rate_limit try again in 5s');
    });
    await expect(capturedProcessTask(job)).rejects.toThrow(DelayedError);
    expect(database.upsertSystemMessage).toHaveBeenCalled();
    expect(database.updateJobStatus).toHaveBeenCalledWith(
      expect.any(Object),
      'job-123',
      'delayed',
      expect.anything()
    );
  });

  it('handles generic errors', async () => {
    const job = generateTestJob();
    orchestrator.executeAgentWorkflow.mockImplementation(async () => {
      throw new Error('Some API Error');
    });
    await expect(capturedProcessTask(job)).rejects.toThrow('Some API Error');
    expect(database.updateJobStatus).toHaveBeenCalledWith(
      expect.anything(),
      'job-123',
      'failed',
      { error: 'Some API Error' }
    );
  });
  
  it('calls onJobFailed', () => {
    expect(capturedOnFailed).toBeDefined();
    console.error = jest.fn();
    capturedOnFailed({ id: '123' }, new Error('test err'));
    expect(console.error).toHaveBeenCalledWith('Job 123 failed:', 'test err');
  });

  it('handles rate limit delay parsing 1h 5m 10s cs', async () => {
    const job = generateTestJob();
    job.attemptsMade = 1;
    job.data.payload.lang = 'cs';
    orchestrator.executeAgentWorkflow.mockImplementation(async () => {
      throw new Error('rate_limit try again in 1h5m10s');
    });
    await expect(capturedProcessTask(job)).rejects.toThrow(DelayedError);
    expect(database.updateJobStatus).toHaveBeenCalledWith(
      expect.anything(),
      'job-123',
      'delayed',
      expect.objectContaining({ message: expect.stringContaining('Omlouvám se') })
    );
  });

  it('should resume from savedMessages if present', async () => {
    const job = generateTestJob();
    job.data.savedMessages = [{ role: 'system', content: 'saved_state' }];
    orchestrator.executeAgentWorkflow.mockResolvedValue({ chat_message: 'resumed' });
    await capturedProcessTask(job);
    expect(orchestrator.executeAgentWorkflow).toHaveBeenCalledWith(
      expect.anything(), expect.anything(), expect.anything(),
      expect.anything(), expect.anything(), expect.anything(),
      expect.anything(), expect.anything(), expect.anything(),
      [{ role: 'system', content: 'saved_state' }], expect.anything()
    );
    expect(database.updateJobStatus).toHaveBeenCalledWith(expect.anything(), 'job-123', 'completed', { chat_message: 'resumed' });
  });

  it('should update job data with savedMessages on rate limit error', async () => {
    const job = generateTestJob();
    const err = new Error('rate_limit try again in 5s');
    err.savedMessages = [{ role: 'system', content: 'saved_state' }];
    orchestrator.executeAgentWorkflow.mockRejectedValue(err);
    await expect(capturedProcessTask(job)).rejects.toThrow(DelayedError);
    expect(job.updateData).toHaveBeenCalledWith(expect.objectContaining({ savedMessages: [{ role: 'system', content: 'saved_state' }] }));
  });

  it('should skip RAG (searchEpisodicMemory) when history is empty', async () => {
    const job = generateTestJob();
    database.fetchEpisodicMemory.mockResolvedValueOnce([]); // Empty history
    require('./embeddings').isModelLoaded.mockReturnValueOnce(true); // Ensure embeddings model is loaded to test the logic
    
    orchestrator.executeAgentWorkflow.mockResolvedValue({ chat_message: 'Hi!' });
    
    await capturedProcessTask(job);
    
    // RAG should NOT have been called because history is empty
    expect(database.searchEpisodicMemory).not.toHaveBeenCalled();
    expect(database.fetchEpisodicMemory).toHaveBeenCalled();
  });

  it('covers fetch_action_modules with categories', async () => {
    database.fetchActionModules.mockResolvedValueOnce([{ module_title: 'm1', categories: [{ name: 'c1' }] }]);
    const job = generateTestJob();
    orchestrator.executeAgentWorkflow.mockImplementation(async (a, b, c, d, e, exec) => {
      await exec('fetch_action_plans', {});
      return { chat_message: 'Done' };
    });
    await capturedProcessTask(job);
  });

  it('covers fetch_action_module_categories with category_names', async () => {
    database.fetchActionModules.mockResolvedValueOnce([{ module_title: 'm1', categories: [{ name: 'c1' }, { name: 'c2' }] }]);
    const job = generateTestJob();
    orchestrator.executeAgentWorkflow.mockImplementation(async (a, b, c, d, e, exec) => {
      await exec('fetch_action_plan_categories', { plan_title: 'm1', category_names: ['c1'] });
      return { chat_message: 'Done' };
    });
    await capturedProcessTask(job);
  });

  it('covers generate_user_plan', async () => {
    const job = generateTestJob();
    orchestrator.getGroqClient.mockReturnValue({
      chat: { completions: { create: jest.fn().mockResolvedValue({
        choices: [{ message: { tool_calls: [{ function: { arguments: '{"plan_title": "p1", "description": "desc", "categories": []}' } }] } }]
      }) } }
    });
    orchestrator.executeAgentWorkflow.mockImplementation(async (a, b, c, d, e, exec) => {
      await exec('generate_user_plan', { topic: 'topic', user_goals_and_context: 'context' });
      return { chat_message: 'Done' };
    });
    await capturedProcessTask(job);
  });

  it('covers generate_user_routines', async () => {
    const job = generateTestJob();
    database.fetchActionModules.mockResolvedValueOnce([{ module_title: 'm1', categories: [] }]);
    orchestrator.getGroqClient.mockReturnValue({
      chat: { completions: { create: jest.fn().mockResolvedValue({
        choices: [{ message: { tool_calls: [{ function: { arguments: '{"crons": [{"title": "c1"}]}' } }] } }]
      }) } }
    });
    orchestrator.executeAgentWorkflow.mockImplementation(async (a, b, c, d, e, exec) => {
      await exec('generate_user_routines', { plan_title: 'm1' });
      return { chat_message: 'Done' };
    });
    await capturedProcessTask(job);
  });

  it('covers compileHistory without id and created_at', async () => {
    const job = generateTestJob();
    job.data.payload.memoryId = 'mem-123';
    database.searchEpisodicMemory.mockResolvedValue([{ role: 'assistant', message: 'm3' }]);
    database.fetchEpisodicMemory.mockResolvedValue([{ role: 'assistant', message: 'm2' }]);
    
    orchestrator.executeAgentWorkflow.mockImplementation(async (a, b, c, history) => {
      expect(history.length).toBeGreaterThan(0);
      return { chat_message: 'Done' };
    });
    await capturedProcessTask(job);
  });

  it('covers enqueue_questions, dequeue_question, remove_from_queue, and evaluate_current_question', async () => {
    database.searchUserFacts.mockResolvedValueOnce([{ fact: 'f1' }]);
    database.searchEpisodicMemory.mockResolvedValueOnce([{ memory: 'm1' }]);
    database.fetchQuestionQueue.mockResolvedValue({ queue: ['what is this?', 'another question'] });
    orchestrator.getGroqClient.mockReturnValue({ chat: { completions: { create: jest.fn().mockResolvedValue({ choices: [{ message: { tool_calls: [{ function: { arguments: '{}' } }] } }] }) } } });
    orchestrator.executeAgentWorkflow.mockImplementation(async (a, b, c, history, lang, exec) => {
      await exec('enqueue_questions', { questions: ['what is this?'] });
      await exec('remove_from_queue', { indices: [1] });
      await exec('evaluate_current_question', {});
      await exec('dequeue_question', {});
      return { chat_message: 'Done' };
    });
    await capturedProcessTask(generateTestJob());
  });

  it('covers empty user facts and empty queue', async () => {
    const job = generateTestJob();
    database.searchUserFacts.mockResolvedValueOnce([]); // empty facts
    database.fetchEpisodicMemory.mockResolvedValueOnce([]); // empty history
    database.fetchQuestionQueue.mockResolvedValue({ queue: [] });
    
    orchestrator.executeAgentWorkflow.mockImplementation(async (a, b, c, history, lang, exec) => {
      await exec('evaluate_current_question', {});
      return { chat_message: 'Done' };
    });
    
    await capturedProcessTask(job);
  });

  it('handles user context building empty cases', async () => {
    const job = generateTestJob();
    database.searchUserFacts.mockResolvedValue([]);
    database.fetchUserCrons.mockResolvedValue(null);
    database.fetchQuestionQueue.mockResolvedValue({ queue: ['q1', 'q2'] });
    orchestrator.executeAgentWorkflow.mockImplementation(async (a, b, c, d, e, exec) => {
      await exec('enqueue_questions', { questions: ['q1', 'q2'] });
      const res = await exec('evaluate_current_question', {});
      expect(res.retrieved_facts).toBeDefined();
      return { chat_message: 'Hi' };
    });
    await capturedProcessTask(job);
  });
