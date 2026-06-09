import { AppUser, TestItem } from '../types';

export function getEligibility(user: AppUser | null, test: TestItem) {
  if (user?.role === 'admin' && user.approvalStatus === 'approved') {
    return {
      allowed: true,
      label: 'Admin Access',
      reason: 'Approved admins can preview and attempt any published paper.',
      ctaLabel: 'Open Paper',
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

  if (user.batchId && user.batchId !== test.batchId) {
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
