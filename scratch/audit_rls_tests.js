const SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV3dXpkZ2dpbWJiYmZnY2F1emhvIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NTM5MTMxNSwiZXhwIjoyMDkwOTY3MzE1fQ.WCCXL2twdvI0BCW2OPR2NeNaV5mnzvDTJa2Fwfqx18o';
const ANON_KEY = 'sb_publishable_2hMbPMAYceagP86WVmzZEQ_BDkMMXLp';
const BASE_URL = 'https://uwuzdggimbbbfgcauzho.supabase.co';

async function auditRls() {
  // Check if we can sign in or test an authenticated token
  console.log('Fetching profiles to get an admin user id...');
  const res = await fetch(`${BASE_URL}/rest/v1/profiles?role=eq.admin&select=*`, {
    headers: {
      apikey: SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
    }
  });
  const profiles = await res.json();
  console.log('Admin profiles:', profiles);
}

auditRls().catch(console.error);
