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

async function testFetchQuestions() {
  const testId = 'pdf_test_1786853175921';
  console.log(`Checking questions for test ${testId}:`);

  const testSets = await query('pdf_native_test_sets', '*', `test_id=eq.${testId}&order=order_index.asc`);
  console.log('Linked sets:', testSets);

  const testQs = await query('pdf_native_test_questions', '*', `test_id=eq.${testId}&order=order_index.asc`);
  console.log(`Linked questions count: ${testQs.length}`);

  const batchAccess = await query('pdf_native_test_batch_access', '*', `test_id=eq.${testId}`);
  console.log('Batch access:', batchAccess);
}

testFetchQuestions();
