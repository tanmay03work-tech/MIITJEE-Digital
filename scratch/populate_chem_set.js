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

async function run() {
  const chemQs = await req('pdf_native_questions?pdf_id=eq.pdf_7450f9ee123d8b4a&order=page_start.asc,question_number.asc');
  console.log(`Found ${chemQs.length} chemistry questions`);

  if (chemQs.length > 0) {
    const sqRows = chemQs.map((q, idx) => ({
      id: `sq_set_1786848247573_${idx + 1}`,
      set_id: 'set_1786848247573',
      question_id: q.id,
      order_index: idx + 1,
      created_at: new Date().toISOString(),
    }));

    await req('pdf_native_set_questions', {
      method: 'POST',
      body: JSON.stringify(sqRows),
    });
    console.log('Populated chemistry set relations!');
  }
}

run();
