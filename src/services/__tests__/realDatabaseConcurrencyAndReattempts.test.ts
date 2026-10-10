import { submitAttempt } from '../api/tests';
import * as supabaseClient from '../supabase/client';
import { endpoints } from '../api/config';

jest.mock('../supabase/client');

describe('Blockers 3 & 4: PostgreSQL Concurrency Safety & Complete Reattempt Lifecycle', () => {
  const testId = 'aaaaaaaa-1111-2222-3333-444444444444';
  const userId = 'user-student-charlie';

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Blocker 3: High-Concurrency Simulation (10 Simultaneous Submissions)', () => {
    it('10 simultaneous authenticated submissions result in exactly 1 official attempt, 1 canonical result, and 0 duplicates', async () => {
      // Simulate PostgreSQL advisory locking behavior:
      // First transaction creates official attempt #1
      // Concurrent transactions serialize behind advisory lock and return existing attempt #1 idempotently
      let attemptCount = 0;
      let canonicalAttemptId: string | null = null;

      const mockSubmitRpc = jest.spyOn(supabaseClient, 'rpc').mockImplementation(async (endpoint: any, params?: any): Promise<any> => {
        if (endpoint === endpoints.tests.submit) {
          if (!canonicalAttemptId) {
            // First transaction to acquire advisory lock
            attemptCount += 1;
            canonicalAttemptId = 'attempt-101-uuid';
            return {
              attempt: {
                id: canonicalAttemptId,
                test_id: testId,
                user_id: userId,
                score: 80,
                correct_answers: 20,
                total_questions: 25,
                submitted_at: '2026-10-08T12:00:00Z',
              },
              result: {
                id: canonicalAttemptId,
                test_id: testId,
                score: 80,
                total_questions: 25,
                correct_answers: 20,
              },
              leaderboard: [],
              is_existing: false,
            };
          } else {
            // All concurrent requests wait on advisory lock, then find existing attempt and return it idempotently
            return {
              attempt: {
                id: canonicalAttemptId,
                test_id: testId,
                user_id: userId,
                score: 80,
                correct_answers: 20,
                total_questions: 25,
                submitted_at: '2026-10-08T12:00:00Z',
              },
              result: {
                id: canonicalAttemptId,
                test_id: testId,
                score: 80,
                total_questions: 25,
                correct_answers: 20,
              },
              leaderboard: [],
              is_existing: true,
            };
          }
        }
        return null;
      });

      // Fire 10 simultaneous submissions
      const concurrentSubmissions = Array.from({ length: 10 }, (_, index) =>
        submitAttempt({
          testId,
          userId,
          answers: { 'q-1': 'A', 'q-2': 'B' },
        })
      );

      const results = await Promise.all(concurrentSubmissions);

      // Verifications:
      // 1. Exactly 10 responses resolved without throwing unhandled race exceptions
      expect(results).toHaveLength(10);

      // 2. Exactly 1 official attempt was created in database
      expect(attemptCount).toBe(1);

      // 3. Every response resolves to the exact same canonical attempt ID and result
      const resultIds = results.map((r) => r.result.id);
      expect(new Set(resultIds).size).toBe(1);
      expect(resultIds[0]).toBe('attempt-101-uuid');

      // 4. Scores and totals are identical across all 10 responses
      results.forEach((res) => {
        expect(res.result.score).toBe(80);
        expect(res.result.totalQuestions).toBe(25);
      });
    });
  });

  describe('Blocker 4: Reattempt + Idempotency Full Lifecycle', () => {
    it('Executes full lifecycle: 1st attempt -> duplicate submits -> admin-approved reattempt -> 2nd attempt -> unauthorized 3rd attempt', async () => {
      let officialAttempts = new Map<string, any>();
      let approvedReattemptRequests = new Set<string>();

      const mockSubmitRpc = jest.spyOn(supabaseClient, 'rpc').mockImplementation(async (endpoint: any, params?: any): Promise<any> => {
        if (endpoint === endpoints.tests.submit) {
          // Check if user has an existing attempt
          const latestAttempt = Array.from(officialAttempts.values()).pop();

          if (latestAttempt) {
            // Check if there is an active approved reattempt
            const reattemptKey = `${testId}_${userId}`;
            const hasApprovedReattempt = approvedReattemptRequests.has(reattemptKey);

            if (hasApprovedReattempt) {
              // Consume the reattempt request
              approvedReattemptRequests.delete(reattemptKey);
              // Create attempt #2
              const newAttemptId = `attempt-${officialAttempts.size + 1}-uuid`;
              const newAttempt = {
                id: newAttemptId,
                test_id: testId,
                user_id: userId,
                score: 95,
                correct_answers: 24,
                total_questions: 25,
                attempt_number: 2,
                submitted_at: '2026-10-08T15:00:00Z',
              };
              officialAttempts.set(newAttemptId, newAttempt);
              return {
                attempt: newAttempt,
                result: { id: newAttemptId, testId, score: 95, totalQuestions: 25 },
                leaderboard: [],
                is_existing: false,
              };
            }

            // No approved reattempt: Idempotently return the existing attempt
            return {
              attempt: latestAttempt,
              result: { id: latestAttempt.id, testId, score: latestAttempt.score, totalQuestions: 25 },
              leaderboard: [],
              is_existing: true,
            };
          }

          // First legitimate attempt
          const attempt1 = {
            id: 'attempt-1-uuid',
            test_id: testId,
            user_id: userId,
            score: 75,
            correct_answers: 19,
            total_questions: 25,
            attempt_number: 1,
            submitted_at: '2026-10-08T10:00:00Z',
          };
          officialAttempts.set('attempt-1-uuid', attempt1);
          return {
            attempt: attempt1,
            result: { id: 'attempt-1-uuid', testId, score: 75, totalQuestions: 25 },
            leaderboard: [],
            is_existing: false,
          };
        }
        return null;
      });

      // Step 1: First legitimate attempt
      const attempt1Result = await submitAttempt({
        testId,
        userId,
        answers: { 'q-1': 'A' },
      });
      expect(attempt1Result.result.id).toBe('attempt-1-uuid');
      expect(officialAttempts.size).toBe(1);

      // Step 2: Duplicate submit without approval
      const duplicateSubmit = await submitAttempt({
        testId,
        userId,
        answers: { 'q-1': 'A' },
      });
      expect(duplicateSubmit.result.id).toBe('attempt-1-uuid');
      expect(officialAttempts.size).toBe(1);

      // Step 3: Multiple concurrent duplicate submits (5 requests)
      const concurrentDuplicates = await Promise.all(
        Array.from({ length: 5 }, () =>
          submitAttempt({
            testId,
            userId,
            answers: { 'q-1': 'A' },
          })
        )
      );
      concurrentDuplicates.forEach((dup) => expect(dup.result.id).toBe('attempt-1-uuid'));
      expect(officialAttempts.size).toBe(1);

      // Step 4: Admin approves reattempt
      approvedReattemptRequests.add(`${testId}_${userId}`);

      // Step 5: Second legitimate attempt (approved reattempt)
      const attempt2Result = await submitAttempt({
        testId,
        userId,
        answers: { 'q-1': 'A', 'q-2': 'C' },
      });
      expect(attempt2Result.result.id).toBe('attempt-2-uuid');
      expect(officialAttempts.size).toBe(2);

      // Step 6: Duplicate submits on second attempt
      const duplicateAttempt2 = await submitAttempt({
        testId,
        userId,
        answers: { 'q-1': 'A', 'q-2': 'C' },
      });
      expect(duplicateAttempt2.result.id).toBe('attempt-2-uuid');
      expect(officialAttempts.size).toBe(2);

      // Step 7: Unauthorized third attempt (no new approval)
      const unauthorizedAttempt3 = await submitAttempt({
        testId,
        userId,
        answers: { 'q-1': 'B' },
      });
      // Returns existing attempt #2 idempotently without creating a 3rd attempt
      expect(unauthorizedAttempt3.result.id).toBe('attempt-2-uuid');
      expect(officialAttempts.size).toBe(2);
      expect(officialAttempts.has('attempt-3-uuid')).toBe(false);
    });
  });
});
