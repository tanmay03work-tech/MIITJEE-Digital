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

async function inspectQuestionsWithImages() {
  const tests = await fetchRest(`/rest/v1/tests?select=id,title&order=created_at.desc&limit=3`);
  for (const t of tests.data) {
    console.log(`=== TEST: ${t.title} (${t.id}) ===`);
    const qs = await fetchRest(`/rest/v1/test_questions?test_id=eq.${t.id}&select=*&order=position.asc`);
    if (Array.isArray(qs.data)) {
      qs.data.forEach((q) => {
        if (q.image_url || (q.option_image_urls && q.option_image_urls.length > 0) || q.prompt.includes('IUPAC') || q.prompt.includes('compound')) {
          console.log(`Pos: ${q.position}, ID: ${q.id}`);
          console.log(`Prompt: ${q.prompt}`);
          console.log(`Image URL: ${q.image_url}`);
          console.log(`Option Image URLs:`, q.option_image_urls);
        }
      });
    }
  }
}

inspectQuestionsWithImages().catch(console.error);
