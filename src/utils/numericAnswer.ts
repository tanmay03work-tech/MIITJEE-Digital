const NUMERIC_ANSWER_PATTERN = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/;
const UNICODE_MINUS = /[\u2212\u2013\u2014]/g;
const NON_NUMERIC_SPACE = /[\s\u00A0\u202F]+/g;

export function normalizeNumericAnswer(value: unknown, allowIncomplete = false): string {
  const raw = String(value ?? '')
    .trim()
    .replace(UNICODE_MINUS, '-')
    .replace(/,/g, '.')
    .replace(NON_NUMERIC_SPACE, '');

  if (allowIncomplete && (raw === '-' || raw === '+' || raw === '.' || raw === '-.' || raw === '+.')) {
    return raw;
  }

  if (!NUMERIC_ANSWER_PATTERN.test(raw)) {
    return '';
  }

  const numericValue = Number(raw);
  return Number.isFinite(numericValue) ? String(numericValue) : '';
}

export function areNumericAnswersEquivalent(left: unknown, right: unknown): boolean {
  const normalizedLeft = normalizeNumericAnswer(left);
  const normalizedRight = normalizeNumericAnswer(right);

  if (!normalizedLeft || !normalizedRight) {
    return false;
  }

  return Math.abs(Number(normalizedLeft) - Number(normalizedRight)) < 1e-9;
}
