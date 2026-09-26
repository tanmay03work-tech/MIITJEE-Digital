import { TestItem } from '../types';
import { formatDateTimeLabel } from './formatters';
import { isGrandTest } from '../services/api/publishedGrandTests';

export function isTestActive(test: Pick<TestItem, 'isStarted' | 'scheduledAt'> & { id?: string; title?: string }, now = Date.now()) {
  if (isGrandTest(test.id, test.title)) {
    return true;
  }
  return test.isStarted || new Date(test.scheduledAt).getTime() <= now;
}

export function getTestStatusLabel(test: Pick<TestItem, 'isStarted' | 'scheduledAt'>) {
  return isTestActive(test) ? 'Active' : 'Locked';
}

export function getTestLockedMessage(test: Pick<TestItem, 'scheduledAt'>) {
  return `This paper will start at ${formatDateTimeLabel(test.scheduledAt)}. Have patience.`;
}
