const https = require('https');

const SUPABASE_URL = 'https://uwuzdggimbbbfgcauzho.supabase.co';
const SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV3dXpkZ2dpbWJiYmZnY2F1emhvIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NTM5MTMxNSwiZXhwIjoyMDkwOTY3MzE1fQ.WCCXL2twdvI0BCW2OPR2NeNaV5mnzvDTJa2Fwfqx18o';
const ANON_KEY = 'sb_publishable_2hMbPMAYceagP86WVmzZEQ_BDkMMXLp';

async function request(endpoint, method = 'GET', body = null, apiKey = ANON_KEY) {
  return new Promise((resolve, reject) => {
    const url = new URL(endpoint, SUPABASE_URL);
    const postData = body ? JSON.stringify(body) : '';
    const headers = {
      'apikey': apiKey,
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    };
    if (postData) headers['Content-Length'] = Buffer.byteLength(postData);

    const req = https.request(url, { method, headers }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(data) });
        } catch {
          resolve({ status: res.statusCode, data });
        }
      });
    });
    req.on('error', reject);
    if (postData) req.write(postData);
    req.end();
  });
}

async function verifyProductionData() {
  console.log('=== VERIFYING SUPABASE SETS WITH ACTUAL RELATIONAL COUNT ===');
  const setsRes = await request('/rest/v1/pdf_native_sets?select=*,pdf_native_set_questions(count)');
  console.log('Sets status:', setsRes.status);
  setsRes.data.forEach(s => {
    const actualCount = s.pdf_native_set_questions?.[0]?.count ?? s.total_questions ?? 0;
    console.log(`- Set: "${s.set_name}" (ID: ${s.id}) | Subject: ${s.subject} | Status: ${s.status} | Authoritative Question Count: ${actualCount}`);
  });

  console.log('\n=== VERIFYING PHYSICS SET 01 QUESTIONS ===');
  const phySetId = 'set_1786825374013';
  const phyRelations = await request(`/rest/v1/pdf_native_set_questions?set_id=eq.${phySetId}&order=order_index.asc`);
  console.log(`Physics Set Questions relations: ${phyRelations.data.length}`);
  const qIds = phyRelations.data.map(r => r.question_id);
  const phyQuestions = await request(`/rest/v1/pdf_native_questions?id=in.(${qIds.join(',')})`);
  console.log(`Physics Set Actual Questions loaded: ${phyQuestions.data.length}`);

  console.log('\n=== VERIFYING PRODUCTION TESTS ===');
  const testsRes = await request('/rest/v1/pdf_native_tests?select=*&order=created_at.desc');
  console.log('Tests count:', testsRes.data.length);
  testsRes.data.forEach(t => {
    console.log(`- Test: "${t.title}" (ID: ${t.id}) | Status: ${t.status} | Subject: ${t.subject} | Total Q: ${t.total_questions}`);
  });
}

verifyProductionData().catch(console.error);
