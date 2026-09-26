const https = require('https');
const { SUPABASE_URL, SUPABASE_SERVICE_KEY: SERVICE_ROLE_KEY } = require('./supabase-env');
const TEST_ID = 'd7050a12-a787-4359-9474-304de0adcc2d';

function fetchJson(endpoint) {
  return new Promise((resolve, reject) => {
    const url = new URL(`${SUPABASE_URL}${endpoint}`);
    const options = {
      hostname: url.hostname,
      port: 443,
      path: url.pathname + url.search,
      method: 'GET',
      headers: {
        'apikey': SERVICE_ROLE_KEY,
        'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
      },
    };

    https.get(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(data) });
        } catch (e) {
          resolve({ status: res.statusCode, body: data });
        }
      });
    }).on('error', reject);
  });
}

async function checkQuestions() {
  const qRes = await fetchJson(`/rest/v1/test_questions?test_id=eq.${TEST_ID}&order=position.asc&select=*`);
  const questions = qRes.body;

  console.log(`Total questions in test: ${questions.length}`);
  for (const q of questions) {
    const isMatch = /Match\s+List[- ]?I\s+with\s+List[- ]?II/i.test(q.prompt);
    const isStatement = /Statement\s*(?:I|\(I\)|1):/i.test(q.prompt);
    const hasImage = Boolean(q.image_url);

    console.log(`Q${q.position}: Type=${q.question_type}, hasImage=${hasImage}, isMatch=${isMatch}, isStatement=${isStatement}`);
    if (isMatch) {
      console.log(`   MATCH QUESTION Q${q.position}:`);
      console.log(`   Prompt lines:\n${q.prompt.split('\n').map(l => '     ' + l).join('\n')}`);
    }
    if (hasImage) {
      console.log(`   IMAGE QUESTION Q${q.position}: ${q.image_url}`);
    }
  }
}

checkQuestions();
