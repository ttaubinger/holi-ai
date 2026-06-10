const database = require('../services/db');
const { enqueueJob } = require('../services/queue');

const fetchAndMergeTraces = async (keys, limit, offset) => {
  const [traces, msgs] = await Promise.all([
    database.fetchLlmTraces(keys, keys.userId, limit, offset),
    database.fetchEpisodicMemory(keys, keys.userId, limit, offset)
  ]);
  const chatMsgs = msgs
    .filter(m => m.role !== 'system')
    .map(m => ({ id: m.id, type: 'chat_message', role: m.role, message: m.message, created_at: m.created_at }));
  const combined = [...traces.map(t => ({ ...t, type: 'trace' })), ...chatMsgs];
  return combined.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()).slice(0, limit);
};

const handleGetTraces = async (request, reply) => {
  try {
    const head = request.headers['x-ecosystem-keys'];
    if (!head) return reply.code(401).send({ error: 'Missing credentials' });
    const keys = JSON.parse(head);
    if (!keys.userId) return reply.code(400).send({ error: 'Missing userId' });
    const limit = parseInt(request.query.limit) || 50;
    const offset = parseInt(request.query.offset) || 0;
    const traces = await fetchAndMergeTraces(keys, limit, offset);
    return { traces };
  } catch (error) {
    request.log.error(error);
    return reply.code(500).send({ error: 'Failed' });
  }
};

const getMockData = () => ({
  topic: "Rapid Weight Loss and Cholesterol Management Plan",
  user_goals_and_context: "Male, 38 years old, 195 cm, 104 kg, goal to lose 11 kg in 1 month (aggressive), high cholesterol (no meds), cleared for weight loss, sedentary lifestyle, currently eating junk food, open to diet changes, no dietary restrictions, prefers walking, running, cycling, swimming, strength training, qi gong, exercises 3 days/week for 20-50 minutes per session, motivated but struggles with motivation, previously tried keto successfully but found it too radical."
});

const getMockPayload = () => ({
  role: 'assistant',
  tool_calls: [{
    id: `test_${Date.now()}`,
    type: 'function',
    function: { name: 'generate_user_plan', arguments: JSON.stringify(getMockData()) }
  }]
});

const executeTestPlanJob = async (keys) => {
  await database.upsertUserFacts(keys, keys.userId, [
    { key: 'primary_goal', value: getMockData().topic },
    { key: 'context', value: getMockData().user_goals_and_context }
  ]);
  await database.upsertQuestionQueue(keys, keys.userId, []);

  const jobRecord = await database.insertJob(keys, 'debug_plan', { userId: keys.userId });
  await enqueueJob(jobRecord.id, 'debug_plan', { userId: keys.userId, lang: 'en' }, keys, 0, {
    savedMessages: [getMockPayload()]
  });
  return jobRecord.id;
};

const handleTestPlan = async (request, reply) => {
  try {
    const head = request.headers['x-ecosystem-keys'];
    if (!head) return reply.code(401).send({ error: 'Missing credentials' });
    const keys = JSON.parse(head);
    if (!keys.userId) return reply.code(400).send({ error: 'Missing userId' });
    const jobId = await executeTestPlanJob(keys);
    return { success: true, jobId };
  } catch (error) {
    request.log.error(error);
    return reply.code(500).send({ error: 'Failed' });
  }
};

async function routes(fastify, _options) {
  fastify.get('/debug/traces', handleGetTraces);
  fastify.post('/debug/test-plan', handleTestPlan);
}

module.exports = routes;
