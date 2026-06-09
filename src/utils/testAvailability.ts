import { TestItem } from '../types';
import { formatDateTimeLabel } from './formatters';

export function isTestActive(test: Pick<TestItem, 'isStarted' | 'scheduledAt'>, now = Date.now()) {
  return test.isStarted || new Date(test.scheduledAt).getTime() <= now;
}

export function getTestStatusLabel(test: Pick<TestItem, 'isStarted' | 'scheduledAt'>) {
  return isTestActive(test) ? 'Active' : 'Locked';
}

export function getTestLockedMessage(test: Pick<TestItem, 'scheduledAt'>) {
  return `This paper will start at ${formatDateTimeLabel(test.scheduledAt)}. Have patience.`;
}
