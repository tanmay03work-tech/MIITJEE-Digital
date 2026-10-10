import { create } from 'zustand';

import { TestItem, TestQuestion } from '../types';
import { coerceDurationMinutes } from '../utils/formatters';

export type ExamSubmissionState =
  | 'IN_PROGRESS'
  | 'TIME_EXPIRED'
  | 'SUBMITTING'
  | 'RETRY_PENDING'
  | 'SUBMITTED';

interface TestSessionState {
  test: TestItem | null;
  questions: TestQuestion[];
  answers: Record<string, string>;
  flaggedQuestionIds: string[];
  currentIndex: number;
  secondsRemaining: number;
  startedAt: string | null;
  expiresAt: string | null;
  studentName: string | null;
  submissionState: ExamSubmissionState;
  isFrozen: boolean;
  startSession: (
    test: TestItem,
    questions: TestQuestion[],
    studentName?: string,
    initialAnswers?: Record<string, string>,
    initialFlaggedIds?: string[],
    existingStartedAt?: string,
    existingExpiresAt?: string,
    initialSubmissionState?: ExamSubmissionState,
  ) => void;
  updateQuestions: (questions: TestQuestion[]) => void;
  setStudentName: (name: string) => void;
  setSubmissionState: (state: ExamSubmissionState) => void;
  selectAnswer: (questionId: string, answer: string) => void;
  clearResponse: (questionId: string) => void;
  toggleFlag: (questionId: string) => void;
  jumpTo: (index: number) => void;
  next: () => void;
  previous: () => void;
  tick: () => void;
  reset: () => void;
}

const initialState = {
  test: null,
  questions: [],
  answers: {},
  flaggedQuestionIds: [],
  currentIndex: 0,
  secondsRemaining: 0,
  startedAt: null,
  expiresAt: null,
  studentName: null,
  submissionState: 'IN_PROGRESS' as ExamSubmissionState,
  isFrozen: false,
};

export const useTestSessionStore = create<TestSessionState>((set, get) => ({
  ...initialState,
  startSession: (
    test,
    questions,
    studentName,
    initialAnswers,
    initialFlaggedIds,
    existingStartedAt,
    existingExpiresAt,
    initialSubmissionState,
  ) => {
    const durationSeconds = coerceDurationMinutes(test.durationMinutes) * 60;
    const now = Date.now();
    const startedAt = existingStartedAt || new Date(now).toISOString();
    const expiresAt = existingExpiresAt || new Date(now + durationSeconds * 1000).toISOString();
    const secondsRemaining = Math.max(
      0,
      Math.floor((new Date(expiresAt).getTime() - now) / 1000),
    );
    const submissionState =
      initialSubmissionState ?? (secondsRemaining === 0 ? 'TIME_EXPIRED' : 'IN_PROGRESS');
    const isFrozen = submissionState !== 'IN_PROGRESS';

    set({
      test,
      questions,
      answers: initialAnswers ?? {},
      flaggedQuestionIds: initialFlaggedIds ?? [],
      currentIndex: 0,
      startedAt,
      expiresAt,
      secondsRemaining,
      submissionState,
      isFrozen,
      studentName: studentName ?? get().studentName,
    });
  },
  updateQuestions: (questions) => set({ questions }),
  setStudentName: (name) => set({ studentName: name }),
  setSubmissionState: (submissionState) =>
    set({
      submissionState,
      isFrozen: submissionState !== 'IN_PROGRESS',
    }),
  selectAnswer: (questionId, answer) =>
    set((state) => {
      if (state.isFrozen || state.submissionState !== 'IN_PROGRESS') {
        return state;
      }
      const currentAnswer = state.answers[questionId];
      if (currentAnswer === answer) {
        const nextAnswers = { ...state.answers };
        delete nextAnswers[questionId];
        return { answers: nextAnswers };
      }

      return {
        answers: {
          ...state.answers,
          [questionId]: answer,
        },
      };
    }),
  clearResponse: (questionId) =>
    set((state) => {
      if (state.isFrozen || state.submissionState !== 'IN_PROGRESS') {
        return state;
      }
      const nextAnswers = { ...state.answers };
      delete nextAnswers[questionId];
      return { answers: nextAnswers };
    }),
  toggleFlag: (questionId) =>
    set((state) => ({
      flaggedQuestionIds: state.flaggedQuestionIds.includes(questionId)
        ? state.flaggedQuestionIds.filter((id) => id !== questionId)
        : [...state.flaggedQuestionIds, questionId],
    })),
  jumpTo: (index) => {
    const boundedIndex = Math.max(0, Math.min(index, get().questions.length - 1));
    set({ currentIndex: boundedIndex });
  },
  next: () => set((state) => ({ currentIndex: Math.min(state.currentIndex + 1, state.questions.length - 1) })),
  previous: () => set((state) => ({ currentIndex: Math.max(state.currentIndex - 1, 0) })),
  tick: () =>
    set((state) => {
      if (!state.expiresAt) {
        const nextSec = Math.max(state.secondsRemaining - 1, 0);
        return {
          secondsRemaining: nextSec,
          submissionState:
            nextSec === 0 && state.submissionState === 'IN_PROGRESS'
              ? 'TIME_EXPIRED'
              : state.submissionState,
          isFrozen: nextSec === 0 ? true : state.isFrozen,
        };
      }

      const now = Date.now();
      const expiresMs = new Date(state.expiresAt).getTime();
      const remaining = Math.max(0, Math.floor((expiresMs - now) / 1000));
      const shouldExpire = remaining === 0 && state.submissionState === 'IN_PROGRESS';

      return {
        secondsRemaining: remaining,
        submissionState: shouldExpire ? 'TIME_EXPIRED' : state.submissionState,
        isFrozen: shouldExpire ? true : state.isFrozen,
      };
    }),
  reset: () => set(initialState),
}));
