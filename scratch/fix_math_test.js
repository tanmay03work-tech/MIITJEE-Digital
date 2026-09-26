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

async function fixMathTest() {
  const testId = 'pdf_test_1786850080190';
  const mathSetId = 'set_1786849674045';

  console.log('1. Removing old test sets junctions...');
  await req(`pdf_native_test_sets?test_id=eq.${testId}`, { method: 'DELETE' });

  console.log('2. Inserting correct Math test set junction...');
  await req('pdf_native_test_sets', {
    method: 'POST',
    body: JSON.stringify([
      {
        id: `ts_${testId}_${mathSetId}`,
        test_id: testId,
        set_id: mathSetId,
        order_index: 1,
        created_at: new Date().toISOString(),
      },
    ]),
  });

  console.log('3. Removing old test questions junctions...');
  await req(`pdf_native_test_questions?test_id=eq.${testId}`, { method: 'DELETE' });

  console.log('4. Fetching Math set questions...');
  const mathSetQs = await req(`pdf_native_set_questions?set_id=eq.${mathSetId}&order=order_index.asc`);
  console.log(`Found ${mathSetQs.length} Math questions`);

  console.log('5. Inserting clean Math test questions...');
  const newTq = mathSetQs.map((sq, idx) => ({
    id: `tq_${testId}_${idx + 1}`,
    test_id: testId,
    question_id: sq.question_id,
    order_index: idx + 1,
    created_at: new Date().toISOString(),
  }));
  await req('pdf_native_test_questions', {
    method: 'POST',
    body: JSON.stringify(newTq),
  });

  console.log('6. Updating test metadata...');
  await req(`pdf_native_tests?id=eq.${testId}`, {
    method: 'PATCH',
    body: JSON.stringify({
      subject: 'Mathematics',
      total_questions: mathSetQs.length,
      updated_at: new Date().toISOString(),
    }),
  });

  console.log('=== FIX COMPLETE ===');
}

fixMathTest();
