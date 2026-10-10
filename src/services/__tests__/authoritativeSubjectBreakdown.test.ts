import { TestAttemptReviewItem } from '../../types';

interface SubjectScoreItem {
  subject: string;
  correct: number;
  wrong: number;
  unattempted: number;
  score: number;
  total: number;
}

// Canonical subject breakdown calculation helper matching TestResultScreen
function calculateAuthoritativeSubjectBreakdown(
  reviews: TestAttemptReviewItem[],
  correctMarks = 4,
  wrongMarks = 1,
): SubjectScoreItem[] {
  const breakdownMap: Record<
    string,
    { correct: number; wrong: number; unattempted: number; score: number; total: number }
  > = {};

  reviews.forEach((item) => {
    // Authoritative subject from review item (test_questions / attempt review)
    let sub = item.subject?.trim() || 'Unassigned';
    if (sub.toLowerCase() === 'maths') {
      sub = 'Mathematics';
    } else {
      sub = sub.charAt(0).toUpperCase() + sub.slice(1).toLowerCase();
    }

    if (!breakdownMap[sub]) {
      breakdownMap[sub] = { correct: 0, wrong: 0, unattempted: 0, score: 0, total: 0 };
    }

    const entry = breakdownMap[sub]!;
    entry.total += 1;

    const ans = (item.userAnswer || '').trim();
    if (ans === '' || item.isUnattempted) {
      entry.unattempted += 1;
    } else if (item.isCorrect) {
      entry.correct += 1;
    } else {
      entry.wrong += 1;
    }
  });

  const standardOrder = ['Physics', 'Chemistry', 'Biology', 'Mathematics'];
  return Object.keys(breakdownMap)
    .sort((a, b) => {
      const idxA = standardOrder.indexOf(a);
      const idxB = standardOrder.indexOf(b);
      if (idxA !== -1 && idxB !== -1) return idxA - idxB;
      if (idxA !== -1) return -1;
      if (idxB !== -1) return 1;
      return a.localeCompare(b);
    })
    .map((key) => {
      const entry = breakdownMap[key]!;
      const score = entry.correct * correctMarks - entry.wrong * Math.abs(wrongMarks);
      return {
        subject: key,
        correct: entry.correct,
        wrong: entry.wrong,
        unattempted: entry.unattempted,
        score,
        total: entry.total,
      };
    });
}

describe('Blocker 7: Authoritative Subject Breakdown without Position or Heuristic Splitting', () => {
  it('Correctly calculates subject breakdown for a mixed-subject test with arbitrary interleaved ordering', () => {
    // Mixed-subject test with completely arbitrary, scrambled question ordering
    const mixedReviewItems: TestAttemptReviewItem[] = [
      {
        questionId: 'q-1',
        testId: 'test-mixed',
        questionType: 'mcq',
        prompt: 'Solve the integral of x*sin(x) dx',
        options: ['A', 'B', 'C', 'D'],
        userAnswer: 'A',
        correctAnswer: 'A',
        isCorrect: true,
        explanation: 'Integration by parts',
        subject: 'Mathematics', // Pos 1: Math
      },
      {
        questionId: 'q-2',
        testId: 'test-mixed',
        questionType: 'mcq',
        prompt: 'Calculate torque about axis of rotation',
        options: ['A', 'B', 'C', 'D'],
        userAnswer: 'B',
        correctAnswer: 'B',
        isCorrect: true,
        explanation: 'Torque = r x F',
        subject: 'Physics', // Pos 2: Physics
      },
      {
        questionId: 'q-3',
        testId: 'test-mixed',
        questionType: 'mcq',
        prompt: 'Identify the IUPAC name of CH3-CH(OH)-CH3',
        options: ['A', 'B', 'C', 'D'],
        userAnswer: 'C',
        correctAnswer: 'D',
        isCorrect: false,
        explanation: 'Propan-2-ol is IUPAC name',
        subject: 'Chemistry', // Pos 3: Chemistry (Wrong)
      },
      {
        questionId: 'q-4',
        testId: 'test-mixed',
        questionType: 'mcq',
        prompt: 'Name the cell organelle responsible for ATP synthesis',
        options: ['A', 'B', 'C', 'D'],
        userAnswer: '',
        correctAnswer: 'A',
        isCorrect: false,
        isUnattempted: true,
        explanation: 'Mitochondria is powerhouse of cell',
        subject: 'Biology', // Pos 4: Biology (Unattempted)
      },
      {
        questionId: 'q-5',
        testId: 'test-mixed',
        questionType: 'mcq',
        prompt: 'Find the eigenvalues of a 2x2 matrix',
        options: ['A', 'B', 'C', 'D'],
        userAnswer: 'B',
        correctAnswer: 'C',
        isCorrect: false,
        explanation: 'Roots of characteristic equation',
        subject: 'Maths', // Pos 5: Math (normalize to Mathematics) (Wrong)
      },
      {
        questionId: 'q-6',
        testId: 'test-mixed',
        questionType: 'mcq',
        prompt: 'State Faraday law of electromagnetic induction',
        options: ['A', 'B', 'C', 'D'],
        userAnswer: '',
        correctAnswer: 'B',
        isCorrect: false,
        isUnattempted: true,
        explanation: 'Induced EMF = -dPhi/dt',
        subject: 'Physics', // Pos 6: Physics (Unattempted)
      },
      {
        questionId: 'q-7',
        testId: 'test-mixed',
        questionType: 'mcq',
        prompt: 'What is the hybridization of sp3d2 in SF6?',
        options: ['A', 'B', 'C', 'D'],
        userAnswer: 'A',
        correctAnswer: 'A',
        isCorrect: true,
        explanation: 'Octahedral geometry',
        subject: 'Chemistry', // Pos 7: Chemistry (Correct)
      },
      {
        questionId: 'q-8',
        testId: 'test-mixed',
        questionType: 'mcq',
        prompt: 'Which phase of meiosis involves crossing over?',
        options: ['A', 'B', 'C', 'D'],
        userAnswer: 'C',
        correctAnswer: 'C',
        isCorrect: true,
        explanation: 'Pachytene stage of Prophase I',
        subject: 'Biology', // Pos 8: Biology (Correct)
      },
    ];

    const breakdown = calculateAuthoritativeSubjectBreakdown(mixedReviewItems, 4, 1);

    // Standard ordering: Physics, Chemistry, Biology, Mathematics
    expect(breakdown).toHaveLength(4);

    // 1. Physics Breakdown:
    // Total 2: 1 correct (q-2), 1 unattempted (q-6), 0 wrong -> Score: 1*4 - 0*1 = 4
    const physics = breakdown.find((b) => b.subject === 'Physics')!;
    expect(physics).toBeDefined();
    expect(physics.total).toBe(2);
    expect(physics.correct).toBe(1);
    expect(physics.wrong).toBe(0);
    expect(physics.unattempted).toBe(1);
    expect(physics.score).toBe(4);

    // 2. Chemistry Breakdown:
    // Total 2: 1 correct (q-7), 1 wrong (q-3), 0 unattempted -> Score: 1*4 - 1*1 = 3
    const chemistry = breakdown.find((b) => b.subject === 'Chemistry')!;
    expect(chemistry).toBeDefined();
    expect(chemistry.total).toBe(2);
    expect(chemistry.correct).toBe(1);
    expect(chemistry.wrong).toBe(1);
    expect(chemistry.unattempted).toBe(0);
    expect(chemistry.score).toBe(3);

    // 3. Biology Breakdown:
    // Total 2: 1 correct (q-8), 1 unattempted (q-4), 0 wrong -> Score: 1*4 - 0*1 = 4
    const biology = breakdown.find((b) => b.subject === 'Biology')!;
    expect(biology).toBeDefined();
    expect(biology.total).toBe(2);
    expect(biology.correct).toBe(1);
    expect(biology.wrong).toBe(0);
    expect(biology.unattempted).toBe(1);
    expect(biology.score).toBe(4);

    // 4. Mathematics Breakdown:
    // Total 2: 1 correct (q-1), 1 wrong (q-5), 0 unattempted -> Score: 1*4 - 1*1 = 3
    const math = breakdown.find((b) => b.subject === 'Mathematics')!;
    expect(math).toBeDefined();
    expect(math.total).toBe(2);
    expect(math.correct).toBe(1);
    expect(math.wrong).toBe(1);
    expect(math.unattempted).toBe(0);
    expect(math.score).toBe(3);

    // Aggregate totals check:
    const totalScore = breakdown.reduce((sum, b) => sum + b.score, 0);
    expect(totalScore).toBe(14); // 4 + 3 + 4 + 3 = 14
    const totalQuestions = breakdown.reduce((sum, b) => sum + b.total, 0);
    expect(totalQuestions).toBe(8);
  });
});
