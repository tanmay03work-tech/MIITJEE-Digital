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

async function extractQuestionsFromDoc(doc, pdfId, pdfUrl, subject, startQNum = 1, endQNum = 100) {
  const questions = [];
  const Q_START_REGEX = /^\s*(?:\(?(\d{1,3})\)?[\.\:\-\)]|\bQ(?:uestion)?[\.\:\s]*(\d{1,3})\b)/i;

  for (let pageNum = 1; pageNum <= doc.numPages; pageNum++) {
    const page = await doc.getPage(pageNum);
    const viewport = page.getViewport({ scale: 1.0 });
    const tc = await page.getTextContent();

    const pageText = tc.items.map(i => i.str).join(' ');
    if (pageText.includes('(Answer Key)') || pageText.includes('(Solutions)')) {
      console.log(`Page ${pageNum} is Answer Key/Solutions, stopping question extraction.`);
      break;
    }

    const items = tc.items.map((item) => {
      const tx = item.transform;
      const x = tx[4];
      const y = viewport.height - tx[5];
      const width = item.width || 20;
      const height = item.height || 10;
      return {
        text: item.str.trim(),
        x,
        y,
        width,
        height,
      };
    }).filter(item => item.text.length > 0);

    const questionStarts = [];
    items.forEach((it, idx) => {
      const match = it.text.match(Q_START_REGEX);
      if (match) {
        const num = Number(match[1] || match[2]);
        if (num >= startQNum && num <= endQNum) {
          questionStarts.push({
            qNum: String(num),
            itemIndex: idx,
            item: it,
            y: Math.max(0, it.y - 10),
          });
        }
      }
    });

    console.log(`Page ${pageNum}: Detected ${questionStarts.length} questions:`, questionStarts.map(q => q.qNum));

    for (let i = 0; i < questionStarts.length; i++) {
      const current = questionStarts[i];
      const next = questionStarts[i + 1];

      const topY = Math.max(0, current.y - 6);
      const bottomY = next ? Math.max(topY + 30, next.y - 8) : viewport.height - 20;
      const height = Math.max(40, bottomY - topY);

      const qId = `pdf_${pdfId}_q${current.qNum}_${pageNum}_${i}`;
      questions.push({
        id: qId,
        pdf_id: pdfId,
        pdf_url: pdfUrl,
        question_number: current.qNum,
        page_start: pageNum,
        page_end: pageNum,
        bbox: {
          x: 10,
          y: Math.round(topY),
          width: Math.round(viewport.width - 20),
          height: Math.round(height),
        },
        subject: subject,
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

  return questions;
}

async function buildBothTests() {
  console.log('=== STEP 1: EXTRACT PHYSICS QUESTIONS FROM REAL PDF ===');
  const physPdfUrl = 'https://uwuzdggimbbbfgcauzho.supabase.co/storage/v1/object/public/exam-assets/pdfs/1786860000000-11th_morning_physics__1163869_1_1786701950.pdf';
  const physPdfId = 'pdf_phys_1786860000000';
  const physBuf = fs.readFileSync('D:\\Downloads\\11th_morning_physics__1163869_1_1786701950.pdf');
  const physDoc = await pdfjsLib.getDocument({ data: new Uint8Array(physBuf) }).promise;
  const physQuestions = await extractQuestionsFromDoc(physDoc, physPdfId, physPdfUrl, 'Physics', 1, 25);
  console.log(`Physics questions extracted: ${physQuestions.length}`);

  console.log('Saving Physics questions to pdf_native_questions...');
  await req('pdf_native_questions', {
    method: 'POST',
    body: JSON.stringify(physQuestions),
  });

  const physSetId = 'set_1786825374013';
  await req(`pdf_native_sets?id=eq.${physSetId}`, {
    method: 'PATCH',
    body: JSON.stringify({
      source_pdf_id: physPdfId,
      pdf_url: physPdfUrl,
      total_questions: physQuestions.length,
      status: 'READY',
      updated_at: new Date().toISOString(),
    }),
  });

  await req(`pdf_native_set_questions?set_id=eq.${physSetId}`, { method: 'DELETE' });
  const physSq = physQuestions.map((q, idx) => ({
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

  console.log('=== STEP 2: GET CHEMISTRY, MATH, BIOLOGY SET QUESTIONS ===');
  const chemSetId = 'set_1786848247573';
  const mathSetId = 'set_1786849674045';
  const bioSetId = 'set_1786851470684';

  const chemSq = await req(`pdf_native_set_questions?set_id=eq.${chemSetId}&order=order_index.asc`);
  const mathSq = await req(`pdf_native_set_questions?set_id=eq.${mathSetId}&order=order_index.asc`);
  const bioSq = await req(`pdf_native_set_questions?set_id=eq.${bioSetId}&order=order_index.asc`);

  console.log(`Sets status: Physics=${physSq.length}, Chemistry=${chemSq.length}, Math=${mathSq.length}, Biology=${bioSq.length}`);

  console.log('=== STEP 3: CONFIGURE ELEVATOR TEST (PCM - 75 Qs) ===');
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
  console.log(`Elevator Test ready with ${elevatorTq.length} questions (Physics 25, Chemistry 25, Math 25)`);

  console.log('=== STEP 4: CONFIGURE GENESIS TEST (PCB - 100 Qs) ===');
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

  console.log(`=== GENESIS TEST READY WITH ${genesisTq.length} QUESTIONS (PHYSICS 25, CHEMISTRY 25, BIOLOGY 50) ===`);
}

buildBothTests().catch(e => console.error('Build error:', e));
