const SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV3dXpkZ2dpbWJiYmZnY2F1emhvIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NTM5MTMxNSwiZXhwIjoyMDkwOTY3MzE1fQ.WCCXL2twdvI0BCW2OPR2NeNaV5mnzvDTJa2Fwfqx18o';
const BASE_URL = 'https://uwuzdggimbbbfgcauzho.supabase.co';

async function checkFunctions() {
  const res = await fetch(`${BASE_URL}/rest/v1/`, {
    headers: {
      apikey: SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
    }
  });
  console.log('OpenAPI spec status:', res.status);
  const spec = await res.json();
  const rpcPaths = Object.keys(spec.paths || {}).filter(p => p.startsWith('/rpc/'));
  console.log('All available RPC functions on remote DB:');
  rpcPaths.forEach(p => console.log(' -', p));
}

checkFunctions().catch(console.error);
