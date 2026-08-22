const https = require('https');

const SUPABASE_URL = 'https://uwuzdggimbbbfgcauzho.supabase.co';
const SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV3dXpkZ2dpbWJiYmZnY2F1emhvIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NTM5MTMxNSwiZXhwIjoyMDkwOTY3MzE1fQ.WCCXL2twdvI0BCW2OPR2NeNaV5mnzvDTJa2Fwfqx18o';

function restRequest({ method, path, body }) {
  return new Promise((resolve, reject) => {
    const url = new URL(`${SUPABASE_URL}${path}`);
    const req = https.request(url, {
      method,
      headers: {
        'apikey': SERVICE_ROLE_KEY,
        'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=representation',
      }
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
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function main() {
  console.log('Testing direct select from test_attempts...');
  const res = await restRequest({ method: 'GET', path: '/rest/v1/test_attempts?limit=1' });
  console.log('Select result:', res);
}

main();
