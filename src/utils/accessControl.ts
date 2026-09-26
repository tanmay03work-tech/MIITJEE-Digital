import { AppUser, TestItem } from '../types';
import { isGrandTest } from '../services/api/publishedGrandTests';

export function getEligibility(user: AppUser | null, test: TestItem) {
  if (user?.role === 'admin') {
    return {
      allowed: true,
      label: 'Admin Access',
      reason: 'Admins can preview and attempt any published paper.',
      ctaLabel: 'Open Paper',
    };
  }

  if (isGrandTest(test.id, test.title)) {
    return {
      allowed: true,
      label: 'Open For All',
      reason: 'This grand test is open for all students across any batch.',
      ctaLabel: 'Start Paper',
    };
  }

  const isOpenForAll =
    test.isOpenForAll === true ||
    test.accessMode === 'OPEN_FOR_ALL' ||
    !test.batchId ||
    test.batchId.trim() === '' ||
    test.batchId === 'ALL' ||
    test.batchId.toLowerCase() === 'all batches' ||
    test.batchId.toLowerCase() === 'all';

  if (isOpenForAll) {
    return {
      allowed: true,
      label: 'Open For All',
      reason: 'This paper is open for all students. No batch restriction.',
      ctaLabel: 'Start Paper',
    };
  }

  if (test.type === 'scholarship') {
    if (user?.role === 'miitjee_student') {
      return {
        allowed: false,
        label: 'MIITJEE Students',
        reason: 'Scholarship papers are only for outside student registrations. MIITJEE batch students cannot attempt them.',
        ctaLabel: 'Not Available',
      };
    }

    return {
      allowed: true,
      label: 'Open for Registration',
      reason: 'Complete a short profile form to unlock this scholarship paper.',
      ctaLabel: 'Register & Continue',
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

  // Check allowedBatches array (PDF-native tests use this for multi-batch access)
  if (user.batchId && test.allowedBatches && test.allowedBatches.includes(user.batchId)) {
    return {
      allowed: true,
      label: user.role === 'miitjee_student' ? 'Ready' : 'Batch Match',
      reason: `This paper is available for your ${user.batchId} batch.`,
      ctaLabel: user.role === 'miitjee_student' ? 'Start Paper' : 'Open Paper',
    };
  }

  if (user.batchId && user.batchId !== test.batchId) {
    // If there are allowedBatches but user is not in any of them
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
