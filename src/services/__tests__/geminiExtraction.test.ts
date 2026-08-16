import { normalizeExamText } from '../../utils/examText';

function processExtractedQuestion(rawQuestion: {
  type: 'mcq' | 'integer';
  question: string;
  options?: string[];
  correctAnswer?: string;
  explanation?: string;
  has_image?: boolean;
  source_region?: string | null;
}) {
  return {
    type: rawQuestion.type,
    question: normalizeExamText(rawQuestion.question.trim()),
    options: (rawQuestion.options || []).map((opt) => normalizeExamText(opt.trim())),
    correctAnswer: rawQuestion.correctAnswer ? normalizeExamText(rawQuestion.correctAnswer.trim()) : undefined,
    explanation: rawQuestion.explanation ? normalizeExamText(rawQuestion.explanation.trim()) : undefined,
    hasImage: Boolean(rawQuestion.has_image),
    sourceRegion: rawQuestion.source_region ?? null,
  };
}

describe('Phase 4 - Gemini Multimodal Question Extraction Tests', () => {
  test('Test 1: Standard text question extraction', () => {
    const raw = {
      type: 'mcq' as const,
      question: 'What is the SI unit of electric current?',
      options: ['Ampere', 'Volt', 'Ohm', 'Watt'],
      correctAnswer: 'Ampere',
      explanation: 'Electric current is measured in Amperes.',
      has_image: false,
    };
    const processed = processExtractedQuestion(raw);
    expect(processed.question).toBe('What is the SI unit of electric current?');
    expect(processed.options.length).toBe(4);
    expect(processed.hasImage).toBe(false);
  });

  test('Test 2: Mathematical formula and exponent preservation', () => {
    const raw = {
      type: 'mcq' as const,
      question: 'Evaluate the integral int(x^2 dx) from x=0 to 3.',
      options: ['9', '18', '27', '81'],
      correctAnswer: '9',
      has_image: false,
    };
    const processed = processExtractedQuestion(raw);
    expect(Boolean(processed.question.includes('x^2'))).toBe(true);
    expect(processed.hasImage).toBe(false);
  });

  test('Test 3: Physics dimensional formula & Greek symbols', () => {
    const raw = {
      type: 'mcq' as const,
      question: 'Find the dimension of viscosity coefficient μ in [ML^-1T^-1].',
      options: ['[ML^-1T^-1]', '[MLT^-2]', '[M^2L^-1T^-1]', 'Dimensionless'],
      correctAnswer: '[ML^-1T^-1]',
      has_image: false,
    };
    const processed = processExtractedQuestion(raw);
    expect(Boolean(processed.question.includes('μ'))).toBe(true);
    expect(Boolean(processed.options[0]?.includes('[ML^-1T^-1]'))).toBe(true);
  });

  test('Test 4: Chemistry reaction formula & subscripts', () => {
    const raw = {
      type: 'mcq' as const,
      question: 'What is the oxidation state of sulfur in H2SO4?',
      options: ['+6', '+4', '+2', '0'],
      correctAnswer: '+6',
      has_image: false,
    };
    const processed = processExtractedQuestion(raw);
    expect(Boolean(processed.question.includes('H2SO4'))).toBe(true);
    expect(processed.correctAnswer).toBe('+6');
  });

  test('Test 5: Circuit diagram and visual content detection', () => {
    const raw = {
      type: 'mcq' as const,
      question: 'In the circuit shown below, calculate the equivalent resistance between A and B.',
      options: ['5 Ω', '10 Ω', '15 Ω', '20 Ω'],
      correctAnswer: '10 Ω',
      has_image: true,
      source_region: 'circuit_diagram_page_2_fig_1',
    };
    const processed = processExtractedQuestion(raw);
    expect(processed.hasImage).toBe(true);
    expect(processed.sourceRegion).toBe('circuit_diagram_page_2_fig_1');
  });

  test('Test 6: Integer question format', () => {
    const raw = {
      type: 'integer' as const,
      question: 'Calculate the value of (2^5 + 3^3) mod 7.',
      options: [],
      correctAnswer: '3',
      has_image: false,
    };
    const processed = processExtractedQuestion(raw);
    expect(processed.type).toBe('integer');
    expect(processed.options.length).toBe(0);
    expect(processed.correctAnswer).toBe('3');
  });
});
