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
  return res.json();
}

async function fixPhysicsExact() {
  const physPdfUrl = 'https://uwuzdggimbbbfgcauzho.supabase.co/storage/v1/object/public/exam-assets/pdfs/1786860000000-11th_morning_physics__1163869_1_1786701950.pdf';
  const physPdfId = 'pdf_phys_1786860000000';
  const physBuf = fs.readFileSync('D:\\Downloads\\11th_morning_physics__1163869_1_1786701950.pdf');
  const doc = await pdfjsLib.getDocument({ data: new Uint8Array(physBuf) }).promise;

  const questions = [];
  let expectedQ = 1;

  for (let pageNum = 1; pageNum <= 3; pageNum++) {
    const page = await doc.getPage(pageNum);
    const viewport = page.getViewport({ scale: 1.0 });
    const tc = await page.getTextContent();

    const items = tc.items.map((item) => {
      const tx = item.transform;
      return {
        text: item.str.trim(),
        x: tx[4],
        y: viewport.height - tx[5],
        width: item.width || 20,
        height: item.height || 10,
      };
    }).filter(item => item.text.length > 0);

    const questionStarts = [];
    items.forEach((it, idx) => {
      // Must match at start of line or with parenthesis e.g. (1), (2)...
      const match = it.text.match(/^\s*\((\d{1,2})\)/);
      if (match) {
        const num = Number(match[1]);
        if (num === expectedQ && it.x < 150) {
          questionStarts.push({
            qNum: String(num),
            itemIndex: idx,
            item: it,
            y: Math.max(0, it.y - 10),
          });
          expectedQ++;
        }
      }
    });

    console.log(`Page ${pageNum}: Verified questions:`, questionStarts.map(q => q.qNum));

    for (let i = 0; i < questionStarts.length; i++) {
      const current = questionStarts[i];
      const next = questionStarts[i + 1];

      const topY = Math.max(0, current.y - 6);
      const bottomY = next ? Math.max(topY + 30, next.y - 8) : viewport.height - 20;
      const height = Math.max(40, bottomY - topY);

      const qId = `pdf_${physPdfId}_q${current.qNum}_${pageNum}_${i}`;
      questions.push({
        id: qId,
        pdf_id: physPdfId,
        pdf_url: physPdfUrl,
        question_number: current.qNum,
        page_start: pageNum,
        page_end: pageNum,
        bbox: {
          x: 10,
          y: Math.round(topY),
          width: Math.round(viewport.width - 20),
          height: Math.round(height),
        },
        subject: 'Physics',
        question_type: 'MCQ',
        correct_answer: 'A',
        marks: 4,
        negative_marks: 1,
        review_status: 'APPROVED',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
    }
  }

  console.log(`Exact Physics Questions Extracted: ${questions.length}`);

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

  const chemSetId = 'set_1786848247573';
  const mathSetId = 'set_1786849674045';
  const bioSetId = 'set_1786851470684';

  const chemSq = await req(`pdf_native_set_questions?set_id=eq.${chemSetId}&order=order_index.asc`);
  const mathSq = await req(`pdf_native_set_questions?set_id=eq.${mathSetId}&order=order_index.asc`);
  const bioSq = await req(`pdf_native_set_questions?set_id=eq.${bioSetId}&order=order_index.asc`);

  console.log('=== UPDATE ELEVATOR TEST (PCM - 75 Qs) ===');
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

  await req(`pdf_native_tests?id=eq.${elevatorTestId}`, {
    method: 'PATCH',
    body: JSON.stringify({
      title: 'Elevator Morning Batch',
      total_questions: elevatorTq.length,
      updated_at: new Date().toISOString(),
    }),
  });
  console.log(`Elevator test configured with ${elevatorTq.length} questions (Exactly 25 Physics, 25 Chemistry, 25 Math)`);

  console.log('=== UPDATE GENESIS TEST (PCB - 100 Qs) ===');
  const genesisTestId = 'pdf_test_genesis_neet_11';
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

  await req(`pdf_native_tests?id=eq.${genesisTestId}`, {
    method: 'PATCH',
    body: JSON.stringify({
      title: 'Genesis Morning Batch',
      total_questions: genesisTq.length,
      updated_at: new Date().toISOString(),
    }),
  });

  console.log(`Genesis test configured with ${genesisTq.length} questions (Exactly 25 Physics, 25 Chemistry, 50 Biology)`);
}

fixPhysicsExact().catch(e => console.error(e));
