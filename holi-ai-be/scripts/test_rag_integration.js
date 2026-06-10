/* eslint-disable */
process.env.USE_LOCAL_DB = 'true';
process.env.DATABASE_URL = 'postgresql://postgres:password@127.0.0.1:5432/holi_ai';
const { Pool } = require('pg');
const { searchUserFacts, searchEpisodicMemory, upsertUserFacts, insertEpisodicMemory, fetchQuestionQueue, upsertQuestionQueue } = require('./src/services/db');
const { generateEmbedding } = require('./src/services/embeddings');
const { handleDequeueQuestion } = require('./src/services/worker');

const dbUrl = process.env.DATABASE_URL;
let pool = new Pool({ connectionString: dbUrl });
const TEST_USER_ID = 'test-rag-int-user';

async function runTest() {
  const keys = { 
    ragThreshold: '0.55', 
    neonUrl: dbUrl
  };
  
  console.log("Cleaning DB...");
  await pool.query('DELETE FROM user_facts WHERE user_id = $1', [TEST_USER_ID]);
  await pool.query('DELETE FROM episodic_memory WHERE user_id = $1', [TEST_USER_ID]);
  await pool.query('DELETE FROM user_queues WHERE user_id = $1', [TEST_USER_ID]);
  
  console.log("1. Insert User Facts");
  const facts = [
    { key: 'height_cm', value: '195', embedding: await generateEmbedding('height_cm: 195') },
    { key: 'weight_kg', value: '104', embedding: await generateEmbedding('weight_kg: 104') },
    { key: 'favorite_food', value: 'pizza', embedding: await generateEmbedding('favorite_food: pizza') }
  ];
  await upsertUserFacts(keys, TEST_USER_ID, facts);
  
  console.log("2. Insert Episodic Memory");
  const q2 = "Could you tell me your current weight and height?";
  const memE1 = await generateEmbedding(q2);
  await insertEpisodicMemory(keys, TEST_USER_ID, 'assistant', JSON.stringify({ chat_message: q2 }), memE1);
  
  const irrStr = "I have no preferences";
  const memE2 = await generateEmbedding(irrStr);
  await insertEpisodicMemory(keys, TEST_USER_ID, 'user', JSON.stringify({ chat_message: irrStr }), memE2);
  
  console.log("3. Create Queue");
  const q1 = "Could you share your current weight and height, please?";
  // Put q1 as the second question so that after dequeuing the first, q1 is evaluated
  await upsertQuestionQueue(keys, TEST_USER_ID, ["Some previous question", q1], "some raw str");
  
  console.log("4. Call handleDequeueQuestion");
  const history = [{ role: 'user', message: 'Hello' }]; 
  const result = await handleDequeueQuestion(keys, TEST_USER_ID, history);
  
  console.log("5. Assertions");
  if (!result.success || result.question !== q1) {
    throw new Error(`Failed to dequeue to q1. Got: ${result.question}`);
  }
  
  const factKeys = result.retrieved_facts.map(f => f.key);
  console.log("Retrieved Fact Keys:", factKeys);
  if (!factKeys.includes('height_cm')) throw new Error("Missing height_cm");
  if (!factKeys.includes('weight_kg')) throw new Error("Missing weight_kg");
  if (factKeys.includes('favorite_food')) throw new Error("Included favorite_food");
  
  const memStrings = result.retrieved_memory.map(m => m.message);
  console.log("Retrieved Memory:", memStrings);
  if (!memStrings.some(m => m.includes(q2))) throw new Error("Missing assistant question in memory");
  if (memStrings.some(m => m.includes("no preferences"))) throw new Error("Included irrelevant memory");

  console.log("✅ Integration Test Passed!");
  
  await pool.query('DELETE FROM user_facts WHERE user_id = $1', [TEST_USER_ID]);
  await pool.query('DELETE FROM episodic_memory WHERE user_id = $1', [TEST_USER_ID]);
  await pool.query('DELETE FROM user_queues WHERE user_id = $1', [TEST_USER_ID]);
  await pool.end();
}

runTest().catch((err) => {
  console.error(err);
  process.exit(1);
});
