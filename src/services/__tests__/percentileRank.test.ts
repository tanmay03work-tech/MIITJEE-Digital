export interface CandidateAttempt {
  userId: string;
  score: number;
  wrongCount: number;
  submittedAt: string;
  rank?: number;
  percentile?: number;
}

export function computeRanksAndPercentiles(attempts: CandidateAttempt[]): CandidateAttempt[] {
  const N = attempts.length;
  if (N === 0) return [];

  // Sort by tie-breaking rules:
  // 1. Score DESC
  // 2. Wrong Count ASC (fewer wrong answers)
  // 3. SubmittedAt ASC (earlier submission)
  const sorted = [...attempts].sort((a, b) => {
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
});
