const SUPABASE_URL = 'https://uwuzdggimbbbfgcauzho.supabase.co';
const SUPABASE_KEY = 'sb_publishable_2hMbPMAYceagP86WVmzZEQ_BDkMMXLp';

async function query(table, select = '*', order = '') {
  let url = `${SUPABASE_URL}/rest/v1/${table}?select=${encodeURIComponent(select)}`;
  if (order) url += `&order=${order}`;
  const res = await fetch(url, {
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
    },
  });
  return res.json();
}

async function run() {
  console.log('=== PDF NATIVE TESTS ===');
  const tests = await query('pdf_native_tests', '*', 'created_at.desc');
  console.log('Total tests:', tests.length);
  console.log(JSON.stringify(tests.slice(0, 5), null, 2));

  console.log('=== PDF NATIVE TEST SETS ===');
  const testSets = await query('pdf_native_test_sets');
  console.log('Total test sets links:', testSets.length);
  console.log(JSON.stringify(testSets.slice(0, 5), null, 2));

  console.log('=== PDF NATIVE SETS ===');
  const sets = await query('pdf_native_sets', '*', 'created_at.desc');
  console.log('Total sets:', sets.length);
  console.log(JSON.stringify(sets.slice(0, 5), null, 2));

  console.log('=== PDF NATIVE TEST QUESTIONS (junction) ===');
  const testQs = await query('pdf_native_test_questions', '*', 'order_index.asc');
  console.log('Total test questions links:', testQs.length);
  console.log(JSON.stringify(testQs.slice(0, 5), null, 2));

  console.log('=== PDF NATIVE QUESTIONS (First 5) ===');
  const qs = await query('pdf_native_questions', 'id,pdf_id,pdf_url,question_number,page_start,bbox,regions', 'created_at.desc');
  console.log('Total questions:', qs.length);
  console.log(JSON.stringify(qs.slice(0, 5), null, 2));
}

run();
