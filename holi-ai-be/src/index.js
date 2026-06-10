const fastify = require('fastify')({ logger: true });
const cors = require('@fastify/cors');
require('dotenv').config();

const chatRoutes = require('./routes/chat');
const garminRoutes = require('./routes/garmin');
const biometricsRoutes = require('./routes/biometrics');
const configRoutes = require('./routes/config');
const activitiesRoutes = require('./routes/activities');
const debugRoutes = require('./routes/debug');
const { createWorker } = require('./services/worker');

const startServer = async () => {
  await fastify.register(cors, { origin: '*' });
  const routes = [chatRoutes, garminRoutes, biometricsRoutes, configRoutes, activitiesRoutes, debugRoutes];
  for (const r of routes) fastify.register(r, { prefix: '/api' });
  fastify.get('/', async () => ({ status: 'ok', service: 'HoliAI Backend' }));
  createWorker();
  await fastify.listen({ port: process.env.PORT || 4000, host: '0.0.0.0' });
};

startServer().catch(err => {
  fastify.log.error(err);
  process.exit(1);
});
