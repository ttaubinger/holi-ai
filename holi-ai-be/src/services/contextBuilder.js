const { fetchActionModules, fetchUserCrons } = require('./db');
const { generateEmbedding } = require('./embeddings');

const cosineSimilarity = (vecA, vecB) => {
  if (!vecA || !vecB || vecA.length !== vecB.length) return 0;
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
};

const buildRelevantContext = async (apiKeys, userId, message, msgEmbedding) => {
  const allModules = await fetchActionModules(apiKeys, userId);
  const allCrons = await fetchUserCrons(apiKeys, userId);
  
  const planIndex = allModules.map(m => m.module_title);
  const cronIndex = allCrons.map(c => c.title);

  const relevantModules = [];
  const relevantCrons = [];

  for (const m of allModules) {
    const textToEmbed = `${m.module_title} ${m.description || ''}`;
    const emb = await generateEmbedding(textToEmbed);
    const sim = cosineSimilarity(msgEmbedding, emb);
    if (sim > 0.25) relevantModules.push({ module: m, sim });
  }

  for (const c of allCrons) {
    const textToEmbed = `${c.title} ${c.description || ''} ${c.category || ''}`;
    const emb = await generateEmbedding(textToEmbed);
    const sim = cosineSimilarity(msgEmbedding, emb);
    if (sim > 0.25) relevantCrons.push({ cron: c, sim });
  }

  relevantModules.sort((a, b) => b.sim - a.sim);
  relevantCrons.sort((a, b) => b.sim - a.sim);

  return {
    planIndex,
    cronIndex,
    relevantModules: relevantModules.slice(0, 2).map(r => r.module),
    relevantCrons: relevantCrons.slice(0, 3).map(r => r.cron)
  };
};

module.exports = { buildRelevantContext };
