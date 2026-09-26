const SUPABASE_URL = 'https://uwuzdggimbbbfgcauzho.supabase.co';
const SUPABASE_KEY = 'sb_publishable_2hMbPMAYceagP86WVmzZEQ_BDkMMXLp';

async function testQInsert() {
  const row = {
    id: `pdf_phys_test_q1`,
    pdf_id: 'pdf_phys_1786860000000',
    pdf_url: 'https://uwuzdggimbbbfgcauzho.supabase.co/storage/v1/object/public/exam-assets/pdfs/1786860000000-11th_morning_physics__1163869_1_1786701950.pdf',
    question_number: '1',
    page_start: 1,
    page_end: 1,
    bbox: { x: 10, y: 100, width: 285, height: 150 },
    subject: 'Physics',
    question_type: 'MCQ',
    correct_answer: 'A',
    marks: 4,
    negative_marks: 1,
    review_status: 'APPROVED',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const res = await fetch(`${SUPABASE_URL}/rest/v1/pdf_native_questions`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    },
    body: JSON.stringify([row]),
  });

  console.log('Status:', res.status);
  console.log('Response:', await res.text());
}

testQInsert();
