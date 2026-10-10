export interface CandidateAttempt {
  userId: string;
  score: number;
  wrongCount: number;
  submittedAt: string;
  role?: string;
  isFinalized?: boolean;
  rank?: number;
  percentile?: number;
}

export function filterEligibleCohortAttempts(attempts: CandidateAttempt[]): CandidateAttempt[] {
  // 1. Exclude admin/faculty/staff
  // 2. Exclude unfinished/unfinalized attempts (or NULL scores)
  // 3. For multiple attempts by same user, deterministically pick latest finalized attempt
  const eligible = attempts.filter((a) => {
    const isStudent = !a.role || a.role === 'student' || a.role === 'miitjee_student';
    const isFinished = a.isFinalized !== false && a.submittedAt && a.score !== null && a.score !== undefined;
    return isStudent && isFinished;
  });

  const latestByUser = new Map<string, CandidateAttempt>();
  // Sort by submittedAt DESC to find latest attempt per student
  const sortedByTime = [...eligible].sort(
    (a, b) => new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime()
  );

  for (const attempt of sortedByTime) {
    if (!latestByUser.has(attempt.userId)) {
      latestByUser.set(attempt.userId, attempt);
    }
  }

  return Array.from(latestByUser.values());
}

export function computeRanksAndPercentiles(attempts: CandidateAttempt[]): CandidateAttempt[] {
  const eligible = filterEligibleCohortAttempts(attempts);
  const N = eligible.length;
  if (N === 0) return [];

  // Sort by tie-breaking rules:
  // 1. Score DESC
  // 2. Wrong Count ASC (fewer wrong answers)
  // 3. SubmittedAt ASC (earlier submission)
  const sorted = [...eligible].sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (a.wrongCount !== b.wrongCount) return a.wrongCount - b.wrongCount;
    return new Date(a.submittedAt).getTime() - new Date(b.submittedAt).getTime();
  });

  return sorted.map((candidate, index) => {
    const rank = index + 1;

    // Count how many candidates scored <= candidate.score
    const countBelowOrEqual = sorted.filter((item) => item.score <= candidate.score).length;
    const percentile = Number(((countBelowOrEqual / N) * 100).toFixed(2));

    return {
      ...candidate,
      rank,
      percentile,
    };
  });
}

describe('Phase 16 - Percentile & Rank Engine Tests', () => {
  test('Test 1: Rank ordering and N-based percentile formula calculation', () => {
    const attempts: CandidateAttempt[] = [
      { userId: 'u1', score: 100, wrongCount: 0, submittedAt: '2026-08-08T10:00:00Z' },
      { userId: 'u2', score: 80, wrongCount: 2, submittedAt: '2026-08-08T10:05:00Z' },
      { userId: 'u3', score: 60, wrongCount: 5, submittedAt: '2026-08-08T10:10:00Z' },
      { userId: 'u4', score: 40, wrongCount: 8, submittedAt: '2026-08-08T10:15:00Z' },
    ];

    const ranked = computeRanksAndPercentiles(attempts);

    expect(ranked[0]?.userId).toBe('u1');
    expect(ranked[0]?.rank).toBe(1);
    expect(ranked[0]?.percentile).toBe(100.0);

    expect(ranked[3]?.userId).toBe('u4');
    expect(ranked[3]?.rank).toBe(4);
    expect(ranked[3]?.percentile).toBe(25.0);
  });

  test('Test 2: Tie-breaker - Same score resolved by fewer wrong answers', () => {
    const attempts: CandidateAttempt[] = [
      { userId: 'uA', score: 120, wrongCount: 4, submittedAt: '2026-08-08T10:00:00Z' }, // 4 wrong
      { userId: 'uB', score: 120, wrongCount: 1, submittedAt: '2026-08-08T10:00:00Z' }, // 1 wrong -> SHOULD BE RANK 1
    ];

    const ranked = computeRanksAndPercentiles(attempts);

    expect(ranked[0]?.userId).toBe('uB'); // Fewer wrong answers wins tie-breaker
    expect(ranked[0]?.rank).toBe(1);
    expect(ranked[1]?.userId).toBe('uA');
    expect(ranked[1]?.rank).toBe(2);
  });

  test('Test 3: Tie-breaker - Same score & same wrong count resolved by earlier submission time', () => {
    const attempts: CandidateAttempt[] = [
      { userId: 'uLate', score: 150, wrongCount: 0, submittedAt: '2026-08-08T10:30:00Z' },
      { userId: 'uEarly', score: 150, wrongCount: 0, submittedAt: '2026-08-08T10:15:00Z' }, // Earlier submission -> RANK 1
    ];

    const ranked = computeRanksAndPercentiles(attempts);

    expect(ranked[0]?.userId).toBe('uEarly');
    expect(ranked[0]?.rank).toBe(1);
    expect(ranked[1]?.userId).toBe('uLate');
    expect(ranked[1]?.rank).toBe(2);
  });

  test('Test 4: NTA Methodology - Equal scores receive identical percentile regardless of rank tie-breaking', () => {
    const attempts: CandidateAttempt[] = [
      { userId: 'u1', score: 180, wrongCount: 0, submittedAt: '2026-08-08T10:00:00Z' }, // 180
      { userId: 'u2', score: 120, wrongCount: 1, submittedAt: '2026-08-08T10:05:00Z' }, // 120
      { userId: 'u3', score: 120, wrongCount: 3, submittedAt: '2026-08-08T10:10:00Z' }, // 120 (tied score)
      { userId: 'u4', score: 60, wrongCount: 5, submittedAt: '2026-08-08T10:15:00Z' },  // 60
    ];

    const ranked = computeRanksAndPercentiles(attempts);

    // u1 has highest score (4 out of 4 <= 180) -> 100.0%
    expect(ranked[0]?.percentile).toBe(100.0);

    // Both u2 and u3 scored 120. Candidates with score <= 120: u2, u3, u4 (3 out of 4) -> 75.0%
    const u2Result = ranked.find((r) => r.userId === 'u2');
    const u3Result = ranked.find((r) => r.userId === 'u3');
    expect(u2Result?.percentile).toBe(75.0);
    expect(u3Result?.percentile).toBe(75.0);
    expect(u2Result?.percentile).toEqual(u3Result?.percentile);

    // u4 has score 60 (1 out of 4 <= 60) -> 25.0%
    expect(ranked[3]?.percentile).toBe(25.0);
  });

  test('Test 5: Single candidate cohort always yields exactly 100.0 percentile', () => {
    const attempts: CandidateAttempt[] = [
      { userId: 'solo', score: 45, wrongCount: 2, submittedAt: '2026-08-08T10:00:00Z' },
    ];

    const ranked = computeRanksAndPercentiles(attempts);

    expect(ranked).toHaveLength(1);
    expect(ranked[0]?.rank).toBe(1);
    expect(ranked[0]?.percentile).toBe(100.0);
  });

  test('Test 6: Percentile is strictly bounded within 0 to 100 and cannot produce 308% raw score anomaly', () => {
    const attempts: CandidateAttempt[] = [
      { userId: 'topper', score: 308, wrongCount: 1, submittedAt: '2026-08-08T10:00:00Z' },
      { userId: 'runnerUp', score: 250, wrongCount: 4, submittedAt: '2026-08-08T10:05:00Z' },
      { userId: 'third', score: 180, wrongCount: 6, submittedAt: '2026-08-08T10:10:00Z' },
    ];

    const ranked = computeRanksAndPercentiles(attempts);

    ranked.forEach((candidate) => {
      expect((candidate.percentile ?? 0) >= 0).toBe(true);
      expect((candidate.percentile ?? 0) <= 100).toBe(true);
      // Raw score (e.g. 308) must NOT be confused with percentile
      if (candidate.userId === 'topper') {
        expect(candidate.score).toBe(308); // Raw marks
        expect(candidate.percentile).toBe(100.0); // Percentile rank, NOT 308%
      }
    });
  });

  test('Test 7: Empty cohort returns empty array safely without NaN or division by zero', () => {
    const emptyCohort: CandidateAttempt[] = [];
    const ranked = computeRanksAndPercentiles(emptyCohort);
    expect(ranked).toEqual([]);
  });

  test('Test 8: Exclusion of admin/faculty and unfinished attempts from cohort', () => {
    const attemptsWithStaffAndUnfinished: CandidateAttempt[] = [
      { userId: 'admin-1', score: 290, wrongCount: 0, submittedAt: '2026-08-08T09:00:00Z', role: 'admin' },
      { userId: 'faculty-1', score: 300, wrongCount: 0, submittedAt: '2026-08-08T09:00:00Z', role: 'faculty' },
      { userId: 'student-in-progress', score: 0, wrongCount: 0, submittedAt: '2026-08-08T10:00:00Z', role: 'student', isFinalized: false },
      { userId: 'student-A', score: 180, wrongCount: 2, submittedAt: '2026-08-08T10:00:00Z', role: 'student', isFinalized: true },
      { userId: 'student-B', score: 120, wrongCount: 5, submittedAt: '2026-08-08T10:05:00Z', role: 'miitjee_student', isFinalized: true },
    ];

    const ranked = computeRanksAndPercentiles(attemptsWithStaffAndUnfinished);

    // Only student-A and student-B must be in the cohort
    expect(ranked).toHaveLength(2);
    expect(ranked.map((c) => c.userId)).toEqual(['student-A', 'student-B']);
    expect(ranked[0]?.userId).toBe('student-A');
    expect(ranked[0]?.percentile).toBe(100.0);
    expect(ranked[1]?.userId).toBe('student-B');
    expect(ranked[1]?.percentile).toBe(50.0);
  });

  test('Test 9: Multiple attempts by same student deterministically resolves to latest finalized attempt', () => {
    const attemptsWithReattempt: CandidateAttempt[] = [
      // Student 1: 1st attempt = 100, 2nd attempt (latest) = 150
      { userId: 'student-1', score: 100, wrongCount: 10, submittedAt: '2026-08-08T10:00:00Z', role: 'student', isFinalized: true },
      { userId: 'student-1', score: 150, wrongCount: 2, submittedAt: '2026-08-08T12:00:00Z', role: 'student', isFinalized: true },
      // Student 2: 1 attempt = 120
      { userId: 'student-2', score: 120, wrongCount: 5, submittedAt: '2026-08-08T11:00:00Z', role: 'student', isFinalized: true },
    ];

    const ranked = computeRanksAndPercentiles(attemptsWithReattempt);

    expect(ranked).toHaveLength(2);
    const student1 = ranked.find((c) => c.userId === 'student-1');
    expect(student1?.score).toBe(150); // Evaluates latest attempt
    expect(student1?.rank).toBe(1);
    expect(student1?.percentile).toBe(100.0);
  });
});
