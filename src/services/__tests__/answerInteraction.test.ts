interface ExamState {
  answers: Record<string, string>;
  flaggedIds: string[];
}

function selectAnswer(state: ExamState, questionId: string, option: string): ExamState {
  const current = state.answers[questionId];
  const nextAnswers = { ...state.answers };

  if (current === option) {
    delete nextAnswers[questionId];
  } else {
    nextAnswers[questionId] = option;
  }

  return { ...state, answers: nextAnswers };
}

function clearResponse(state: ExamState, questionId: string): ExamState {
  const nextAnswers = { ...state.answers };
  delete nextAnswers[questionId];
  return { ...state, answers: nextAnswers };
}

function toggleFlag(state: ExamState, questionId: string): ExamState {
  const isFlagged = state.flaggedIds.includes(questionId);
  const nextFlagged = isFlagged
    ? state.flaggedIds.filter((id) => id !== questionId)
    : [...state.flaggedIds, questionId];
  return { ...state, flaggedIds: nextFlagged };
}

function getPaletteStatus(state: ExamState, questionId: string): string {
  const isAnswered = !!state.answers[questionId];
  const isFlagged = state.flaggedIds.includes(questionId);

  if (isAnswered && isFlagged) return 'ANSWERED_AND_FLAGGED';
  if (isFlagged) return 'UNANSWERED_AND_FLAGGED';
  if (isAnswered) return 'ANSWERED';
  return 'UNANSWERED';
}

function calculateScore(
  answers: Record<string, string>,
  correctAnswers: Record<string, string>,
  correctMarks = 4,
  wrongMarks = -1,
): { totalScore: number; correctCount: number; wrongCount: number; unattemptedCount: number } {
  let totalScore = 0;
  let correctCount = 0;
  let wrongCount = 0;
  let unattemptedCount = 0;

  Object.keys(correctAnswers).forEach((qId) => {
    const selected = answers[qId];
    const target = correctAnswers[qId];

    if (!selected) {
      unattemptedCount++;
    } else if (selected === target) {
      correctCount++;
      totalScore += correctMarks;
    } else {
      wrongCount++;
      totalScore += wrongMarks;
    }
  });

  return { totalScore, correctCount, wrongCount, unattemptedCount };
}

describe('Phase 8 - Answer Interaction & State Transition Tests', () => {
  const initial: ExamState = { answers: {}, flaggedIds: [] };

  test('Test 1: Select option -> Answered state', () => {
    const s1 = selectAnswer(initial, 'q1', 'A');
    expect(s1.answers['q1']).toBe('A');
    expect(getPaletteStatus(s1, 'q1')).toBe('ANSWERED');
  });

  test('Test 2: Click selected option again -> Unselect -> Unanswered state', () => {
    const s1 = selectAnswer(initial, 'q1', 'A');
    const s2 = selectAnswer(s1, 'q1', 'A'); // Click A again
    expect(Boolean(s2.answers['q1'])).toBe(false);
    expect(getPaletteStatus(s2, 'q1')).toBe('UNANSWERED');
  });

  test('Test 3: Clear Response button resets answer', () => {
    const s1 = selectAnswer(initial, 'q1', 'B');
    const s2 = clearResponse(s1, 'q1');
    expect(Boolean(s2.answers['q1'])).toBe(false);
    expect(getPaletteStatus(s2, 'q1')).toBe('UNANSWERED');
  });

  test('Test 4: Answered + Flagged vs Unanswered + Flagged palette states', () => {
    let s = toggleFlag(initial, 'q1');
    expect(getPaletteStatus(s, 'q1')).toBe('UNANSWERED_AND_FLAGGED');

    s = selectAnswer(s, 'q1', 'C');
    expect(getPaletteStatus(s, 'q1')).toBe('ANSWERED_AND_FLAGGED');

    s = selectAnswer(s, 'q1', 'C'); // Unselect C while flagged
    expect(getPaletteStatus(s, 'q1')).toBe('UNANSWERED_AND_FLAGGED');
  });

  test('Test 5: Scoring considers ONLY final selected answer (Unselected option gives 0 marks)', () => {
    const correctMap = { q1: 'A', q2: 'B' };

    // Student selects A then unselects A for q1, selects B for q2
    let s = selectAnswer(initial, 'q1', 'A');
    s = selectAnswer(s, 'q1', 'A'); // Unselected q1
    s = selectAnswer(s, 'q2', 'B'); // Selected q2

    const score = calculateScore(s.answers, correctMap);
    expect(score.totalScore).toBe(4); // +4 for q2, 0 for q1 (unattempted)
    expect(score.unattemptedCount).toBe(1);
    expect(score.correctCount).toBe(1);
    expect(score.wrongCount).toBe(0);
  });
});
