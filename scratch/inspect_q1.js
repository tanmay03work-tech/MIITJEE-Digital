const SUPABASE_URL = 'https://uwuzdggimbbbfgcauzho.supabase.co';
const SUPABASE_KEY = 'sb_publishable_2hMbPMAYceagP86WVmzZEQ_BDkMMXLp';

async function query(table, select = '*', filter = '') {
  let url = `${SUPABASE_URL}/rest/v1/${table}?select=${encodeURIComponent(select)}`;
  if (filter) url += `&${filter}`;
  const res = await fetch(url, {
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
    },
  });
  return res.json();
}

async function run() {
  const qs = await query('pdf_native_questions', '*', 'id=eq.pdf_q_pdf_1786824456756_1');
  console.log('Question 1:');
  console.log(JSON.stringify(qs, null, 2));

  console.log('\nAll questions in Physics set:');
  const setQs = await query('pdf_native_set_questions', '*', 'set_id=eq.set_1786825374013&order=order_index.asc');
  console.log(setQs);
}

run();
