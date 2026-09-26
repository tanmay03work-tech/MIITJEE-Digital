const SUPABASE_URL = 'https://uwuzdggimbbbfgcauzho.supabase.co';
const SUPABASE_KEY = 'sb_publishable_2hMbPMAYceagP86WVmzZEQ_BDkMMXLp';

async function req(path) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` }
  });
  return res.json();
}

async function checkChemQuestions() {
  const setQs = await req('pdf_native_set_questions?set_id=eq.set_1786848247573&order=order_index.asc');
  console.log(`Chemistry Set (set_1786848247573) has ${setQs.length} questions:`);
  for (const sq of setQs) {
    const q = await req(`pdf_native_questions?id=eq.${sq.question_id}`);
    if (q && q[0]) {
      console.log(`Order ${sq.order_index}: Q${q[0].question_number} | page: ${q[0].page_start} | bbox: ${JSON.stringify(q[0].bbox)} | ans: ${q[0].correct_answer}`);
    }
  }
}

checkChemQuestions();
