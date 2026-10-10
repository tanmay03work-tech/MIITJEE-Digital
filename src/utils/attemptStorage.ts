import AsyncStorage from '@react-native-async-storage/async-storage';

export const ATTEMPT_SNAPSHOT_PREFIX = 'miitjee:exam-attempt-snapshot:';

export interface ExamAttemptSnapshot {
  testId: string;
  userId: string;
  answers: Record<string, string>;
  flaggedQuestionIds: string[];
  secondsRemaining: number;
  startedAt?: string;
  expiresAt?: string;
  studentName?: string;
  savedAt: string;
  isPendingSync: boolean;
  submissionState?: 'IN_PROGRESS' | 'TIME_EXPIRED' | 'SUBMITTING' | 'RETRY_PENDING' | 'SUBMITTED';
}

export async function saveAttemptSnapshot(snapshot: Omit<ExamAttemptSnapshot, 'savedAt'>): Promise<void> {
  try {
    const payload: ExamAttemptSnapshot = {
      ...snapshot,
      savedAt: new Date().toISOString(),
    };
    await AsyncStorage.setItem(`${ATTEMPT_SNAPSHOT_PREFIX}${snapshot.testId}`, JSON.stringify(payload));
  } catch {
    // Best-effort local persistence
  }
}

export async function loadAttemptSnapshot(testId: string): Promise<ExamAttemptSnapshot | null> {
  try {
    const raw = await AsyncStorage.getItem(`${ATTEMPT_SNAPSHOT_PREFIX}${testId}`);
    if (!raw) {
      return null;
    }
    return JSON.parse(raw) as ExamAttemptSnapshot;
  } catch {
    return null;
  }
}

export async function clearAttemptSnapshot(testId: string): Promise<void> {
  try {
    await AsyncStorage.removeItem(`${ATTEMPT_SNAPSHOT_PREFIX}${testId}`);
  } catch {
    // Best-effort removal
  }
}

export async function getPendingSyncSnapshots(): Promise<ExamAttemptSnapshot[]> {
  try {
    const keys = await AsyncStorage.getAllKeys();
    const snapshotKeys = keys.filter((key) => key.startsWith(ATTEMPT_SNAPSHOT_PREFIX));
    if (snapshotKeys.length === 0) {
      return [];
    }

    const pairs = await AsyncStorage.multiGet(snapshotKeys);
    const snapshots: ExamAttemptSnapshot[] = [];

    for (const [, value] of pairs) {
      if (value) {
        try {
          const parsed = JSON.parse(value) as ExamAttemptSnapshot;
          if (parsed.isPendingSync) {
            snapshots.push(parsed);
          }
        } catch {
          // Ignore parse errors
        }
      }
    }

    return snapshots;
  } catch {
    return [];
  }
}
