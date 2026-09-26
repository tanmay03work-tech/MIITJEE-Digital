const https = require('https');
const { SUPABASE_SERVICE_KEY: SERVICE_ROLE_KEY } = require('./supabase-env');

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
