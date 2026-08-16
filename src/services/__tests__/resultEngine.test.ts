export interface SubjectBreakdown {
  subject: string;
  total: number;
  correct: number;
  wrong: number;
  unattempted: number;
  score: number;
  accuracy: number;
}

export interface ExamResultSnapshot {
  totalQuestions: number;
  correctAnswers: number;
  wrongAnswers: number;
  unattemptedAnswers: number;
  totalScore: number;
  maxScore: number;
  percentage: number;
  subjectBreakdown: Record<string, SubjectBreakdown>;
}

export function computeResultSnapshot(
  questions: Array<{ id: string; subjectLabel?: string; correctAnswer: string }>,
  answers: Record<string, string>,
  markingScheme = { correctMarks: 4, wrongMarks: -1, unattemptedMarks: 0 },
): ExamResultSnapshot {
  let totalScore = 0;
  let correctAnswers = 0;
  let wrongAnswers = 0;
  let unattemptedAnswers = 0;
  const subjectMap: Record<string, SubjectBreakdown> = {};

  questions.forEach((q) => {
    const subj = q.subjectLabel || 'General';
    if (!subjectMap[subj]) {
      subjectMap[subj] = {
        subject: subj,
        total: 0,
        correct: 0,
        wrong: 0,
        unattempted: 0,
        score: 0,
        accuracy: 0,
      };
    }

    const sub = subjectMap[subj];
    sub.total++;

    const studentAnswer = answers[q.id];
    if (!studentAnswer) {
      unattemptedAnswers++;
      sub.unattempted++;
      totalScore += markingScheme.unattemptedMarks;
      sub.score += markingScheme.unattemptedMarks;
    } else if (studentAnswer === q.correctAnswer) {
      correctAnswers++;
      sub.correct++;
      totalScore += markingScheme.correctMarks;
      sub.score += markingScheme.correctMarks;
    } else {
      wrongAnswers++;
      sub.wrong++;
      totalScore += markingScheme.wrongMarks;
      sub.score += markingScheme.wrongMarks;
    }
  });

  // Calculate subject accuracies
  Object.values(subjectMap).forEach((sub) => {
    const attempted = sub.correct + sub.wrong;
    sub.accuracy = attempted > 0 ? Math.round((sub.correct / attempted) * 100) : 0;
  });

  const totalQuestions = questions.length;
  const maxScore = totalQuestions * markingScheme.correctMarks;
  const percentage = maxScore > 0 ? Math.max(0, Math.round((totalScore / maxScore) * 100)) : 0;

  return {
    totalQuestions,
    correctAnswers,
    wrongAnswers,
    unattemptedAnswers,
    totalScore,
    maxScore,
    percentage,
    subjectBreakdown: subjectMap,
  };
}

describe('Phase 15 - Result Engine Tests', () => {
  const questions = [
    { id: 'q1', subjectLabel: 'Physics', correctAnswer: 'A' },
    { id: 'q2', subjectLabel: 'Physics', correctAnswer: 'B' },
    { id: 'q3', subjectLabel: 'Chemistry', correctAnswer: 'C' },
    { id: 'q4', subjectLabel: 'Chemistry', correctAnswer: 'D' },
    { id: 'q5', subjectLabel: 'Mathematics', correctAnswer: 'A' },
  ];

  test('Test 1: Full result snapshot calculation with multi-subject breakdown', () => {
    const answers = {
      q1: 'A', // Physics Correct (+4)
      q2: 'C', // Physics Wrong (-1)
      q3: 'C', // Chemistry Correct (+4)
      q5: 'A', // Mathematics Correct (+4)
      // q4 unattempted (0)
    };

    const snapshot = computeResultSnapshot(questions, answers);

    expect(snapshot.totalQuestions).toBe(5);
    expect(snapshot.correctAnswers).toBe(3);
    expect(snapshot.wrongAnswers).toBe(1);
    expect(snapshot.unattemptedAnswers).toBe(1);
    expect(snapshot.totalScore).toBe(11); // 4 - 1 + 4 + 4 = 11
    expect(snapshot.maxScore).toBe(20);
    expect(snapshot.percentage).toBe(55); // 11/20 = 55%

    // Subject breakdown checks
    expect(snapshot.subjectBreakdown['Physics']?.correct).toBe(1);
    expect(snapshot.subjectBreakdown['Physics']?.wrong).toBe(1);
    expect(snapshot.subjectBreakdown['Physics']?.score).toBe(3);

    expect(snapshot.subjectBreakdown['Chemistry']?.correct).toBe(1);
    expect(snapshot.subjectBreakdown['Chemistry']?.unattempted).toBe(1);

    expect(snapshot.subjectBreakdown['Mathematics']?.correct).toBe(1);
    expect(snapshot.subjectBreakdown['Mathematics']?.score).toBe(4);
  });
});
