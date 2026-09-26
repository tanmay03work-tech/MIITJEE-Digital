const https = require('https');

const SUPABASE_URL = 'https://uwuzdggimbbbfgcauzho.supabase.co';
const ANON_KEY = 'sb_publishable_2hMbPMAYceagP86WVmzZEQ_BDkMMXLp';

async function request(endpoint, method = 'GET', body = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(endpoint, SUPABASE_URL);
    const postData = body ? JSON.stringify(body) : '';
    const headers = {
      'apikey': ANON_KEY,
      'Authorization': `Bearer ${ANON_KEY}`,
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

async function runLiveDeleteTest() {
  console.log('=== TEST 1: INSERT SAMPLE UNREFERENCED QUESTION Q31 (REJECTED) ===');
  const dummyQ = {
    id: `test_q_del_${Date.now()}`,
    pdf_id: 'test_pdf_delete_dummy',
    pdf_url: 'https://example.com/test.pdf',
    question_number: '31',
    page_start: 1,
    page_end: 1,
    bbox: { x: 10, y: 10, width: 200, height: 100 },
    subject: 'Physics',
    question_type: 'MCQ',
    correct_answer: null,
    marks: 4,
    negative_marks: 1,
    review_status: 'REJECTED'
  };

  const insertRes = await request('/rest/v1/pdf_native_questions', 'POST', dummyQ);
  console.log('Insert dummy Q31 status:', insertRes.status);

  // Verify Q31 exists
  const checkRes = await request(`/rest/v1/pdf_native_questions?id=eq.${dummyQ.id}`);
  console.log('Found dummy Q31 in Supabase:', checkRes.data.length === 1 ? '✅ YES' : '❌ NO');

  console.log('\n=== TEST 2: DELETE UNREFERENCED QUESTION Q31 FROM SUPABASE ===');
  const delRes = await request(`/rest/v1/pdf_native_questions?id=eq.${dummyQ.id}`, 'DELETE');
  console.log('Delete status:', delRes.status);

  const verifyGone = await request(`/rest/v1/pdf_native_questions?id=eq.${dummyQ.id}`);
  console.log('Verified dummy Q31 is permanently gone:', verifyGone.data.length === 0 ? '✅ PASS' : '❌ FAIL');
}

runLiveDeleteTest().catch(console.error);
