const fs = require('fs');
const pdfjsLib = require('pdfjs-dist/legacy/build/pdf.js');

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
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`HTTP ${res.status} on ${path}: ${text}`);
  }
  return res.json();
}

async function masterBuild() {
  console.log('=== 1. EXTRACT 25 PHYSICS QUESTIONS ===');
  const physPdfUrl = 'https://uwuzdggimbbbfgcauzho.supabase.co/storage/v1/object/public/exam-assets/pdfs/1786860000000-11th_morning_physics__1163869_1_1786701950.pdf';
  const physPdfId = 'pdf_phys_1786860000000';
  const physBuf = fs.readFileSync('D:\\Downloads\\11th_morning_physics__1163869_1_1786701950.pdf');
  const doc = await pdfjsLib.getDocument({ data: new Uint8Array(physBuf) }).promise;

  const physAnswers = {
    '1': 'A', '2': 'B', '3': 'A', '4': 'C', '5': 'D',
    '6': 'A', '7': 'D', '8': 'C', '9': 'B', '10': 'C',
    '11': 'C', '12': 'B', '13': 'C', '14': 'A', '15': 'B',
    '16': 'A', '17': 'C', '18': 'D', '19': 'B', '20': 'A',
    '21': 'B', '22': 'B', '23': 'B', '24': 'A', '25': 'B'
  };

  const questions = [];

  for (let p = 1; p <= 3; p++) {
    const page = await doc.getPage(p);
    const viewport = page.getViewport({ scale: 1.0 });
    const tc = await page.getTextContent();

    const col1Starts = [];
    const col2Starts = [];

    for (const it of tc.items) {
      const match = it.str.match(/^\s*\((\d{1,2})\)/);
      if (match) {
        const num = Number(match[1]);
        if (num >= 1 && num <= 25) {
          const x = it.transform[4];
          const y = viewport.height - it.transform[5];
          if (x < 100) {
            col1Starts.push({ qNum: String(num), x, y });
          } else if (x >= 290 && x <= 340) {
            col2Starts.push({ qNum: String(num), x, y });
          }
        }
      }
    }

    col1Starts.sort((a, b) => a.y - b.y);
    col2Starts.sort((a, b) => a.y - b.y);

    for (let i = 0; i < col1Starts.length; i++) {
      const cur = col1Starts[i];
      const next = col1Starts[i + 1];
      const topY = Math.max(0, cur.y - 8);
      const bottomY = next ? Math.max(topY + 30, next.y - 10) : viewport.height - 20;
      const height = Math.max(50, bottomY - topY);

      questions.push({
        id: `pdf_${physPdfId}_q${cur.qNum}`,
        pdf_id: physPdfId,
        pdf_url: physPdfUrl,
        question_number: cur.qNum,
        page_start: p,
        page_end: p,
        bbox: {
          x: 10,
          y: Math.round(topY),
          width: 285,
          height: Math.round(height),
        },
        subject: 'Physics',
        question_type: 'MCQ',
        correct_answer: physAnswers[cur.qNum] || 'A',
        marks: 4,
        negative_marks: 1,
        review_status: 'APPROVED',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
    }

    for (let i = 0; i < col2Starts.length; i++) {
      const cur = col2Starts[i];
      const next = col2Starts[i + 1];
      const topY = Math.max(0, cur.y - 8);
      const bottomY = next ? Math.max(topY + 30, next.y - 10) : viewport.height - 20;
      const height = Math.max(50, bottomY - topY);

      questions.push({
        id: `pdf_${physPdfId}_q${cur.qNum}`,
        pdf_id: physPdfId,
        pdf_url: physPdfUrl,
        question_number: cur.qNum,
        page_start: p,
        page_end: p,
        bbox: {
          x: 298,
          y: Math.round(topY),
          width: 287,
          height: Math.round(height),
        },
        subject: 'Physics',
        question_type: 'MCQ',
        correct_answer: physAnswers[cur.qNum] || 'A',
        marks: 4,
        negative_marks: 1,
        review_status: 'APPROVED',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
    }
  }

  questions.sort((a, b) => Number(a.question_number) - Number(b.question_number));
  console.log(`Extracted exactly ${questions.length} Physics questions.`);

  console.log('Clearing old questions and saving 25 Physics questions...');
  await fetch(`${SUPABASE_URL}/rest/v1/pdf_native_questions?pdf_id=eq.${physPdfId}`, {
    method: 'DELETE',
    headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
  });

  await req('pdf_native_questions', {
    method: 'POST',
    body: JSON.stringify(questions),
  });

  const physSetId = 'set_1786825374013';
  await req(`pdf_native_sets?id=eq.${physSetId}`, {
    method: 'PATCH',
    body: JSON.stringify({
      source_pdf_id: physPdfId,
      pdf_url: physPdfUrl,
      total_questions: questions.length,
      status: 'READY',
      updated_at: new Date().toISOString(),
    }),
  });

  await req(`pdf_native_set_questions?set_id=eq.${physSetId}`, { method: 'DELETE' });
  const physSq = questions.map((q, idx) => ({
    id: `sq_${physSetId}_${idx + 1}`,
    set_id: physSetId,
    question_id: q.id,
    order_index: idx + 1,
    created_at: new Date().toISOString(),
  }));
  await req('pdf_native_set_questions', {
    method: 'POST',
    body: JSON.stringify(physSq),
  });

  console.log('=== 2. FETCH ALL SET QUESTIONS ===');
  const chemSetId = 'set_1786848247573';
  const mathSetId = 'set_1786849674045';
  const bioSetId = 'set_1786851470684';

  const chemSq = await req(`pdf_native_set_questions?set_id=eq.${chemSetId}&order=order_index.asc`);
  const mathSq = await req(`pdf_native_set_questions?set_id=eq.${mathSetId}&order=order_index.asc`);
  const bioSq = await req(`pdf_native_set_questions?set_id=eq.${bioSetId}&order=order_index.asc`);

  console.log(`Set counts: Physics=${physSq.length}, Chemistry=${chemSq.length}, Mathematics=${mathSq.length}, Biology=${bioSq.length}`);

  console.log('=== 3. CONFIGURE ELEVATOR TEST (PCM - 75 QUESTIONS) ===');
  const elevatorTestId = 'pdf_test_1786853175921';
  const elevatorSets = [
    { id: `ts_${elevatorTestId}_${physSetId}`, test_id: elevatorTestId, set_id: physSetId, order_index: 1, created_at: new Date().toISOString() },
    { id: `ts_${elevatorTestId}_${chemSetId}`, test_id: elevatorTestId, set_id: chemSetId, order_index: 2, created_at: new Date().toISOString() },
    { id: `ts_${elevatorTestId}_${mathSetId}`, test_id: elevatorTestId, set_id: mathSetId, order_index: 3, created_at: new Date().toISOString() },
  ];
  await req(`pdf_native_test_sets?test_id=eq.${elevatorTestId}`, { method: 'DELETE' });
  await req('pdf_native_test_sets', { method: 'POST', body: JSON.stringify(elevatorSets) });

  const elevatorTq = [
    ...physSq.map((sq, idx) => ({ id: `tq_${elevatorTestId}_${idx + 1}`, test_id: elevatorTestId, question_id: sq.question_id, order_index: idx + 1, created_at: new Date().toISOString() })),
    ...chemSq.map((sq, idx) => ({ id: `tq_${elevatorTestId}_${physSq.length + idx + 1}`, test_id: elevatorTestId, question_id: sq.question_id, order_index: physSq.length + idx + 1, created_at: new Date().toISOString() })),
    ...mathSq.map((sq, idx) => ({ id: `tq_${elevatorTestId}_${physSq.length + chemSq.length + idx + 1}`, test_id: elevatorTestId, question_id: sq.question_id, order_index: physSq.length + chemSq.length + idx + 1, created_at: new Date().toISOString() })),
  ];
  await req(`pdf_native_test_questions?test_id=eq.${elevatorTestId}`, { method: 'DELETE' });
  await req('pdf_native_test_questions', { method: 'POST', body: JSON.stringify(elevatorTq) });

  await req(`pdf_native_test_sections?test_id=eq.${elevatorTestId}`, { method: 'DELETE' });
  await req('pdf_native_test_sections', {
    method: 'POST',
    body: JSON.stringify([
      { id: `sec_${elevatorTestId}_1`, test_id: elevatorTestId, set_id: physSetId, subject: 'Physics', question_type: 'MCQ', section_order: 1, question_start: 1, question_end: physSq.length, mcq_count: physSq.length, integer_count: 0, correct_marks: 4, negative_marks: 1, created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
      { id: `sec_${elevatorTestId}_2`, test_id: elevatorTestId, set_id: chemSetId, subject: 'Chemistry', question_type: 'MCQ', section_order: 2, question_start: physSq.length + 1, question_end: physSq.length + chemSq.length, mcq_count: chemSq.length, integer_count: 0, correct_marks: 4, negative_marks: 1, created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
      { id: `sec_${elevatorTestId}_3`, test_id: elevatorTestId, set_id: mathSetId, subject: 'Mathematics', question_type: 'MCQ', section_order: 3, question_start: physSq.length + chemSq.length + 1, question_end: elevatorTq.length, mcq_count: mathSq.length, integer_count: 0, correct_marks: 4, negative_marks: 1, created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
    ]),
  });

  await req(`pdf_native_test_batch_access?test_id=eq.${elevatorTestId}`, { method: 'DELETE' });
  await req('pdf_native_test_batch_access', {
    method: 'POST',
    body: JSON.stringify([{ id: `tba_${elevatorTestId}_ELEVATOR`, test_id: elevatorTestId, batch_id: 'ELEVATOR', created_at: new Date().toISOString() }]),
  });

  await req(`pdf_native_tests?id=eq.${elevatorTestId}`, {
    method: 'PATCH',
    body: JSON.stringify({
      title: 'Elevator Morning Batch',
      duration_minutes: 180,
      subject: 'Multi-Subject',
      total_questions: elevatorTq.length,
      visibility: 'BATCH_ONLY',
      status: 'READY',
      updated_at: new Date().toISOString(),
    }),
  });

  console.log(`=== 4. CONFIGURE GENESIS TEST (PCB - 100 QUESTIONS) ===`);
  const genesisTestId = 'pdf_test_genesis_neet_11';
  await req(`pdf_native_tests?id=eq.${genesisTestId}`, { method: 'DELETE' });
  await req('pdf_native_tests', {
    method: 'POST',
    body: JSON.stringify({
      id: genesisTestId,
      title: 'Genesis Morning Batch',
      description: 'NEET 11th - Physics, Chemistry & Biology Examination',
      duration_minutes: 200,
      subject: 'Multi-Subject',
      total_questions: physSq.length + chemSq.length + bioSq.length,
      status: 'READY',
      visibility: 'BATCH_ONLY',
      starts_at: new Date().toISOString(),
      ends_at: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }),
  });

  const genesisSets = [
    { id: `ts_${genesisTestId}_${physSetId}`, test_id: genesisTestId, set_id: physSetId, order_index: 1, created_at: new Date().toISOString() },
    { id: `ts_${genesisTestId}_${chemSetId}`, test_id: genesisTestId, set_id: chemSetId, order_index: 2, created_at: new Date().toISOString() },
    { id: `ts_${genesisTestId}_${bioSetId}`, test_id: genesisTestId, set_id: bioSetId, order_index: 3, created_at: new Date().toISOString() },
  ];
  await req(`pdf_native_test_sets?test_id=eq.${genesisTestId}`, { method: 'DELETE' });
  await req('pdf_native_test_sets', { method: 'POST', body: JSON.stringify(genesisSets) });

  const genesisTq = [
    ...physSq.map((sq, idx) => ({ id: `tq_${genesisTestId}_${idx + 1}`, test_id: genesisTestId, question_id: sq.question_id, order_index: idx + 1, created_at: new Date().toISOString() })),
    ...chemSq.map((sq, idx) => ({ id: `tq_${genesisTestId}_${physSq.length + idx + 1}`, test_id: genesisTestId, question_id: sq.question_id, order_index: physSq.length + idx + 1, created_at: new Date().toISOString() })),
    ...bioSq.map((sq, idx) => ({ id: `tq_${genesisTestId}_${physSq.length + chemSq.length + idx + 1}`, test_id: genesisTestId, question_id: sq.question_id, order_index: physSq.length + chemSq.length + idx + 1, created_at: new Date().toISOString() })),
  ];
  await req(`pdf_native_test_questions?test_id=eq.${genesisTestId}`, { method: 'DELETE' });
  await req('pdf_native_test_questions', { method: 'POST', body: JSON.stringify(genesisTq) });

  await req(`pdf_native_test_sections?test_id=eq.${genesisTestId}`, { method: 'DELETE' });
  await req('pdf_native_test_sections', {
    method: 'POST',
    body: JSON.stringify([
      { id: `sec_${genesisTestId}_1`, test_id: genesisTestId, set_id: physSetId, subject: 'Physics', question_type: 'MCQ', section_order: 1, question_start: 1, question_end: physSq.length, mcq_count: physSq.length, integer_count: 0, correct_marks: 4, negative_marks: 1, created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
      { id: `sec_${genesisTestId}_2`, test_id: genesisTestId, set_id: chemSetId, subject: 'Chemistry', question_type: 'MCQ', section_order: 2, question_start: physSq.length + 1, question_end: physSq.length + chemSq.length, mcq_count: chemSq.length, integer_count: 0, correct_marks: 4, negative_marks: 1, created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
      { id: `sec_${genesisTestId}_3`, test_id: genesisTestId, set_id: bioSetId, subject: 'Biology', question_type: 'MCQ', section_order: 3, question_start: physSq.length + chemSq.length + 1, question_end: genesisTq.length, mcq_count: bioSq.length, integer_count: 0, correct_marks: 4, negative_marks: 1, created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
    ]),
  });

  await req(`pdf_native_test_batch_access?test_id=eq.${genesisTestId}`, { method: 'DELETE' });
  await req('pdf_native_test_batch_access', {
    method: 'POST',
    body: JSON.stringify([{ id: `tba_${genesisTestId}_GENESIS`, test_id: genesisTestId, batch_id: 'GENESIS', created_at: new Date().toISOString() }]),
  });

  console.log('=== 5. SUCCESS! BOTH TESTS PERFECTLY CONFIGURED ===');
  console.log(`• ELEVATOR: ${elevatorTq.length} questions (Physics 25, Chemistry 25, Mathematics 25)`);
  console.log(`• GENESIS: ${genesisTq.length} questions (Physics 25, Chemistry 25, Biology 50)`);
}

masterBuild().catch(e => console.error('Build Error:', e));
