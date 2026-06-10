const { Queue } = require('bullmq');
const IORedis = require('ioredis');
require('dotenv').config();

const createRedisConnection = () => {
  const url = process.env.REDIS_URL || 'redis://127.0.0.1:6379';
  return new IORedis(url, { maxRetriesPerRequest: null });
};

const redisConnection = createRedisConnection();

const createLlmQueue = () => {
  return new Queue('llm-tasks', { connection: redisConnection });
};

const llmQueue = createLlmQueue();

const enqueueJob = async (jobId, taskType, payload, apiKeys, delayMs = 0) => {
  return llmQueue.add(taskType, { jobId, payload, apiKeys }, { 
    delay: delayMs,
    attempts: 10,
    backoff: { type: 'fixed', delay: 60000 }
  });
};

module.exports = { enqueueJob, redisConnection };
