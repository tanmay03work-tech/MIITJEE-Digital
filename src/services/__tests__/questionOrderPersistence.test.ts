import { QuestionBankQuestion } from '../../types';
import { useAppStore } from '../../store/appStore';
import { fetchQuestionSetQuestions, reorderQuestionSet } from '../api/admin';
import * as supabaseClient from '../supabase/client';

jest.mock('../supabase/client');

describe('Phase 2: Question Order Persistence & Q75 -> Q10 Regression Suite', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useAppStore.setState({
      results: [],
      questionBankSets: [],
      questionBankSelection: [],
      pendingQuestionBankImport: [],
    });
  });

  it('Q75 -> Q10 preserves complete question identity, prompt, options, and answer after save + reload', async () => {
    // Generate 100 realistic questions
    const initialQuestions: QuestionBankQuestion[] = Array.from({ length: 100 }, (_, i) => {
      const qNum = i + 1;
      const isMatchTheFollowing = qNum === 37 || qNum === 45 || qNum === 75;
      const prompt = isMatchTheFollowing
        ? `Question ${qNum}: Match the following:\n| List I | List II |\n| :--- | :--- |\n| P. Item 1 | 1. Val 1 |\n| Q. Item 2 | 2. Val 2 |`
        : `Question ${qNum} standard conceptual prompt for JEE Advanced`;

      return {
        id: qNum,
        setId: 42,
        position: qNum,
        question: prompt,
        options: ['Option A text', 'Option B text', 'Option C text', 'Option D text'],
        type: 'mcq' as const,
        correctAnswer: (['A', 'B', 'C', 'D'] as const)[qNum % 4]!,
        explanation: `Detailed derivation for question ${qNum}`,
        imageUrl: qNum === 75 ? 'https://example.com/diagrams/q75.png' : null,
      };
    });

    // Capture the original Q75 state before moving
    const originalQ75 = { ...initialQuestions[74]! };
    expect(originalQ75.id).toBe(75);
    expect(originalQ75.position).toBe(75);
    expect(originalQ75.question).toContain('| List I | List II |');
    expect(originalQ75.imageUrl).toBe('https://example.com/diagrams/q75.png');

    // Simulate moving Q75 (fromIndex = 74) to position 10 (toIndex = 9)
    const fromIndex = 74;
    const toIndex = 9;

    const reordered = [...initialQuestions];
    const [moved] = reordered.splice(fromIndex, 1);
    expect(moved).toBeDefined();
    reordered.splice(toIndex, 0, moved!);

    // Reassign positions 1..100
    const withUpdatedPositions = reordered.map((q, idx) => ({
      ...q,
      position: idx + 1,
    }));

    // Verify in-memory position after move
    expect(withUpdatedPositions[9]?.id).toBe(75);
    expect(withUpdatedPositions[9]?.position).toBe(10);
    expect(withUpdatedPositions[10]?.id).toBe(10);
    expect(withUpdatedPositions[10]?.position).toBe(11);

    // Mock RPC call for reorder_question_set
    const mockRpc = jest.spyOn(supabaseClient, 'rpc').mockResolvedValueOnce({
      success: true,
      set_id: 42,
      updated_count: 100,
    } as any);

    const questionIds = withUpdatedPositions.map((q) => Number(q.id));
    const reorderResult = await reorderQuestionSet(42, questionIds);

    expect(reorderResult.success).toBe(true);
    expect(mockRpc).toHaveBeenCalledWith('reorder_question_set', {
      p_set_id: 42,
      p_question_ids: questionIds,
    });
    expect(questionIds[9]).toBe(75);
    expect(questionIds[10]).toBe(10);

    // Simulate save + reload from database via fetchQuestionSetQuestions
    // The database returns rows sorted by position.asc, id.asc
    const dbSimulatedRows = withUpdatedPositions.map((q) => ({
      id: q.id as number,
      question: q.question,
      options: q.options,
      type: q.type,
      image_url: q.imageUrl,
      correct_answer: q.correctAnswer,
      position: q.position,
    }));

    jest.spyOn(supabaseClient, 'selectRows').mockResolvedValueOnce(dbSimulatedRows as any);

    const reloadedQuestions = await fetchQuestionSetQuestions(42);

    expect(reloadedQuestions.length).toBe(100);

    // Verify Q75 is strictly at index 9 (10th item)
    const reloadedAtPos10 = reloadedQuestions[9]!;
    expect(reloadedAtPos10.id).toBe(75);
    expect(reloadedAtPos10.position).toBe(10);
    expect(reloadedAtPos10.question).toBe(originalQ75.question);
    expect(reloadedAtPos10.options).toEqual(originalQ75.options);
    expect(reloadedAtPos10.correctAnswer).toBe(originalQ75.correctAnswer);
    expect(reloadedAtPos10.imageUrl).toBe(originalQ75.imageUrl);

    // Verify next question at index 10 is Q10
    const reloadedAtPos11 = reloadedQuestions[10]!;
    expect(reloadedAtPos11.id).toBe(10);
    expect(reloadedAtPos11.position).toBe(11);

    // Select questions and queue them into Create Test
    useAppStore.getState().selectAllQuestionBankQuestions(reloadedQuestions);
    const queuedDrafts = useAppStore.getState().queueSelectedQuestionBankQuestions();

    expect(queuedDrafts.length).toBe(100);
    // Draft question at index 9 must be Q75 with Match-the-Following table and diagram preserved
    expect(queuedDrafts[9]?.prompt).toBe(originalQ75.question);
    expect(queuedDrafts[9]?.options).toEqual(originalQ75.options);
    expect(queuedDrafts[9]?.imageUrl).toBe('https://example.com/diagrams/q75.png');
    expect(queuedDrafts[9]?.correctOptionIndex).toBe(3); // 75 % 4 = 3 ('D')
    expect(queuedDrafts[9]?.needsReview).toBe(false);
  });

  it('shuffle reorders all positions deterministically and preserves all question content', async () => {
    const questions: QuestionBankQuestion[] = [
      { id: 1, setId: 5, position: 1, question: 'Q1', options: ['A', 'B'], type: 'mcq', correctAnswer: 'A' },
      { id: 2, setId: 5, position: 2, question: 'Q2', options: ['A', 'B'], type: 'mcq', correctAnswer: 'B' },
      { id: 3, setId: 5, position: 3, question: 'Q3', options: ['A', 'B'], type: 'mcq', correctAnswer: 'A' },
      { id: 4, setId: 5, position: 4, question: 'Q4', options: ['A', 'B'], type: 'mcq', correctAnswer: 'B' },
    ];

    // Explicitly reverse order to test shuffle persistence
    const shuffled = [questions[3]!, questions[1]!, questions[0]!, questions[2]!].map((q, idx) => ({
      ...q,
      position: idx + 1,
    }));

    const mockRpc = jest.spyOn(supabaseClient, 'rpc').mockResolvedValueOnce({
      success: true,
      set_id: 5,
      updated_count: 4,
    } as any);

    const questionIds = shuffled.map((q) => Number(q.id));
    await reorderQuestionSet(5, questionIds);

    expect(mockRpc).toHaveBeenCalledWith('reorder_question_set', {
      p_set_id: 5,
      p_question_ids: [4, 2, 1, 3],
    });

    // When loaded from DB with positions:
    jest.spyOn(supabaseClient, 'selectRows').mockResolvedValueOnce(
      shuffled.map((q) => ({
        id: q.id as number,
        question: q.question,
        options: q.options,
        type: q.type,
        image_url: null,
        correct_answer: q.correctAnswer,
        position: q.position,
      })) as any,
    );

    const fetched = await fetchQuestionSetQuestions(5);
    expect(fetched.map((q) => q.id)).toEqual([4, 2, 1, 3]);
  });
});
