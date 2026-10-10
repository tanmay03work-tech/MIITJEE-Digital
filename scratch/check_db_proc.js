const fs = require('fs');
const https = require('https');

const script = fs.readFileSync('scratch/apply_regions_migration.js', 'utf8');
const keyMatch = script.match(/SERVICE_ROLE_KEY\s*=\s*'([^']+)'/);
const key = keyMatch ? keyMatch[1] : '';

function executeSql(query) {
  return new Promise((resolve, reject) => {
    const dataString = JSON.stringify({ query });
    const options = {
      hostname: 'api.supabase.com',
      port: 443,
      path: '/v1/projects/uwuzdggimbbbfgcauzho/db/query',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + key,
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

    req.on('error', reject);
    req.write(dataString);
    req.end();
  });
}

async function inspectPgProc() {
  const query = "SELECT p.oid, p.proname, p.pronargs, pg_get_function_identity_arguments(p.oid) as identity_args, pg_get_function_arguments(p.oid) as full_args FROM pg_proc p JOIN pg_namespace n ON p.pronamespace = n.oid WHERE n.nspname = 'public' AND p.proname = 'create_test_with_questions';";
  const res = await executeSql(query);
  console.log('Query status:', res.status);
  try {
    const data = JSON.parse(res.body);
    console.log('Total functions matching public.create_test_with_questions:', data.length);
    data.forEach((fn, idx) => {
      console.log(`Function #${idx + 1}:`);
      console.log('  OID:', fn.oid);
      console.log('  pronargs:', fn.pronargs);
      console.log('  identity_args:', fn.identity_args);
    });
  } catch (e) {
    console.log('Raw body:', res.body);
  }

  // Check supabase_migrations.schema_migrations
  const migQuery = "SELECT version, name FROM supabase_migrations.schema_migrations ORDER BY version DESC LIMIT 10;";
  const migRes = await executeSql(migQuery);
  try {
    const migData = JSON.parse(migRes.body);
    console.log('\nTop 10 rows in supabase_migrations.schema_migrations:');
    migData.forEach(m => console.log('  -', m.version, m.name || ''));
  } catch (e) {
    console.log('Mig error:', migRes.body);
  }
}

inspectPgProc().catch(console.error);
