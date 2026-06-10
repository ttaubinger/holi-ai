let capturedProcessTask;

const captureProcessTaskFn = (processFn) => {
  capturedProcessTask = processFn;
};

jest.mock('bullmq', () => {
  class MockWorker {
    constructor(queueName, processFn) {
      capturedProcessTask = processFn;
    }
    on() {}
  }
  class MockQueue {
    constructor() {}
  }
  class MockDelayedError extends Error {}
  return {
    Worker: MockWorker,
    Queue: MockQueue,
    DelayedError: MockDelayedError
  };
});

jest.mock('./db', () => {
  return {
    updateJobStatus: jest.fn().mockResolvedValue(true),
    insertEpisodicMemory: jest.fn().mockResolvedValue(true),
    fetchCoachPrompt: jest.fn().mockResolvedValue('system prompt'),
    upsertCoachPrompt: jest.fn().mockResolvedValue(true),
    fetchEpisodicMemory: jest.fn().mockResolvedValue([]),
    searchEpisodicMemory: jest.fn().mockResolvedValue([]),
    upsertCrons: jest.fn().mockResolvedValue(true),
    fetchUserCrons: jest.fn().mockResolvedValue([]),
    fetchQuestionQueue: jest.fn().mockResolvedValue({
      queue: [],
      context: ''
    }),
    upsertQuestionQueue: jest.fn().mockResolvedValue(true),
    fetchActionModules: jest.fn().mockResolvedValue([]),
    upsertActionModules: jest.fn().mockResolvedValue(true),
    fetchUserFacts: jest.fn().mockResolvedValue([]),
    upsertUserFacts: jest.fn().mockResolvedValue(true)
  };
});

jest.mock('../agent/orchestrator', () => {
  return {
    executeAgentWorkflow: jest.fn()
  };
});

jest.mock('./embeddings', () => {
  return {
    generateEmbedding: jest.fn().mockResolvedValue([
      0.1,
      0.2
    ])
  };
});

const { createWorker } = require('./worker');
const orchestrator = require('../agent/orchestrator');
const database = require('./db');

const generateTestJob = () => {
  return {
    data: {
      jobId: 'job-123',
      payload: {
        userId: 'u1',
        message: 'Hello',
        lang: 'en'
      },
      apiKeys: {
        groqKey: 'key'
      }
    }
  };
};

const assertJobCompletedSuccessfully = () => {
  expect(orchestrator.executeAgentWorkflow).toHaveBeenCalledTimes(1);
  expect(database.upsertUserFacts).toHaveBeenCalledWith(
    {
      groqKey: 'key'
    },
    'u1',
    [
      {
        key: 'weight',
        value: '80kg'
      }
    ]
  );
  expect(database.updateJobStatus).toHaveBeenCalledWith(
    {
      groqKey: 'key'
    },
    'job-123',
    'completed',
    {
      chat_message: 'Hi!'
    }
  );
};

const testJobProcessing = async () => {
  const job = generateTestJob();
  orchestrator.executeAgentWorkflow.mockImplementation(
    async (apiKeys, message, prompt, history, language, executor) => {
      await executor(
        'upsert_user_fact',
        {
          key: 'weight',
          value: '80kg'
        }
      );
      return 'Hi!';
    }
  );
  await capturedProcessTask(job);
  assertJobCompletedSuccessfully();
};

const beforeEachTest = () => {
  jest.clearAllMocks();
  createWorker();
};

describe('Worker tests', () => {
  beforeEach(beforeEachTest);

  it(
    'should process job, call tool executor, and save final chat message',
    testJobProcessing
  );
});
