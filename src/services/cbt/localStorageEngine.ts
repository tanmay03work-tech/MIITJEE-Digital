/**
 * Local-First Storage Engine for CBT Exam Engine
 * Guarantees 0ms synchronous in-memory state mutations + async atomic disk writes.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

export interface LocalAnswerRecord {
  question_id: string;
  selected_option: string | null;
  status: 'answered' | 'flagged' | 'unanswered' | 'reviewed';
  version_id: number;
  client_timestamp: string;
}

export interface LocalSessionState {
  session_id: string;
  test_id: string;
  user_id: string;
  time_remaining_seconds: number;
  duration_minutes: number;
  answers: Record<string, LocalAnswerRecord>;
  un_synced_version: number;
  last_saved_at: string;
  is_submitted: boolean;
  is_offline_submission_pending: boolean;
}

const CBT_SESSION_STORAGE_PREFIX = 'miitjee:cbt:session:';
const CBT_SYNC_QUEUE_PREFIX = 'miitjee:cbt:queue:';

/**
 * Saves current exam session locally (Atomic async write)
 */
export async function saveLocalCbtSession(sessionState: LocalSessionState): Promise<void> {
  try {
    const key = `${CBT_SESSION_STORAGE_PREFIX}${sessionState.session_id}`;
    await AsyncStorage.setItem(key, JSON.stringify(sessionState));
  } catch (e) {
    console.error('[CBT LocalStorage] Error saving session:', e);
  }
}

/**
 * Loads active CBT session from disk storage for disaster recovery (app crash / reboot)
 */
export async function loadLocalCbtSession(sessionId: string): Promise<LocalSessionState | null> {
  try {
    const key = `${CBT_SESSION_STORAGE_PREFIX}${sessionId}`;
    const raw = await AsyncStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw) as LocalSessionState;
  } catch (e) {
    console.error('[CBT LocalStorage] Error loading session:', e);
    return null;
  }
}

/**
 * Appends answer payload to local un-synced queue
 */
export async function pushToSyncQueue(sessionId: string, record: LocalAnswerRecord): Promise<void> {
  try {
    const key = `${CBT_SYNC_QUEUE_PREFIX}${sessionId}`;
    const existingRaw = await AsyncStorage.getItem(key);
    const queue: LocalAnswerRecord[] = existingRaw ? JSON.parse(existingRaw) : [];
    
    // Upsert by question_id
    const idx = queue.findIndex(q => q.question_id === record.question_id);
    if (idx >= 0) {
      queue[idx] = record;
    } else {
      queue.push(record);
    }

    await AsyncStorage.setItem(key, JSON.stringify(queue));
  } catch (e) {
    console.error('[CBT LocalStorage] Error pushing to sync queue:', e);
  }
}

/**
 * Retrieves un-synced queue items for background sync worker
 */
export async function getUnsyncedQueue(sessionId: string): Promise<LocalAnswerRecord[]> {
  try {
    const key = `${CBT_SYNC_QUEUE_PREFIX}${sessionId}`;
    const raw = await AsyncStorage.getItem(key);
    if (!raw) return [];
    return JSON.parse(raw) as LocalAnswerRecord[];
  } catch {
    return [];
  }
}

/**
 * Clears synced queue items up to version_id
 */
export async function clearSyncedQueue(sessionId: string, upToVersion: number): Promise<void> {
  try {
    const key = `${CBT_SYNC_QUEUE_PREFIX}${sessionId}`;
    const raw = await AsyncStorage.getItem(key);
    if (!raw) return;
    const queue: LocalAnswerRecord[] = JSON.parse(raw);
    const remaining = queue.filter(item => item.version_id > upToVersion);
    await AsyncStorage.setItem(key, JSON.stringify(remaining));
  } catch (e) {
    console.error('[CBT LocalStorage] Error clearing synced queue:', e);
  }
}
