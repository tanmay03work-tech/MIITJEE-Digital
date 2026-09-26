const SUPABASE_URL = 'https://uwuzdggimbbbfgcauzho.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_2hMbPMAYceagP86WVmzZEQ_BDkMMXLp';

async function inspect() {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/tests?select=*`, {
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    },
  });
  const data = await res.json();
  console.log('Total tests in tests table:', Array.isArray(data) ? data.length : data);
  if (Array.isArray(data)) {
    console.log(JSON.stringify(data.map(t => ({
      id: t.id,
      title: t.title,
      batch_id: t.batch_id,
      type: t.type,
      is_open_for_all: t.is_open_for_all,
      is_published: t.is_published,
      is_started: t.is_started
    })), null, 2));
  }
}

inspect();
