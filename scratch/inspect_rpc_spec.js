const SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV3dXpkZ2dpbWJiYmZnY2F1emhvIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NTM5MTMxNSwiZXhwIjoyMDkwOTY3MzE1fQ.WCCXL2twdvI0BCW2OPR2NeNaV5mnzvDTJa2Fwfqx18o';
const BASE_URL = 'https://uwuzdggimbbbfgcauzho.supabase.co';

async function inspectRpcParams() {
  const res = await fetch(`${BASE_URL}/rest/v1/`, {
    headers: {
      apikey: SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
    }
  });
  const spec = await res.json();
  const createPath = spec.paths['/rpc/create_test_with_questions'];
  console.log('create_test_with_questions post parameters:', JSON.stringify(createPath?.post?.parameters, null, 2));

  const updatePath = spec.paths['/rpc/update_test_details'];
  console.log('update_test_details post parameters:', JSON.stringify(updatePath?.post?.parameters, null, 2));

  const sharePath = spec.paths['/rpc/generate_exam_share_link'];
  console.log('generate_exam_share_link post parameters:', JSON.stringify(sharePath?.post?.parameters, null, 2));
}

inspectRpcParams().catch(console.error);
