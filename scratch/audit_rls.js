const https = require('https');

const SUPABASE_URL = 'https://uwuzdggimbbbfgcauzho.supabase.co';
const SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV3dXpkZ2dpbWJiYmZnY2F1emhvIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NTM5MTMxNSwiZXhwIjoyMDkwOTY3MzE1fQ.WCCXL2twdvI0BCW2OPR2NeNaV5mnzvDTJa2Fwfqx18o';
const ANON_KEY = 'sb_publishable_2hMbPMAYceagP86WVmzZEQ_BDkMMXLp';

async function testRequest(endpoint, method = 'GET', body = null, apiKey = ANON_KEY) {
  return new Promise((resolve) => {
    const url = new URL(endpoint, SUPABASE_URL);
    const postData = body ? JSON.stringify(body) : '';
    const headers = {
      'apikey': apiKey,
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    };
    if (postData) {
      headers['Content-Length'] = Buffer.byteLength(postData);
    }
    const req = https.request(url, {
      method,
      headers
    }, (res) => {
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
    req.on('error', (err) => resolve({ status: 500, data: err.message }));
    if (postData) req.write(postData);
    req.end();
  });
}

async function runRlsAudit() {
  console.log('=== PHASE 5: RLS AUDIT ON PDF TABLES (WITH ANON KEY) ===');
  
  // 1. pdf_native_sets
  const setsSelect = await testRequest('/rest/v1/pdf_native_sets?select=*');
  console.log('pdf_native_sets SELECT (Anon):', setsSelect.status, setsSelect.data?.length || setsSelect.data);

  // 2. pdf_native_questions
  const qSelect = await testRequest('/rest/v1/pdf_native_questions?select=*');
  console.log('pdf_native_questions SELECT (Anon):', qSelect.status, qSelect.data?.length || qSelect.data);

  // 3. pdf_native_set_questions
  const sqSelect = await testRequest('/rest/v1/pdf_native_set_questions?select=*');
  console.log('pdf_native_set_questions SELECT (Anon):', sqSelect.status, sqSelect.data?.length || sqSelect.data);

  // 4. pdf_native_tests
  const testsSelect = await testRequest('/rest/v1/pdf_native_tests?select=*');
  console.log('pdf_native_tests SELECT (Anon):', testsSelect.status, testsSelect.data?.length || testsSelect.data);

  // 5. pdf_native_test_questions
  const tqSelect = await testRequest('/rest/v1/pdf_native_test_questions?select=*');
  console.log('pdf_native_test_questions SELECT (Anon):', tqSelect.status, tqSelect.data?.length || tqSelect.data);

  // Test INSERT with Anon key (to see if client can save without auth token or if auth token is required)
  console.log('\n=== TEST WRITE OPERATIONS (ANON KEY) ===');
  const dummySet = {
    id: 'test_rls_probe_' + Date.now(),
    set_name: 'Probe Set',
    source_pdf_id: 'probe_pdf',
    pdf_url: null,
    subject: 'Physics',
    total_questions: 0,
    status: 'DRAFT',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };
  const setInsert = await testRequest('/rest/v1/pdf_native_sets', 'POST', dummySet, ANON_KEY);
  console.log('pdf_native_sets INSERT (Anon):', setInsert.status, setInsert.data);

  if (setInsert.status === 201) {
    // Clean up probe
    await testRequest(`/rest/v1/pdf_native_sets?id=eq.${dummySet.id}`, 'DELETE', null, SERVICE_ROLE_KEY);
    console.log('Cleaned up probe set');
  }
}

runRlsAudit().catch(console.error);
