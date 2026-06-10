const database = require('../../db');
const embeddings = require('../../embeddings');

const handleUpsertActionPlan = async (apiKeys, userId, toolArgs) => {
  const dbArgs = { ...toolArgs, module_title: toolArgs.plan_title };
  delete dbArgs.plan_title;
  await database.upsertActionModules(apiKeys, userId, [dbArgs]);
  return { success: true };
};

const handleUpsertUserCron = async (apiKeys, userId, toolArgs) => {
  const cronsToInsert = toolArgs.crons && Array.isArray(toolArgs.crons)
    ? toolArgs.crons.map((c, i) => ({ ...c, cron_id: `c_${Date.now()}_${i}`, is_active: true }))
    : [{ ...toolArgs, cron_id: `c_${Date.now()}`, is_active: true }];
  await database.upsertCrons(apiKeys, userId, cronsToInsert);
  return { success: true };
};

const handleEvolveCoachPrompt = async (apiKeys, userId, toolArgs) => {
  await database.upsertCoachPrompt(apiKeys, userId, toolArgs.evolved_prompt);
  return { success: true };
};

const handleUpsertUserFacts = async (apiKeys, userId, toolArgs) => {
  const factsWithEmbeddings = [];
  for (const f of toolArgs.facts || []) {
    factsWithEmbeddings.push({
      key: f.key,
      value: f.value,
      embedding: await embeddings.generateEmbedding(`${f.key}: ${f.value}`)
    });
  }
  await database.upsertUserFacts(apiKeys, userId, factsWithEmbeddings);
  return { success: true, message: "Facts saved successfully." };
};

module.exports = {
  handleUpsertActionPlan,
  handleUpsertUserCron,
  handleEvolveCoachPrompt,
  handleUpsertUserFacts
};
