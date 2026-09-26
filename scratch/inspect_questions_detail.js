const SUPABASE_URL = 'https://uwuzdggimbbbfgcauzho.supabase.co';
const SUPABASE_KEY = 'sb_publishable_2hMbPMAYceagP86WVmzZEQ_BDkMMXLp';

async function query(table, select = '*', filter = '') {
  let url = `${SUPABASE_URL}/rest/v1/${table}?select=${encodeURIComponent(select)}`;
  if (filter) url += `&${filter}`;
  const res = await fetch(url, {
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
    },
  });
  return res.json();
}

async function run() {
  const tests = await query('pdf_native_tests');
  console.log('Tests:');
  for (const t of tests) {
    console.log(`Test ID: ${t.id}, Title: ${t.title}`);
  }

  const sets = await query('pdf_native_sets');
  console.log('\nSets:');
  for (const s of sets) {
    console.log(`Set ID: ${s.id}, Name: ${s.set_name}, Subject: ${s.subject}, PDF_ID: ${s.source_pdf_id}, PDF_URL: ${s.pdf_url}`);
  }

  console.log('\nQuestions:');
  const qs = await query('pdf_native_questions', 'id,pdf_id,pdf_url,question_number,page_start,subject');
  console.log(`Total questions: ${qs.length}`);
  for (const q of qs.slice(0, 10)) {
    console.log(`Q ID: ${q.id}, Q#: ${q.question_number}, Subject: ${q.subject}, PDF_ID: ${q.pdf_id}, PDF_URL: ${q.pdf_url}`);
  }
}

run();
