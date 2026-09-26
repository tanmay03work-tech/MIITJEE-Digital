const SUPABASE_URL = 'https://uwuzdggimbbbfgcauzho.supabase.co';
const SUPABASE_KEY = 'sb_publishable_2hMbPMAYceagP86WVmzZEQ_BDkMMXLp';

async function req(path) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` }
  });
  return res.json();
}

async function verifyElevator() {
  const testId = 'pdf_test_1786853175921';
  const tq = await req(`pdf_native_test_questions?test_id=eq.${testId}&order=order_index.asc`);
  console.log(`Total questions in Elevator test: ${tq.length}`);

  console.log('\n--- Section Boundaries Verification ---');
  // Check Q1 (Physics start)
  const q1 = await req(`pdf_native_questions?id=eq.${tq[0].question_id}`);
  console.log('Q1 (CBT Question 1 - Physics Start):', {
    qNum: q1[0].question_number,
    subject: q1[0].subject,
    pdf_url: q1[0].pdf_url.slice(-50),
    page: q1[0].page_start,
  });

  // Check Q25 (Physics end)
  const q25 = await req(`pdf_native_questions?id=eq.${tq[24].question_id}`);
  console.log('Q25 (CBT Question 25 - Physics End):', {
    qNum: q25[0].question_number,
    subject: q25[0].subject,
    pdf_url: q25[0].pdf_url.slice(-50),
    page: q25[0].page_start,
  });

  // Check Q26 (Chemistry start)
  const q26 = await req(`pdf_native_questions?id=eq.${tq[25].question_id}`);
  console.log('Q26 (CBT Question 26 - Chemistry Start):', {
    qNum: q26[0].question_number,
    subject: q26[0].subject,
    pdf_url: q26[0].pdf_url.slice(-50),
    page: q26[0].page_start,
    regions: q26[0].bbox.regions ? q26[0].bbox.regions.length : 1,
  });

  // Check Q50 (Chemistry end)
  const q50 = await req(`pdf_native_questions?id=eq.${tq[49].question_id}`);
  console.log('Q50 (CBT Question 50 - Chemistry End):', {
    qNum: q50[0].question_number,
    subject: q50[0].subject,
    pdf_url: q50[0].pdf_url.slice(-50),
    page: q50[0].page_start,
  });

  // Check Q51 (Math start)
  const q51 = await req(`pdf_native_questions?id=eq.${tq[50].question_id}`);
  console.log('Q51 (CBT Question 51 - Math Start):', {
    qNum: q51[0].question_number,
    subject: q51[0].subject,
    pdf_url: q51[0].pdf_url.slice(-50),
    page: q51[0].page_start,
  });

  // Check Q75 (Math end)
  const q75 = await req(`pdf_native_questions?id=eq.${tq[74].question_id}`);
  console.log('Q75 (CBT Question 75 - Math End):', {
    qNum: q75[0].question_number,
    subject: q75[0].subject,
    pdf_url: q75[0].pdf_url.slice(-50),
    page: q75[0].page_start,
  });
}

verifyElevator();
