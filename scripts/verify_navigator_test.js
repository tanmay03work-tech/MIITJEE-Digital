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

function checkUrlStatus(urlStr) {
  return new Promise((resolve) => {
    const url = new URL(urlStr);
    https.get(url, (res) => {
      resolve(res.statusCode);
    }).on('error', () => resolve(500));
  });
}

async function verify() {
  console.log('=== 1. Checking Test in Database ===');
  const testRes = await fetchJson(`/rest/v1/tests?id=eq.${TEST_ID}&select=*`);
  console.log('Test details:', testRes.body);

  if (!testRes.body || testRes.body.length === 0) {
    throw new Error('Test not found in tests table!');
  }
  const test = testRes.body[0];
  console.log(`Title: ${test.title}`);
  console.log(`Is Published: ${test.is_published}`);
  console.log(`Is Open For All: ${test.is_open_for_all}`);
  console.log(`Share Code: ${test.share_code}`);

  console.log('\n=== 2. Checking Questions in Database ===');
  const qRes = await fetchJson(`/rest/v1/test_questions?test_id=eq.${TEST_ID}&order=position.asc&select=*`);
  const questions = qRes.body;
  console.log(`Found ${questions.length} questions in test_questions.`);

  if (questions.length !== 25) {
    throw new Error(`Expected 25 questions, got ${questions.length}`);
  }

  let mcqCount = 0;
  let integerCount = 0;
  let imageCount = 0;

  for (const q of questions) {
    console.log(`[Q${q.position}] (${q.question_type}) ${q.prompt.substring(0, 50)}...`);
    if (q.question_type === 'mcq') {
      mcqCount++;
      if (!Array.isArray(q.options) || q.options.length !== 4) {
        throw new Error(`Question ${q.position} MCQ does not have 4 options!`);
      }
      console.log(`    Options: [${q.options.join(' | ')}]`);
      console.log(`    Correct Answer: ${q.correct_answer}`);
    } else if (q.question_type === 'integer') {
      integerCount++;
      console.log(`    Integer Answer: ${q.integer_answer}`);
    }

    if (q.image_url) {
      imageCount++;
      const imgStatus = await checkUrlStatus(q.image_url);
      console.log(`    Image: ${q.image_url} (HTTP Status: ${imgStatus})`);
      if (imgStatus !== 200) {
        throw new Error(`Image for Q${q.position} returned HTTP ${imgStatus}`);
      }
    }
  }

  console.log('\n=== Summary of Verification ===');
  console.log(`Total Questions: ${questions.length}`);
  console.log(`MCQ Questions: ${mcqCount}`);
  console.log(`Integer Questions: ${integerCount}`);
  console.log(`Diagram Images Verified: ${imageCount}`);
  console.log('ALL CHECKS PASSED WITH 100% ACCURACY!');
}

verify().catch(err => {
  console.error(err);
  process.exit(1);
});
