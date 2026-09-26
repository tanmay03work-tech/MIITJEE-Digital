function normalizeUserAnswerForQuestion(val, question) {
  if (val === undefined || val === null || String(val).trim() === '') {
    return '';
  }

  const raw = String(val).trim();
  const normRaw = raw.replace(/^Option\s+/i, '').trim();
  const cleanCorrect = (question.correctAnswer || (question.integerAnswer !== undefined && question.integerAnswer !== null ? String(question.integerAnswer) : '') || '').trim();
  const normCorrect = cleanCorrect.replace(/^Option\s+/i, '').trim();

  // If question has options (MCQ)
  if (question.options && Array.isArray(question.options) && question.options.length > 0) {
    const isSingleLetterUser = /^[A-D]$/i.test(normRaw);
    const isSingleLetterCorrect = /^[A-D]$/i.test(normCorrect);

    if (isSingleLetterUser) {
      const optIdx = normRaw.toUpperCase().charCodeAt(0) - 65;
      const optText = (question.options[optIdx] || '').trim();

      // If correct answer in DB is text (e.g. "32"), and user selected letter (e.g. "A" which is option 0 "32")
      if (!isSingleLetterCorrect && optText) {
        // Return option text so SQL string comparison "32" = "32" succeeds
        return optText;
      }
      return normRaw.toUpperCase();
    } else {
      // User sent option text (e.g. "32")
      // If correct answer in DB is single letter (e.g. "A"), find matching option index
      if (isSingleLetterCorrect) {
        const foundIdx = question.options.findIndex(
          (opt) => (opt || '').trim().toLowerCase() === normRaw.toLowerCase()
        );
        if (foundIdx !== -1) {
          return String.fromCharCode(65 + foundIdx);
        }
      }
      return raw;
    }
  }

  return raw;
}

// Test cases
const q1 = {
  options: ['32', '30', '24', '48'],
  correctAnswer: '32'
};
console.log('Q1 (User A, Correct 32):', normalizeUserAnswerForQuestion('A', q1)); // Expected: '32'
console.log('Q1 (User B, Correct 32):', normalizeUserAnswerForQuestion('B', q1)); // Expected: '30'

const q2 = {
  options: ['1 : 2√2', '1 : 4', '1 : √2', '1 : 2'],
  correctAnswer: '1 : 2√2'
};
console.log('Q2 (User A, Correct 1:2√2):', normalizeUserAnswerForQuestion('A', q2)); // Expected: '1 : 2√2'
console.log('Q2 (User B, Correct 1:2√2):', normalizeUserAnswerForQuestion('B', q2)); // Expected: '1 : 4'

const q3 = {
  options: ['A', 'B', 'C', 'D'],
  correctAnswer: 'A'
};
console.log('Q3 (User A, Correct A):', normalizeUserAnswerForQuestion('A', q3)); // Expected: 'A'
console.log('Q3 (User B, Correct A):', normalizeUserAnswerForQuestion('B', q3)); // Expected: 'B'

const q4 = {
  type: 'integer',
  correctAnswer: '42'
};
console.log('Q4 (User 42, Correct 42):', normalizeUserAnswerForQuestion('42', q4)); // Expected: '42'
