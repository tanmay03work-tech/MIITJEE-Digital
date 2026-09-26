const SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV3dXpkZ2dpbWJiYmZnY2F1emhvIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NTM5MTMxNSwiZXhwIjoyMDkwOTY3MzE1fQ.WCCXL2twdvI0BCW2OPR2NeNaV5mnzvDTJa2Fwfqx18o';
const BASE_URL = 'https://uwuzdggimbbbfgcauzho.supabase.co';

async function testCreateTestWithAll() {
  const payload = {
    p_title: 'Weekly Test Open For All Test',
    p_description: 'Testing open for all weekly test with batch_id ALL',
    p_duration_minutes: 60,
    p_batch_id: 'ALL',
    p_type: 'weekly',
    p_subject: 'Physics',
    p_scholarship_admission_class: null,
    p_scholarship_target_exam: null,
    p_questions: [
      {
        type: 'mcq',
        prompt: 'What is the SI unit of force?',
        options: ['Joule', 'Newton', 'Watt', 'Pascal'],
        correctOptionIndex: 1,
        explanation: 'The SI unit of force is Newton.',
        subjectLabel: 'Physics'
      }
    ],
    p_scheduled_at: new Date().toISOString(),
  };

  console.log('Testing RPC call with p_batch_id: ALL...');
  const res = await fetch(`${BASE_URL}/rest/v1/rpc/create_test_with_questions`, {
    method: 'POST',
    headers: {
      apikey: SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation'
    },
    body: JSON.stringify(payload)
  });

  console.log('RPC Status:', res.status);
  const text = await res.text();
  console.log('RPC Response:', text);
}

testCreateTestWithAll().catch(console.error);
