const SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV3dXpkZ2dpbWJiYmZnY2F1emhvIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NTM5MTMxNSwiZXhwIjoyMDkwOTY3MzE1fQ.WCCXL2twdvI0BCW2OPR2NeNaV5mnzvDTJa2Fwfqx18o';
const BASE_URL = 'https://uwuzdggimbbbfgcauzho.supabase.co';

async function testCreateOpenWeekly() {
  const testRow = {
    title: 'Weekly Test Open For All',
    description: 'Weekly test open for everyone',
    duration_minutes: 60,
    batch_id: null,
    type: 'weekly',
    subject: 'Physics',
    scheduled_at: new Date().toISOString(),
    created_by: '00289244-ccd4-49e5-93dc-864ac2e8dfa0',
    is_open_for_all: true,
    is_published: true,
    is_started: false,
    share_code: Math.random().toString(36).substring(2, 10).toUpperCase(),
  };

  console.log('Inserting Open For All weekly test directly into tests table...');
  const res = await fetch(`${BASE_URL}/rest/v1/tests`, {
    method: 'POST',
    headers: {
      apikey: SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation'
    },
    body: JSON.stringify(testRow)
  });

  console.log('Insert status:', res.status);
  const data = await res.json();
  console.log('Created test:', data);

  if (Array.isArray(data) && data[0]?.id) {
    const testId = data[0].id;
    console.log('Inserting question for test:', testId);
    const qRes = await fetch(`${BASE_URL}/rest/v1/test_questions`, {
      method: 'POST',
      headers: {
        apikey: SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json',
        Prefer: 'return=representation'
      },
      body: JSON.stringify([{
        test_id: testId,
        position: 1,
        question_type: 'mcq',
        prompt: 'What is Newton unit of?',
        options: ['Energy', 'Force', 'Power', 'Work'],
        correct_answer: 'Force',
        explanation: 'Newton is unit of force.',
        subject_label: 'Physics'
      }])
    });

    console.log('Question status:', qRes.status);
    console.log('Question created:', await qRes.json());

    // Clean up
    console.log('Cleaning up created test...');
    await fetch(`${BASE_URL}/rest/v1/tests?id=eq.${testId}`, {
      method: 'DELETE',
      headers: {
        apikey: SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SERVICE_ROLE_KEY}`
      }
    });
    console.log('Cleaned up.');
  }
}

testCreateOpenWeekly().catch(console.error);
