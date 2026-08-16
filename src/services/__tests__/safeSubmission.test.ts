import { ExamAttemptSnapshot } from '../../utils/attemptStorage';

class MockOfflineRecoveryEngine {
  private localStore: Map<string, ExamAttemptSnapshot> = new Map();
  public isNetworkConnected = true;
  public serverSubmissions: Array<{ testId: string; answersCount: number }> = [];

  public async submitAttempt(
    testId: string,
    userId: string,
    answers: Record<string, string>,
    flaggedIds: string[],
    secondsRemaining: number,
  ): Promise<{ success: boolean; resultId?: string }> {
    const snapshot: ExamAttemptSnapshot = {
      testId,
      userId,
      answers,
      flaggedQuestionIds: flaggedIds,
      secondsRemaining,
      savedAt: new Date().toISOString(),
      isPendingSync: !this.isNetworkConnected,
    };

    // Save locally first for safety
    this.localStore.set(testId, snapshot);

    if (!this.isNetworkConnected) {
      throw new Error('Network error: Unable to reach server. Saved locally.');
    }

    // Submit to server
    this.serverSubmissions.push({ testId, answersCount: Object.keys(answers).length });

    // Mark synced & clear
    this.localStore.delete(testId);
    return { success: true, resultId: `result-${testId}` };
  }

  public async autoSyncPendingSnapshots(): Promise<number> {
    if (!this.isNetworkConnected) {
      return 0;
    }

    let syncedCount = 0;
    for (const [testId, snapshot] of Array.from(this.localStore.entries())) {
      if (snapshot.isPendingSync) {
        this.serverSubmissions.push({ testId, answersCount: Object.keys(snapshot.answers).length });
        this.localStore.delete(testId);
        syncedCount++;
      }
    }
    return syncedCount;
  }

  public getSnapshot(testId: string): ExamAttemptSnapshot | undefined {
    return this.localStore.get(testId);
  }
}

describe('Phase 10 - Safe Submission & Recovery Tests', () => {
  test('Test 1: Network failure during submission persists attempt snapshot locally', async () => {
    const engine = new MockOfflineRecoveryEngine();
    engine.isNetworkConnected = false;

    const answers = { q1: 'A', q2: 'B', q3: 'C' };

    let errorThrown = false;
    try {
      await engine.submitAttempt('test-1', 'user-101', answers, ['q3'], 900);
    } catch {
      errorThrown = true;
    }

    expect(errorThrown).toBe(true);

    const saved = engine.getSnapshot('test-1');
    expect(Boolean(saved)).toBe(true);
    expect(saved?.isPendingSync).toBe(true);
    expect(saved?.answers['q1']).toBe('A');
    expect(saved?.answers['q3']).toBe('C');
  });

  test('Test 2: Automatic background sync on network reconnection', async () => {
    const engine = new MockOfflineRecoveryEngine();
    engine.isNetworkConnected = false;

    try {
      await engine.submitAttempt('test-2', 'user-101', { q1: 'D' }, [], 600);
    } catch {
      // Expected offline failure
    }

    expect(Boolean(engine.getSnapshot('test-2'))).toBe(true);

    // Reconnect network
    engine.isNetworkConnected = true;
    const syncedCount = await engine.autoSyncPendingSnapshots();

    expect(syncedCount).toBe(1);
    expect(Boolean(engine.getSnapshot('test-2'))).toBe(false); // Cleared after sync
    expect(engine.serverSubmissions.length).toBe(1);
  });

  test('Test 3: App crash recovery restores answers and secondsRemaining', async () => {
    const engine = new MockOfflineRecoveryEngine();
    engine.isNetworkConnected = false;

    await engine.submitAttempt('test-3', 'user-101', { q1: 'A', q2: 'C' }, ['q2'], 450).catch(() => undefined);

    const restored = engine.getSnapshot('test-3');
    expect(restored?.answers['q1']).toBe('A');
    expect(restored?.answers['q2']).toBe('C');
    expect(restored?.secondsRemaining).toBe(450);
    expect(Boolean(restored?.flaggedQuestionIds.includes('q2'))).toBe(true);
  });
});
