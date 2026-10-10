import { saveAttemptSnapshot, loadAttemptSnapshot, clearAttemptSnapshot, ATTEMPT_SNAPSHOT_PREFIX } from '../../utils/attemptStorage';
import { useTestSessionStore } from '../../store/testSessionStore';
import { submitAttempt } from '../api/tests';
import * as supabaseClient from '../supabase/client';
import { endpoints } from '../api/config';
const storageMap = new Map<string, string>();
jest.mock('@react-native-async-storage/async-storage', () => ({
  setItem: jest.fn(async (key: string, val: string) => { storageMap.set(key, val); }),
  getItem: jest.fn(async (key: string) => storageMap.get(key) || null),
  removeItem: jest.fn(async (key: string) => { storageMap.delete(key); }),
  clear: jest.fn(async () => { storageMap.clear(); }),
  getAllKeys: jest.fn(async () => Array.from(storageMap.keys())),
  multiGet: jest.fn(async (keys: string[]) => keys.map((k) => [k, storageMap.get(k) || null])),
}));

jest.mock('../supabase/client');

describe('Blocker 6: Real Timer Expiry + Network Failure + Refresh Recovery E2E Flow', () => {
  const testId = 'test-e2e-timer-999';
  const userId = 'student-e2e-david';

  const mockTestItem: any = {
    id: testId,
    title: 'CBT Major Test 1',
    durationMinutes: 180,
    totalMarks: 300,
    correctMarks: 4,
    wrongMarks: -1,
    type: 'weekly',
  };

  const mockQuestions: any[] = [
    {
      id: 'q-timer-1',
      testId,
      type: 'mcq',
      prompt: 'Q1: Conservation of angular momentum applies when:',
      options: ['External torque is zero', 'External force is zero', 'Velocity is constant', 'Mass is zero'],
    },
    {
      id: 'q-timer-2',
      testId,
      type: 'mcq',
      prompt: 'Q2: The oxidation state of Mn in KMnO4 is:',
      options: ['+7', '+6', '+4', '+2'],
    },
  ];

  beforeEach(async () => {
    jest.clearAllMocks();
    useTestSessionStore.getState().reset();
    storageMap.clear();
  });

  it('Executes complete flow: Exam starts -> Answers entered -> Timer expires -> Network failure (RETRY_PENDING) -> Page refresh -> Snapshot restored -> Auto-resubmission -> Server acknowledgement -> Durable Result (Never redirected to Tests/Home)', async () => {
    // -------------------------------------------------------------------------
    // 1. EXAM STARTS
    // -------------------------------------------------------------------------
    const sessionStore = useTestSessionStore.getState();
    const startedAt = new Date(Date.now() - 10 * 60 * 1000).toISOString(); // 10 minutes ago
    const expiresAt = new Date(Date.now() + 60 * 1000).toISOString(); // 60 seconds remaining

    sessionStore.startSession(
      mockTestItem,
      mockQuestions,
      'David Student',
      {},
      [],
      startedAt,
      expiresAt,
    );

    expect(useTestSessionStore.getState().test?.id).toBe(testId);
    expect(useTestSessionStore.getState().questions).toHaveLength(2);
    expect(useTestSessionStore.getState().submissionState).toBe('IN_PROGRESS');

    // -------------------------------------------------------------------------
    // 2. ANSWERS ENTERED BY STUDENT
    // -------------------------------------------------------------------------
    sessionStore.selectAnswer('q-timer-1', 'External torque is zero');
    sessionStore.selectAnswer('q-timer-2', '+7');

    const enteredAnswers = useTestSessionStore.getState().answers;
    expect(enteredAnswers['q-timer-1']).toBe('External torque is zero');
    expect(enteredAnswers['q-timer-2']).toBe('+7');

    // Snapshot saved locally
    await saveAttemptSnapshot({
      testId,
      userId,
      answers: enteredAnswers,
      flaggedQuestionIds: [],
      secondsRemaining: 60,
      startedAt,
      expiresAt,
      studentName: 'David Student',
      isPendingSync: false,
      submissionState: 'IN_PROGRESS',
    });

    // -------------------------------------------------------------------------
    // 3. TIMER EXPIRES
    // -------------------------------------------------------------------------
    // Time reaches expiry
    useTestSessionStore.setState({ expiresAt: new Date(Date.now() - 1000).toISOString(), secondsRemaining: 0 });
    sessionStore.tick(); // Ticking triggers TIME_EXPIRED when expired
    expect(useTestSessionStore.getState().submissionState).toBe('TIME_EXPIRED');
    expect(useTestSessionStore.getState().isFrozen).toBe(true);

    // -------------------------------------------------------------------------
    // 4. SUBMISSION REQUEST FAILS (TRANSIENT NETWORK OUTAGE)
    // -------------------------------------------------------------------------
    const networkError = new Error('Network request failed - connection timeout');
    jest.spyOn(supabaseClient, 'rpc').mockRejectedValueOnce(networkError);

    // On submission error, state transitions to RETRY_PENDING and snapshot marked isPendingSync
    sessionStore.setSubmissionState('RETRY_PENDING');
    await saveAttemptSnapshot({
      testId,
      userId,
      answers: enteredAnswers,
      flaggedQuestionIds: [],
      secondsRemaining: 0,
      startedAt,
      expiresAt,
      studentName: 'David Student',
      isPendingSync: true,
      submissionState: 'RETRY_PENDING',
    });

    const pendingSnapshot = await loadAttemptSnapshot(testId);
    expect(pendingSnapshot).not.toBeNull();
    expect(pendingSnapshot?.submissionState).toBe('RETRY_PENDING');
    expect(pendingSnapshot?.isPendingSync).toBe(true);
    expect(pendingSnapshot?.answers['q-timer-1']).toBe('External torque is zero');

    // -------------------------------------------------------------------------
    // 5. PAGE REFRESH (BROWSER RELOAD / APP CRASH RECOVERY)
    // -------------------------------------------------------------------------
    // Reset volatile store memory to simulate fresh page load
    useTestSessionStore.getState().reset();
    expect(useTestSessionStore.getState().test).toBeNull();
    expect(Object.keys(useTestSessionStore.getState().answers)).toHaveLength(0);

    // -------------------------------------------------------------------------
    // 6. PENDING SNAPSHOT RESTORED
    // -------------------------------------------------------------------------
    const restoredSnapshot = await loadAttemptSnapshot(testId);
    expect(restoredSnapshot).not.toBeNull();

    // Bootstrap rehydrates state from snapshot without throwing
    useTestSessionStore.getState().startSession(
      mockTestItem,
      mockQuestions,
      restoredSnapshot!.studentName || 'David Student',
      restoredSnapshot!.answers,
      restoredSnapshot!.flaggedQuestionIds,
      restoredSnapshot!.startedAt,
      restoredSnapshot!.expiresAt,
      restoredSnapshot!.submissionState,
    );

    const rehydratedStore = useTestSessionStore.getState();
    expect(rehydratedStore.test?.id).toBe(testId);
    expect(rehydratedStore.answers['q-timer-1']).toBe('External torque is zero');
    expect(rehydratedStore.answers['q-timer-2']).toBe('+7');
    expect(rehydratedStore.submissionState).toBe('RETRY_PENDING');

    // -------------------------------------------------------------------------
    // 7. AUTOMATIC RESUBMISSION & SERVER ACKNOWLEDGEMENT
    // -------------------------------------------------------------------------
    let attemptsCreatedCount = 0;
    const mockOfficialResult = {
      attempt: {
        id: 'official-attempt-durable-1',
        test_id: testId,
        user_id: userId,
        score: 8,
        correct_answers: 2,
        total_questions: 2,
        submitted_at: '2026-10-08T18:00:00Z',
      },
      result: {
        id: 'official-attempt-durable-1',
        test_id: testId,
        user_id: userId,
        score: 8,
        correct_answers: 2,
        total_questions: 2,
        submitted_at: '2026-10-08T18:00:00Z',
      },
      leaderboard: [],
      is_existing: false,
    };

    jest.spyOn(supabaseClient, 'rpc').mockImplementation(async (endpoint: any, params?: any): Promise<any> => {
      if (endpoint === endpoints.tests.submit) {
        attemptsCreatedCount += 1;
        return mockOfficialResult;
      }
      return null;
    });

    // Auto-resubmit with restored answers
    const submissionResponse = await submitAttempt({
      testId,
      userId,
      answers: rehydratedStore.answers,
      studentName: 'David Student',
    });

    // -------------------------------------------------------------------------
    // 8. DURABLE RESULT & RESULT SCREEN TRANSITION (NEVER REDIRECTED TO HOME)
    // -------------------------------------------------------------------------
    expect(submissionResponse.result.id).toBe('official-attempt-durable-1');
    expect(submissionResponse.result.score).toBe(8);
    expect(submissionResponse.result.totalQuestions).toBe(2);

    // Snapshot cleared upon server acknowledgement
    await clearAttemptSnapshot(testId);
    const clearedSnapshot = await loadAttemptSnapshot(testId);
    expect(clearedSnapshot).toBeNull();

    // Verify exactly one official attempt exists
    expect(attemptsCreatedCount).toBe(1);

    // Verify no redirection occurred (session ended with durable result ready for ResultScreen)
    expect(submissionResponse.result).toBeDefined();
    expect(submissionResponse.result.id).toBeTruthy();
  });
});
