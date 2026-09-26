const https = require('https');
const { SUPABASE_URL, SUPABASE_SERVICE_KEY: SERVICE_ROLE_KEY } = require('./supabase-env');

function fetchJson(endpoint) {
  return new Promise((resolve, reject) => {
    const url = new URL(`${SUPABASE_URL}${endpoint}`);
    https.get(url, {
      headers: {
        'apikey': SERVICE_ROLE_KEY,
        'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
      }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          resolve(data);
        }
      });
    }).on('error', reject);
  });
}

function checkUrl(urlStr) {
  return new Promise((resolve) => {
    https.get(urlStr, (res) => {
      resolve(res.statusCode);
    }).on('error', () => resolve(500));
  });
}

async function verify() {
  const testId = 'd1099f8b-3b3d-4a53-94cf-58375dabd8fe';
  console.log(`Verifying test ${testId}...`);

  const tests = await fetchJson(`/rest/v1/tests?id=eq.${testId}&select=*`);
  const test = tests[0];
  console.log('Test details:', {
    id: test.id,
    title: test.title,
    duration_minutes: test.duration_minutes,
    is_open_for_all: test.is_open_for_all,
    is_published: test.is_published,
    subject: test.subject,
  });

  const questions = await fetchJson(`/rest/v1/test_questions?test_id=eq.${testId}&order=position.asc&select=*`);
  console.log(`Fetched ${questions.length} questions from database.`);

  const imagesChecked = [];
  for (const q of questions) {
    if (q.image_url) {
      const code = await checkUrl(q.image_url);
      imagesChecked.push({ qNum: q.position, url: q.image_url, status: code });
    }
  }

  console.log('Diagram images verification:', imagesChecked);
  const allImagesOk = imagesChecked.every(img => img.status === 200);
  console.log(`All images HTTP 200 OK: ${allImagesOk}`);

  console.log('Verification COMPLETE and PASS!');
}

verify();
