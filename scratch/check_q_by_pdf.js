const SUPABASE_URL = 'https://uwuzdggimbbbfgcauzho.supabase.co';
const SUPABASE_KEY = 'sb_publishable_2hMbPMAYceagP86WVmzZEQ_BDkMMXLp';

async function req(path) {
  const url = `${SUPABASE_URL}/rest/v1/${path}`;
  const res = await fetch(url, {
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
    },
  });
  return res.json();
}

async function run() {
  const qs = await req('pdf_native_questions?select=id,pdf_id,subject,question_number');
  const byPdf = {};
  for (const q of qs) {
    byPdf[q.pdf_id] = (byPdf[q.pdf_id] || 0) + 1;
  }
  console.log('Questions by pdf_id:', byPdf);
}

run();
