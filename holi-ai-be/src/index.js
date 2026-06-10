const fastify = require('fastify')({ logger: true });
const cors = require('@fastify/cors');
require('dotenv').config();

const chatRoutes = require('./routes/chat');
const garminRoutes = require('./routes/garmin');
const configRoutes = require('./routes/config');
const { createWorker } = require('./services/worker');
const { initHeartbeatCron } = require('./cron/heartbeat');

const startServer = async () => {
  await fastify.register(cors, { origin: '*' });
  
  fastify.register(chatRoutes, { prefix: '/api' });
  fastify.register(garminRoutes, { prefix: '/api' });
  fastify.register(configRoutes, { prefix: '/api' });

  createWorker();
  initHeartbeatCron();

  const port = process.env.PORT || 4000;
  await fastify.listen({ port, host: '0.0.0.0' });
};

startServer().catch(err => {
  fastify.log.error(err);
  process.exit(1);
});
