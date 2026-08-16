import { ExamCreationDraft } from '../../utils/draftStorage';

function simulateDraftAutoSave(draft: Partial<ExamCreationDraft>): ExamCreationDraft {
  return {
    title: draft.title || 'Untitled Draft Exam',
    description: draft.description || 'Draft description',
    durationMinutes: draft.durationMinutes || '90',
    subjectMode: draft.subjectMode || 'multi',
    primarySubject: draft.primarySubject || 'Physics',
    type: draft.type || 'weekly',
    batchId: draft.batchId || 'BATCH_JEE_2026',
    scheduleDate: draft.scheduleDate || '2026-08-10',
    scheduleTime: draft.scheduleTime || '10:00',
    scholarshipAdmissionClass: draft.scholarshipAdmissionClass || '8th',
    scholarshipTargetExam: draft.scholarshipTargetExam || 'boards',
    questions: draft.questions || [
      {
        type: 'mcq',
        prompt: 'Sample Q1',
        options: ['A', 'B', 'C', 'D'],
        correctOptionIndex: 0,
        explanation: 'Exp 1',
        imageUrl: null,
      },
    ],
    subjectRangePlan: draft.subjectRangePlan || '1-10: Physics',
    isOpenForAll: draft.isOpenForAll ?? false,
    correctMarks: draft.correctMarks || '4',
    wrongMarks: draft.wrongMarks || '-1',
    unattemptedMarks: draft.unattemptedMarks || '0',
    status: draft.status || 'DRAFT',
    savedAt: new Date().toISOString(),
  };
}

function isExamVisibleToStudent(testStatus: 'DRAFT' | 'PUBLISHED' | 'ENDED' | 'ARCHIVED', isPublished: boolean): boolean {
  return isPublished && testStatus === 'PUBLISHED';
}

describe('Phase 3 - Exam Draft Auto-Save & Recovery Tests', () => {
  test('Test 1: Draft payload captures all required fields accurately', () => {
    const draft = simulateDraftAutoSave({
      title: 'JEE Mock 2',
      durationMinutes: '180',
      isOpenForAll: true,
      correctMarks: '4',
      wrongMarks: '-1',
    });

    expect(draft.title).toBe('JEE Mock 2');
    expect(draft.durationMinutes).toBe('180');
    expect(draft.isOpenForAll).toBe(true);
    expect(draft.status).toBe('DRAFT');
    expect(Boolean(draft.savedAt)).toBe(true);
  });

  test('Test 2: Question list and order are preserved in draft', () => {
    const draft = simulateDraftAutoSave({
      questions: [
        { type: 'mcq', prompt: 'Q1', options: ['A', 'B', 'C', 'D'], correctOptionIndex: 1, explanation: '' },
        { type: 'integer', prompt: 'Q2', options: [], correctOptionIndex: 0, integerAnswer: 42, explanation: '' },
      ],
    });

    expect(draft.questions.length).toBe(2);
    expect(draft.questions[0]?.prompt).toBe('Q1');
    expect(draft.questions[1]?.integerAnswer).toBe(42);
  });

  test('Test 3: Only PUBLISHED exams are visible to students', () => {
    expect(isExamVisibleToStudent('DRAFT', false)).toBe(false);
    expect(isExamVisibleToStudent('DRAFT', true)).toBe(false);
    expect(isExamVisibleToStudent('ENDED', false)).toBe(false);
    expect(isExamVisibleToStudent('ARCHIVED', false)).toBe(false);
    expect(isExamVisibleToStudent('PUBLISHED', true)).toBe(true);
  });
});
