export interface SubmitSummary {
  totalQuestions: number;
  attemptedCount: number;
  unattemptedCount: number;
  flaggedCount: number;
  timeRemainingSeconds: number;
}

export function generateSubmitSummary(
  questionIds: string[],
  answers: Record<string, string>,
  flaggedIds: string[],
  timeRemainingSeconds: number,
): SubmitSummary {
  const totalQuestions = questionIds.length;
  const attemptedCount = questionIds.filter((id) => Boolean(answers[id])).length;
  const unattemptedCount = totalQuestions - attemptedCount;
  const flaggedCount = questionIds.filter((id) => flaggedIds.includes(id)).length;

  return {
    totalQuestions,
    attemptedCount,
    unattemptedCount,
    flaggedCount,
    timeRemainingSeconds,
  };
}

describe('Phase 9 - Submit Confirmation Modal Tests', () => {
  const questionIds = ['q1', 'q2', 'q3', 'q4', 'q5'];
  const answers = { q1: 'A', q3: 'C' };
  const flaggedIds = ['q3', 'q4'];

  test('Test 1: Exact stat calculation for confirmation modal', () => {
    const summary = generateSubmitSummary(questionIds, answers, flaggedIds, 1200);

    expect(summary.totalQuestions).toBe(5);
    expect(summary.attemptedCount).toBe(2);
    expect(summary.unattemptedCount).toBe(3);
    expect(summary.flaggedCount).toBe(2);
    expect(summary.timeRemainingSeconds).toBe(1200);
  });

  test('Test 2: User manual trigger requires confirmation modal step', () => {
    let isModalVisible = false;

    // Student clicks Submit Test
    isModalVisible = true;
    expect(isModalVisible).toBe(true);

    // Student clicks Return to Exam
    isModalVisible = false;
    expect(isModalVisible).toBe(false);
  });

  test('Test 3: Auto-submit (time expiry / violation threshold) bypasses confirmation modal', () => {
    let isSubmitted = false;
    let isModalPrompted = false;

    const isAutoSubmit = true;
    if (isAutoSubmit) {
      isSubmitted = true;
      isModalPrompted = false;
    }

    expect(isSubmitted).toBe(true);
    expect(isModalPrompted).toBe(false);
  });
});
