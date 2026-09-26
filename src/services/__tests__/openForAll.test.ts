export interface ExamAccessCheck {
  isOpenForAll: boolean;
  assignedBatchId?: string;
  userBatchId?: string;
  userRole: 'student' | 'admin';
}

export function evaluateExamAccess(check: ExamAccessCheck): { allowed: boolean; reason: string } {
  // Admin always allowed
  if (check.userRole === 'admin') {
    return { allowed: true, reason: 'Admin Access Granted' };
  }

  // Open for All exams allowed for any authenticated student regardless of batch
  if (check.isOpenForAll) {
    return { allowed: true, reason: 'Open For All Exam Access Granted' };
  }

  // No batch restriction set on test
  if (!check.assignedBatchId) {
    return { allowed: true, reason: 'No Batch Restriction' };
  }

  // Batch match
  if (check.userBatchId === check.assignedBatchId) {
    return { allowed: true, reason: 'Batch Membership Confirmed' };
  }

  // Access denied for non-matching batch student on restricted test
  return {
    allowed: false,
    reason: `This exam is restricted to members of batch ${check.assignedBatchId}.`,
  };
}

describe('Phase 13 - Open-For-All Access Control Tests', () => {
  test('Test 1: Non-batch student accesses Open For All exam -> SUCCESS', () => {
    const result = evaluateExamAccess({
      isOpenForAll: true,
      assignedBatchId: 'BATCH_JEE_ADV_2026',
      userBatchId: 'BATCH_NEET_2026',
      userRole: 'student',
    });

    expect(result.allowed).toBe(true);
    expect(Boolean(result.reason.includes('Open For All'))).toBe(true);
  });

  test('Test 2: Non-batch student accesses Restricted exam -> ACCESS DENIED', () => {
    const result = evaluateExamAccess({
      isOpenForAll: false,
      assignedBatchId: 'BATCH_JEE_ADV_2026',
      userBatchId: 'BATCH_NEET_2026',
      userRole: 'student',
    });

    expect(result.allowed).toBe(false);
    expect(Boolean(result.reason.includes('restricted to members of batch BATCH_JEE_ADV_2026'))).toBe(true);
  });

  test('Test 3: Batch member student accesses Restricted exam -> SUCCESS', () => {
    const result = evaluateExamAccess({
      isOpenForAll: false,
      assignedBatchId: 'BATCH_JEE_ADV_2026',
      userBatchId: 'BATCH_JEE_ADV_2026',
      userRole: 'student',
    });

    expect(result.allowed).toBe(true);
    expect(Boolean(result.reason.includes('Batch Membership Confirmed'))).toBe(true);
  });

  test('Test 4: Admin accesses any exam regardless of batch restriction -> SUCCESS', () => {
    const result = evaluateExamAccess({
      isOpenForAll: false,
      assignedBatchId: 'BATCH_EXCLUSIVE',
      userBatchId: undefined,
      userRole: 'admin',
    });

    expect(result.allowed).toBe(true);
    expect(Boolean(result.reason.includes('Admin Access'))).toBe(true);
  });

  test('Test 5: Student without any batch assignment accesses Open For All exam -> SUCCESS', () => {
    const result = evaluateExamAccess({
      isOpenForAll: true,
      assignedBatchId: undefined,
      userBatchId: undefined,
      userRole: 'student',
    });

    expect(result.allowed).toBe(true);
    expect(Boolean(result.reason.includes('Open For All'))).toBe(true);
  });

  test('Test 6: Weekly test open for all is accessible to any student role via getEligibility', () => {
    const { getEligibility } = require('../../utils/accessControl');
    const weeklyOpenTest = {
      id: 'test_weekly_open_1',
      title: 'Weekly Mock Test - Open For All',
      description: 'Weekly test open for everyone',
      durationMinutes: 60,
      questionCount: 25,
      type: 'weekly' as const,
      subject: 'Physics',
      scheduledAt: new Date().toISOString(),
      isPublished: true,
      isStarted: true,
      isOpenForAll: true,
      batchId: undefined,
      accessMode: 'OPEN_FOR_ALL' as const,
    };

    // 1. Regular student with no batch
    const studentNoBatch = { id: 'u1', fullName: 'A', phone: '123', email: 'a@test.com', role: 'student' as const, batchId: undefined, createdAt: '' };
    expect(getEligibility(studentNoBatch, weeklyOpenTest).allowed).toBe(true);
    expect(getEligibility(studentNoBatch, weeklyOpenTest).ctaLabel).toBe('Start Paper');

    // 2. MIITJEE student in different batch
    const miitjeeStudent = { id: 'u2', fullName: 'B', phone: '123', email: 'b@test.com', role: 'miitjee_student' as const, batchId: 'BATCH_NEET_2026', createdAt: '' };
    expect(getEligibility(miitjeeStudent, weeklyOpenTest).allowed).toBe(true);
    expect(getEligibility(miitjeeStudent, weeklyOpenTest).ctaLabel).toBe('Start Paper');

    // 3. Admin user
    const adminUser = { id: 'u3', fullName: 'Admin', phone: '123', email: 'admin@test.com', role: 'admin' as const, createdAt: '' };
    expect(getEligibility(adminUser, weeklyOpenTest).allowed).toBe(true);

    // 4. Guest / Unauthenticated student
    expect(getEligibility(null, weeklyOpenTest).allowed).toBe(true);
    expect(getEligibility(null, weeklyOpenTest).ctaLabel).toBe('Start Paper');
  });
});
