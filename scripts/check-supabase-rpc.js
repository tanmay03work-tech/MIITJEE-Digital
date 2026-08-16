const https = require('https');

const SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV3dXpkZ2dpbWJiYmZnY2F1emhvIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NTM5MTMxNSwiZXhwIjoyMDkwOTY3MzE1fQ.WCCXL2twdvI0BCW2OPR2NeNaV5mnzvDTJa2Fwfqx18o';

const options = {
  hostname: 'uwuzdggimbbbfgcauzho.supabase.co',
  port: 443,
  path: '/rest/v1/',
  method: 'GET',
  headers: {
    'apikey': SERVICE_ROLE_KEY,
    'Authorization': `Bearer ${SERVICE_ROLE_KEY}`
  }
};

const req = https.request(options, (res) => {
  let body = '';
  res.on('data', chunk => body += chunk);
  res.on('end', () => {
    try {
      const json = JSON.parse(body);
      console.log('OpenAPI Title:', json.info?.title);
      console.log('Available Definitions/Tables:', Object.keys(json.definitions || {}));
      console.log('Available Paths/RPCs:', Object.keys(json.paths || {}).filter(p => p.includes('rpc')));
    } catch (e) {
      console.log('Raw output:', body.substring(0, 500));
    }
  });
});

req.on('error', err => console.error(err));
req.end();
