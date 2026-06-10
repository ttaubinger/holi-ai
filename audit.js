const fs = require('fs');

const files = [
  'holi-(h)ai-be/src/services/db.js',
  'holi-(h)ai-be/src/services/worker.js',
  'holi-(h)ai-be/src/agent/orchestrator.js',
  'holi-(h)ai-be/src/routes/chat.js',
  'holi-(h)ai-fe/src/app/page.tsx'
];

let failed = false;
files.forEach(f => {
  console.log(`>>> Auditing ${f}`);
  const content = fs.readFileSync(f, 'utf8');
  const lines = content.split('\n');
  let inFunc = false;
  let count = 0;
  
  for (const line of lines) {
    if (line.match(/(const|function|=>).*{/)) {
      inFunc = true;
      count = 1;
    } else if (inFunc && line.match(/^  }/) || line.match(/^}/)) {
      inFunc = false;
      if (count > 15) {
        console.log(`[FAIL] Function too long: ${count} lines in ${f}`);
        failed = true;
      }
      count = 0;
    } else if (inFunc) {
      count++;
    }
  }
});

if (!failed) console.log('Zero violations. Audit passed.');
