import { TestQuestion } from '../../types';

function buildPreservedQuestion(raw: {
  id: string;
  prompt: string;
  options: string[];
  imageUrl?: string | null;
  optionImageUrls?: string[];
  sourcePage?: number;
  sourceRegion?: string | null;
}): TestQuestion {
  return {
    id: raw.id,
    testId: 'test-demo',
    type: 'mcq',
    prompt: raw.prompt,
    options: raw.options,
    correctAnswer: raw.options[0] || '',
    explanation: 'Extracted explanation',
    imageUrl: raw.imageUrl ? `https://storage.miitjee.org/exam-assets/${raw.imageUrl}` : undefined,
    optionImageUrls: raw.optionImageUrls
      ? raw.optionImageUrls.map((img) => `https://storage.miitjee.org/exam-assets/${img}`)
      : undefined,
    sourcePage: raw.sourcePage ?? 1,
    sourceRegion: raw.sourceRegion ?? null,
  };
}

describe('Phase 5 - Diagram & Image Preservation Tests', () => {
  test('Test 1: Question level diagram association & R2 storage URL', () => {
    const q = buildPreservedQuestion({
      id: 'q1',
      prompt: 'Identify the circuit component shown below.',
      options: ['Resistor', 'Capacitor', 'Inductor', 'Diode'],
      imageUrl: 'diagrams/circuit_fig1.png',
      sourcePage: 3,
      sourceRegion: 'x:50,y:120,w:400,h:250',
    });

    expect(q.imageUrl).toBe('https://storage.miitjee.org/exam-assets/diagrams/circuit_fig1.png');
    expect(q.sourcePage).toBe(3);
    expect(q.sourceRegion).toBe('x:50,y:120,w:400,h:250');
  });

  test('Test 2: Image-based options (A, B, C, D) mapping', () => {
    const q = buildPreservedQuestion({
      id: 'q2',
      prompt: 'Which graph represents Ohm’s Law V vs I?',
      options: ['Graph A', 'Graph B', 'Graph C', 'Graph D'],
      imageUrl: null,
      optionImageUrls: [
        'options/opt_a.png',
        'options/opt_b.png',
        'options/opt_c.png',
        'options/opt_d.png',
      ],
      sourcePage: 5,
    });

    expect(q.optionImageUrls?.length).toBe(4);
    expect(q.optionImageUrls?.[0]).toBe('https://storage.miitjee.org/exam-assets/options/opt_a.png');
    expect(q.optionImageUrls?.[3]).toBe('https://storage.miitjee.org/exam-assets/options/opt_d.png');
  });
});
