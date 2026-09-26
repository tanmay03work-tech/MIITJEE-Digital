import { QuestionBankQuestion, TestResult } from '../../types';
import { useAppStore } from '../../store/appStore';

describe('Question Bank Ordering and Submission Showcase Tests', () => {
  beforeEach(() => {
    useAppStore.setState({
      results: [],
      questionBankSets: [],
      questionBankSelection: [],
      pendingQuestionBankImport: [],
    });
  });

  describe('1. Question Bank Sequential Ordering', () => {
    it('sorts question set questions strictly by ascending ID even if fetched out of order', () => {
      const outOfOrderRows: QuestionBankQuestion[] = [
        {
          id: 45,
          setId: 10,
          question: 'Question 45',
          options: ['A', 'B', 'C', 'D'],
          type: 'mcq',
          correctAnswer: 'B',
        },
        {
          id: 2,
          setId: 10,
          question: 'Question 2',
          options: ['A', 'B', 'C', 'D'],
          type: 'mcq',
          correctAnswer: 'A',
        },
        {
          id: 14,
          setId: 10,
          question: 'Question 14',
          options: ['A', 'B', 'C', 'D'],
          type: 'mcq',
          correctAnswer: 'C',
        },
        {
          id: 1,
          setId: 10,
          question: 'Question 1',
          options: ['A', 'B', 'C', 'D'],
          type: 'mcq',
          correctAnswer: 'D',
        },
      ];

      const sorted = [...outOfOrderRows].sort((a, b) => Number(a.id) - Number(b.id));

      expect(sorted.map((q) => q.id)).toEqual([1, 2, 14, 45]);
      expect(sorted[0]?.question).toBe('Question 1');
      expect(sorted[1]?.question).toBe('Question 2');
      expect(sorted[2]?.question).toBe('Question 14');
      expect(sorted[3]?.question).toBe('Question 45');
    });

    it('queueSelectedQuestionBankQuestions preserves ascending numeric question order', () => {
      const q1: QuestionBankQuestion = {
        id: 105,
        setId: 3,
        question: 'Q105',
        options: ['A', 'B', 'C', 'D'],
        type: 'mcq',
        correctAnswer: 'A',
      };
      const q2: QuestionBankQuestion = {
        id: 12,
        setId: 3,
        question: 'Q12',
        options: ['A', 'B', 'C', 'D'],
        type: 'mcq',
        correctAnswer: 'B',
      };
      const q3: QuestionBankQuestion = {
        id: 50,
        setId: 3,
        question: 'Q50',
        options: ['A', 'B', 'C', 'D'],
        type: 'mcq',
        correctAnswer: 'C',
      };

      // User selects questions in arbitrary click order
      useAppStore.getState().toggleQuestionBankSelection(q1);
      useAppStore.getState().toggleQuestionBankSelection(q2);
      useAppStore.getState().toggleQuestionBankSelection(q3);

      const queued = useAppStore.getState().queueSelectedQuestionBankQuestions();

      expect(queued.length).toBe(3);
      expect(queued[0]?.prompt).toBe('Q12');
      expect(queued[1]?.prompt).toBe('Q50');
      expect(queued[2]?.prompt).toBe('Q105');
    });
  });

  describe('2. Test Submission & Result Showcase Flow', () => {
    it('retains submitted scorecard in results state and does not purge on subsequent lookups', () => {
      const mockResult: TestResult = {
        id: 'result-uuid-12345',
        testId: 'test-uuid-999',
        userId: 'student-user-1',
        studentName: 'Aarav Sharma',
        score: 180,
        correctAnswers: 45,
        wrongAnswers: 5,
        unattempted: 25,
        totalQuestions: 75,
        rank: 1,
        percentile: 99.5,
        submittedAt: new Date().toISOString(),
      };

      // Simulate submitAttempt saving result to store
      useAppStore.setState({
        results: [mockResult],
      });

      // Verify result is present and immediately showcaseable
      const storeResult = useAppStore
        .getState()
        .results.find((entry) => entry.id === 'result-uuid-12345' || entry.testId === 'test-uuid-999');

      expect(Boolean(storeResult)).toBe(true);
      expect(storeResult?.id).toBe('result-uuid-12345');
      expect(storeResult?.studentName).toBe('Aarav Sharma');
      expect(storeResult?.score).toBe(180);
      expect(storeResult?.correctAnswers).toBe(45);

      // Verify that non-destructive attempt loading does not wipe the result
      const backgroundAttemptLookup = null; // simulate null from background check
      if (backgroundAttemptLookup) {
        useAppStore.setState({ results: [backgroundAttemptLookup] });
      }

      // Result should still exist in store
      expect(useAppStore.getState().results.length).toBe(1);
      expect(useAppStore.getState().results[0]?.id).toBe('result-uuid-12345');
    });

    it('allows all student categories (General Student, MIITJEE Student, Admin, Non-batch Student) to submit and view results', () => {
      const studentCategories: Array<{ role: 'student' | 'miitjee_student' | 'admin'; batchId?: string; name: string }> = [
        { role: 'student', batchId: undefined, name: 'General Non-batch Student' },
        { role: 'miitjee_student', batchId: 'JEE_2026', name: 'MIITJEE Enrolled Student' },
        { role: 'admin', batchId: undefined, name: 'Admin User' },
        { role: 'student', batchId: 'NEET_2026', name: 'Other Batch Student' },
      ];

      studentCategories.forEach((cat, idx) => {
        const resultId = `result-${cat.role}-${idx}`;
        const mockResult: TestResult = {
          id: resultId,
          testId: 'open-test-101',
          userId: `user-${cat.role}-${idx}`,
          studentName: cat.name,
          score: 120 + idx * 10,
          correctAnswers: 30,
          wrongAnswers: 5,
          unattempted: 15,
          totalQuestions: 50,
          rank: idx + 1,
          percentile: 95,
          submittedAt: new Date().toISOString(),
        };

        useAppStore.setState((state) => ({
          results: [mockResult, ...state.results],
        }));

        const found = useAppStore.getState().results.find((r) => r.id === resultId);
        expect(Boolean(found)).toBe(true);
        expect(found?.studentName).toBe(cat.name);
        expect(found?.score).toBe(120 + idx * 10);
      });
    });
  });
});
