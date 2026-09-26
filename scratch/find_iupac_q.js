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

async function findIupacQuestions() {
  console.log('=== SEARCH TEST_QUESTIONS ===');
  const tq = await fetchRest(`/rest/v1/test_questions?prompt=ilike.*IUPAC*&select=*`);
  console.log('test_questions count:', tq.data?.length);
  if (tq.data && tq.data.length > 0) {
    tq.data.forEach((q) => {
      console.log(`Q ID: ${q.id}, test_id: ${q.test_id}, position: ${q.position}`);
      console.log(`Prompt: ${q.prompt}`);
      console.log(`Image URL: ${q.image_url}`);
      console.log(`Option Image URLs:`, q.option_image_urls);
    });
  }

  console.log('\n=== SEARCH QUESTION_BANK_QUESTIONS ===');
  const qbq = await fetchRest(`/rest/v1/question_bank_questions?question=ilike.*IUPAC*&select=*`);
  console.log('question_bank_questions count:', qbq.data?.length);
  if (qbq.data && qbq.data.length > 0) {
    qbq.data.forEach((q) => {
      console.log(`QBQ ID: ${q.id}, set_id: ${q.set_id}`);
      console.log(`Question: ${q.question}`);
      console.log(`Image URL: ${q.image_url}`);
    });
  }
}

findIupacQuestions().catch(console.error);
