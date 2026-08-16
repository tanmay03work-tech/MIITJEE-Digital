import { compareSemver } from '../updateChecker';

describe('compareSemver', () => {
  it('correctly identifies higher version', () => {
    expect(compareSemver('1.2.0', '1.1.0')).toBe(1);
    expect(compareSemver('2.0.0', '1.9.9')).toBe(1);
    expect(compareSemver('1.1.1', '1.1.0')).toBe(1);
  });

  it('correctly identifies lower version', () => {
    expect(compareSemver('1.0.0', '1.1.0')).toBe(-1);
    expect(compareSemver('1.1.0', '1.2.0')).toBe(-1);
  });

  it('correctly identifies equal version', () => {
    expect(compareSemver('1.1.0', '1.1.0')).toBe(0);
    expect(compareSemver('v1.1.0', '1.1.0')).toBe(0);
  });
});
