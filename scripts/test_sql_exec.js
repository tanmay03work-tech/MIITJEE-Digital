const https = require('https');

const SUPABASE_URL = 'https://uwuzdggimbbbfgcauzho.supabase.co';
const SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV3dXpkZ2dpbWJiYmZnY2F1emhvIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NTM5MTMxNSwiZXhwIjoyMDkwOTY3MzE1fQ.WCCXL2twdvI0BCW2OPR2NeNaV5mnzvDTJa2Fwfqx18o';

async function testQuery(urlStr, headers, body) {
  return new Promise((resolve) => {
    const url = new URL(urlStr);
    const options = {
      hostname: url.hostname,
      port: 443,
      path: url.pathname + url.search,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...headers,
      },
    };
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        resolve({ status: res.statusCode, data });
      });
    });
    req.on('error', err => resolve({ error: err.message }));
    if (body) req.write(typeof body === 'string' ? body : JSON.stringify(body));
    req.end();
  });
}

async function main() {
  console.log('1. Trying api.supabase.com db query...');
  const res1 = await testQuery(
    'https://api.supabase.com/v1/projects/uwuzdggimbbbfgcauzho/db/query',
    { 'Authorization': `Bearer ${SERVICE_ROLE_KEY}` },
    { query: 'SELECT 1;' }
  );
  console.log('Res 1:', res1);

  console.log('2. Trying rest/v1/rpc...');
  const res2 = await testQuery(
    `${SUPABASE_URL}/rest/v1/rpc/exec_sql`,
    { 'apikey': SERVICE_ROLE_KEY, 'Authorization': `Bearer ${SERVICE_ROLE_KEY}` },
    { sql: 'SELECT 1;' }
  );
  console.log('Res 2:', res2);
}

main();
