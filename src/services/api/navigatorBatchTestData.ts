import { TestItem, TestQuestion } from '../../types';

export const NAVIGATOR_BATCH_TEST_ID = '';
export const LEGACY_NAVIGATOR_BATCH_TEST_ID = '';

export function isNavigatorBatchTest(_id?: string | null, _title?: string | null): boolean {
  return false;
}

export const NAVIGATOR_BATCH_TEST_ITEM: TestItem = {
  id: '',
  title: '',
  description: '',
  durationMinutes: 0,
  questionCount: 0,
  type: 'weekly',
  subject: '',
  scheduledAt: '',
  isPublished: false,
  isStarted: false,
  isOpenForAll: false,
  accessMode: 'RESTRICTED_BATCH',
  correctMarks: 4,
  wrongMarks: 1,
  unattemptedMarks: 0,
};

export function getNavigatorBatchQuestions(_targetTestId?: string): TestQuestion[] {
  return [];
}

export const NAVIGATOR_BATCH_QUESTIONS: TestQuestion[] = [];
