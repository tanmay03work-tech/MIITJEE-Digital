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
    const q29ImgUrl = 'https://uwuzdggimbbbfgcauzho.supabase.co/storage/v1/object/public/exam-assets/images/q29_structure_1787366910785.png';
    const q31ImgUrl = 'https://uwuzdggimbbbfgcauzho.supabase.co/storage/v1/object/public/exam-assets/images/q31_clf3_structures_1787366911966.png';
    const q38ImgUrl = 'https://uwuzdggimbbbfgcauzho.supabase.co/storage/v1/object/public/exam-assets/images/q38_structure_1787366912342.png';

    // Read parsed questions
    const parsedQuestions = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'parsed_chemistry_questions.json'), 'utf-8'));

    const formattedQuestions = parsedQuestions.map((q) => {
      let imageUrl = null;
      if (q.num === 29) imageUrl = q29ImgUrl;
      else if (q.num === 31) imageUrl = q31ImgUrl;
      else if (q.num === 38) imageUrl = q38ImgUrl;

      let correctOptionIndex = 0;
      if (q.type === 'mcq') {
        const correctStr = q.correct || '';
        const match = correctStr.match(/^\(([A-D])\)/);
        if (match) {
          const letter = match[1];
          correctOptionIndex = { 'A': 0, 'B': 1, 'C': 2, 'D': 3 }[letter] ?? 0;
        }
      }

      let integerAnswer = null;
      if (q.type === 'integer') {
        integerAnswer = parseInt(q.correct, 10);
      }

      return {
        type: q.type,
        prompt: q.prompt,
        options: q.options || [],
        correctOptionIndex: correctOptionIndex,
        integerAnswer: integerAnswer,
        explanation: '',
        imageUrl: imageUrl,
        subjectLabel: 'Chemistry',
        num: q.num
      };
    });

    console.log(`Prepared ${formattedQuestions.length} questions.`);

    // 1. Insert into public.tests table
    const testPayload = {
      title: 'MIITJEE Navigator Chemistry',
      description: 'MIITJEE Classes - Navigator Batch Chemistry Question Paper covering Physical, Inorganic, and Organic Chemistry with full MCQs and Numerical problems.',
      duration_minutes: 60,
      type: 'weekly',
      subject: 'Chemistry',
      is_published: true,
      is_open_for_all: true,
      scheduled_at: new Date().toISOString(),
      created_by: 'a652727c-cef5-4a63-8fa5-d6a5a336771d',
      correct_marks: 4,
      wrong_marks: -1,
      unattempted_marks: 0,
    };

    console.log('Inserting test record...');
    const insertedTests = await supabaseRequest({
      method: 'POST',
      endpoint: '/rest/v1/tests?select=*',
      body: testPayload,
      headers: {
        'Prefer': 'return=representation',
      },
    });

    const test = Array.isArray(insertedTests) ? insertedTests[0] : insertedTests;
    console.log(`Created Test ID: ${test.id}`);

    // 2. Insert questions into public.test_questions table
    const testQuestionsPayload = formattedQuestions.map((q, idx) => ({
      test_id: test.id,
      position: idx + 1,
      question_type: q.type,
      prompt: q.prompt,
      options: q.type === 'mcq' ? q.options : [],
      correct_answer: q.type === 'integer' ? String(q.integerAnswer) : (q.options[q.correctOptionIndex] || ''),
      integer_answer: q.integerAnswer,
      explanation: q.explanation || '',
      image_url: q.imageUrl,
      subject_label: 'Chemistry',
    }));

    console.log('Inserting test questions...');
    const insertedQuestions = await supabaseRequest({
      method: 'POST',
      endpoint: '/rest/v1/test_questions?select=*',
      body: testQuestionsPayload,
      headers: {
        'Prefer': 'return=representation',
      },
    });

    console.log(`Inserted ${insertedQuestions.length} questions successfully!`);
    console.log('Test created and published successfully for all students!');
    console.log(JSON.stringify({
      testId: test.id,
      title: test.title,
      questionCount: insertedQuestions.length,
      isOpenForAll: test.is_open_for_all,
      isPublished: test.is_published,
      shareCode: test.share_code,
    }, null, 2));

  } catch (err) {
    console.error('Error creating test:', err);
    process.exit(1);
  }
}

main();
