const SUPABASE_URL = 'https://uwuzdggimbbbfgcauzho.supabase.co';
const SUPABASE_KEY = 'sb_publishable_2hMbPMAYceagP86WVmzZEQ_BDkMMXLp';

async function req(path) {
  const url = `${SUPABASE_URL}/rest/v1/${path}`;
  const res = await fetch(url, {
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
    },
  });
  return res.json();
}

async function verifyElevator() {
  const testId = 'pdf_test_1786853175921';
  console.log('Verifying test record...');
  const t = await req(`pdf_native_tests?id=eq.${testId}`);
  console.log('Test:', t[0]);

  const tq = await req(`pdf_native_test_questions?test_id=eq.${testId}&order=order_index.asc`);
  console.log(`Total questions in test: ${tq.length}`);

  const firstQ = await req(`pdf_native_questions?id=eq.${tq[0].question_id}`);
  console.log('First Question (Q1 in CBT):', {
    id: firstQ[0].id,
    subject: firstQ[0].subject,
    qNum: firstQ[0].question_number,
    pdf_url: firstQ[0].pdf_url,
    page: firstQ[0].page_start,
    bbox: firstQ[0].bbox,
  });

  const mathQ = await req(`pdf_native_questions?id=eq.${tq[25].question_id}`);
  console.log('Math First Question (Q26 in CBT):', {
    id: mathQ[0].id,
    subject: mathQ[0].subject,
    qNum: mathQ[0].question_number,
    pdf_url: mathQ[0].pdf_url,
    page: mathQ[0].page_start,
    bbox: mathQ[0].bbox,
  });
}

verifyElevator();
