const https = require('https');

const SUPABASE_URL = 'https://uwuzdggimbbbfgcauzho.supabase.co';
const SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV3dXpkZ2dpbWJiYmZnY2F1emhvIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NTM5MTMxNSwiZXhwIjoyMDkwOTY3MzE1fQ.WCCXL2twdvI0BCW2OPR2NeNaV5mnzvDTJa2Fwfqx18o';

async function findQ31() {
  const url = new URL('/rest/v1/pdf_native_questions?question_number=eq.31', SUPABASE_URL);
  const req = https.request(url, {
    method: 'GET',
    headers: {
      'apikey': SERVICE_ROLE_KEY,
      'Authorization': `Bearer ${SERVICE_ROLE_KEY}`
    }
  }, (res) => {
    let data = '';
    res.on('data', chunk => data += chunk);
    res.on('end', () => {
      console.log('Q31 in pdf_native_questions:');
      const questions = JSON.parse(data);
      console.log(JSON.stringify(questions, null, 2));

      questions.forEach(async (q) => {
        // check set questions
        const setReq = https.request(new URL(`/rest/v1/pdf_native_set_questions?question_id=eq.${q.id}`, SUPABASE_URL), {
          method: 'GET',
          headers: { 'apikey': SERVICE_ROLE_KEY, 'Authorization': `Bearer ${SERVICE_ROLE_KEY}` }
        }, (sRes) => {
          let sData = '';
          sRes.on('data', c => sData += c);
          sRes.on('end', () => console.log(`Q31 (${q.id}) sets:`, sData));
        });
        setReq.end();

        // check test questions
        const testReq = https.request(new URL(`/rest/v1/pdf_native_test_questions?question_id=eq.${q.id}`, SUPABASE_URL), {
          method: 'GET',
          headers: { 'apikey': SERVICE_ROLE_KEY, 'Authorization': `Bearer ${SERVICE_ROLE_KEY}` }
        }, (tRes) => {
          let tData = '';
          tRes.on('data', c => tData += c);
          tRes.on('end', () => console.log(`Q31 (${q.id}) tests:`, tData));
        });
        testReq.end();
      });
    });
  });
  req.end();
}

findQ31();
