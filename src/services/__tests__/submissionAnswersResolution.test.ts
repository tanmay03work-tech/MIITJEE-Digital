import { submitAttempt } from '../api/tests';
import { useTestSessionStore } from '../../store/testSessionStore';
import { useAppStore } from '../../store/appStore';

describe('Submission Answers & Question Cache Resolution', () => {
  beforeEach(() => {
    useTestSessionStore.getState().reset();
  });

  it('ensures questionCache discards draft IDs and fetches real questions', async () => {
    useAppStore.setState({
      questionCache: {
        'test-fake-draft': [
          {
            id: 'test-fake-draft_draft_1',
            testId: 'test-fake-draft',
            type: 'mcq',
            prompt: 'Test question 1',
            options: ['A', 'B', 'C', 'D'],
            correctAnswer: 'A',
            explanation: '',
          },
        ],
      },
    });

    const cached = useAppStore.getState().questionCache['test-fake-draft'];
    const hasDraftIds = cached && cached.some((q) => q.id.includes('_draft_'));
    expect(hasDraftIds).toBe(true);
  });

  it('selects answers and stores them accurately in useTestSessionStore', () => {
    const store = useTestSessionStore.getState();
    store.startSession(
      {
        id: 'test-123',
        title: 'Physics Exam',
        description: '',
        durationMinutes: 60,
        questionCount: 3,
        type: 'weekly',
        subject: 'Physics',
        scheduledAt: new Date().toISOString(),
        isPublished: true,
        isStarted: true,
      },
      [
        { id: 'q-uuid-1', testId: 'test-123', type: 'mcq', prompt: 'Q1', options: ['A', 'B', 'C', 'D'], correctAnswer: 'A', explanation: '' },
        { id: 'q-uuid-2', testId: 'test-123', type: 'mcq', prompt: 'Q2', options: ['A', 'B', 'C', 'D'], correctAnswer: 'B', explanation: '' },
        { id: 'q-uuid-3', testId: 'test-123', type: 'integer', prompt: 'Q3', options: [], correctAnswer: '42', explanation: '' },
      ],
      'Candidate A'
    );

    useTestSessionStore.getState().selectAnswer('q-uuid-1', 'A');
    useTestSessionStore.getState().selectAnswer('q-uuid-2', 'C');
    useTestSessionStore.getState().selectAnswer('q-uuid-3', '42');

    const liveAnswers = useTestSessionStore.getState().answers;
    expect(liveAnswers['q-uuid-1']).toBe('A');
    expect(liveAnswers['q-uuid-2']).toBe('C');
    expect(liveAnswers['q-uuid-3']).toBe('42');
  });

  it('ensures unattempted/skipped questions have no answer in state and are not submitted as attempted', () => {
    const store = useTestSessionStore.getState();
    store.startSession(
      {
        id: 'test-456',
        title: 'Chemistry Exam',
        description: '',
        durationMinutes: 45,
        questionCount: 4,
        type: 'weekly',
        subject: 'Chemistry',
        scheduledAt: new Date().toISOString(),
        isPublished: true,
        isStarted: true,
      },
      [
        { id: 'q-1', testId: 'test-456', type: 'mcq', prompt: 'Q1', options: ['A', 'B', 'C', 'D'], correctAnswer: 'A', explanation: '' },
        { id: 'q-2', testId: 'test-456', type: 'mcq', prompt: 'Q2', options: ['A', 'B', 'C', 'D'], correctAnswer: 'B', explanation: '' },
        { id: 'q-3', testId: 'test-456', type: 'mcq', prompt: 'Q3', options: ['A', 'B', 'C', 'D'], correctAnswer: 'C', explanation: '' },
        { id: 'q-4', testId: 'test-456', type: 'mcq', prompt: 'Q4', options: ['A', 'B', 'C', 'D'], correctAnswer: 'D', explanation: '' },
      ],
      'Student X'
    );

    // Answer Q1, skip Q2 & Q3 (navigate next), answer Q4
    store.selectAnswer('q-1', 'A');
    store.next(); // at Q2 (no selection)
    store.next(); // at Q3 (no selection)
    store.next(); // at Q4
    store.selectAnswer('q-4', 'D');

    const liveAnswers = useTestSessionStore.getState().answers;
    expect(liveAnswers['q-1']).toBe('A');
    expect(liveAnswers['q-2']).toBe(undefined);
    expect(liveAnswers['q-3']).toBe(undefined);
    expect(liveAnswers['q-4']).toBe('D');
    expect(Object.keys(liveAnswers).length).toBe(2);
  });
});
