const { handleFetchBiometricsLogs, handleFetchActionPlans, handleFetchActionPlanCategories, handleFetchActionPlanCategory, handleFetchUserCrons } = require('./tools/dbFetch');
const { handleEnqueueQuestions, handleDequeueQuestion, handleEvaluateCurrentQuestion } = require('./tools/queue');
const { handleUpsertActionPlan, handleUpsertUserCron, handleEvolveCoachPrompt, handleUpsertUserFacts } = require('./tools/dbUpsert');
const { handleGenerateUserPlan, handleGenerateUserRoutines } = require('./tools/groqGen');

const dispatchToolCall1 = async (apiKeys, userId, functionName, toolArgs, history) => {
  if (functionName === 'fetch_biometrics_logs') return await handleFetchBiometricsLogs(apiKeys, userId, toolArgs);
  if (functionName === 'fetch_action_plans') return await handleFetchActionPlans(apiKeys, userId);
  if (functionName === 'fetch_action_plan_categories') return await handleFetchActionPlanCategories(apiKeys, userId, toolArgs);
  if (functionName === 'fetch_action_plan_category') return await handleFetchActionPlanCategory(apiKeys, userId, toolArgs);
  if (functionName === 'fetch_user_crons') return await handleFetchUserCrons(apiKeys, userId);

  if (functionName === 'enqueue_questions') return await handleEnqueueQuestions(apiKeys, userId, toolArgs);

  if (functionName === 'dequeue_question') return await handleDequeueQuestion(apiKeys, userId, history);
  if (functionName === 'evaluate_current_question') return await handleEvaluateCurrentQuestion(apiKeys, userId, history);
  return null;
};

const dispatchToolCall2 = async (apiKeys, userId, functionName, toolArgs) => {
  if (functionName === 'upsert_action_plan') return await handleUpsertActionPlan(apiKeys, userId, toolArgs);
  if (functionName === 'upsert_user_cron') return await handleUpsertUserCron(apiKeys, userId, toolArgs);
  if (functionName === 'evolve_coach_prompt') return await handleEvolveCoachPrompt(apiKeys, userId, toolArgs);
  if (functionName === 'upsert_user_facts') return await handleUpsertUserFacts(apiKeys, userId, toolArgs);
  if (functionName === 'generate_user_plan') return await handleGenerateUserPlan(apiKeys, userId, toolArgs);
  if (functionName === 'generate_user_routines') return await handleGenerateUserRoutines(apiKeys, userId, toolArgs);
  return null;
};

const handleToolCall = async (apiKeys, userId, functionName, toolArgs, history) => {
  const result1 = await dispatchToolCall1(apiKeys, userId, functionName, toolArgs, history);
  if (result1 !== null) return result1;
  const result2 = await dispatchToolCall2(apiKeys, userId, functionName, toolArgs);
  if (result2 !== null) return result2;
  return { error: 'Tool not found' };
};

module.exports = { handleToolCall, dispatchToolCall1, dispatchToolCall2 };
