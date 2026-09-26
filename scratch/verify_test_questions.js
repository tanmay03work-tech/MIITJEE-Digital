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

async function verify() {
  const testId = 'pdf_test_1786850080190';
  console.log(`Checking questions for ${testId}:`);
  const tq = await req(`pdf_native_test_questions?test_id=eq.${testId}&order=order_index.asc`);
  console.log(`Total test questions linked: ${tq.length}`);

  const qIds = tq.map(r => r.question_id);
  const qRows = await req(`pdf_native_questions?id=in.(${qIds.join(',')})`);
  console.log(`Total questions retrieved: ${qRows.length}`);
  console.log('Sample question 1:', {
    id: qRows[0].id,
    q_num: qRows[0].question_number,
    subject: qRows[0].subject,
    pdf_id: qRows[0].pdf_id,
    pdf_url: qRows[0].pdf_url,
  });
}

verify();
