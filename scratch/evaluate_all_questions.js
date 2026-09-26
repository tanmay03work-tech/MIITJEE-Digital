const https = require('https');

const SUPABASE_URL = 'https://uwuzdggimbbbfgcauzho.supabase.co';
const SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV3dXpkZ2dpbWJiYmZnY2F1emhvIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NTM5MTMxNSwiZXhwIjoyMDkwOTY3MzE1fQ.WCCXL2twdvI0BCW2OPR2NeNaV5mnzvDTJa2Fwfqx18o';

async function fetchRest(endpoint, method = 'GET', body = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(endpoint, SUPABASE_URL);
    const dataString = body ? JSON.stringify(body) : null;
    const req = https.request(url, {
      method,
      headers: {
        'apikey': SERVICE_ROLE_KEY,
        'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json',
        ...(dataString ? { 'Content-Length': Buffer.byteLength(dataString), 'Prefer': 'return=representation' } : {})
      }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(data) });
        } catch (e) {
          resolve({ status: res.statusCode, data: data });
        }
      });
    });
    req.on('error', reject);
    if (dataString) req.write(dataString);
    req.end();
  });
}

function checkIsCorrect(userAns, correctAns, options) {
  if (!userAns || typeof userAns !== 'string' || !userAns.trim()) return false;
  const normUser = userAns.trim().replace(/^Option\s+/i, '');
  const normCorrect = (correctAns || '').trim().replace(/^Option\s+/i, '');

  if (normUser.toLowerCase() === normCorrect.toLowerCase()) return true;

  if (options && Array.isArray(options) && options.length > 0) {
    if (/^[A-D]$/i.test(normUser)) {
      const idx = normUser.toUpperCase().charCodeAt(0) - 65;
      const optText = (options[idx] || '').trim();
      if (optText.toLowerCase() === normCorrect.toLowerCase()) return true;
    }
    if (/^[A-D]$/i.test(normCorrect)) {
      const idx = normCorrect.toUpperCase().charCodeAt(0) - 65;
      const optText = (options[idx] || '').trim();
      if (optText.toLowerCase() === normUser.toLowerCase()) return true;
    }
  }

  if (!isNaN(Number(normUser)) && !isNaN(Number(normCorrect)) && Number(normUser) === Number(normCorrect)) {
    return true;
  }

  return false;
}

async function evaluateAllQuestions() {
  const attemptId = '965d058a-7b40-4f7f-a92f-06f0106dcb0a';
  const testId = 'd89987f8-1978-41f1-9ce9-332b6a0057bf';

  const [attemptRes, qRes] = await Promise.all([
    fetchRest(`/rest/v1/test_attempts?id=eq.${attemptId}&select=*`),
    fetchRest(`/rest/v1/test_questions?test_id=eq.${testId}&select=*&order=position.asc`)
  ]);

  const attempt = attemptRes.data[0];
  const questions = qRes.data;
  const answers = attempt.answers || {};

  console.log(`Analyzing ${questions.length} questions for attempt ${attemptId}...`);

  let correct = 0;
  let wrong = 0;
  let unattempted = 0;
  let score = 0;

  const evaluated = [];

  questions.forEach((q, idx) => {
    const draftKey = `${testId}_draft_${idx + 1}`;
    const rawSelected = answers[q.id] || answers[draftKey] || answers[String(idx + 1)];
    const isAtt = rawSelected !== undefined && rawSelected !== null && String(rawSelected).trim().length > 0;
    const userAns = isAtt ? String(rawSelected).trim() : '';
    const cleanCorrect = (q.correct_answer || (q.integer_answer !== null && q.integer_answer !== undefined ? String(q.integer_answer) : '')).trim();

    if (!isAtt) {
      unattempted++;
      evaluated.push({
        attempt_id: attemptId,
        question_id: q.id,
        selected_answer: '',
        correct_answer: cleanCorrect,
        is_correct: false
      });
    } else {
      const isMatch = checkIsCorrect(userAns, cleanCorrect, q.options);
      if (isMatch) {
        correct++;
        score += 4;
        evaluated.push({
          attempt_id: attemptId,
          question_id: q.id,
          selected_answer: userAns,
          correct_answer: cleanCorrect,
          is_correct: true
        });
      } else {
        wrong++;
        score -= 1;
        evaluated.push({
          attempt_id: attemptId,
          question_id: q.id,
          selected_answer: userAns,
          correct_answer: cleanCorrect,
          is_correct: false
        });
      }

      console.log(`Q${idx + 1}: userAns="${userAns}", correct="${cleanCorrect}", options=${JSON.stringify(q.options)} => isMatch=${isMatch}`);
    }
  });

  console.log(`\nFINAL TOTALS -> Correct: ${correct}, Wrong: ${wrong}, Unattempted: ${unattempted}, Score: ${score}`);

  // Delete previous attempt answers and reinsert correct evaluation
  await fetchRest(`/rest/v1/test_attempt_answers?attempt_id=eq.${attemptId}`, 'DELETE');
  await fetchRest(`/rest/v1/test_attempt_answers`, 'POST', evaluated);

  // Update test_attempts
  await fetchRest(`/rest/v1/test_attempts?id=eq.${attemptId}`, 'PATCH', {
    correct_answers: correct,
    wrong_answers: wrong,
    unattempted: unattempted,
    score: score
  });

  console.log('Updated attempt record and answers in Supabase successfully!');
}

evaluateAllQuestions().catch(console.error);
