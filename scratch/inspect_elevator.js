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
  const t = await query('pdf_native_tests', '*', 'id=eq.pdf_test_1786853175921');
  console.log('Elevator test record:', t);

  const batches = await query('pdf_native_test_batch_access', '*', 'test_id=eq.pdf_test_1786853175921');
  console.log('Batch access record:', batches);

  const allBatches = await query('batches');
  console.log('Available batches in DB:', allBatches);
}

run();
