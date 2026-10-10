import {
  coerceDurationMinutes,
  formatClock,
  formatDuration,
  formatRemainingMinutes,
  initials,
  sanitizeDurationInput,
} from '../formatters';

describe('formatters utility', () => {
  test('coerceDurationMinutes handles numbers, strings, and invalid fallbacks', () => {
    expect(coerceDurationMinutes(45)).toBe(45);
    expect(coerceDurationMinutes('90 mins')).toBe(90);
    expect(coerceDurationMinutes(null)).toBe(60);
    expect(coerceDurationMinutes(-10, 30)).toBe(30);
  });

  test('sanitizeDurationInput strips non-numeric characters', () => {
    expect(sanitizeDurationInput('00120 mins')).toBe('120');
    expect(sanitizeDurationInput('abc')).toBe('');
  });

  test('formatDuration formats minutes into human readable string', () => {
    expect(formatDuration(45)).toBe('45 min');
    expect(formatDuration(60)).toBe('1h');
    expect(formatDuration(135)).toBe('2h 15m');
  });

  test('formatRemainingMinutes formats seconds remaining into minutes (e.g. 10740s -> 179 mins, not hours)', () => {
    expect(formatRemainingMinutes(10740)).toBe('179 mins');
    expect(formatRemainingMinutes(10800)).toBe('180 mins');
    expect(formatRemainingMinutes(60)).toBe('1 min');
    expect(formatRemainingMinutes(45)).toBe('1 min');
    expect(formatRemainingMinutes(0)).toBe('0 mins');
  });

  test('formatClock formats total seconds into clock display', () => {
    expect(formatClock(65)).toBe('01:05');
    expect(formatClock(3665)).toBe('01:01:05');
    expect(formatClock(-5)).toBe('00:00');
  });

  test('initials extracts uppercase initials from name string', () => {
    expect(initials('Rahul Sharma')).toBe('RS');
    expect(initials('Ananya')).toBe('A');
  });
});
