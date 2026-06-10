const database = require('../../db');

const minifyObject = (obj) => {
  if (Array.isArray(obj)) return obj.map(minifyObject);
  if (typeof obj !== 'object' || obj === null) return obj;
  const m = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v == null || ['id', 'user_id', 'updated_at', 'created_at'].includes(k)) continue;
    if (k === 'logged_at') m[k] = new Date(v).toISOString().split('T')[0];
    else m[k] = minifyObject(v);
  }
  return m;
};

const handleFetchBiometricsLogs = async (apiKeys, userId, toolArgs) => {
  const logs = await database.fetchBiometricsLogs(apiKeys, userId, toolArgs.days || 3);
  return minifyObject(logs);
};

const handleFetchActionPlans = async (apiKeys, userId) => {
  const modules = await database.fetchActionModules(apiKeys, userId, false);
  const strippedModules = modules.map(m => m.module_title);
  return minifyObject(strippedModules);
};

const handleFetchActionPlanCategories = async (apiKeys, userId, toolArgs) => {
  const allModules = await database.fetchActionModules(apiKeys, userId, false);
  const match = allModules.find(m => m.module_title.toLowerCase() === toolArgs.plan_title.toLowerCase());
  if (!match) return { error: `Plan not found: ${toolArgs.plan_title}` };
  
  const categoryNames = match.categories ? match.categories.map(c => c.name) : [];
  return minifyObject(categoryNames);
};

const handleFetchActionPlanCategory = async (apiKeys, userId, toolArgs) => {
  const allModules = await database.fetchActionModules(apiKeys, userId, false);
  const match = allModules.find(m => m.module_title.toLowerCase() === toolArgs.plan_title.toLowerCase());
  if (!match) return { error: `Plan not found: ${toolArgs.plan_title}` };

  const catMatch = (match.categories || []).find(c => c.name.toLowerCase() === toolArgs.category_name.toLowerCase());
  if (!catMatch) return { error: `Category not found: ${toolArgs.category_name} in plan: ${toolArgs.plan_title}` };

  return minifyObject(catMatch);
};

const handleFetchUserCrons = async (apiKeys, userId) => {
  const crons = await database.fetchUserCrons(apiKeys, userId);
  return minifyObject(crons);
};

module.exports = {
  handleFetchBiometricsLogs,
  handleFetchActionPlans,
  handleFetchActionPlanCategories,
  handleFetchActionPlanCategory,
  handleFetchUserCrons
};
