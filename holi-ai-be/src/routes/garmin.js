const { getGarminAuthUrl, processGarminWebhook } = require('../services/garmin');



const handleAuth = async (request, reply) => {
  try {
    const url = await getGarminAuthUrl();
    return reply.send({ url });
  } catch (e) {
    return reply.status(500).send({ error: e.message });
  }
};

const handleWebhook = async (request, reply) => {
  try {
    await processGarminWebhook(request.body);
    return reply.status(200).send({ success: true });
  } catch (e) {
    return reply.status(500).send({ error: e.message });
  }
};


async function garminRoutes(fastify, _options) {
  fastify.get('/garmin/auth', handleAuth);
  fastify.post('/garmin/webhook', handleWebhook);
}

module.exports = garminRoutes;
