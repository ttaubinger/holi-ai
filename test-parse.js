const safeJsonParse = (str) => {
  try { return JSON.parse(str); } catch { return null; }
};

const tc = {
  function: {
    name: 'upsert_user_facts',
    arguments: "{\"facts\":[{\"key\":\"primary_goal\",\"value\":\"lose 11 kg and get back in shape\"}]}"
  }
};

const args = safeJsonParse(tc.function.arguments);
console.log(args);

const newFacts = [];
const updateNewFacts = (newFacts, args) => {
  if (!args.facts) return;
  for (const f of args.facts) {
    const existingIdx = newFacts.findIndex(x => x.key === f.key);
    if (existingIdx >= 0) newFacts[existingIdx] = f;
    else newFacts.push(f);
  }
};

updateNewFacts(newFacts, args);
console.log(newFacts);

const hasGoal = newFacts.some(f => f.key === 'primary_goal' && typeof f.value === 'string' && f.value.trim() !== '');
console.log("hasGoal:", hasGoal);
