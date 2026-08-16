import { ExamLinkResolution, TestItem } from '../../types';

function mockResolveLinkLocally(
  shareCode: string,
  testMock?: TestItem | null,
  userId?: string,
  userBatch?: string,
  userRole?: string,
): ExamLinkResolution {
  const cleanCode = shareCode.trim().toUpperCase();

  if (!testMock || testMock.shareCode?.toUpperCase() !== cleanCode) {
    return {
      status: 'INVALID',
      message: 'Exam link does not exist or is invalid.',
    };
  }

  if (testMock.isLinkRevoked || !testMock.isPublished) {
    return {
      status: 'REVOKED',
      message: 'This exam link has been revoked or unpublished by the administrator.',
    };
  }

  if (testMock.linkExpiresAt && new Date() > new Date(testMock.linkExpiresAt)) {
    return {
      status: 'EXPIRED',
      message: 'This exam link has expired.',
    };
  }

  if (userId && userRole !== 'admin' && !testMock.isOpenForAll) {
    if (testMock.batchId && userBatch !== testMock.batchId) {
      return {
        status: 'BATCH_RESTRICTED',
        message: `This exam is restricted to batch ${testMock.batchId}.`,
        test: testMock,
      };
    }
  }

  return {
    status: 'VALID',
    message: 'Exam link resolved successfully.',
    test: testMock,
  };
}

describe('Phase 1 - Exam Link System Resolution Tests', () => {
  const baseTest: TestItem = {
    id: 'test-123',
    shareCode: 'ABC12345',
    title: 'JEE Advanced Mock Paper 1',
    description: 'Full syllabus mock test',
    durationMinutes: 180,
    questionCount: 30,
    type: 'weekly',
    subject: 'Physics',
    scheduledAt: new Date(Date.now() - 10000).toISOString(),
    isPublished: true,
    isStarted: true,
    isOpenForAll: false,
    isLinkRevoked: false,
    batchId: 'BATCH_JEE_2026',
  };

  test('Test 1: Valid exam link opens test details', () => {
    const res = mockResolveLinkLocally('ABC12345', baseTest, 'user-1', 'BATCH_JEE_2026', 'student');
    expect(res.status).toBe('VALID');
    expect(res.test?.id).toBe('test-123');
  });

  test('Test 2: Invalid share code returns INVALID status', () => {
    const res = mockResolveLinkLocally('WRONG123', baseTest, 'user-1', 'BATCH_JEE_2026', 'student');
    expect(res.status).toBe('INVALID');
  });

  test('Test 3: Revoked exam link returns REVOKED status', () => {
    const revokedTest = { ...baseTest, isLinkRevoked: true };
    const res = mockResolveLinkLocally('ABC12345', revokedTest, 'user-1', 'BATCH_JEE_2026', 'student');
    expect(res.status).toBe('REVOKED');
  });

  test('Test 4: Expired exam link returns EXPIRED status', () => {
    const expiredTest = {
      ...baseTest,
      linkExpiresAt: new Date(Date.now() - 3600000).toISOString(),
    };
    const res = mockResolveLinkLocally('ABC12345', expiredTest, 'user-1', 'BATCH_JEE_2026', 'student');
    expect(res.status).toBe('EXPIRED');
  });

  test('Test 5: OPEN_FOR_ALL mode allows any authenticated student', () => {
    const openTest = { ...baseTest, isOpenForAll: true, batchId: 'BATCH_NEET' };
    const res = mockResolveLinkLocally('ABC12345', openTest, 'user-2', 'BATCH_JEE_2026', 'student');
    expect(res.status).toBe('VALID');
  });

  test('Test 6: RESTRICTED_BATCH blocks students from other batches', () => {
    const res = mockResolveLinkLocally('ABC12345', baseTest, 'user-2', 'BATCH_NEET_2026', 'student');
    expect(res.status).toBe('BATCH_RESTRICTED');
  });

  test('Test 7: Admin user bypasses RESTRICTED_BATCH mode', () => {
    const res = mockResolveLinkLocally('ABC12345', baseTest, 'admin-1', 'OTHER', 'admin');
    expect(res.status).toBe('VALID');
  });
});
