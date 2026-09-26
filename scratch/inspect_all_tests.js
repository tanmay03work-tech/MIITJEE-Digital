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

async function inspect() {
  console.log('=== ALL TESTS IN SUPABASE ===');
  const tests = await query('pdf_native_tests', '*', 'order=created_at.desc');
  console.log('Tests count:', tests.length);
  for (const t of tests) {
    console.log(`\nTest ID: ${t.id}`);
    console.log(`Title: ${t.title}`);
    console.log(`Visibility: ${t.visibility}`);
    console.log(`Allowed Batches: ${JSON.stringify(t.allowed_batches)}`);
    console.log(`Subject: ${t.subject}`);
    console.log(`Total questions: ${t.total_questions}`);
    console.log(`Status: ${t.status}`);

    const testSets = await query('pdf_native_test_sets', '*', `test_id=eq.${t.id}`);
    console.log(`Linked sets count: ${testSets.length}`, testSets);

    const testQs = await query('pdf_native_test_questions', '*', `test_id=eq.${t.id}`);
    console.log(`Linked test questions count: ${testQs.length}`);
  }
}

inspect();
