export function sanitizeUserInput(input: string): string {
  return input
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/javascript:/gi, '')
    .replace(/on\w+\s*=/gi, '')
    .trim();
}

export function verifyStudentAccessRights(
  resource: 'DRAFT_TEST' | 'PUBLISHED_TEST' | 'QUESTION_BANK' | 'OWN_RESULT' | 'OTHER_USER_RESULT',
  userRole: 'student' | 'admin',
): boolean {
  if (userRole === 'admin') return true;

  switch (resource) {
    case 'DRAFT_TEST':
      return false; // Students cannot access drafts
    case 'QUESTION_BANK':
      return false; // Students cannot access raw question bank
    case 'OTHER_USER_RESULT':
      return false; // Students cannot view other users' private attempt details
    case 'PUBLISHED_TEST':
    case 'OWN_RESULT':
      return true;
    default:
      return false;
  }
}

describe('Phase 20 - Security & Data Integrity Tests', () => {
  test('Test 1: Student blocked from accessing DRAFT tests & raw Question Bank', () => {
    expect(verifyStudentAccessRights('DRAFT_TEST', 'student')).toBe(false);
    expect(verifyStudentAccessRights('QUESTION_BANK', 'student')).toBe(false);
    expect(verifyStudentAccessRights('OTHER_USER_RESULT', 'student')).toBe(false);

    expect(verifyStudentAccessRights('PUBLISHED_TEST', 'student')).toBe(true);
    expect(verifyStudentAccessRights('OWN_RESULT', 'student')).toBe(true);
  });

  test('Test 2: Admin granted full access to all resources', () => {
    expect(verifyStudentAccessRights('DRAFT_TEST', 'admin')).toBe(true);
    expect(verifyStudentAccessRights('QUESTION_BANK', 'admin')).toBe(true);
    expect(verifyStudentAccessRights('OTHER_USER_RESULT', 'admin')).toBe(true);
  });

  test('Test 3: XSS & Injection sanitization on user input strings', () => {
    const malicious = '<script>alert("hack")</script> What is E = mc2?';
    const sanitized = sanitizeUserInput(malicious);

    expect(Boolean(sanitized.includes('<script>'))).toBe(false);
    expect(sanitized).toBe('What is E = mc2?');
  });
});
