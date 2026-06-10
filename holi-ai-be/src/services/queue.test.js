const mockAdd = jest.fn().mockResolvedValue(true);
jest.mock('bullmq', () => {
  return { Queue: jest.fn().mockImplementation(() => ({ add: mockAdd })) };
});
jest.mock('ioredis', () => jest.fn());

const { enqueueJob } = require('./queue');

describe('queue', () => {
  it('enqueues job with default delay', async () => {
    await enqueueJob('job1', 'task', {}, {});
    expect(mockAdd).toHaveBeenCalledWith('task', { jobId: 'job1', payload: {}, apiKeys: {} }, expect.objectContaining({ delay: 0 }));
  });
  it('enqueues job with explicit delay', async () => {
    await enqueueJob('job2', 'task', {}, {}, 1000);
    expect(mockAdd).toHaveBeenCalledWith('task', { jobId: 'job2', payload: {}, apiKeys: {} }, expect.objectContaining({ delay: 1000 }));
  });
});

const mockQ = (getJobs) => {
  jest.doMock('bullmq', () => ({
    Queue: jest.fn().mockImplementation(() => ({
      add: mockAdd,
      getJobs
    }))
  }));
};

describe('purgeUserJobs success', () => {
  beforeEach(() => jest.resetModules());
  it('removes jobs for the specific user', async () => {
    const mockRemove = jest.fn().mockResolvedValue(true);
    const mockRemove2 = jest.fn().mockResolvedValue(true);
    mockQ(jest.fn().mockResolvedValue([
      { data: { payload: { userId: 'u1' } }, remove: mockRemove },
      { data: { payload: { userId: 'u2' } }, remove: mockRemove2 }
    ]));
    const { purgeUserJobs } = require('./queue');
    await purgeUserJobs('u1');
    expect(mockRemove).toHaveBeenCalled();
    expect(mockRemove2).not.toHaveBeenCalled();
  });
});

describe('purgeUserJobs error', () => {
  beforeEach(() => jest.resetModules());
  it('handles errors during purge', async () => {
    mockQ(jest.fn().mockRejectedValue(new Error('Redis Error')));
    const { purgeUserJobs } = require('./queue');
    await expect(purgeUserJobs('u1')).resolves.toBeUndefined();
  });
});
