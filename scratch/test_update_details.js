const SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV3dXpkZ2dpbWJiYmZnY2F1emhvIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NTM5MTMxNSwiZXhwIjoyMDkwOTY3MzE1fQ.WCCXL2twdvI0BCW2OPR2NeNaV5mnzvDTJa2Fwfqx18o';
const BASE_URL = 'https://uwuzdggimbbbfgcauzho.supabase.co';

async function testUpdateDetails() {
  console.log('Testing update_test_details with p_is_open_for_all and p_batch_id null...');
  // First fetch an existing test id
  const tRes = await fetch(`${BASE_URL}/rest/v1/tests?limit=1&select=*`, {
    headers: {
      apikey: SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`
    }
  });
  const tests = await tRes.json();
  if (tests.length > 0) {
    const test = tests[0];
    console.log('Testing on test id:', test.id);
    const updateRes = await fetch(`${BASE_URL}/rest/v1/rpc/update_test_details`, {
      method: 'POST',
      headers: {
        apikey: SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        p_test_id: test.id,
        p_title: test.title,
        p_description: test.description,
        p_duration_minutes: test.duration_minutes,
        p_batch_id: null,
        p_type: test.type,
        p_subject: test.subject,
        p_scheduled_at: test.scheduled_at,
        p_scholarship_admission_class: test.scholarship_admission_class,
        p_scholarship_target_exam: test.scholarship_target_exam,
        p_is_open_for_all: true
      })
    });
    console.log('Update status:', updateRes.status);
    console.log('Update result:', await updateRes.json());
  }
}

testUpdateDetails().catch(console.error);
