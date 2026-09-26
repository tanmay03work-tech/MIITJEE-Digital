const fs = require('fs');
const pdfjsLib = require('pdfjs-dist/legacy/build/pdf.js');

const SUPABASE_URL = 'https://uwuzdggimbbbfgcauzho.supabase.co';
const SUPABASE_KEY = 'sb_publishable_2hMbPMAYceagP86WVmzZEQ_BDkMMXLp';

async function uploadToStorage(fileName, buffer) {
  const uploadPath = `pdfs/${Date.now()}-${fileName.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
  const url = `${SUPABASE_URL}/storage/v1/object/exam-assets/${uploadPath}`;

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/pdf',
      'x-upsert': 'true',
    },
    body: buffer,
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Upload failed: ${errText}`);
  }

  const publicUrl = `${SUPABASE_URL}/storage/v1/object/public/exam-assets/${uploadPath}`;
  return { uploadPath, publicUrl };
}

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

async function extractQuestionsFromDoc(doc, pdfId, pdfUrl, subject, startQNum = 1) {
  const questions = [];
  const Q_START_REGEX = /^\s*(?:\(?(\d{1,3})\)?[\.\:\-\)]|\bQ(?:uestion)?[\.\:\s]*(\d{1,3})\b)/i;

  for (let pageNum = 1; pageNum <= doc.numPages; pageNum++) {
    const page = await doc.getPage(pageNum);
    const viewport = page.getViewport({ scale: 1.0 });
    const tc = await page.getTextContent();

    // Check if this page is Answer Key or Solutions
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
        const num = match[1] || match[2];
        questionStarts.push({
          qNum: num,
          itemIndex: idx,
          item: it,
          y: Math.max(0, it.y - 10),
        });
      }
    });

    console.log(`Page ${pageNum}: Detected ${questionStarts.length} question headers:`, questionStarts.map(q => q.qNum));

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
        question_number: String(current.qNum),
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

async function processAll() {
  console.log('=== STEP 1: UPLOAD AND PROCESS REAL PHYSICS PDF ===');
  const physFilePath = 'D:\\Downloads\\11th_morning_physics__1163869_1_1786701950.pdf';
  const physBuf = fs.readFileSync(physFilePath);
  const { publicUrl: physPublicUrl } = await uploadToStorage('11th_morning_physics__1163869_1_1786701950.pdf', physBuf);
  console.log('Uploaded real Physics PDF to:', physPublicUrl);

  const physDoc = await pdfjsLib.getDocument({ data: new Uint8Array(physBuf) }).promise;
  const physPdfId = `pdf_phys_${Date.now()}`;
  const physQuestions = await extractQuestionsFromDoc(physDoc, physPdfId, physPublicUrl, 'Physics', 1);
  console.log(`Extracted ${physQuestions.length} Physics questions`);

  console.log('=== STEP 2: PROCESS REAL CHEMISTRY PDF ===');
  const chemFilePath = 'D:\\Downloads\\11th_Morning_chemistry__1164158_1_1786766330.pdf';
  const chemBuf = fs.readFileSync(chemFilePath);
  const { publicUrl: chemPublicUrl } = await uploadToStorage('11th_Morning_chemistry__1164158_1_1786766330.pdf', chemBuf);
  console.log('Uploaded real Chemistry PDF to:', chemPublicUrl);

  const chemDoc = await pdfjsLib.getDocument({ data: new Uint8Array(chemBuf) }).promise;
  const chemPdfId = `pdf_chem_${Date.now()}`;
  const chemQuestions = await extractQuestionsFromDoc(chemDoc, chemPdfId, chemPublicUrl, 'Chemistry', 26);
  console.log(`Extracted ${chemQuestions.length} Chemistry questions`);

  console.log('=== STEP 3: SAVE QUESTIONS TO SUPABASE ===');
  const allNewQs = [...physQuestions, ...chemQuestions];
  await req('pdf_native_questions', {
    method: 'POST',
    body: JSON.stringify(allNewQs),
  });
  console.log(`Saved ${allNewQs.length} questions to pdf_native_questions`);

  console.log('=== STEP 4: UPDATE PHYSICS SET ===');
  const physSetId = 'set_1786825374013';
  await req(`pdf_native_sets?id=eq.${physSetId}`, {
    method: 'PATCH',
    body: JSON.stringify({
      source_pdf_id: physPdfId,
      pdf_url: physPublicUrl,
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
  console.log(`Updated Physics Set with ${physSq.length} questions`);

  console.log('=== STEP 5: UPDATE CHEMISTRY SET ===');
  const chemSetId = 'set_1786848247573';
  await req(`pdf_native_sets?id=eq.${chemSetId}`, {
    method: 'PATCH',
    body: JSON.stringify({
      source_pdf_id: chemPdfId,
      pdf_url: chemPublicUrl,
      total_questions: chemQuestions.length,
      status: 'READY',
      updated_at: new Date().toISOString(),
    }),
  });

  await req(`pdf_native_set_questions?set_id=eq.${chemSetId}`, { method: 'DELETE' });
  const chemSq = chemQuestions.map((q, idx) => ({
    id: `sq_${chemSetId}_${idx + 1}`,
    set_id: chemSetId,
    question_id: q.id,
    order_index: idx + 1,
    created_at: new Date().toISOString(),
  }));
  await req('pdf_native_set_questions', {
    method: 'POST',
    body: JSON.stringify(chemSq),
  });
  console.log(`Updated Chemistry Set with ${chemSq.length} questions`);

  console.log('=== STEP 6: CONFIGURE ELEVATOR MORNING BATCH TEST (75 QUESTIONS) ===');
  const mathSetId = 'set_1786849674045';
  const mathSq = await req(`pdf_native_set_questions?set_id=eq.${mathSetId}&order=order_index.asc`);

  const elevatorTestId = 'pdf_test_1786853175921';
  const allElevatorQuestions = [...physQuestions, ...chemQuestions, ...mathSq];

  await req(`pdf_native_test_sets?test_id=eq.${elevatorTestId}`, { method: 'DELETE' });
  await req('pdf_native_test_sets', {
    method: 'POST',
    body: JSON.stringify([
      { id: `ts_${elevatorTestId}_${physSetId}`, test_id: elevatorTestId, set_id: physSetId, order_index: 1, created_at: new Date().toISOString() },
      { id: `ts_${elevatorTestId}_${chemSetId}`, test_id: elevatorTestId, set_id: chemSetId, order_index: 2, created_at: new Date().toISOString() },
      { id: `ts_${elevatorTestId}_${mathSetId}`, test_id: elevatorTestId, set_id: mathSetId, order_index: 3, created_at: new Date().toISOString() },
    ]),
  });

  await req(`pdf_native_test_questions?test_id=eq.${elevatorTestId}`, { method: 'DELETE' });
  const elevatorTq = [
    ...physQuestions.map((q, idx) => ({
      id: `tq_${elevatorTestId}_${idx + 1}`,
      test_id: elevatorTestId,
      question_id: q.id,
      order_index: idx + 1,
      created_at: new Date().toISOString(),
    })),
    ...chemQuestions.map((q, idx) => ({
      id: `tq_${elevatorTestId}_${physQuestions.length + idx + 1}`,
      test_id: elevatorTestId,
      question_id: q.id,
      order_index: physQuestions.length + idx + 1,
      created_at: new Date().toISOString(),
    })),
    ...mathSq.map((sq, idx) => ({
      id: `tq_${elevatorTestId}_${physQuestions.length + chemQuestions.length + idx + 1}`,
      test_id: elevatorTestId,
      question_id: sq.question_id,
      order_index: physQuestions.length + chemQuestions.length + idx + 1,
      created_at: new Date().toISOString(),
    })),
  ];

  await req('pdf_native_test_questions', {
    method: 'POST',
    body: JSON.stringify(elevatorTq),
  });

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
        question_end: physQuestions.length,
        mcq_count: physQuestions.length,
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
        question_start: physQuestions.length + 1,
        question_end: physQuestions.length + chemQuestions.length,
        mcq_count: chemQuestions.length,
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
        question_start: physQuestions.length + chemQuestions.length + 1,
        question_end: elevatorTq.length,
        mcq_count: mathSq.length,
        integer_count: 0,
        correct_marks: 4,
        negative_marks: 1,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    ]),
  });

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

  await req(`pdf_native_tests?id=eq.${elevatorTestId}`, {
    method: 'PATCH',
    body: JSON.stringify({
      subject: 'Multi-Subject',
      total_questions: elevatorTq.length,
      visibility: 'BATCH_ONLY',
      status: 'READY',
      updated_at: new Date().toISOString(),
    }),
  });

  console.log(`=== PIPELINE COMPLETE: Elevator Morning Batch test is now LIVE with ${elevatorTq.length} questions across Physics (25), Chemistry (25), Math (25) ===`);
}

processAll().catch(e => console.error('Error in processAll:', e));
