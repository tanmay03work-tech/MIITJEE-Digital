import { QuestionBankQuestion } from '../../types';

export function reviewActionReducer(
  question: QuestionBankQuestion,
  action:
    | { type: 'APPROVE' }
    | { type: 'EDIT'; payload: Partial<QuestionBankQuestion> }
    | { type: 'RE_EXTRACT'; newPrompt: string; newOptions: string[] }
    | { type: 'REPLACE_IMAGE'; newImageUrl: string }
    | { type: 'MARK_FOR_REVIEW' },
): QuestionBankQuestion {
  switch (action.type) {
    case 'APPROVE':
      return {
        ...question,
        needsReview: false,
        aiConfidence: 1.0,
      };

    case 'EDIT':
      return {
        ...question,
        ...action.payload,
      };

    case 'RE_EXTRACT':
      return {
        ...question,
        question: action.newPrompt,
        options: action.newOptions,
        aiConfidence: 0.95,
        needsReview: false,
      };

    case 'REPLACE_IMAGE':
      return {
        ...question,
        imageUrl: action.newImageUrl,
      };

    case 'MARK_FOR_REVIEW':
      return {
        ...question,
        needsReview: true,
      };

    default:
      return question;
  }
}

describe('Phase 7 - Question Bank Review Actions Tests', () => {
  const baseQuestion: QuestionBankQuestion = {
    id: 'q-101',
    setId: 1,
    type: 'mcq',
    question: 'Raw extracted question text',
    options: ['Opt A', 'Opt B', 'Opt C', 'Opt D'],
    correctAnswer: 'Opt A',
    explanation: 'Explanation',
    imageUrl: null,
    aiConfidence: 0.75,
    needsReview: true,
  };

  test('Test 1: Approve action clears needsReview and sets confidence to 1.0', () => {
    const updated = reviewActionReducer(baseQuestion, { type: 'APPROVE' });
    expect(updated.needsReview).toBe(false);
    expect(updated.aiConfidence).toBe(1.0);
  });

  test('Test 2: Edit action updates question prompt and correct answer', () => {
    const updated = reviewActionReducer(baseQuestion, {
      type: 'EDIT',
      payload: { question: 'Edited prompt text', correctAnswer: 'Opt B' },
    });
    expect(updated.question).toBe('Edited prompt text');
    expect(updated.correctAnswer).toBe('Opt B');
  });

  test('Test 3: Re-extract action updates prompt with new AI output', () => {
    const updated = reviewActionReducer(baseQuestion, {
      type: 'RE_EXTRACT',
      newPrompt: 'Re-extracted question',
      newOptions: ['1', '2', '3', '4'],
    });
    expect(updated.question).toBe('Re-extracted question');
    expect(updated.options.length).toBe(4);
    expect(updated.needsReview).toBe(false);
  });

  test('Test 4: Replace Image action updates imageUrl with new storage URL', () => {
    const updated = reviewActionReducer(baseQuestion, {
      type: 'REPLACE_IMAGE',
      newImageUrl: 'https://storage.miitjee.org/exam-assets/replaced.png',
    });
    expect(updated.imageUrl).toBe('https://storage.miitjee.org/exam-assets/replaced.png');
  });

  test('Test 5: Mark for Review action sets needsReview to true', () => {
    const approved = reviewActionReducer(baseQuestion, { type: 'APPROVE' });
    const flagged = reviewActionReducer(approved, { type: 'MARK_FOR_REVIEW' });
    expect(flagged.needsReview).toBe(true);
  });
});
