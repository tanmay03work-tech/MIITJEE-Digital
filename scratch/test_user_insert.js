const SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV3dXpkZ2dpbWJiYmZnY2F1emhvIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NTM5MTMxNSwiZXhwIjoyMDkwOTY3MzE1fQ.WCCXL2twdvI0BCW2OPR2NeNaV5mnzvDTJa2Fwfqx18o';
const ANON_KEY = 'sb_publishable_2hMbPMAYceagP86WVmzZEQ_BDkMMXLp';
const BASE_URL = 'https://uwuzdggimbbbfgcauzho.supabase.co';

async function testUserInsert() {
  // Let's sign in as admin@gmail.com
  console.log('Signing in as admin@gmail.com...');
  const authRes = await fetch(`${BASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: {
      apikey: ANON_KEY,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      email: 'admin@gmail.com',
      password: 'password123' // or whatever password
    })
  });
  console.log('Auth status:', authRes.status);
  const authData = await authRes.json();
  console.log('Auth data:', authData.user ? 'User authenticated' : authData);
}

testUserInsert().catch(console.error);
