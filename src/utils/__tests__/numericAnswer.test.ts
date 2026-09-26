import { areNumericAnswersEquivalent, normalizeNumericAnswer } from '../numericAnswer';

describe('numeric answers', () => {
  it('normalizes valid integer-style numeric input', () => {
    expect(normalizeNumericAnswer(' 005 ')).toBe('5');
    expect(normalizeNumericAnswer('5.0')).toBe('5');
    expect(normalizeNumericAnswer('1,25')).toBe('1.25');
  });

  it('removes ordinary and copied whitespace', () => {
    expect(normalizeNumericAnswer('  42  ')).toBe('42');
    expect(normalizeNumericAnswer('4\u00A02')).toBe('42');
    expect(normalizeNumericAnswer('4\u202F2')).toBe('42');
  });

  it('accepts alternate minus characters', () => {
    expect(normalizeNumericAnswer('\u22122')).toBe('-2');
    expect(normalizeNumericAnswer('\u20132')).toBe('-2');
    expect(normalizeNumericAnswer('\u20142')).toBe('-2');
  });

  it('supports incomplete valid input while the student is typing', () => {
    expect(normalizeNumericAnswer('-', true)).toBe('-');
    expect(normalizeNumericAnswer('-.', true)).toBe('-.');
    expect(normalizeNumericAnswer('-', false)).toBe('');
  });

  it('compares equivalent numeric representations', () => {
    expect(areNumericAnswersEquivalent(' 5 ', '5.0')).toBe(true);
    expect(areNumericAnswersEquivalent('\u22122', '-2')).toBe(true);
    expect(areNumericAnswersEquivalent('1,25', '1.25')).toBe(true);
    expect(areNumericAnswersEquivalent('5', '6')).toBe(false);
  });
});
