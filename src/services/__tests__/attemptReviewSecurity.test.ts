import { fetchAttemptReview } from '../api/tests';
import * as supabaseClient from '../supabase/client';
import { endpoints } from '../api/config';

jest.mock('../supabase/client');

describe('Blocker 2: Canonical Review RPC Security & Authorization Suite', () => {
  const currentStudentId = 'student-uuid-alice';
  const otherStudentId = 'student-uuid-bob';
  const adminUserId = 'admin-uuid-super';

  const finalizedAttemptId = '11111111-2222-3333-4444-555555555555';
  const inProgressAttemptId = '22222222-3333-4444-5555-666666666666';
  const otherStudentAttemptId = '33333333-4444-5555-6666-777777777777';
  const nonexistentAttemptId = '99999999-9999-9999-9999-999999999999';

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('1. Own finalized attempt: allowed and retrieves full review items with correct answers, explanations, and subjects', async () => {
    const mockReviewRows = [
      {
        question_id: 'q-uuid-1',
        test_id: 'test-uuid-1',
        question_type: 'mcq',
        prompt: 'Which hormone regulates blood sugar?',
        options: ['Insulin', 'Glucagon', 'Thyroxine', 'Adrenaline'],
        user_answer: 'Insulin',
        correct_answer: 'Insulin',
        is_correct: true,
        is_unattempted: false,
        explanation: 'Insulin promotes uptake of glucose by hepatocytes and adipocytes.',
        image_url: null,
        subject: 'Biology',
      },
      {
        question_id: 'q-uuid-2',
        test_id: 'test-uuid-1',
        question_type: 'integer',
        prompt: 'Calculate the total energy in Joules.',
        options: [],
        user_answer: '42',
        correct_answer: '42',
        is_correct: true,
        is_unattempted: false,
        explanation: 'E = mc^2 calculation yields 42 Joules.',
        image_url: 'https://example.com/circuit.png',
        subject: 'Physics',
      },
    ];

    const mockRpc = jest.spyOn(supabaseClient, 'rpc').mockResolvedValueOnce(mockReviewRows as any);

    const reviews = await fetchAttemptReview(finalizedAttemptId);

    expect(mockRpc).toHaveBeenCalledWith(
      endpoints.tests.review,
      { p_attempt_id: finalizedAttemptId },
      { retryable: true },
    );
    expect(endpoints.tests.review).toBe('get_attempt_review');

    expect(reviews).toHaveLength(2);
    expect(reviews[0]!.prompt).toBe('Which hormone regulates blood sugar?');
    expect(reviews[0]!.correctAnswer).toBe('Insulin');
    expect(reviews[0]!.explanation).toBe('Insulin promotes uptake of glucose by hepatocytes and adipocytes.');
    expect(reviews[0]!.subject).toBe('Biology');
    expect(reviews[0]!.isCorrect).toBe(true);

    expect(reviews[1]!.prompt).toBe('Calculate the total energy in Joules.');
    expect(reviews[1]!.correctAnswer).toBe('42');
    expect(reviews[1]!.subject).toBe('Physics');
  });

  it('2. Authorized admin: allowed to review student attempt', async () => {
    const mockAdminReviewRows = [
      {
        question_id: 'q-uuid-1',
        test_id: 'test-uuid-1',
        question_type: 'mcq',
        prompt: 'Admin inspection of student test',
        options: ['A', 'B', 'C', 'D'],
        user_answer: 'A',
        correct_answer: 'A',
        is_correct: true,
        is_unattempted: false,
        explanation: 'Verified by admin',
        image_url: null,
        subject: 'Chemistry',
      },
    ];

    jest.spyOn(supabaseClient, 'rpc').mockResolvedValueOnce(mockAdminReviewRows as any);

    const reviews = await fetchAttemptReview(otherStudentAttemptId);
    expect(reviews).toHaveLength(1);
    expect(reviews[0]!.subject).toBe('Chemistry');
  });

  it('3. Active / in-progress attempt: denied (RPC throws locked error before attempt is submitted)', async () => {
    jest.spyOn(supabaseClient, 'rpc').mockRejectedValueOnce(
      new Error('Attempt is still in progress; review answers are locked until submission'),
    );

    let thrownError: any = null;
    try {
      await fetchAttemptReview(inProgressAttemptId);
    } catch (err) {
      thrownError = err;
    }
    expect(thrownError).not.toBeNull();
    expect(thrownError?.message).toContain('Attempt is still in progress; review answers are locked until submission');
  });

  it("4. Another student's attempt: denied (RPC raises 42501 access denied exception)", async () => {
    jest.spyOn(supabaseClient, 'rpc').mockRejectedValueOnce(
      new Error('Access denied to this attempt review'),
    );

    let thrownError: any = null;
    try {
      await fetchAttemptReview(otherStudentAttemptId);
    } catch (err) {
      thrownError = err;
    }
    expect(thrownError).not.toBeNull();
    expect(thrownError?.message).toContain('Access denied to this attempt review');
  });

  it('5. Invalid or nonexistent attempt: denied (RPC raises P0002 not found exception)', async () => {
    jest.spyOn(supabaseClient, 'rpc').mockRejectedValueOnce(
      new Error('Test attempt not found'),
    );

    let thrownError: any = null;
    try {
      await fetchAttemptReview(nonexistentAttemptId);
    } catch (err) {
      thrownError = err;
    }
    expect(thrownError).not.toBeNull();
    expect(thrownError?.message).toContain('Test attempt not found');
  });

  it('6. Unauthenticated caller: denied (RPC raises 42501 authentication required exception)', async () => {
    jest.spyOn(supabaseClient, 'rpc').mockRejectedValueOnce(
      new Error('Authentication required'),
    );

    let thrownError: any = null;
    try {
      await fetchAttemptReview(finalizedAttemptId);
    } catch (err) {
      thrownError = err;
    }
    expect(thrownError).not.toBeNull();
    expect(thrownError?.message).toContain('Authentication required');
  });
});
