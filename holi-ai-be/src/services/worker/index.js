const { Worker } = require('bullmq');
const { redisConnection } = require('../queue');
const { runAgent } = require('./agentRunner');
const { handleProcessLlmError } = require('./errorHandler');
const { handleDequeueQuestion } = require('./tools/queue');

const processLlmTask = async (job) => {
  const { jobId, payload, apiKeys } = job.data;
  try {
    await runAgent(jobId, payload, apiKeys, job);
  } catch (error) {
    await handleProcessLlmError(error, job, payload, apiKeys);
  }
};

const onJobFailed = (job, error) => {
  console.error(`Job ${job.id} failed:`, error.message);
};

const createWorker = () => {
  const workerOptions = { connection: redisConnection, limiter: { max: 10, duration: 60000 } };
  const worker = new Worker('llm-tasks', processLlmTask, workerOptions);
  worker.on('failed', onJobFailed);
  return worker;
};

module.exports = { createWorker, handleDequeueQuestion, processLlmTask };
