const { insertEpisodicMemory, updateEpisodicMemoryEmbedding, fetchEpisodicMemory, searchEpisodicMemory, upsertSystemMessage, deleteTransientSystemMessages } = require('./episodic');
const { searchUserFacts, upsertUserFacts, fetchUserFacts } = require('./facts');
const { upsertCrons, fetchUserCrons, deleteUserCron, toggleUserCron } = require('./crons');
const { insertBiometricsLog, fetchBiometricsLogs, insertActivityLog, fetchActivityLogs } = require('./biometrics');
const { upsertQuestionQueue, fetchQuestionQueue, fetchRagEnabled, enableRag } = require('./queue');
const { deleteActionModule, fetchActionModules, upsertActionModules } = require('./actionModules');
const { insertJob, updateJobStatus, fetchJob, insertConfig, fetchConfig, upsertCoachPrompt, fetchCoachPrompt, wipeDatabase, insertLlmTrace, fetchLlmTraces } = require('./system');

module.exports = {
  insertEpisodicMemory,
  updateEpisodicMemoryEmbedding,
  fetchEpisodicMemory,
  searchEpisodicMemory,
  searchUserFacts,
  insertJob,
  updateJobStatus,
  fetchJob,
  insertConfig,
  fetchConfig,
  upsertCoachPrompt,
  fetchCoachPrompt,
  upsertCrons,
  fetchUserCrons,
  deleteUserCron,
  toggleUserCron,
  upsertQuestionQueue,
  fetchQuestionQueue,
  fetchRagEnabled,
  enableRag,
  upsertActionModules,
  fetchActionModules,
  deleteActionModule,
  upsertUserFacts,
  fetchUserFacts,
  insertBiometricsLog,
  fetchBiometricsLogs,
  wipeDatabase,
  insertActivityLog,
  fetchActivityLogs,
  upsertSystemMessage,
  deleteTransientSystemMessages,
  insertLlmTrace,
  fetchLlmTraces
};
