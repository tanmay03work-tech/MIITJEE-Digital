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

async function checkStorageAndJobs() {
  console.log('=== CHECK PDF_IMPORT_JOBS ===');
  const jobs = await fetchRest('/rest/v1/pdf_import_jobs?select=*');
  console.log('Jobs status:', jobs.status, 'Count:', Array.isArray(jobs.data) ? jobs.data.length : 'N/A');
  if (Array.isArray(jobs.data)) {
    console.log(jobs.data);
  }

  console.log('\n=== CHECK STORAGE OBJECTS IN exam-assets ===');
  const storageObjects = await fetchRest('/storage/v1/object/list/exam-assets');
  console.log('Storage status:', storageObjects.status);
  console.log(storageObjects.data);

  console.log('\n=== CHECK ALL TABLES IN DB ===');
  const root = await fetchRest('/rest/v1/');
  console.log('All REST tables:', Object.keys(root.data?.definitions || {}));
}

checkStorageAndJobs().catch(console.error);
