import { create } from 'zustand';

import { TestItem, TestQuestion } from '../types';
import { coerceDurationMinutes } from '../utils/formatters';

interface TestSessionState {
  test: TestItem | null;
  questions: TestQuestion[];
  answers: Record<string, string>;
  flaggedQuestionIds: string[];
  currentIndex: number;
  secondsRemaining: number;
  studentName: string | null;
  startSession: (test: TestItem, questions: TestQuestion[], studentName?: string) => void;
  updateQuestions: (questions: TestQuestion[]) => void;
  setStudentName: (name: string) => void;
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
  studentName: null,
};

export const useTestSessionStore = create<TestSessionState>((set, get) => ({
  ...initialState,
  startSession: (test, questions, studentName) =>
    set({
      test,
      questions,
      answers: {},
      flaggedQuestionIds: [],
      currentIndex: 0,
      secondsRemaining: coerceDurationMinutes(test.durationMinutes) * 60,
      studentName: studentName ?? get().studentName,
    }),
  updateQuestions: (questions) => set({ questions }),
  setStudentName: (name) => set({ studentName: name }),
  selectAnswer: (questionId, answer) =>
    set((state) => {
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
    set((state) => ({
      secondsRemaining: Math.max(state.secondsRemaining - 1, 0),
    })),
  reset: () => set(initialState),
}));
