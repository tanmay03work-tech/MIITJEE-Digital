/**
 * Local-First CBT Session Store (Zustand)
 * Manages zero-latency local exam state, questions, timer, local persistence, and background sync worker.
 */

import { create } from 'zustand';
import { registerDeviceBinding } from '../services/cbt/deviceBinding';
import { CbtBackgroundSyncWorker } from '../services/cbt/backgroundSyncWorker';
import { activityLog } from '../services/api/activityLogger';
import {
  LocalAnswerRecord,
  LocalSessionState,
  loadLocalCbtSession,
  pushToSyncQueue,
  saveLocalCbtSession
} from '../services/cbt/localStorageEngine';
import { executeSafeSubmission, SubmissionResult } from '../services/cbt/safeSubmissionEngine';

export interface CbtQuestion {
  id: string;
  question: string;
  options: string[];
  type: string;
  explanation?: string;
  subject?: string;
}

export interface CbtState {
  // Session details
  sessionId: string | null;
  testId: string | null;
  userId: string | null;
  durationMinutes: number;
  timeRemainingSeconds: number;
  isTimerRunning: boolean;
  isSubmitted: boolean;
  isOfflinePending: boolean;

  // Question & Navigation State
  questions: CbtQuestion[];
  currentQuestionIndex: number;
  answers: Record<string, LocalAnswerRecord>;
  unSyncedVersion: number;

  // Status flags
  deviceStatus: 'INITIALIZING' | 'VERIFIED' | 'DEVICE_MISMATCH' | 'ERROR';
  deviceMessage: string | null;
  syncStatus: 'IDLE' | 'SYNCING' | 'SYNCED' | 'OFFLINE_BUFFER';
  lastSyncedAt: string | null;

  // Actions
  initializeSession: (userId: string, testId: string, durationMinutes: number, questions: CbtQuestion[]) => Promise<boolean>;
  selectOption: (questionId: string, optionIndex: number | string | null) => void;
  toggleFlag: (questionId: string) => void;
  setCurrentQuestionIndex: (index: number) => void;
  tickTimer: () => void;
  submitExam: () => Promise<SubmissionResult>;
  resetStore: () => void;
}

let syncWorker: CbtBackgroundSyncWorker | null = null;
let timerInterval: ReturnType<typeof setInterval> | null = null;

export const useCbtSessionStore = create<CbtState>((set, get) => ({
  sessionId: null,
  testId: null,
  userId: null,
  durationMinutes: 180,
  timeRemainingSeconds: 180 * 60,
  isTimerRunning: false,
  isSubmitted: false,
  isOfflinePending: false,

  questions: [],
  currentQuestionIndex: 0,
  answers: {},
  unSyncedVersion: 1,

  deviceStatus: 'INITIALIZING',
  deviceMessage: null,
  syncStatus: 'IDLE',
  lastSyncedAt: null,

  initializeSession: async (userId, testId, durationMinutes, questions) => {
    set({ deviceStatus: 'INITIALIZING', userId, testId, questions, durationMinutes });

    // Step 1: Register/Verify Device Binding
    const bindResult = await registerDeviceBinding(userId);
    if (!bindResult.success) {
      set({
        deviceStatus: 'DEVICE_MISMATCH',
        deviceMessage: bindResult.message || 'Device binding error'
      });
      activityLog.logAuth('DEVICE_MISMATCH', {
        userId,
        status: 'failed',
        reason: bindResult.message || 'Computer is bound to another student account.',
        suggestedFix: 'Use the registered computer or ask Admin to reset your registered device.',
      });
      return false;
    }

    set({ deviceStatus: 'VERIFIED', deviceMessage: null });

    // Step 2: Check Local Disaster Recovery Session
    const generatedSessionId = `SESSION-${userId}-${testId}`;
    const recoveredSession = await loadLocalCbtSession(generatedSessionId);

    let initialAnswers: Record<string, LocalAnswerRecord> = {};
    let initialTime = durationMinutes * 60;
    let initialVersion = 1;
    let isAlreadySubmitted = false;

    if (recoveredSession) {
      initialAnswers = recoveredSession.answers || {};
      initialTime = recoveredSession.time_remaining_seconds;
      initialVersion = recoveredSession.un_synced_version;
      isAlreadySubmitted = recoveredSession.is_submitted;
    }

    set({
      sessionId: generatedSessionId,
      timeRemainingSeconds: initialTime,
      answers: initialAnswers,
      unSyncedVersion: initialVersion,
      isSubmitted: isAlreadySubmitted,
      isTimerRunning: !isAlreadySubmitted
    });

    if (!isAlreadySubmitted) {
      activityLog.logExam('EXAM_STARTED', {
        userId,
        testId,
        status: 'success',
        timeRemaining: initialTime,
      });
    }

    // Step 3: Start Background Sync Worker (10s Jittered Batch Sync)
    if (!isAlreadySubmitted) {
      if (syncWorker) syncWorker.stop();

      syncWorker = new CbtBackgroundSyncWorker({
        sessionId: generatedSessionId,
        userId,
        testId,
        baseIntervalMs: 10_000,
        getTimeRemainingSeconds: () => get().timeRemainingSeconds,
        getAllLocalAnswers: () => get().answers,
        onSyncSuccess: (ver, serverTime) => {
          set({ syncStatus: 'SYNCED', lastSyncedAt: serverTime });
        },
        onSyncError: () => {
          set({ syncStatus: 'OFFLINE_BUFFER' });
        }
      });

      syncWorker.start();
    }

    // Step 4: Start Countdown Timer
    if (timerInterval) clearInterval(timerInterval);
    timerInterval = setInterval(() => {
      get().tickTimer();
    }, 1000);

    return true;
  },

  selectOption: (questionId, optionValue) => {
    const { answers, unSyncedVersion, sessionId } = get();
    const newVersion = unSyncedVersion + 1;
    const selectedOptionStr = optionValue === null ? null : String(optionValue);

    const updatedRecord: LocalAnswerRecord = {
      question_id: questionId,
      selected_option: selectedOptionStr,
      status: selectedOptionStr === null ? 'unanswered' : 'answered',
      version_id: newVersion,
      client_timestamp: new Date().toISOString()
    };

    const newAnswers = { ...answers, [questionId]: updatedRecord };

    // 0ms In-Memory Update
    set({
      answers: newAnswers,
      unSyncedVersion: newVersion,
      syncStatus: 'SYNCING'
    });

    // Async Local Storage Write & Queue Push
    if (sessionId) {
      pushToSyncQueue(sessionId, updatedRecord);
      const stateToPersist: LocalSessionState = {
        session_id: sessionId,
        test_id: get().testId || '',
        user_id: get().userId || '',
        time_remaining_seconds: get().timeRemainingSeconds,
        duration_minutes: get().durationMinutes,
        answers: newAnswers,
        un_synced_version: newVersion,
        last_saved_at: new Date().toISOString(),
        is_submitted: get().isSubmitted,
        is_offline_submission_pending: get().isOfflinePending
      };
      saveLocalCbtSession(stateToPersist);
    }
  },

  toggleFlag: (questionId) => {
    const { answers, unSyncedVersion, sessionId } = get();
    const current = answers[questionId];
    const newStatus = current?.status === 'flagged' ? (current.selected_option ? 'answered' : 'unanswered') : 'flagged';
    const newVersion = unSyncedVersion + 1;

    const updatedRecord: LocalAnswerRecord = {
      question_id: questionId,
      selected_option: current?.selected_option ?? null,
      status: newStatus,
      version_id: newVersion,
      client_timestamp: new Date().toISOString()
    };

    const newAnswers = { ...answers, [questionId]: updatedRecord };

    set({ answers: newAnswers, unSyncedVersion: newVersion });

    if (sessionId) {
      pushToSyncQueue(sessionId, updatedRecord);
    }
  },

  setCurrentQuestionIndex: (index) => {
    set({ currentQuestionIndex: index });
  },

  tickTimer: () => {
    const { timeRemainingSeconds, isTimerRunning, isSubmitted } = get();
    if (!isTimerRunning || isSubmitted) return;

    if (timeRemainingSeconds <= 1) {
      set({ timeRemainingSeconds: 0, isTimerRunning: false });
      get().submitExam();
    } else {
      set({ timeRemainingSeconds: timeRemainingSeconds - 1 });
    }
  },

  submitExam: async () => {
    const state = get();
    if (state.isSubmitted) {
      return {
        success: true,
        status: 'SUBMITTED_SYNCED',
        message: 'Exam is already submitted.'
      };
    }

    // Stop timer and sync worker
    set({ isTimerRunning: false, isSubmitted: true });
    if (syncWorker) syncWorker.stop();
    if (timerInterval) clearInterval(timerInterval);

    const sessionStateToSubmit: LocalSessionState = {
      session_id: state.sessionId || '',
      test_id: state.testId || '',
      user_id: state.userId || '',
      time_remaining_seconds: state.timeRemainingSeconds,
      duration_minutes: state.durationMinutes,
      answers: state.answers,
      un_synced_version: state.unSyncedVersion,
      last_saved_at: new Date().toISOString(),
      is_submitted: true,
      is_offline_submission_pending: false
    };

    const isAutoSubmit = state.timeRemainingSeconds <= 0;

    const result = await executeSafeSubmission(sessionStateToSubmit);
    if (result.status === 'SUBMITTED_OFFLINE_SAVED') {
      set({ isOfflinePending: true });
      activityLog.logExam('EXAM_OFFLINE_SAVED', {
        userId: state.userId || undefined,
        testId: state.testId || undefined,
        status: 'warning',
        reason: 'Network offline during final submit. Saved locally to computer.',
      });
    } else {
      activityLog.logExam(isAutoSubmit ? 'EXAM_AUTO_SUBMITTED' : 'EXAM_SUBMITTED', {
        userId: state.userId || undefined,
        testId: state.testId || undefined,
        status: 'success',
        timeRemaining: state.timeRemainingSeconds,
      });
    }
    return result;
  },

  resetStore: () => {
    if (syncWorker) syncWorker.stop();
    if (timerInterval) clearInterval(timerInterval);

    set({
      sessionId: null,
      testId: null,
      userId: null,
      isTimerRunning: false,
      isSubmitted: false,
      answers: {},
      questions: [],
      currentQuestionIndex: 0
    });
  }
}));
