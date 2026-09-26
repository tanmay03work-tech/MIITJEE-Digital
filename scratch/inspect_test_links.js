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
  const testSets = await query('pdf_native_test_sets');
  console.log('Test Sets junction:', JSON.stringify(testSets, null, 2));

  const testQs = await query('pdf_native_test_questions', '*', 'order_index.asc');
  console.log('Test questions count:', testQs.length);
  console.log('First 5 test questions:', JSON.stringify(testQs.slice(0, 5), null, 2));
  console.log('Questions 26 to 30:', JSON.stringify(testQs.slice(25, 30), null, 2));
}

run();
