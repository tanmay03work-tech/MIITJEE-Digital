/**
 * Canonical Question & Answer Normalization Utility
 * Guarantees that question options, correct answers, and types remain an indivisible unit.
 * STRICT SAFETY RULE: NEVER defaults unresolved answers to Option A.
 */

export interface NormalizedAnswerResolution {
  correctOptionIndex: number;
  canonicalAnswerLetter: 'A' | 'B' | 'C' | 'D' | null;
  integerAnswer?: number;
  isValid: boolean;
  needsReview: boolean;
  validationError?: string;
}

export function resolveCanonicalAnswer(
  type: 'mcq' | 'integer',
  rawAnswer: string | number | undefined | null,
  options: string[] = [],
): NormalizedAnswerResolution {
  if (type === 'integer') {
    if (typeof rawAnswer === 'number' && !Number.isNaN(rawAnswer)) {
      return {
        correctOptionIndex: -1,
        canonicalAnswerLetter: null,
        integerAnswer: rawAnswer,
        isValid: true,
        needsReview: false,
      };
    }

    const str = String(rawAnswer ?? '').trim();
    const cleanStr = str.replace(/[−–]/g, '-').replace(/,/g, '.');
    const parsed = parseFloat(cleanStr);

    if (str !== '' && !Number.isNaN(parsed)) {
      return {
        correctOptionIndex: -1,
        canonicalAnswerLetter: null,
        integerAnswer: parsed,
        isValid: true,
        needsReview: false,
      };
    }

    return {
      correctOptionIndex: -1,
      canonicalAnswerLetter: null,
      integerAnswer: undefined,
      isValid: false,
      needsReview: true,
      validationError: `Invalid integer answer: "${rawAnswer ?? ''}"`,
    };
  }

  // MCQ Normalization
  if (typeof rawAnswer === 'number' && rawAnswer >= 0 && rawAnswer <= 3) {
    const letter = (['A', 'B', 'C', 'D'][rawAnswer] as 'A' | 'B' | 'C' | 'D') ?? 'A';
    return {
      correctOptionIndex: rawAnswer,
      canonicalAnswerLetter: letter,
      isValid: true,
      needsReview: false,
    };
  }

  const ansStr = String(rawAnswer ?? '').trim().toUpperCase();

  if (ansStr === 'A' || ansStr === '1') {
    return { correctOptionIndex: 0, canonicalAnswerLetter: 'A', isValid: true, needsReview: false };
  }
  if (ansStr === 'B' || ansStr === '2') {
    return { correctOptionIndex: 1, canonicalAnswerLetter: 'B', isValid: true, needsReview: false };
  }
  if (ansStr === 'C' || ansStr === '3') {
    return { correctOptionIndex: 2, canonicalAnswerLetter: 'C', isValid: true, needsReview: false };
  }
  if (ansStr === 'D' || ansStr === '4') {
    return { correctOptionIndex: 3, canonicalAnswerLetter: 'D', isValid: true, needsReview: false };
  }

  // Check matching option text
  const cleanRaw = String(rawAnswer ?? '').trim().toLowerCase();
  if (cleanRaw && options.length > 0) {
    const matchIdx = options.findIndex((opt) => (opt || '').trim().toLowerCase() === cleanRaw);
    if (matchIdx >= 0 && matchIdx <= 3) {
      const letter = ['A', 'B', 'C', 'D'][matchIdx] as 'A' | 'B' | 'C' | 'D';
      return {
        correctOptionIndex: matchIdx,
        canonicalAnswerLetter: letter,
        isValid: true,
        needsReview: false,
      };
    }
  }

  // Unresolved! Never default to 0 / Option A.
  return {
    correctOptionIndex: -1,
    canonicalAnswerLetter: null,
    isValid: false,
    needsReview: true,
    validationError: `Could not deterministically map correct answer "${rawAnswer ?? ''}" to any option.`,
  };
}
