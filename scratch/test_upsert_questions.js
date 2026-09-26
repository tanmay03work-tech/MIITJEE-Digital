const https = require('https');

const SUPABASE_URL = 'https://uwuzdggimbbbfgcauzho.supabase.co';
const ANON_KEY = 'sb_publishable_2hMbPMAYceagP86WVmzZEQ_BDkMMXLp';

async function testUpsertQuestions() {
  const dummyQuestions = Array.from({ length: 5 }, (_, i) => ({
    id: `pdf_q_test_pdf_${i + 1}`,
    pdf_id: 'test_pdf',
    pdf_url: 'https://example.com/test.pdf',
    question_number: String(i + 1),
    page_start: 1,
    page_end: 1,
    bbox: { x: 10, y: 100 * i, width: 200, height: 80 },
    subject: 'Chemistry',
    chapter: null,
    topic: null,
    question_type: 'MCQ',
    correct_answer: 'B',
    marks: 4,
    negative_marks: 1,
    review_status: 'APPROVED',
    raw_text: `Test Question ${i + 1}`,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  }));

  const url = new URL('/rest/v1/pdf_native_questions?on_conflict=pdf_id,question_number', SUPABASE_URL);
  const body = JSON.stringify(dummyQuestions);
  
  const req = https.request(url, {
    method: 'POST',
    headers: {
      'apikey': ANON_KEY,
      'Authorization': `Bearer ${ANON_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': 'resolution=merge-duplicates,return=representation',
      'Content-Length': Buffer.byteLength(body)
    }
  }, (res) => {
    let data = '';
    res.on('data', chunk => data += chunk);
    res.on('end', () => {
      console.log('Upsert status:', res.statusCode);
      console.log('Upsert response:', data);
    });
  });

  req.on('error', console.error);
  req.write(body);
  req.end();
}

testUpsertQuestions();
