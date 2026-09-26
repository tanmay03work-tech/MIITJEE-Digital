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

async function populateChemistry() {
  const chemUrl = 'https://uwuzdggimbbbfgcauzho.supabase.co/storage/v1/object/public/exam-assets/pdfs/1786848242187-11th_Morning_chemistry__1164158_1_1786766330.pdf';
  const chemPdfId = 'pdf_7450f9ee123d8b4a';
  const chemSetId = 'set_1786848247573';

  console.log('Fetching Chemistry PDF...');
  const res = await fetch(chemUrl);
  const buf = await res.arrayBuffer();
  const doc = await pdfjsLib.getDocument({ data: new Uint8Array(buf) }).promise;

  const chemAnswers = {
    '26': 'B', '27': 'A', '28': 'B', '29': 'D', '30': 'C',
    '31': 'B', '32': 'B', '33': 'A', '34': 'A', '35': 'A',
    '36': 'C', '37': 'A', '38': 'C', '39': 'D', '40': 'C',
    '41': 'D', '42': 'A', '43': 'B', '44': 'D', '45': 'B',
    '46': 'A', '47': 'D', '48': 'B', '49': 'C', '50': 'D'
  };

  const Q_START_REGEX = /^\s*(?:\(?(\d{1,3})\)?[\.\:\-\)]|\bQ(?:uestion)?[\.\:\s]*(\d{1,3})\b)/i;
  const questions = [];

  for (let pageNum = 1; pageNum <= 2; pageNum++) {
    const page = await doc.getPage(pageNum);
    const viewport = page.getViewport({ scale: 1.0 });
    const tc = await page.getTextContent();

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
        if (Number(num) >= 26 && Number(num) <= 50) {
          questionStarts.push({
            qNum: num,
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

      const qId = `pdf_${chemPdfId}_q${current.qNum}_${pageNum}_${i}`;
      questions.push({
        id: qId,
        pdf_id: chemPdfId,
        pdf_url: chemUrl,
        question_number: String(current.qNum),
        page_start: pageNum,
        page_end: pageNum,
        bbox: {
          x: 10,
          y: Math.round(topY),
          width: Math.round(viewport.width - 20),
          height: Math.round(height),
        },
        subject: 'Chemistry',
        question_type: 'MCQ',
        correct_answer: chemAnswers[current.qNum] || 'A',
        marks: 4,
        negative_marks: 1,
        review_status: 'APPROVED',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
    }
  }

  console.log(`Total Chemistry Questions detected: ${questions.length}`);

  console.log('Saving questions to Supabase...');
  await req('pdf_native_questions', {
    method: 'POST',
    body: JSON.stringify(questions),
  });

  console.log('Updating Chemistry Set questions in Supabase...');
  await req(`pdf_native_set_questions?set_id=eq.${chemSetId}`, { method: 'DELETE' });

  const sqRows = questions.map((q, idx) => ({
    id: `sq_${chemSetId}_${idx + 1}`,
    set_id: chemSetId,
    question_id: q.id,
    order_index: idx + 1,
    created_at: new Date().toISOString(),
  }));

  await req('pdf_native_set_questions', {
    method: 'POST',
    body: JSON.stringify(sqRows),
  });

  await req(`pdf_native_sets?id=eq.${chemSetId}`, {
    method: 'PATCH',
    body: JSON.stringify({
      total_questions: questions.length,
      status: 'READY',
      updated_at: new Date().toISOString(),
    }),
  });

  console.log('=== CHEMISTRY SET FULLY POPULATED & READY ===');
}

populateChemistry().catch(e => console.error(e));
