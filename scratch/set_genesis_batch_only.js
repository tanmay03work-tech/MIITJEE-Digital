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

async function verifyGenesisAccess() {
  const genesisTestId = 'pdf_test_genesis_neet_11';

  console.log('1. Setting visibility = BATCH_ONLY strictly on Genesis test...');
  await req(`pdf_native_tests?id=eq.${genesisTestId}`, {
    method: 'PATCH',
    body: JSON.stringify({
      visibility: 'BATCH_ONLY',
      updated_at: new Date().toISOString(),
    }),
  });

  console.log('2. Setting batch access strictly to GENESIS only...');
  await req(`pdf_native_test_batch_access?test_id=eq.${genesisTestId}`, { method: 'DELETE' });
  await req('pdf_native_test_batch_access', {
    method: 'POST',
    body: JSON.stringify([
      {
        id: `tba_${genesisTestId}_GENESIS`,
        test_id: genesisTestId,
        batch_id: 'GENESIS',
        created_at: new Date().toISOString(),
      },
    ]),
  });

  const test = await req(`pdf_native_tests?id=eq.${genesisTestId}`);
  const batchAccess = await req(`pdf_native_test_batch_access?test_id=eq.${genesisTestId}`);
  console.log('Genesis Test Record:', test[0]);
  console.log('Batch Access Record:', batchAccess);
}

verifyGenesisAccess();
