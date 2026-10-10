import { normalizeExamText, formatExamTextForDisplay, parseExamTextSegments } from '../examText';

describe('examText utility and FormattedExamText parsing', () => {
  test('corrects combining upper arrow into canonical vector syntax', () => {
    // F followed by \u20D7 (combining right arrow above)
    const raw = 'The Coulomb force F\u20D7 between the two is';
    const normalized = normalizeExamText(raw);
    expect(normalized).toContain('\\vec{F}');

    const segments = parseExamTextSegments(raw);
    const vectorSeg = segments.find((s) => s.type === 'vector');
    expect(vectorSeg).toBeDefined();
    expect(vectorSeg?.content).toBe('F');
  });

  test('corrects vector E and unit vectors î and ĵ', () => {
    const raw = 'The electric field is E⃗ = (2/5)E0 î + (3/5)E0 ĵ';
    const normalized = normalizeExamText(raw);
    expect(normalized).toContain('\\vec{E}');
    expect(normalized).toContain('\\hat{i}');
    expect(normalized).toContain('\\hat{j}');

    const segments = parseExamTextSegments(raw);
    const vectorSeg = segments.find((s) => s.type === 'vector' && s.content === 'E');
    expect(vectorSeg).toBeDefined();

    const hatSeg = segments.find((s) => s.type === 'hat' && s.content === 'i');
    expect(hatSeg).toBeDefined();
  });

  test('normalizes LaTeX arrows and math symbols', () => {
    const raw = 'When x \\rightarrow 0, f(x) \\approx \\pm \\sqrt{x}';
    const normalized = normalizeExamText(raw);
    expect(normalized).toContain('→');
    expect(normalized).toContain('≈');
    expect(normalized).toContain('±');
    expect(normalized).toContain('√(x)');
  });

  test('repairs mojibake characters', () => {
    const raw = 'â‰¤ and â‰¥ and âˆ’ and â†’ and Â² and Î¼';
    const normalized = normalizeExamText(raw);
    expect(normalized).toContain('≤');
    expect(normalized).toContain('≥');
    expect(normalized).toContain('−');
    expect(normalized).toContain('→');
    expect(normalized).toContain('²');
    expect(normalized).toContain('μ');
  });
});
