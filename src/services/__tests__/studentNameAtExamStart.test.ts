import { useTestSessionStore } from '../../store/testSessionStore';
import { mapResult } from '../supabase/mappers';
import { ResultRow } from '../supabase/types';
import { calculateSubjectAwareRanks, generateSubjectAwareCsv } from '../../utils/excelExporter';

describe('Student Name at Exam Start Feature Tests', () => {
  beforeEach(() => {
    useTestSessionStore.getState().reset();
  });

  it('TEST 1: Stores studentName in testSessionStore during session', () => {
    const mockTest = {
      id: 'test-1',
      title: 'Physics Test',
      description: 'Sample paper',
      durationMinutes: 60,
      questionCount: 10,
      type: 'weekly' as const,
      subject: 'Physics',
      scheduledAt: '2026-08-09T00:00:00Z',
      isPublished: true,
      isStarted: true,
    };

    useTestSessionStore.getState().setStudentName('Rahul Kumar');
    useTestSessionStore.getState().startSession(mockTest, []);

    expect(useTestSessionStore.getState().studentName).toBe('Rahul Kumar');
  });

  it('TEST 2: mapResult maps student_name from ResultRow correctly', () => {
    const row: ResultRow = {
      id: 'attempt-101',
      test_id: 'test-1',
      user_id: 'user-1',
      student_name: 'Ananya Sharma',
      score: 28,
      correct_answers: 7,
      wrong_answers: 0,
      unattempted: 3,
      total_questions: 10,
      rank: 1,
      percentile: 100,
      submitted_at: '2026-08-09T00:00:00Z',
    };

    const mapped = mapResult(row);
    expect(mapped.studentName).toBe('Ananya Sharma');
  });

  it('TEST 3: Historical attempts without student_name fall back safely to undefined', () => {
    const legacyRow: ResultRow = {
      id: 'attempt-old',
      test_id: 'test-1',
      user_id: 'user-1',
      score: 20,
      correct_answers: 5,
      total_questions: 10,
      rank: 2,
      percentile: 80,
      submitted_at: '2026-01-01T00:00:00Z',
    };

    const mapped = mapResult(legacyRow);
    expect(mapped.studentName).toBe(undefined);
  });

  it('TEST 4: Excel export uses authoritative attempt studentName', () => {
    const rawResults = [{
      studentId: 'user-123',
      studentName: 'Rahul Kumar',
      examTitle: 'Physics Units & Dimensions',
      attemptStatus: 'Completed',
      subjectScores: {
        Physics: { correct: 5, wrong: 1, unattempted: 4, score: 19 },
      },
      submittedAt: '2026-08-09T00:00:00Z',
    }];

    const ranked = calculateSubjectAwareRanks(rawResults);
    const csv = generateSubjectAwareCsv(ranked, ['Physics']);

    expect(csv.includes('Rahul Kumar')).toBe(true);
    expect(csv.includes('Physics Units & Dimensions')).toBe(true);
  });

  it('TEST 5: Resume / Refresh safety retains studentName in session without prompting', () => {
    const mockTest = {
      id: 'test-2',
      title: 'Chemistry Test',
      description: 'Sample paper',
      durationMinutes: 45,
      questionCount: 15,
      type: 'weekly' as const,
      subject: 'Chemistry',
      scheduledAt: '2026-08-09T00:00:00Z',
      isPublished: true,
      isStarted: true,
    };

    // First exam start
    useTestSessionStore.getState().setStudentName('Priya Patel');
    useTestSessionStore.getState().startSession(mockTest, []);

    expect(useTestSessionStore.getState().studentName).toBe('Priya Patel');

    // Simulated refresh: startSession re-called without new studentName argument
    useTestSessionStore.getState().startSession(mockTest, []);
    expect(useTestSessionStore.getState().studentName).toBe('Priya Patel');
  });
});
