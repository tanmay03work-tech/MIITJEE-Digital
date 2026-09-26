const SUPABASE_URL = 'https://uwuzdggimbbbfgcauzho.supabase.co';
const SUPABASE_KEY = 'sb_publishable_2hMbPMAYceagP86WVmzZEQ_BDkMMXLp';

async function testTqInsert() {
  const row = {
    id: `tq_test_${Date.now()}`,
    test_id: 'pdf_test_1786853175921',
    question_id: 'pdf_pdf_phys_1786860000000_q1_p1',
    order_index: 1,
    created_at: new Date().toISOString(),
  };

  const res = await fetch(`${SUPABASE_URL}/rest/v1/pdf_native_test_questions`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    },
    body: JSON.stringify([row]),
  });

  console.log('Status:', res.status);
  console.log('Response:', await res.text());
}

testTqInsert();
