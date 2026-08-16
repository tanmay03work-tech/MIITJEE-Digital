export interface MarkingScheme {
  correctMarks: number;
  wrongMarks: number;
  unattemptedMarks: number;
}

export function evaluateMarkingScheme(
  userAnswers: Record<string, string>,
  answerKey: Record<string, string>,
  scheme: MarkingScheme,
): {
  totalScore: number;
  maxScore: number;
  correctCount: number;
  wrongCount: number;
  unattemptedCount: number;
} {
  let totalScore = 0;
  let correctCount = 0;
  let wrongCount = 0;
  let unattemptedCount = 0;

  const questionIds = Object.keys(answerKey);
  const maxScore = questionIds.length * scheme.correctMarks;

  questionIds.forEach((qId) => {
    const studentAnswer = userAnswers[qId];
    const correctAnswer = answerKey[qId];

    if (!studentAnswer) {
      unattemptedCount++;
      totalScore += scheme.unattemptedMarks;
    } else if (studentAnswer === correctAnswer) {
      correctCount++;
      totalScore += scheme.correctMarks;
    } else {
      wrongCount++;
      totalScore += scheme.wrongMarks;
    }
  });

  return { totalScore, maxScore, correctCount, wrongCount, unattemptedCount };
}

describe('Phase 14 - Marking System Tests', () => {
  const answerKey = {
    q1: 'A',
    q2: 'B',
    q3: 'C',
    q4: 'D',
    q5: 'A',
  };

  test('Test 1: Standard JEE Main Scheme (+4 / -1 / 0)', () => {
    // 3 correct (A, B, C), 1 wrong (C instead of D for q4), 1 unattempted (q5)
    const userAnswers = { q1: 'A', q2: 'B', q3: 'C', q4: 'C' };
    const scheme: MarkingScheme = { correctMarks: 4, wrongMarks: -1, unattemptedMarks: 0 };

    const res = evaluateMarkingScheme(userAnswers, answerKey, scheme);
    expect(res.maxScore).toBe(20);
    expect(res.correctCount).toBe(3);
    expect(res.wrongCount).toBe(1);
    expect(res.unattemptedCount).toBe(1);
    expect(res.totalScore).toBe(11); // 3*4 + 1*(-1) = 12 - 1 = 11
  });

  test('Test 2: Custom JEE Advanced Scheme (+4 / -2 / 0)', () => {
    const userAnswers = { q1: 'A', q2: 'B', q3: 'C', q4: 'C' };
    const scheme: MarkingScheme = { correctMarks: 4, wrongMarks: -2, unattemptedMarks: 0 };

    const res = evaluateMarkingScheme(userAnswers, answerKey, scheme);
    expect(res.totalScore).toBe(10); // 3*4 + 1*(-2) = 12 - 2 = 10
  });

  test('Test 3: No-Penalty Scheme (+3 / 0 / 0)', () => {
    const userAnswers = { q1: 'A', q2: 'B', q3: 'C', q4: 'C' };
    const scheme: MarkingScheme = { correctMarks: 3, wrongMarks: 0, unattemptedMarks: 0 };

    const res = evaluateMarkingScheme(userAnswers, answerKey, scheme);
    expect(res.totalScore).toBe(9); // 3*3 + 0 = 9
  });

  test('Test 4: Perfect score evaluation', () => {
    const userAnswers = { q1: 'A', q2: 'B', q3: 'C', q4: 'D', q5: 'A' };
    const scheme: MarkingScheme = { correctMarks: 4, wrongMarks: -1, unattemptedMarks: 0 };

    const res = evaluateMarkingScheme(userAnswers, answerKey, scheme);
    expect(res.totalScore).toBe(20);
    expect(res.correctCount).toBe(5);
  });
});
