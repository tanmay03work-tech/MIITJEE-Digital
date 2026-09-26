const SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV3dXpkZ2dpbWJiYmZnY2F1emhvIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NTM5MTMxNSwiZXhwIjoyMDkwOTY3MzE1fQ.WCCXL2twdvI0BCW2OPR2NeNaV5mnzvDTJa2Fwfqx18o';
const BASE_URL = 'https://uwuzdggimbbbfgcauzho.supabase.co';

async function testPipeline() {
  console.log('Testing create_test_with_questions with valid batch ELEVATOR...');
  const createPayload = {
    p_title: 'Weekly Test Open For All Test Pipeline',
    p_description: 'Testing open for all pipeline',
    p_duration_minutes: 60,
    p_batch_id: 'ELEVATOR',
    p_type: 'weekly',
    p_subject: 'Physics',
    p_scholarship_admission_class: null,
    p_scholarship_target_exam: null,
    p_questions: [
      {
        type: 'mcq',
        prompt: 'What is the speed of light in vacuum?',
        options: ['3x10^8 m/s', '3x10^6 m/s', '3x10^5 km/s', 'Both A and C'],
        correctOptionIndex: 3,
        explanation: 'Speed of light is 3x10^8 m/s = 3x10^5 km/s.',
        subjectLabel: 'Physics'
      }
    ],
    p_scheduled_at: new Date().toISOString(),
  };

  // 1. First fetch an admin user token to test authenticated execution
  // Or test with service key directly
  const res = await fetch(`${BASE_URL}/rest/v1/rpc/create_test_with_questions`, {
    method: 'POST',
    headers: {
      apikey: SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(createPayload)
  });

  console.log('Create status:', res.status);
  const data = await res.json();
  console.log('Create result:', data);
}

testPipeline().catch(console.error);
