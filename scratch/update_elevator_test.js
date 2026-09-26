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

async function updateElevatorTest() {
  const testId = 'pdf_test_1786853175921';
  const chemSetId = 'set_1786848247573';
  const mathSetId = 'set_1786849674045';

  const chemSq = await req(`pdf_native_set_questions?set_id=eq.${chemSetId}&order=order_index.asc`);
  const mathSq = await req(`pdf_native_set_questions?set_id=eq.${mathSetId}&order=order_index.asc`);

  console.log(`Chemistry questions: ${chemSq.length}, Math questions: ${mathSq.length}`);

  // Link sets
  await req(`pdf_native_test_sets?test_id=eq.${testId}`, { method: 'DELETE' });
  await req('pdf_native_test_sets', {
    method: 'POST',
    body: JSON.stringify([
      { id: `ts_${testId}_${chemSetId}`, test_id: testId, set_id: chemSetId, order_index: 1, created_at: new Date().toISOString() },
      { id: `ts_${testId}_${mathSetId}`, test_id: testId, set_id: mathSetId, order_index: 2, created_at: new Date().toISOString() },
    ]),
  });

  // Link questions
  await req(`pdf_native_test_questions?test_id=eq.${testId}`, { method: 'DELETE' });
  const tqRows = [
    ...chemSq.map((sq, idx) => ({
      id: `tq_${testId}_${idx + 1}`,
      test_id: testId,
      question_id: sq.question_id,
      order_index: idx + 1,
      created_at: new Date().toISOString(),
    })),
    ...mathSq.map((sq, idx) => ({
      id: `tq_${testId}_${chemSq.length + idx + 1}`,
      test_id: testId,
      question_id: sq.question_id,
      order_index: chemSq.length + idx + 1,
      created_at: new Date().toISOString(),
    })),
  ];

  await req('pdf_native_test_questions', {
    method: 'POST',
    body: JSON.stringify(tqRows),
  });

  // Configure sections
  await req(`pdf_native_test_sections?test_id=eq.${testId}`, { method: 'DELETE' });
  await req('pdf_native_test_sections', {
    method: 'POST',
    body: JSON.stringify([
      {
        id: `sec_${testId}_1`,
        test_id: testId,
        set_id: chemSetId,
        subject: 'Chemistry',
        question_type: 'MCQ',
        section_order: 1,
        question_start: 1,
        question_end: chemSq.length,
        mcq_count: chemSq.length,
        integer_count: 0,
        correct_marks: 4,
        negative_marks: 1,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      {
        id: `sec_${testId}_2`,
        test_id: testId,
        set_id: mathSetId,
        subject: 'Mathematics',
        question_type: 'MCQ',
        section_order: 2,
        question_start: chemSq.length + 1,
        question_end: tqRows.length,
        mcq_count: mathSq.length,
        integer_count: 0,
        correct_marks: 4,
        negative_marks: 1,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    ]),
  });

  // Batch access
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

  // Update test
  await req(`pdf_native_tests?id=eq.${testId}`, {
    method: 'PATCH',
    body: JSON.stringify({
      title: 'Elevator Morning Batch',
      subject: 'Multi-Subject',
      total_questions: tqRows.length,
      visibility: 'BATCH_ONLY',
      status: 'READY',
      updated_at: new Date().toISOString(),
    }),
  });

  console.log(`=== ELEVATOR TEST UPDATED WITH ${tqRows.length} QUESTIONS (CHEMISTRY + MATHEMATICS) ===`);
}

updateElevatorTest().catch(e => console.error(e));
