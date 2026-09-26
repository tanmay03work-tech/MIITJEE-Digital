const https = require('https');
const { SUPABASE_URL, SUPABASE_SERVICE_KEY: SERVICE_ROLE_KEY } = require('./supabase-env');

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
