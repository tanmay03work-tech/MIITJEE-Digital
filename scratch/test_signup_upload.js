const SUPABASE_URL = 'https://uwuzdggimbbbfgcauzho.supabase.co';
const SUPABASE_KEY = 'sb_publishable_2hMbPMAYceagP86WVmzZEQ_BDkMMXLp';

async function testSignUp() {
  const email = `admin_uploader_${Date.now()}@miitjee.com`;
  const password = 'StrongPassword123!';

  console.log('Signing up user:', email);
  const res = await fetch(`${SUPABASE_URL}/auth/v1/signup`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ email, password }),
  });

  const data = await res.json();
  console.log('Signup status:', res.status, data);

  if (data.access_token) {
    console.log('Access token received! Uploading Physics PDF...');
    const fs = require('fs');
    const buf = fs.readFileSync('D:\\Downloads\\11th_morning_physics__1163869_1_1786701950.pdf');
    const uploadPath = `pdfs/1786860000000-11th_morning_physics__1163869_1_1786701950.pdf`;

    const upRes = await fetch(`${SUPABASE_URL}/storage/v1/object/exam-assets/${uploadPath}`, {
      method: 'POST',
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${data.access_token}`,
        'Content-Type': 'application/pdf',
        'x-upsert': 'true',
      },
      body: buf,
    });

    console.log('Upload status:', upRes.status, await upRes.text());
  }
}

testSignUp();
