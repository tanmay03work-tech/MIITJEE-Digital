function mockResolveLinkLocally(
  shareCode,
  testMock,
  userId,
  userBatch,
  userRole
) {
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

const baseTest = {
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

const tests = [
  { name: '1. Valid Link', run: () => mockResolveLinkLocally('ABC12345', baseTest, 'u1', 'BATCH_JEE_2026', 'student').status === 'VALID' },
  { name: '2. Invalid Link', run: () => mockResolveLinkLocally('WRONG', baseTest, 'u1', 'BATCH_JEE_2026', 'student').status === 'INVALID' },
  { name: '3. Revoked Link', run: () => mockResolveLinkLocally('ABC12345', { ...baseTest, isLinkRevoked: true }, 'u1', 'BATCH_JEE_2026', 'student').status === 'REVOKED' },
  { name: '4. Expired Link', run: () => mockResolveLinkLocally('ABC12345', { ...baseTest, linkExpiresAt: new Date(Date.now() - 3600000).toISOString() }, 'u1', 'BATCH_JEE_2026', 'student').status === 'EXPIRED' },
  { name: '5. Open For All', run: () => mockResolveLinkLocally('ABC12345', { ...baseTest, isOpenForAll: true }, 'u2', 'NEET', 'student').status === 'VALID' },
  { name: '6. Restricted Batch Block', run: () => mockResolveLinkLocally('ABC12345', baseTest, 'u2', 'NEET', 'student').status === 'BATCH_RESTRICTED' },
  { name: '7. Admin Bypass', run: () => mockResolveLinkLocally('ABC12345', baseTest, 'admin1', 'OTHER', 'admin').status === 'VALID' },
];

console.log('--- PHASE 1 EXAM LINK TEST RESULTS ---');
let passed = 0;
tests.forEach((t) => {
  const ok = t.run();
  if (ok) passed++;
  console.log(`${t.name}: ${ok ? 'PASS' : 'FAIL'}`);
});
console.log(`Summary: ${passed}/${tests.length} tests passed.`);
if (passed !== tests.length) process.exit(1);
