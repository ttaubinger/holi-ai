const { pipeline, env } = require('@xenova/transformers');

env.cacheDir = './.cache';

let generatorPromise = null;

const generateEmbedding = async (text) => {
  if (!text || typeof text !== 'string') return null;
  if (!generatorPromise) {
    generatorPromise = pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2').catch(e => {
      generatorPromise = null;
      throw e;
    });
  }
  const generator = await generatorPromise;
  const result = await generator(text, { pooling: 'mean', normalize: true });
  return Array.from(result.data);
};
const isModelLoaded = () => generatorPromise !== null;

module.exports = { generateEmbedding, isModelLoaded };
