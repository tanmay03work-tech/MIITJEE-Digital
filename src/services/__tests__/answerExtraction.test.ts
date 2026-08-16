export interface AnswerExtractionResult {
  questionIndex: number;
  extractedAnswer: string;
  confidence: number;
  hasAnswerKeyMatch: boolean;
  needsReview: boolean;
}

export function evaluateAnswerKeyMapping(
  extractedQuestions: Array<{ index: number; aiAnswer: string; confidence?: number }>,
  answerKeyMap?: Record<number, string>,
): AnswerExtractionResult[] {
  return extractedQuestions.map((q) => {
    const keyMatch = answerKeyMap ? answerKeyMap[q.index] : undefined;

    if (keyMatch) {
      return {
        questionIndex: q.index,
        extractedAnswer: keyMatch,
        confidence: 1.0,
        hasAnswerKeyMatch: true,
        needsReview: false,
      };
    }

    const aiConf = q.confidence ?? 0.8;
    const needsReview = aiConf < 0.9;

    return {
      questionIndex: q.index,
      extractedAnswer: q.aiAnswer,
      confidence: aiConf,
      hasAnswerKeyMatch: false,
      needsReview,
    };
  });
}

describe('Phase 6 - Correct Answer Extraction & Mapping Tests', () => {
  test('Test 1: Mapped answer key overrides AI answer with 1.0 confidence', () => {
    const extracted = [{ index: 1, aiAnswer: 'B', confidence: 0.75 }];
    const answerKey = { 1: 'A' };
    const results = evaluateAnswerKeyMapping(extracted, answerKey);

    expect(results[0]?.extractedAnswer).toBe('A');
    expect(results[0]?.hasAnswerKeyMatch).toBe(true);
    expect(results[0]?.needsReview).toBe(false);
    expect(results[0]?.confidence).toBe(1.0);
  });

  test('Test 2: Low confidence AI answer without answer key flags Needs Review', () => {
    const extracted = [{ index: 1, aiAnswer: 'C', confidence: 0.75 }];
    const results = evaluateAnswerKeyMapping(extracted);

    expect(results[0]?.extractedAnswer).toBe('C');
    expect(results[0]?.hasAnswerKeyMatch).toBe(false);
    expect(results[0]?.needsReview).toBe(true);
  });

  test('Test 3: High confidence AI answer without answer key passes review', () => {
    const extracted = [{ index: 1, aiAnswer: 'D', confidence: 0.95 }];
    const results = evaluateAnswerKeyMapping(extracted);

    expect(results[0]?.extractedAnswer).toBe('D');
    expect(results[0]?.hasAnswerKeyMatch).toBe(false);
    expect(results[0]?.needsReview).toBe(false);
  });
});
