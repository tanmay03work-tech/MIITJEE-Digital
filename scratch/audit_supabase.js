const https = require('https');

const SUPABASE_URL = 'https://uwuzdggimbbbfgcauzho.supabase.co';
const SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV3dXpkZ2dpbWJiYmZnY2F1emhvIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NTM5MTMxNSwiZXhwIjoyMDkwOTY3MzE1fQ.WCCXL2twdvI0BCW2OPR2NeNaV5mnzvDTJa2Fwfqx18o';
const ANON_KEY = 'sb_publishable_2hMbPMAYceagP86WVmzZEQ_BDkMMXLp';

async function fetchRest(endpoint, apiKey = SERVICE_ROLE_KEY) {
  return new Promise((resolve, reject) => {
    const url = new URL(endpoint, SUPABASE_URL);
    const req = https.request(url, {
      method: 'GET',
      headers: {
        'apikey': apiKey,
        'Authorization': `Bearer ${apiKey}`,
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

async function runAudit() {
  console.log('=== 1. PDF_NATIVE_SETS (AUTHORITATIVE SETS TABLE) ===');
  const setsRes = await fetchRest('/rest/v1/pdf_native_sets?select=*');
  console.log(`pdf_native_sets count: ${setsRes.data?.length || 0}`);
  console.log(JSON.stringify(setsRes.data, null, 2));

  console.log('\n=== 2. PDF_NATIVE_SET_QUESTIONS (JUNCTION) ===');
  const setQuestionsRes = await fetchRest('/rest/v1/pdf_native_set_questions?select=*');
  console.log(`pdf_native_set_questions count: ${setQuestionsRes.data?.length || 0}`);
  if (Array.isArray(setQuestionsRes.data)) {
    const setGroups = {};
    setQuestionsRes.data.forEach(sq => {
      setGroups[sq.set_id] = (setGroups[sq.set_id] || 0) + 1;
    });
    console.log('Set questions count by set_id:', setGroups);
    console.log('Sample set questions:', setQuestionsRes.data.slice(0, 5));
  }

  console.log('\n=== 3. PDF_NATIVE_QUESTIONS ===');
  const questionsRes = await fetchRest('/rest/v1/pdf_native_questions?select=*');
  console.log(`pdf_native_questions total count: ${questionsRes.data?.length || 0}`);
  if (Array.isArray(questionsRes.data)) {
    const byPdf = {};
    questionsRes.data.forEach(q => {
      byPdf[q.pdf_id] = (byPdf[q.pdf_id] || 0) + 1;
    });
    console.log('Questions count by pdf_id:', byPdf);
    console.log('Sample question:', questionsRes.data[0]);
  }

  console.log('\n=== 4. PDF_NATIVE_TESTS ===');
  const testsRes = await fetchRest('/rest/v1/pdf_native_tests?select=*');
  console.log(`pdf_native_tests count: ${testsRes.data?.length || 0}`);
  console.log(JSON.stringify(testsRes.data, null, 2));

  console.log('\n=== 5. PDF_NATIVE_TEST_QUESTIONS ===');
  const testQRes = await fetchRest('/rest/v1/pdf_native_test_questions?select=*');
  console.log(`pdf_native_test_questions count: ${testQRes.data?.length || 0}`);

  console.log('\n=== 6. PDF_NATIVE_TEST_SETS (TEST-SET JUNCTION) ===');
  const testSetsRes = await fetchRest('/rest/v1/pdf_native_test_sets?select=*');
  console.log(`pdf_native_test_sets count: ${testSetsRes.data?.length || 0}`);
  console.log(JSON.stringify(testSetsRes.data, null, 2));
}

runAudit().catch(console.error);
