const database = require('../../db');
const embeddings = require('../../embeddings');

const handleUpsertActionPlan = async (apiKeys, userId, toolArgs) => {
  const dbArgs = { ...toolArgs, module_title: toolArgs.plan_title };
  delete dbArgs.plan_title;
  await database.upsertActionModules(apiKeys, userId, [dbArgs]);
  return { success: true };
};

const slugify = (s) => s ? s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') : '';

const buildCronId = (cron) => cron.cron_id || `c_${slugify(cron.title)}`;

const handleUpsertUserCron = async (apiKeys, userId, toolArgs) => {
  const cronsToInsert = toolArgs.crons && Array.isArray(toolArgs.crons)
    ? toolArgs.crons.map((c) => ({ ...c, cron_id: buildCronId(c), is_active: true }))
    : [{ ...toolArgs, cron_id: buildCronId(toolArgs), is_active: true }];
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
