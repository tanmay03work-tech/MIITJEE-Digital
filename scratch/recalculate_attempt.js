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

async function fixLatestAttempt() {
  const attemptId = '965d058a-7b40-4f7f-a92f-06f0106dcb0a';
  const testId = 'd89987f8-1978-41f1-9ce9-332b6a0057bf';

  const [attemptRes, qRes] = await Promise.all([
    fetchRest(`/rest/v1/test_attempts?id=eq.${attemptId}&select=*`),
    fetchRest(`/rest/v1/test_questions?test_id=eq.${testId}&select=*&order=position.asc`)
  ]);

  const attempt = attemptRes.data[0];
  const questions = qRes.data;
  console.log(`Evaluating attempt ${attemptId} with ${questions.length} questions...`);

  const answers = attempt.answers || {};
  let correct = 0;
  let wrong = 0;
  let unattempted = 0;
  let score = 0;

  const evaluatedAnswers = [];

  questions.forEach((q, idx) => {
    const draftKey = `${testId}_draft_${idx + 1}`;
    const selected = answers[q.id] || answers[draftKey] || answers[String(idx + 1)];
    const isAtt = selected !== undefined && selected !== null && String(selected).trim().length > 0;
    const cleanCorrect = (q.correct_answer || '').trim();

    if (!isAtt) {
      unattempted++;
      evaluatedAnswers.push({
        attempt_id: attemptId,
        question_id: q.id,
        selected_answer: '',
        correct_answer: cleanCorrect,
        is_correct: false
      });
    } else {
      const normSel = String(selected).replace(/^Option\s+/i, '').trim().toUpperCase();
      let normCorr = cleanCorrect.replace(/^Option\s+/i, '').trim().toUpperCase();
      // If correct_answer in DB is text (like '32'), check option matching
      if (q.options && Array.isArray(q.options)) {
        if (/^[A-D]$/.test(normSel)) {
          const optIdx = normSel.charCodeAt(0) - 65;
          const optText = (q.options[optIdx] || '').trim().toUpperCase();
          if (optText === normCorr || normSel === normCorr) {
            normCorr = normSel; // match
          }
        }
      }

      const isMatch = normSel === normCorr;
      if (isMatch) {
        correct++;
        score += 4;
        evaluatedAnswers.push({
          attempt_id: attemptId,
          question_id: q.id,
          selected_answer: String(selected),
          correct_answer: cleanCorrect,
          is_correct: true
        });
      } else {
        wrong++;
        score -= 1;
        evaluatedAnswers.push({
          attempt_id: attemptId,
          question_id: q.id,
          selected_answer: String(selected),
          correct_answer: cleanCorrect,
          is_correct: false
        });
      }
    }
  });

  console.log(`Results -> Correct: ${correct}, Wrong: ${wrong}, Unattempted: ${unattempted}, Score: ${score}`);

  // Update attempt in DB
  const updateRes = await fetchRest(`/rest/v1/test_attempts?id=eq.${attemptId}`, 'PATCH', {
    correct_answers: correct,
    wrong_answers: wrong,
    unattempted: unattempted,
    score: score,
    total_questions: questions.length
  });

  console.log('Update result:', updateRes.status, updateRes.data);

  // Insert attempt answers
  try {
    await fetchRest(`/rest/v1/test_attempt_answers`, 'POST', evaluatedAnswers);
    console.log('Inserted evaluated answer rows into test_attempt_answers!');
  } catch (err) {
    console.error('Error inserting attempt answers:', err);
  }
}

fixLatestAttempt().catch(console.error);
