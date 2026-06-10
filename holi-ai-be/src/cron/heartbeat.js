const cron = require('node-cron');
const { insertJob } = require('../services/db');
const { enqueueJob } = require('../services/queue');

const evaluateHeartbeat = async () => {
  // In a full implementation, iterate users needing evaluation
  const mockUserId = 'usr_1';
  
  const jobRecord = await insertJob('heartbeat_eval', { userId: mockUserId });
  await enqueueJob(jobRecord.id, 'heartbeat_eval', { userId: mockUserId });
};

const initHeartbeatCron = () => {
  cron.schedule('*/30 * * * *', async () => {
    try {
      await evaluateHeartbeat();
    } catch (err) {
      console.error('Heartbeat cron failed', err);
    }
  });
};

module.exports = { initHeartbeatCron };
