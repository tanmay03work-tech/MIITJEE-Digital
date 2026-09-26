const https = require('https');

const SUPABASE_URL = 'https://uwuzdggimbbbfgcauzho.supabase.co';
const ANON_KEY = 'sb_publishable_2hMbPMAYceagP86WVmzZEQ_BDkMMXLp';

async function request(endpoint, method = 'GET', body = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(endpoint, SUPABASE_URL);
    const postData = body ? JSON.stringify(body) : '';
    const headers = {
      'apikey': ANON_KEY,
      'Authorization': `Bearer ${ANON_KEY}`,
      'Content-Type': 'application/json'
    };
    if (postData) headers['Content-Length'] = Buffer.byteLength(postData);

    const req = https.request(url, { method, headers }, (res) => {
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
    if (postData) req.write(postData);
    req.end();
  });
}

async function testQ14PersistenceCycle() {
  console.log('=== STEP 1: LOAD PHYSICS SET 01 QUESTIONS FROM SUPABASE ===');
  const setId = 'set_1786825374013';
  const rels = await request(`/rest/v1/pdf_native_set_questions?set_id=eq.${setId}&order=order_index.asc`);
  console.log('Junction relations count:', rels.data.length);
  
  const q14Rel = rels.data.find(r => r.order_index === 14);
  if (!q14Rel) {
    throw new Error('Q14 relation not found in set!');
  }
  console.log('Q14 question ID:', q14Rel.question_id);

  console.log('\n=== STEP 2: SIMULATE ADMIN BOUNDARY CORRECTION ON Q14 (PAGE 2) ===');
  const correctedBbox = {
    x: 10,
    y: 150,
    width: 293,
    height: 85,
    regions: [
      {
        id: 'q14_reg_page2',
        pageNumber: 2,
        bbox: { x: 10, y: 150, width: 293, height: 85 },
        role: 'stem',
        orderIndex: 0,
        label: 'Region 1 (Stem)'
      }
    ]
  };

  const updateRes = await request(`/rest/v1/pdf_native_questions?id=eq.${q14Rel.question_id}`, 'PATCH', {
    page_start: 2,
    page_end: 2,
    bbox: correctedBbox,
    review_status: 'APPROVED'
  });
  console.log('Update Q14 status:', updateRes.status);
  console.log('Updated Q14 row:', updateRes.data);

  console.log('\n=== STEP 3: SIMULATE LEAVING SET & REOPENING SET FROM SUPABASE ===');
  const reloadedRels = await request(`/rest/v1/pdf_native_set_questions?set_id=eq.${setId}&order=order_index.asc`);
  const qIds = reloadedRels.data.map(r => r.question_id);
  const reloadedQuestions = await request(`/rest/v1/pdf_native_questions?id=in.(${qIds.join(',')})`);
  
  const q14 = reloadedQuestions.data.find(q => q.id === q14Rel.question_id);
  console.log('\n=== VERIFICATION FOR Q14 REOPEN ===');
  console.log('Q14 page_start:', q14.page_start, q14.page_start === 2 ? '✅ PASS' : '❌ FAIL');
  console.log('Q14 page_end:', q14.page_end, q14.page_end === 2 ? '✅ PASS' : '❌ FAIL');
  console.log('Q14 bbox:', q14.bbox);
  console.log('Q14 embedded regions:', q14.bbox?.regions);
  const regPage = q14.bbox?.regions?.[0]?.pageNumber;
  console.log('Q14 region pageNumber:', regPage, regPage === 2 ? '✅ PASS' : '❌ FAIL');

  console.log('\n=== STEP 4: TEST MULTI-PAGE QUESTION PERSISTENCE (P1 STEM + P2 OPTIONS) ===');
  const multiPageBbox = {
    x: 10,
    y: 100,
    width: 293,
    height: 120,
    regions: [
      {
        id: 'q14_reg_p1',
        pageNumber: 1,
        bbox: { x: 10, y: 700, width: 293, height: 100 },
        role: 'stem',
        orderIndex: 0,
        label: 'Region 1 (Stem)'
      },
      {
        id: 'q14_reg_p2',
        pageNumber: 2,
        bbox: { x: 10, y: 50, width: 293, height: 120 },
        role: 'options',
        orderIndex: 1,
        label: 'Region 2 (Options)'
      }
    ]
  };

  const multiRes = await request(`/rest/v1/pdf_native_questions?id=eq.${q14Rel.question_id}`, 'PATCH', {
    page_start: 1,
    page_end: 2,
    bbox: multiPageBbox,
    review_status: 'APPROVED'
  });
  console.log('Multi-page update status:', multiRes.status);
  
  const verifyMulti = await request(`/rest/v1/pdf_native_questions?id=eq.${q14Rel.question_id}`);
  const qMulti = verifyMulti.data[0];
  console.log('Multi-page page_start:', qMulti.page_start, qMulti.page_start === 1 ? '✅ PASS' : '❌ FAIL');
  console.log('Multi-page page_end:', qMulti.page_end, qMulti.page_end === 2 ? '✅ PASS' : '❌ FAIL');
  console.log('Multi-page regions count:', qMulti.bbox?.regions?.length, qMulti.bbox?.regions?.length === 2 ? '✅ PASS' : '❌ FAIL');

  // Restore Q14 to Page 2 as desired by user
  await request(`/rest/v1/pdf_native_questions?id=eq.${q14Rel.question_id}`, 'PATCH', {
    page_start: 2,
    page_end: 2,
    bbox: correctedBbox,
    review_status: 'APPROVED'
  });
  console.log('\nRestored Q14 to Page 2 authoritative boundary.');
}

testQ14PersistenceCycle().catch(console.error);
