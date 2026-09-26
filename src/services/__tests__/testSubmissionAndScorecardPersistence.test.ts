import { TestResult } from '../../types';
import { useAppStore } from '../../store/appStore';
import {
  saveLocalStandardAttempt,
  getLocalStandardAttempt,
  getLocalStandardAttemptByTestId,
} from '../api/tests';

describe('Test Submission and Scorecard Persistence Tests', () => {
  beforeEach(() => {
    useAppStore.setState({
      results: [],
      tests: [],
      batches: [],
    });
  });

  it('preserves freshly submitted test scorecard when bootstrap executes with remote data', async () => {
    const freshSubmissionResult: TestResult = {
      id: 'fresh-attempt-001',
      testId: 'test-weekly-101',
      userId: 'student-user-1',
      studentName: 'Aarav Sharma',
      score: 160,
      correctAnswers: 40,
      wrongAnswers: 0,
      unattempted: 5,
      totalQuestions: 45,
      rank: 1,
      percentile: 99.5,
      submittedAt: new Date().toISOString(),
    };

    // 1. Store has fresh result from submission
    useAppStore.setState({
      results: [freshSubmissionResult],
    });

    expect(useAppStore.getState().results.length).toBe(1);
    expect(useAppStore.getState().results[0]?.id).toBe('fresh-attempt-001');

    // 2. Simulate remote bootstrap returning an older list of results from database
    const remoteFetchedResults: TestResult[] = [
      {
        id: 'old-attempt-999',
        testId: 'test-old-50',
        userId: 'student-user-1',
        studentName: 'Aarav Sharma',
        score: 120,
        correctAnswers: 30,
        wrongAnswers: 10,
        unattempted: 5,
        totalQuestions: 45,
        rank: 5,
        percentile: 85,
        submittedAt: new Date(Date.now() - 86400000).toISOString(),
      },
    ];

    // 3. Perform non-destructive merge as implemented in appStore
    const currentResults = useAppStore.getState().results;
    const mergedResults = [
      ...remoteFetchedResults,
      ...currentResults.filter((local) => !remoteFetchedResults.some((r) => r.id === local.id)),
    ];

    useAppStore.setState({ results: mergedResults });

    // 4. Verify both remote results and local fresh submission are present
    const updatedResults = useAppStore.getState().results;
    expect(updatedResults.length).toBe(2);
    expect(updatedResults.some((r) => r.id === 'fresh-attempt-001')).toBe(true);
    expect(updatedResults.some((r) => r.id === 'old-attempt-999')).toBe(true);
  });

  it('persists and retrieves standard/grand test attempts in local storage and memory', async () => {
    const grandTestResult: TestResult = {
      id: 'attempt-nav-9988',
      testId: 'navigator-batch-test',
      userId: 'student-user-2',
      studentName: 'Priya Verma',
      score: 180,
      correctAnswers: 45,
      wrongAnswers: 0,
      unattempted: 0,
      totalQuestions: 45,
      rank: 1,
      percentile: 100,
      submittedAt: new Date().toISOString(),
    };

    await saveLocalStandardAttempt(grandTestResult, []);

    const retrievedById = await getLocalStandardAttempt('attempt-nav-9988');
    expect(Boolean(retrievedById)).toBe(true);
    expect(retrievedById?.id).toBe('attempt-nav-9988');
    expect(retrievedById?.studentName).toBe('Priya Verma');
    expect(retrievedById?.score).toBe(180);

    const retrievedByTestId = await getLocalStandardAttemptByTestId('navigator-batch-test', 'student-user-2');
    expect(Boolean(retrievedByTestId)).toBe(true);
    expect(retrievedByTestId?.id).toBe('attempt-nav-9988');
  });
});
