function getEligibility(user, test) {
  if (user?.role === 'admin' && user.approvalStatus === 'approved') {
    return {
      allowed: true,
      label: 'Admin Access',
      reason: 'Approved admins can preview and attempt any published paper.',
      ctaLabel: 'Open Paper',
    };
  }

  const isExplicitRestricted =
    test.accessMode === 'RESTRICTED_BATCH' ||
    test.isOpenForAll === false ||
    (test.allowedBatches && test.allowedBatches.length > 0);

  const isOpenForAll =
    !isExplicitRestricted &&
    (Boolean(test.isOpenForAll) ||
      test.accessMode === 'OPEN_FOR_ALL' ||
      !test.batchId ||
      test.batchId.trim() === '' ||
      test.batchId === 'ALL' ||
      test.batchId.toLowerCase() === 'all batches' ||
      test.batchId.toLowerCase() === 'all');

  if (isOpenForAll) {
    return {
      allowed: true,
      label: 'Open For All',
      reason: 'This paper is open for all students across any batch.',
      ctaLabel: 'Start Paper',
    };
  }

  if (!user) {
    return {
      allowed: false,
      label: 'Sign In First',
      reason: 'Sign in to view your batch access and request enrollment for weekly papers.',
      ctaLabel: 'Sign In',
    };
  }

  if (user.batchId && user.batchId === test.batchId) {
    return {
      allowed: true,
      label: user.role === 'miitjee_student' ? 'Ready' : 'Batch Match',
      reason: `This paper is active for your ${test.batchId} batch.`,
      ctaLabel: user.role === 'miitjee_student' ? 'Start Paper' : 'Open Paper',
    };
  }

  if (user.batchId && test.allowedBatches && test.allowedBatches.includes(user.batchId)) {
    return {
      allowed: true,
      label: user.role === 'miitjee_student' ? 'Ready' : 'Batch Match',
      reason: `This paper is available for your ${user.batchId} batch.`,
      ctaLabel: user.role === 'miitjee_student' ? 'Start Paper' : 'Open Paper',
    };
  }

  if (user.batchId && user.batchId !== test.batchId) {
    if (test.allowedBatches && test.allowedBatches.length > 0) {
      return {
        allowed: false,
        label: 'Different Batch',
        reason: `You are enrolled in ${user.batchId}. This paper is restricted to: ${test.allowedBatches.join(', ')}.`,
        ctaLabel: 'Different Batch',
      };
    }
    return {
      allowed: false,
      label: 'Different Batch',
      reason: `You are enrolled in ${user.batchId}. This weekly paper belongs to ${test.batchId}.`,
      ctaLabel: 'Different Batch',
    };
  }

  return {
    allowed: false,
    label: 'Batch Access Needed',
    reason: 'Weekly papers are available only after batch enrollment is approved by the admin team.',
    ctaLabel: 'Request Batch Access',
  };
}

const genesisTest = {
  id: 'pdf_test_genesis_neet_11',
  title: 'Genesis Morning Batch',
  isOpenForAll: false,
  batchId: 'GENESIS',
  allowedBatches: ['GENESIS'],
  accessMode: 'RESTRICTED_BATCH',
};

console.log('1. Genesis Student Access:');
console.log(getEligibility({ role: 'miitjee_student', batchId: 'GENESIS', approvalStatus: 'approved' }, genesisTest));

console.log('\n2. Elevator Student Trying to Access Genesis:');
console.log(getEligibility({ role: 'miitjee_student', batchId: 'ELEVATOR', approvalStatus: 'approved' }, genesisTest));

console.log('\n3. Admin Access:');
console.log(getEligibility({ role: 'admin', approvalStatus: 'approved' }, genesisTest));
