const fs = require('fs');
const path = require('path');

const parsedPath = path.join(__dirname, '..', 'question paper', 'parsed_pcm_questions.json');
const imgMapPath = path.join(__dirname, '..', 'question paper', 'uploaded_images_map.json');

const questions = JSON.parse(fs.readFileSync(parsedPath, 'utf-8'));
const imgMap = JSON.parse(fs.readFileSync(imgMapPath, 'utf-8'));

console.log(`Loaded ${questions.length} questions.`);

const formatted = questions.map((q) => {
  let imgUrl = null;
  if (q.images && q.images.length > 0) {
    const rawImg = q.images[0].replace('word/', '');
    const mapped = Object.keys(imgMap).find(k => k.includes(rawImg) || rawImg.includes(k));
    if (mapped && imgMap[mapped]) {
      imgUrl = imgMap[mapped];
    }
  }

  // Handle Q75 specifically if options missing
  if (q.num === 75 && (!q.options || q.options.length === 0)) {
    q.type = 'mcq';
    q.options = ['-1', '0', '1', 'Does not exist'];
    q.correct = '(A) -1';
  }

  let correctOptionIndex = 0;
  if (q.type === 'mcq') {
    const match = (q.correct || '').match(/^\(([A-D])\)/i);
    if (match) {
      const letter = match[1].toUpperCase();
      correctOptionIndex = { 'A': 0, 'B': 1, 'C': 2, 'D': 3 }[letter] ?? 0;
    }
  }

  let integerAnswer = null;
  if (q.type === 'integer') {
    const parsedInt = parseInt(q.correct, 10);
    integerAnswer = isNaN(parsedInt) ? 0 : parsedInt;
  }

  let correctAnswer = '';
  if (q.type === 'integer') {
    correctAnswer = String(integerAnswer);
  } else {
    correctAnswer = q.options[correctOptionIndex] || q.options[0] || '';
  }

  return {
    num: q.num,
    subject: q.subject,
    type: q.type,
    prompt: q.prompt.trim(),
    options: q.type === 'mcq' ? q.options : [],
    correctOptionIndex,
    integerAnswer,
    correctAnswer,
    rawCorrect: q.correct,
    imageUrl: imgUrl,
    explanation: '',
  };
});

console.log('--- Summary by Subject ---');
const subjects = ['Physics', 'Chemistry', 'Mathematics'];
subjects.forEach((sub) => {
  const subQs = formatted.filter(q => q.subject === sub);
  const mcqs = subQs.filter(q => q.type === 'mcq');
  const ints = subQs.filter(q => q.type === 'integer');
  const withImgs = subQs.filter(q => !!q.imageUrl);
  console.log(`${sub}: Total ${subQs.length} (MCQs: ${mcqs.length}, Integers: ${ints.length}, Images: ${withImgs.length})`);
});

fs.writeFileSync(
  path.join(__dirname, '..', 'question paper', 'final_pcm_questions_payload.json'),
  JSON.stringify(formatted, null, 2),
  'utf-8'
);
console.log('Saved final_pcm_questions_payload.json');
