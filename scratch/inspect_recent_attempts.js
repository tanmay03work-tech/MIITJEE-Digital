const https = require('https');

const SUPABASE_URL = 'https://uwuzdggimbbbfgcauzho.supabase.co';
const SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV3dXpkZ2dpbWJiYmZnY2F1emhvIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NTM5MTMxNSwiZXhwIjoyMDkwOTY3MzE1fQ.WCCXL2twdvI0BCW2OPR2NeNaV5mnzvDTJa2Fwfqx18o';

async function fetchRest(endpoint) {
  return new Promise((resolve, reject) => {
    const url = new URL(endpoint, SUPABASE_URL);
    const req = https.request(url, {
      method: 'GET',
      headers: {
        'apikey': SERVICE_ROLE_KEY,
        'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json'
      }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(data) });
        } catch (e) {
          resolve({ status: res.statusCode, data: data });
        }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

async function inspectLatestAttempts() {
  console.log('=== LATEST TEST ATTEMPTS ===');
  const attempts = await fetchRest('/rest/v1/test_attempts?select=*&order=submitted_at.desc&limit=5');
  console.log('Attempts:', JSON.stringify(attempts.data, null, 2));

  console.log('\n=== LATEST TESTS ===');
  const tests = await fetchRest('/rest/v1/tests?select=id,title,type,question_count,scheduled_at,is_published,is_started&order=created_at.desc&limit=5');
  console.log('Tests:', JSON.stringify(tests.data, null, 2));
}

inspectLatestAttempts().catch(console.error);
