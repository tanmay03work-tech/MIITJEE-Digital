const SUPABASE_URL = 'https://uwuzdggimbbbfgcauzho.supabase.co';
const SUPABASE_KEY = 'sb_publishable_2hMbPMAYceagP86WVmzZEQ_BDkMMXLp';

async function req(path) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` }
  });
  return res.json();
}

async function checkSets() {
  const sets = await req('pdf_native_sets?order=created_at.desc');
  console.log('All Question Sets in DB:');
  for (const s of sets) {
    const sq = await req(`pdf_native_set_questions?set_id=eq.${s.id}`);
    console.log(`- ID: ${s.id} | Name: "${s.set_name}" | Subject: ${s.subject} | Qs: ${sq.length} | Created: ${s.created_at} | PDF: ${s.pdf_url}`);
  }
}

checkSets();
