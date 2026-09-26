const SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV3dXpkZ2dpbWJiYmZnY2F1emhvIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NTM5MTMxNSwiZXhwIjoyMDkwOTY3MzE1fQ.WCCXL2twdvI0BCW2OPR2NeNaV5mnzvDTJa2Fwfqx18o';
const BASE_URL = 'https://uwuzdggimbbbfgcauzho.supabase.co';

async function testRpcCall() {
  const payload = {
    p_title: 'Test Weekly Open',
    p_description: 'Test description',
    p_duration_minutes: 60,
    p_batch_id: null,
    p_type: 'weekly',
    p_subject: 'Physics',
    p_scholarship_admission_class: null,
    p_scholarship_target_exam: null,
    p_questions: [
      {
        type: 'mcq',
        prompt: 'What is 1+1?',
        options: ['1', '2', '3', '4'],
        correctOptionIndex: 1,
        explanation: '1+1=2',
        subjectLabel: 'Physics'
      }
    ],
    p_scheduled_at: new Date().toISOString(),
    p_is_open_for_all: true
  };

  console.log('Testing RPC create_test_with_questions with p_is_open_for_all: true...');
  const res = await fetch(`${BASE_URL}/rest/v1/rpc/create_test_with_questions`, {
    method: 'POST',
    headers: {
      apikey: SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload)
  });

  console.log('RPC Status:', res.status);
  const text = await res.text();
  console.log('RPC Response:', text);
}

testRpcCall().catch(console.error);
