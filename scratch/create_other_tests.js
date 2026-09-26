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

async function createTestForSet(setId, title, subject) {
  const setQs = await req(`pdf_native_set_questions?set_id=eq.${setId}&order=order_index.asc`);
  if (!setQs || setQs.length === 0) return;

  const testId = `pdf_test_${Date.now()}_${subject.toLowerCase().slice(0, 4)}`;
  console.log(`Creating test ${testId} for ${title} (${setQs.length} questions)...`);

  await req('pdf_native_tests', {
    method: 'POST',
    body: JSON.stringify({
      id: testId,
      title: `${title} Test`,
      duration_minutes: 180,
      subject: subject,
      total_questions: setQs.length,
      status: 'READY',
      visibility: 'OPEN_FOR_ALL',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }),
  });

  await req('pdf_native_test_sets', {
    method: 'POST',
    body: JSON.stringify([
      {
        id: `ts_${testId}_${setId}`,
        test_id: testId,
        set_id: setId,
        order_index: 1,
        created_at: new Date().toISOString(),
      },
    ]),
  });

  const tqRows = setQs.map((sq, idx) => ({
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

  console.log(`Test ${testId} created successfully!`);
}

async function run() {
  await createTestForSet('set_1786851470684', 'Genesis Biology (Set 01)', 'Biology');
  await createTestForSet('set_1786848247573', '11th Morning Chemistry (Set 01)', 'Chemistry');
}

run();
