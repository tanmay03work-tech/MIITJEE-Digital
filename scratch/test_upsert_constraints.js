const SUPABASE_URL = 'https://uwuzdggimbbbfgcauzho.supabase.co';
const SUPABASE_KEY = 'sb_publishable_2hMbPMAYceagP86WVmzZEQ_BDkMMXLp';

async function testPost(table, body) {
  const url = `${SUPABASE_URL}/rest/v1/${table}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  console.log(`POST to ${table}: status ${res.status}`, text);
}

async function testUpsert(table, body, onConflict) {
  const url = `${SUPABASE_URL}/rest/v1/${table}?on_conflict=${encodeURIComponent(onConflict)}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates,return=representation',
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  console.log(`UPSERT to ${table} (on_conflict=${onConflict}): status ${res.status}`, text);
}

async function run() {
  const testId = 'pdf_test_1786853175921';
  console.log('Testing test_sets upsert with on_conflict=test_id,set_id:');
  await testUpsert('pdf_native_test_sets', [
    {
      id: `ts_${testId}_set_1786849674045`,
      test_id: testId,
      set_id: 'set_1786849674045',
      order_index: 1,
      created_at: new Date().toISOString(),
    }
  ], 'test_id,set_id');

  console.log('\nTesting test_questions upsert with on_conflict=test_id,question_id:');
  await testUpsert('pdf_native_test_questions', [
    {
      id: `tq_${testId}_1`,
      test_id: testId,
      question_id: 'pdf_d40caab67e05daa2_q51_0',
      order_index: 1,
      created_at: new Date().toISOString(),
    }
  ], 'test_id,question_id');

  console.log('\nTesting test_batch_access upsert with on_conflict=test_id,batch_id:');
  await testUpsert('pdf_native_test_batch_access', [
    {
      id: `tba_${testId}_batch_1`,
      test_id: testId,
      batch_id: 'batch_1',
      created_at: new Date().toISOString(),
    }
  ], 'test_id,batch_id');
}

run();
