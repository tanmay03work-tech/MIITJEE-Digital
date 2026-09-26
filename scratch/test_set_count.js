const https = require('https');

const SUPABASE_URL = 'https://uwuzdggimbbbfgcauzho.supabase.co';
const ANON_KEY = 'sb_publishable_2hMbPMAYceagP86WVmzZEQ_BDkMMXLp';

async function testSetCountQuery() {
  const url = new URL('/rest/v1/pdf_native_sets?select=*,pdf_native_set_questions(count)', SUPABASE_URL);
  
  const req = https.request(url, {
    method: 'GET',
    headers: {
      'apikey': ANON_KEY,
      'Authorization': `Bearer ${ANON_KEY}`,
      'Content-Type': 'application/json'
    }
  }, (res) => {
    let data = '';
    res.on('data', chunk => data += chunk);
    res.on('end', () => {
      console.log('Query status:', res.statusCode);
      console.log('Query response:', JSON.stringify(JSON.parse(data), null, 2));
    });
  });

  req.on('error', console.error);
  req.end();
}

testSetCountQuery();
