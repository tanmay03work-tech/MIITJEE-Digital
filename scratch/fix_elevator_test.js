const SUPABASE_URL = 'https://uwuzdggimbbbfgcauzho.supabase.co';
const SUPABASE_KEY = 'sb_publishable_2hMbPMAYceagP86WVmzZEQ_BDkMMXLp';

async function req(path, options = {}) {
  const url = `${SUPABASE_URL}/rest/v1/${path}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
      ...(options.headers || {}),
    },
  });
  return res.json();
}

async function fixElevatorTest() {
  const testId = 'pdf_test_1786853175921';
  const sets = ['set_1786825374013', 'set_1786848247573', 'set_1786849674045'];

  console.log('1. Setting linked sets in pdf_native_test_sets...');
  await req(`pdf_native_test_sets?test_id=eq.${testId}`, { method: 'DELETE' });
  await req('pdf_native_test_sets', {
    method: 'POST',
    body: JSON.stringify(sets.map((sId, idx) => ({
      id: `ts_${testId}_${sId}`,
      test_id: testId,
      set_id: sId,
      order_index: idx + 1,
      created_at: new Date().toISOString(),
    }))),
  });

  console.log('2. Setting test questions...');
  await req(`pdf_native_test_questions?test_id=eq.${testId}`, { method: 'DELETE' });

  let allQuestions = [];
  for (const sId of sets) {
    const sQs = await req(`pdf_native_set_questions?set_id=eq.${sId}&order=order_index.asc`);
    allQuestions = allQuestions.concat(sQs);
  }
  console.log(`Total questions gathered: ${allQuestions.length}`);

  const tqRows = allQuestions.map((sq, idx) => ({
    id: `tq_${testId}_${idx + 1}`,
    test_id: testId,
    question_id: sq.question_id,
    order_index: idx + 1,
    created_at: new Date().toISOString(),
  }));
  await req('pdf_native_test_questions', {
    method: 'POST',
    body: JSON.stringify(tqRows),
  });

  console.log('3. Setting batch access for ELEVATOR...');
  await req(`pdf_native_test_batch_access?test_id=eq.${testId}`, { method: 'DELETE' });
  await req('pdf_native_test_batch_access', {
    method: 'POST',
    body: JSON.stringify([
      {
        id: `tba_${testId}_ELEVATOR`,
        test_id: testId,
        batch_id: 'ELEVATOR',
        created_at: new Date().toISOString(),
      },
    ]),
  });

  console.log('4. Updating test record...');
  await req(`pdf_native_tests?id=eq.${testId}`, {
    method: 'PATCH',
    body: JSON.stringify({
      visibility: 'BATCH_ONLY',
      total_questions: allQuestions.length,
      updated_at: new Date().toISOString(),
    }),
  });

  console.log('=== ELEVATOR TEST FIXED ===');
}

fixElevatorTest();
