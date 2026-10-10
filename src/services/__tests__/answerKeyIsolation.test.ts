import { fetchQuestions } from '../api/tests';
import * as supabaseClient from '../supabase/client';
import { endpoints } from '../api/config';

jest.mock('../supabase/client');

describe('Proof A: Complete Answer-Key Isolation Suite', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('fetchQuestions queries list_student_test_questions and receives question content only without correct answers', async () => {
    // Mock RPC returning student-sanitized question content (no answers)
    const mockStudentRpcRows = [
      {
        id: 'q-1-uuid',
        test_id: 'test-uuid-1',
        question_type: 'mcq',
        prompt: 'What is the SI unit of electric flux?',
        options: ['N m^2 C^-1', 'N m C^-1', 'N C^-1', 'V m^-1'],
        image_url: null,
        subject_label: 'Physics',
      },
      {
        id: 'q-2-uuid',
        test_id: 'test-uuid-1',
        question_type: 'integer',
        prompt: 'Find the radius of curvature in cm.',
        options: [],
        image_url: 'https://example.com/mirror.png',
        subject_label: 'Physics',
      },
    ];

    const mockRpc = jest.spyOn(supabaseClient, 'rpc').mockResolvedValueOnce(mockStudentRpcRows as any);
    const mockSelectRows = jest.spyOn(supabaseClient, 'selectRows');

    const questions = await fetchQuestions('test-uuid-1');

    // 1. Assert RPC called list_student_test_questions
    expect(mockRpc).toHaveBeenCalledWith(
      endpoints.tests.studentQuestions,
      { p_test_id: 'test-uuid-1' },
      { retryable: true },
    );

    // 2. Assert direct table SELECT on test_questions was NEVER invoked
    expect(mockSelectRows).not.toHaveBeenCalled();

    // 3. Assert returned objects have NO correct answers or explanations
    expect(questions.length).toBe(2);
    expect(questions[0]?.prompt).toBe('What is the SI unit of electric flux?');
    expect(questions[0]?.correctAnswer).toBeUndefined();
    expect(questions[0]?.integerAnswer).toBeUndefined();
    expect(questions[0]?.explanation).toBeUndefined();

    expect(questions[1]?.prompt).toBe('Find the radius of curvature in cm.');
    expect(questions[1]?.correctAnswer).toBeUndefined();
    expect(questions[1]?.integerAnswer).toBeUndefined();
    expect(questions[1]?.explanation).toBeUndefined();
  });

  it('proves no REST fallback path selects answers from test_questions table', async () => {
    // If the studentQuestions RPC fails
    jest.spyOn(supabaseClient, 'rpc').mockRejectedValue(new Error('Network failure'));
    const mockSelectRows = jest.spyOn(supabaseClient, 'selectRows');

    const questions = await fetchQuestions('test-uuid-1');

    // Must return empty array and MUST NOT call selectRows selecting correct_answer
    expect(questions).toEqual([]);
    expect(mockSelectRows).not.toHaveBeenCalled();
  });
});
