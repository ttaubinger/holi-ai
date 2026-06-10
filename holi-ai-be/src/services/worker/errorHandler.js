const database = require('../db');
const { DelayedError } = require('bullmq');

const createStatusHandler = (apiKeys, userId, jobId) => async (msg) => {
  await database.upsertSystemMessage(apiKeys, userId, msg);
  await database.updateJobStatus(apiKeys, jobId, 'processing', { system_message: msg });
};

const createTraceHandler = (apiKeys, userId, jobId) => async (traceData) => {
  try {
    const job = await database.fetchJob(apiKeys, jobId);
    if (!job) throw new Error('JOB_WIPED');
    await database.insertLlmTrace(apiKeys, userId, traceData);
  } catch (e) {
    if (e.message === 'JOB_WIPED') throw e;
    console.error(`Failed to insert trace for job ${jobId}:`, e.message);
  }
};

const parseHMSDelay = (match) => {
  if (!match) return 0;
  return (parseFloat(match[1] || 0) * 3600 + parseFloat(match[2] || 0) * 60 + parseFloat(match[3] || 0)) * 1000;
};

const calculateDelayMilliseconds = (errorMessage, attemptsMade) => {
  const msMatch = errorMessage.match(/try again in (\d+(?:\.\d+)?)ms/);
  const delay = msMatch ? parseFloat(msMatch[1]) : parseHMSDelay(errorMessage.match(/try again in (?:(\d+)h)?(?:(\d+)m(?!s))?(?:(\d+(?:\.\d+)?)s)?/));
  if (delay > 0) return Math.ceil(delay / 1000) * 1000;
  const baseDelay = 60000;
  return attemptsMade > 0 ? baseDelay * Math.pow(2, attemptsMade) : baseDelay;
};

const getRateLimitMessage = (language, delayMs) => {
  const seconds = Math.ceil(delayMs / 1000);
  if (seconds < 60) {
    if (language === 'cs') return `Omlouvám se, narazil jsem na limit kapacity AI. Požadavek automaticky zpracuji za cca ${seconds} sekund.`;
    return `I hit an AI capacity limit. I will automatically process this request in about ${seconds} seconds.`;
  }
  const minutes = Math.ceil(seconds / 60);
  if (language === 'cs') return `Omlouvám se, narazil jsem na limit kapacity AI. Požadavek automaticky zpracuji za cca ${minutes} minut.`;
  return `I hit an AI capacity limit. I will automatically process this request in about ${minutes} minutes.`;
};

const getRateLimitStatusOverrides = (job, existingJob) => {
  let progress = existingJob?.result?.progress || null;
  let system_message = existingJob?.result?.system_message || '';
  const activeRoute = job.data.savedContext?.activeRoute;
  
  if (system_message === 'Plan generated.') {
    progress = 0; system_message = 'Starting routines generation...';
  } else if (activeRoute === 'routine_generation' || activeRoute === 'routine_generation_resume') {
    progress = 0; system_message = 'Starting routines generation...';
  } else if (activeRoute === 'plan_generation' || activeRoute === 'plan_generation_resume') {
    progress = 0; system_message = 'Starting plan generation...';
  }
  
  return { progress, system_message };
};

const handleRateLimitError = async (apiKeys, job, payload, errorMessage) => {
  const delayMilliseconds = calculateDelayMilliseconds(errorMessage, job.attemptsMade);
  const languageMessage = getRateLimitMessage(payload.lang, delayMilliseconds);
  const resumeAt = Date.now() + delayMilliseconds;
  const existingJob = await database.fetchJob(apiKeys, job.data.jobId);
  const { progress, system_message } = getRateLimitStatusOverrides(job, existingJob);
  await database.upsertSystemMessage(apiKeys, payload.userId, languageMessage);
  await database.updateJobStatus(apiKeys, job.data.jobId, 'delayed', { message: languageMessage, resumeAt, progress, system_message });
  await job.moveToDelayed(resumeAt, job.token);
  throw new DelayedError();
};

const extractAiGenerationError = (errorMessage) => {
  try {
    const index = errorMessage.indexOf('{');
    if (index >= 0) {
      const parsedError = JSON.parse(errorMessage.substring(index));
      if (parsedError?.error?.failed_generation) return parsedError.error.failed_generation;
    }
  } catch (_e) {
    return '';
  }
  return '';
};

const handleSafetyFilter = async (apiKeys, job, payload) => {
  const safetyMsg = payload.lang === 'cs'
    ? 'Omlouvám se, ale z důvodu bezpečnostních filtrů nemohu tomuto požadavku vyhovět. Prosím upravte svůj požadavek.'
    : 'I apologize, but I cannot fulfill this request due to safety filters. Please adjust your request.';

  await database.updateJobStatus(apiKeys, job.data.jobId, 'completed', { 
    result: { 
      headline: 'Safety Filter', 
      diagnostic_summary: 'Safety filters prevented the AI from fulfilling the request.', 
      chat_message: safetyMsg 
    } 
  });
};

const checkAndHandleLlmError = async (apiKeys, job, payload, error) => {
  const errorMessage = error.message || String(error);
  if (errorMessage.includes('429') || errorMessage.includes('413') || errorMessage.includes('rate_limit') || errorMessage.includes('TPM')) {
    await handleRateLimitError(apiKeys, job, payload, errorMessage);
    return true;
  }
  if (extractAiGenerationError(errorMessage)) {
    await handleSafetyFilter(apiKeys, job, payload);
    return true;
  }
  return false;
};

const traceJobFailure = async (apiKeys, payload, job, error) => {
  if (!apiKeys?.debugMode || error.hasBeenTraced) return;
  try {
    await database.insertLlmTrace(apiKeys, payload.userId, {
      model: 'error', latency_ms: 0, prompt_tokens: 0, completion_tokens: 0, total_tokens: 0,
      payload_input: JSON.stringify([{ role: 'system', content: `Job Failure Stack Trace` }]),
      payload_output: JSON.stringify({ error: `ERROR: ${error.message || String(error)}\n\nStack:\n${error.stack || 'No stack trace'}` })
    });
  } catch (e) {
    console.error(`Failed to insert trace for job ${job.data.jobId}:`, e.message);
  }
};

const handleProcessLlmError = async (err, job, payload, apiKeys) => {
  if (err.message === 'JOB_WIPED') return console.log(`[AI] Job ${job.data.jobId} aborted due to DB wipe.`);
  if (err.savedMessages || err.savedContext) await job.updateData({ ...job.data, savedMessages: err.savedMessages || job.data.savedMessages, savedContext: err.savedContext || job.data.savedContext });
  try {
    if (await checkAndHandleLlmError(apiKeys, job, payload, err)) return;
  } catch (e) {
    if (e.name === 'DelayedError' || e instanceof DelayedError) throw e;
    console.error(`Error in checkAndHandleLlmError:`, e);
  }
  await traceJobFailure(apiKeys, payload, job, err);
  await database.updateJobStatus(apiKeys, job.data.jobId, 'failed', { error: err.message || String(err) }).catch(() => {});
  throw err;
};

module.exports = { createStatusHandler, createTraceHandler, handleProcessLlmError };
