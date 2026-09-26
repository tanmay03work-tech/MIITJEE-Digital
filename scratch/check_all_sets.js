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

async function check() {
  const sets = await req('pdf_native_sets');
  for (const s of sets) {
    const sq = await req(`pdf_native_set_questions?set_id=eq.${s.id}`);
    console.log(`Set ${s.id} (${s.set_name}, ${s.subject}): ${sq.length} questions in pdf_native_set_questions`);
  }
}

check();
