import { calculateSubjectAwareRanks, generateSubjectAwareCsv } from '../../utils/excelExporter';

describe('Subject-Aware Scoring and Excel Export Edge Cases', () => {
  it('Case 1: 4 correct, 0 wrong, 0 unattempted -> Score = 16', () => {
    const raw = [{
      studentId: 's1',
      studentName: 'Student 1',
      examTitle: 'Physics Test',
      attemptStatus: 'Completed',
      subjectScores: {
        Physics: { correct: 4, wrong: 0, unattempted: 0, score: 4 * 4 - 0 * 1 },
      },
      submittedAt: '2026-08-09T00:00:00Z',
    }];

    const ranked = calculateSubjectAwareRanks(raw);
    const first = ranked[0]!;
    expect(first.totalCorrect).toBe(4);
    expect(first.totalWrong).toBe(0);
    expect(first.totalUnattempted).toBe(0);
    expect(first.totalScore).toBe(16);
  });

  it('Case 2: 0 correct, 4 wrong, 0 unattempted -> Score = -4', () => {
    const raw = [{
      studentId: 's1',
      studentName: 'Student 1',
      examTitle: 'Physics Test',
      attemptStatus: 'Completed',
      subjectScores: {
        Physics: { correct: 0, wrong: 4, unattempted: 0, score: 0 * 4 - 4 * 1 },
      },
      submittedAt: '2026-08-09T00:00:00Z',
    }];

    const ranked = calculateSubjectAwareRanks(raw);
    const first = ranked[0]!;
    expect(first.totalCorrect).toBe(0);
    expect(first.totalWrong).toBe(4);
    expect(first.totalUnattempted).toBe(0);
    expect(first.totalScore).toBe(-4);
  });

  it('Case 3: 0 correct, 0 wrong, 4 unattempted -> Score = 0', () => {
    const raw = [{
      studentId: 's1',
      studentName: 'Student 1',
      examTitle: 'Physics Test',
      attemptStatus: 'Completed',
      subjectScores: {
        Physics: { correct: 0, wrong: 0, unattempted: 4, score: 0 * 4 - 0 * 1 },
      },
      submittedAt: '2026-08-09T00:00:00Z',
    }];

    const ranked = calculateSubjectAwareRanks(raw);
    const first = ranked[0]!;
    expect(first.totalCorrect).toBe(0);
    expect(first.totalWrong).toBe(0);
    expect(first.totalUnattempted).toBe(4);
    expect(first.totalScore).toBe(0);
  });

  it('Case 4: 2 correct, 1 wrong, 1 unattempted -> Score = 7', () => {
    const raw = [{
      studentId: 's1',
      studentName: 'Student 1',
      examTitle: 'Physics Test',
      attemptStatus: 'Completed',
      subjectScores: {
        Physics: { correct: 2, wrong: 1, unattempted: 1, score: 2 * 4 - 1 * 1 },
      },
      submittedAt: '2026-08-09T00:00:00Z',
    }];

    const ranked = calculateSubjectAwareRanks(raw);
    const first = ranked[0]!;
    expect(first.totalCorrect).toBe(2);
    expect(first.totalWrong).toBe(1);
    expect(first.totalUnattempted).toBe(1);
    expect(first.totalScore).toBe(7);
  });

  it('Case 5: Physics-only test MUST NOT contain Chemistry or Mathematics in CSV headers', () => {
    const raw = [{
      studentId: 's1',
      studentName: 'John Doe',
      examTitle: 'Physics Units & Dimensions',
      attemptStatus: 'Completed',
      subjectScores: {
        Physics: { correct: 8, wrong: 1, unattempted: 1, score: 31 },
      },
      submittedAt: '2026-08-09T00:00:00Z',
    }];

    const ranked = calculateSubjectAwareRanks(raw);
    const csv = generateSubjectAwareCsv(ranked, ['Physics']);

    expect(csv.includes('Physics Correct')).toBe(true);
    expect(csv.includes('Physics Wrong')).toBe(true);
    expect(csv.includes('Physics Unattempted')).toBe(true);
    expect(csv.includes('Physics Score')).toBe(true);

    expect(csv.includes('Chemistry Correct')).toBe(false);
    expect(csv.includes('Maths Correct')).toBe(false);
    expect(csv.includes('Mathematics Correct')).toBe(false);
  });

  it('Case 6: Physics + Chemistry test MUST NOT contain Mathematics in CSV headers', () => {
    const raw = [{
      studentId: 's1',
      studentName: 'Jane Smith',
      examTitle: 'Physics & Chemistry Test',
      attemptStatus: 'Completed',
      subjectScores: {
        Physics: { correct: 5, wrong: 2, unattempted: 3, score: 18 },
        Chemistry: { correct: 7, wrong: 1, unattempted: 2, score: 27 },
      },
      submittedAt: '2026-08-09T00:00:00Z',
    }];

    const ranked = calculateSubjectAwareRanks(raw);
    const csv = generateSubjectAwareCsv(ranked, ['Physics', 'Chemistry']);

    expect(csv.includes('Physics Score')).toBe(true);
    expect(csv.includes('Chemistry Score')).toBe(true);
    expect(csv.includes('Maths Score')).toBe(false);
    expect(csv.includes('Mathematics Score')).toBe(false);
  });

  it('Case 7: All unattempted submission -> Correct 0, Wrong 0, Unattempted total, Score 0', () => {
    const raw = [{
      studentId: 's1',
      studentName: 'Empty Student',
      examTitle: 'Test',
      attemptStatus: 'Completed',
      subjectScores: {
        Physics: { correct: 0, wrong: 0, unattempted: 10, score: 0 },
      },
      submittedAt: '2026-08-09T00:00:00Z',
    }];

    const ranked = calculateSubjectAwareRanks(raw);
    const first = ranked[0]!;
    expect(first.totalCorrect).toBe(0);
    expect(first.totalWrong).toBe(0);
    expect(first.totalUnattempted).toBe(10);
    expect(first.totalScore).toBe(0);
  });
});
