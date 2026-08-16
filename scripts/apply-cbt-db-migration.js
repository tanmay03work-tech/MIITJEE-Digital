const fs = require('fs');
const path = require('path');
const https = require('https');

const SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV3dXpkZ2dpbWJiYmZnY2F1emhvIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NTM5MTMxNSwiZXhwIjoyMDkwOTY3MzE1fQ.WCCXL2twdvI0BCW2OPR2NeNaV5mnzvDTJa2Fwfqx18o';

const sqlPath = path.join(__dirname, '..', 'supabase', 'migrations', '20260801_cbt_windows_architecture.sql');
const sqlQuery = fs.readFileSync(sqlPath, 'utf8');

async function executeSqlApi(query) {
  return new Promise((resolve, reject) => {
    const dataString = JSON.stringify({ query });
    
    // Supabase Management API or direct SQL runner
    const options = {
      hostname: 'api.supabase.com',
      port: 443,
      path: '/v1/projects/uwuzdggimbbbfgcauzho/db/query',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
        'Content-Length': Buffer.byteLength(dataString)
      }
    };

    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        resolve({ status: res.statusCode, body });
      });
    });

    req.on('error', (err) => reject(err));
    req.write(dataString);
    req.end();
  });
}

async function testSupabaseRest() {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'uwuzdggimbbbfgcauzho.supabase.co',
      port: 443,
      path: '/rest/v1/student_devices?select=*',
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
        resolve({ status: res.statusCode, body });
      });
    });

    req.on('error', (err) => reject(err));
    req.end();
  });
}

async function main() {
  console.log('🔍 Testing Supabase connection & existing tables...');
  const testRes = await testSupabaseRest();
  console.log(`student_devices check status: ${testRes.status}`);
  console.log(`student_devices check body: ${testRes.body}`);

  console.log('🔄 Executing Migration Query via Supabase API...');
  const sqlRes = await executeSqlApi(sqlQuery);
  console.log(`API Exec Status: ${sqlRes.status}`);
  console.log(`API Exec Body: ${sqlRes.body}`);
}

main();
