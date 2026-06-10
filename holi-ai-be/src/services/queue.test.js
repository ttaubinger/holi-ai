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
