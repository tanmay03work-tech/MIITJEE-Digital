const fs = require('fs');
const path = require('path');
const https = require('https');
const { SUPABASE_URL, SUPABASE_SERVICE_KEY: SERVICE_ROLE_KEY } = require('./supabase-env');

function supabaseRequest({ method, endpoint, body, headers = {}, contentType = 'application/json' }) {
  return new Promise((resolve, reject) => {
    const url = new URL(`${SUPABASE_URL}${endpoint}`);
    const reqHeaders = {
      'apikey': SERVICE_ROLE_KEY,
      'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
      ...headers,
    };
    if (contentType) {
      reqHeaders['Content-Type'] = contentType;
    }

    const options = {
      hostname: url.hostname,
      port: 443,
      path: url.pathname + url.search,
      method: method,
      headers: reqHeaders,
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          try {
            resolve(data ? JSON.parse(data) : null);
          } catch (e) {
            resolve(data);
          }
        } else {
          reject(new Error(`HTTP ${res.statusCode}: ${data}`));
        }
      });
    });

    req.on('error', reject);
    if (body) {
      if (Buffer.isBuffer(body)) {
        req.write(body);
      } else if (typeof body === 'string') {
        req.write(body);
      } else {
        req.write(JSON.stringify(body));
      }
    }
    req.end();
  });
}

async function main() {
  try {
    const payloadPath = path.join(__dirname, '..', 'question paper', 'final_pcm_questions_payload.json');
    const questions = JSON.parse(fs.readFileSync(payloadPath, 'utf-8'));
    console.log(`Loaded ${questions.length} questions.`);

    // 1. Create Test in public.tests table
    const testPayload = {
      title: 'MIITJEE Navigator - Full Mock Test (PCM)',
      description: 'MIITJEE Classes - Navigator Batch Full Question Bank (Physics + Chemistry + Mathematics). Standard: 11, 12 | 75 Questions (1-25 Physics, 26-50 Chemistry, 51-75 Mathematics). Duration: 180 Minutes (3 Hours).',
      duration_minutes: 180,
      type: 'weekly',
      subject: 'Mixed Subjects',
      is_published: true,
      is_open_for_all: true,
      scheduled_at: new Date().toISOString(),
      created_by: 'a652727c-cef5-4a63-8fa5-d6a5a336771d',
      correct_marks: 4,
      wrong_marks: -1,
      unattempted_marks: 0,
    };

    console.log('Creating Test in Supabase...');
    const insertedTests = await supabaseRequest({
      method: 'POST',
      endpoint: '/rest/v1/tests?select=*',
      body: testPayload,
      headers: {
        'Prefer': 'return=representation',
      },
    });

    const test = Array.isArray(insertedTests) ? insertedTests[0] : insertedTests;
    console.log(`✓ Test created successfully!`);
    console.log(`Test ID: ${test.id}`);
    console.log(`Title: ${test.title}`);
    console.log(`Duration: ${test.duration_minutes} mins`);
    console.log(`Open For All: ${test.is_open_for_all}`);
    console.log(`Share Code: ${test.share_code}`);

    // 2. Insert 75 questions in public.test_questions table
    const testQuestionsPayload = questions.map((q, idx) => ({
      test_id: test.id,
      position: idx + 1,
      question_type: q.type,
      prompt: q.prompt,
      options: q.type === 'mcq' ? q.options : [],
      correct_answer: q.correctAnswer,
      integer_answer: q.integerAnswer,
      explanation: q.explanation || '',
      image_url: q.imageUrl,
      subject_label: q.subject,
    }));

    console.log(`Inserting ${testQuestionsPayload.length} questions in batches...`);
    // Insert in batches of 25
    const batchSize = 25;
    for (let i = 0; i < testQuestionsPayload.length; i += batchSize) {
      const chunk = testQuestionsPayload.slice(i, i + batchSize);
      await supabaseRequest({
        method: 'POST',
        endpoint: '/rest/v1/test_questions',
        body: chunk,
      });
      console.log(`✓ Inserted questions ${i + 1} to ${i + chunk.length}`);
    }

    console.log('\n=========================================');
    console.log('🎉 TEST PUBLISHED SUCCESSFULLY TO PRODUCTION');
    console.log('=========================================');
    console.log(JSON.stringify({
      id: test.id,
      title: test.title,
      durationMinutes: test.duration_minutes,
      isOpenForAll: test.is_open_for_all,
      isPublished: test.is_published,
      questionCount: testQuestionsPayload.length,
      scheduledAt: test.scheduled_at,
    }, null, 2));

  } catch (err) {
    console.error('Error publishing test:', err);
    process.exit(1);
  }
}

main();
