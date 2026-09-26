const SUPABASE_URL = 'https://uwuzdggimbbbfgcauzho.supabase.co';
const SUPABASE_KEY = 'sb_publishable_2hMbPMAYceagP86WVmzZEQ_BDkMMXLp';

async function req(path, options = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...options,
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
      ...(options.headers || {}),
    },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`HTTP ${res.status} on ${path}: ${text}`);
  }
  return res.json();
}

async function updateElevatorWithCurrentChemistry() {
  const elevatorTestId = 'pdf_test_1786853175921';
  const physSetId = 'set_1786825374013';
  const chemSetId = 'set_1786848247573';
  const mathSetId = 'set_1786849674045';

  console.log('Fetching questions for Physics, Current Chemistry, and Math sets...');
  const physSq = await req(`pdf_native_set_questions?set_id=eq.${physSetId}&order=order_index.asc`);
  const chemSq = await req(`pdf_native_set_questions?set_id=eq.${chemSetId}&order=order_index.asc`);
  const mathSq = await req(`pdf_native_set_questions?set_id=eq.${mathSetId}&order=order_index.asc`);

  console.log(`Counts: Physics=${physSq.length}, Chemistry=${chemSq.length}, Mathematics=${mathSq.length}`);

  // 1. Link Sets in order: Physics (1), Chemistry (2), Mathematics (3)
  console.log('1. Setting linked sets...');
  await req(`pdf_native_test_sets?test_id=eq.${elevatorTestId}`, { method: 'DELETE' });
  await req('pdf_native_test_sets', {
    method: 'POST',
    body: JSON.stringify([
      { id: `ts_${elevatorTestId}_${physSetId}`, test_id: elevatorTestId, set_id: physSetId, order_index: 1, created_at: new Date().toISOString() },
      { id: `ts_${elevatorTestId}_${chemSetId}`, test_id: elevatorTestId, set_id: chemSetId, order_index: 2, created_at: new Date().toISOString() },
      { id: `ts_${elevatorTestId}_${mathSetId}`, test_id: elevatorTestId, set_id: mathSetId, order_index: 3, created_at: new Date().toISOString() },
    ]),
  });

  // 2. Link all 75 questions in sequential order
  console.log('2. Setting all 75 test questions...');
  await req(`pdf_native_test_questions?test_id=eq.${elevatorTestId}`, { method: 'DELETE' });
  const tqRows = [
    ...physSq.map((sq, idx) => ({
      id: `tq_${elevatorTestId}_${idx + 1}`,
      test_id: elevatorTestId,
      question_id: sq.question_id,
      order_index: idx + 1,
      created_at: new Date().toISOString(),
    })),
    ...chemSq.map((sq, idx) => ({
      id: `tq_${elevatorTestId}_${physSq.length + idx + 1}`,
      test_id: elevatorTestId,
      question_id: sq.question_id,
      order_index: physSq.length + idx + 1,
      created_at: new Date().toISOString(),
    })),
    ...mathSq.map((sq, idx) => ({
      id: `tq_${elevatorTestId}_${physSq.length + chemSq.length + idx + 1}`,
      test_id: elevatorTestId,
      question_id: sq.question_id,
      order_index: physSq.length + chemSq.length + idx + 1,
      created_at: new Date().toISOString(),
    })),
  ];

  await req('pdf_native_test_questions', {
    method: 'POST',
    body: JSON.stringify(tqRows),
  });

  // 3. Configure Sections
  console.log('3. Setting sections...');
  await req(`pdf_native_test_sections?test_id=eq.${elevatorTestId}`, { method: 'DELETE' });
  await req('pdf_native_test_sections', {
    method: 'POST',
    body: JSON.stringify([
      {
        id: `sec_${elevatorTestId}_1`,
        test_id: elevatorTestId,
        set_id: physSetId,
        subject: 'Physics',
        question_type: 'MCQ',
        section_order: 1,
        question_start: 1,
        question_end: physSq.length,
        mcq_count: physSq.length,
        integer_count: 0,
        correct_marks: 4,
        negative_marks: 1,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      {
        id: `sec_${elevatorTestId}_2`,
        test_id: elevatorTestId,
        set_id: chemSetId,
        subject: 'Chemistry',
        question_type: 'MCQ',
        section_order: 2,
        question_start: physSq.length + 1,
        question_end: physSq.length + chemSq.length,
        mcq_count: chemSq.length,
        integer_count: 0,
        correct_marks: 4,
        negative_marks: 1,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      {
        id: `sec_${elevatorTestId}_3`,
        test_id: elevatorTestId,
        set_id: mathSetId,
        subject: 'Mathematics',
        question_type: 'MCQ',
        section_order: 3,
        question_start: physSq.length + chemSq.length + 1,
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

  // 4. Batch access
  console.log('4. Setting batch access strictly for ELEVATOR...');
  await req(`pdf_native_test_batch_access?test_id=eq.${elevatorTestId}`, { method: 'DELETE' });
  await req('pdf_native_test_batch_access', {
    method: 'POST',
    body: JSON.stringify([
      {
        id: `tba_${elevatorTestId}_ELEVATOR`,
        test_id: elevatorTestId,
        batch_id: 'ELEVATOR',
        created_at: new Date().toISOString(),
      },
    ]),
  });

  // 5. Update test record
  console.log('5. Updating test record...');
  await req(`pdf_native_tests?id=eq.${elevatorTestId}`, {
    method: 'PATCH',
    body: JSON.stringify({
      title: 'Elevator Morning Batch',
      duration_minutes: 180,
      subject: 'Multi-Subject',
      total_questions: tqRows.length,
      visibility: 'BATCH_ONLY',
      status: 'READY',
      updated_at: new Date().toISOString(),
    }),
  });

  console.log(`=== ELEVATOR TEST UPDATED: Exactly ${tqRows.length} Questions (Physics 25, Chemistry 25, Mathematics 25) ===`);
}

updateElevatorWithCurrentChemistry().catch(e => console.error(e));
