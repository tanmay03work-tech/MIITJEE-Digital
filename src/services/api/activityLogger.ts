/**
 * Production Activity Logger for Admin Panel
 *
 * Logs meaningful events to Supabase `admin_activity_logs` table.
 * Uses in-memory buffering with periodic batch flushes to minimize DB writes.
 *
 * WHAT IS LOGGED:
 *   - Auth events: login success/failure, session expired, device mismatch, sign out
 *   - Exam lifecycle: start, submit, auto-submit, offline save
 *   - Admin actions: create/delete/update test, batch, user role, leaderboard wipe
 *
 * WHAT IS NOT LOGGED:
 *   - Answer clicks, question navigation, timer ticks, API requests,
 *     background sync heartbeats, or any high-frequency client events.
 */

import { Platform } from 'react-native';
import { rpc } from '../supabase/client';

// ─── Types ───────────────────────────────────────────────────

export type ActivityCategory = 'auth' | 'exam' | 'admin_action';
export type ActivityStatus = 'success' | 'failed' | 'warning' | 'info';

export type AuthEventType =
  | 'LOGIN_SUCCESS'
  | 'LOGIN_FAILED'
  | 'SESSION_EXPIRED'
  | 'DEVICE_MISMATCH'
  | 'SIGN_OUT';

export type ExamEventType =
  | 'EXAM_STARTED'
  | 'EXAM_SUBMITTED'
  | 'EXAM_AUTO_SUBMITTED'
  | 'EXAM_OFFLINE_SAVED'
  | 'TEST_SUBMITTED';

export type AdminActionEventType =
  | 'TEST_CREATED'
  | 'TEST_UPDATED'
  | 'TEST_DELETED'
  | 'TEST_STARTED'
  | 'TEST_STOPPED'
  | 'BATCH_CREATED'
  | 'BATCH_DELETED'
  | 'USER_ROLE_CHANGED'
  | 'LEADERBOARD_WIPED'
  | 'ATTEMPT_DELETED'
  | 'QUESTION_SET_CREATED'
  | 'QUESTION_SET_DELETED';

export type ActivityEventType = AuthEventType | ExamEventType | AdminActionEventType;

interface ActivityLogPayload {
  userId?: string;
  studentName?: string;
  category: ActivityCategory;
  eventType: ActivityEventType;
  status: ActivityStatus;
  deviceInfo?: string;
  details?: Record<string, unknown>;
}

interface BufferedLog extends ActivityLogPayload {
  createdAt: string;
}

// ─── Constants ───────────────────────────────────────────────

const FLUSH_INTERVAL_MS = 30_000;
const MAX_BUFFER_SIZE = 50;
const DEDUP_WINDOW_MS = 5_000;

// ─── Singleton Logger ────────────────────────────────────────

class ActivityLogger {
  private buffer: BufferedLog[] = [];
  private flushTimer: ReturnType<typeof setInterval> | null = null;
  private isFlushing = false;
  private lastEventKeys = new Map<string, number>();

  /**
   * Start periodic auto-flush timer.
   * Call once at app startup (after auth is initialized).
   */
  start(): void {
    if (this.flushTimer) return;
    this.flushTimer = setInterval(() => {
      void this.flush();
    }, FLUSH_INTERVAL_MS);
  }

  /**
   * Stop auto-flush timer (e.g., on sign out).
   */
  stop(): void {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }
  }

  // ─── Category-Specific Helpers ───────────────────────────

  logAuth(
    eventType: AuthEventType,
    options: {
      userId?: string;
      studentName?: string;
      status: ActivityStatus;
      reason?: string;
      suggestedFix?: string;
      email?: string;
      deviceInfo?: string;
    },
  ): void {
    this.enqueue({
      userId: options.userId,
      studentName: options.studentName,
      category: 'auth',
      eventType,
      status: options.status,
      deviceInfo: options.deviceInfo || getDeviceString(),
      details: compactDetails({
        reason: options.reason,
        suggested_fix: options.suggestedFix,
        email: options.email,
      }),
    });
  }

  logExam(
    eventType: ExamEventType,
    options: {
      userId?: string;
      studentName?: string;
      testId?: string;
      testTitle?: string;
      status: ActivityStatus;
      reason?: string;
      timeRemaining?: number;
      score?: number;
    },
  ): void {
    this.enqueue({
      userId: options.userId,
      studentName: options.studentName,
      category: 'exam',
      eventType,
      status: options.status,
      deviceInfo: getDeviceString(),
      details: compactDetails({
        test_id: options.testId,
        test_title: options.testTitle,
        reason: options.reason,
        time_remaining_seconds: options.timeRemaining,
        score: options.score,
      }),
    });
  }

  logAdminAction(
    eventType: AdminActionEventType,
    options: {
      adminUserId?: string;
      adminName?: string;
      targetId?: string;
      targetName?: string;
      status?: ActivityStatus;
      reason?: string;
    },
  ): void {
    this.enqueue({
      userId: options.adminUserId,
      studentName: options.adminName,
      category: 'admin_action',
      eventType,
      status: options.status ?? 'success',
      details: compactDetails({
        target_id: options.targetId,
        target_name: options.targetName,
        reason: options.reason,
      }),
    });
  }

  // ─── Core Buffer Logic ───────────────────────────────────

  private enqueue(payload: ActivityLogPayload): void {
    // De-duplicate identical events within 5-second windows
    const dedupeKey = `${payload.category}:${payload.eventType}:${payload.userId ?? 'anon'}`;
    const now = Date.now();
    const lastTime = this.lastEventKeys.get(dedupeKey);

    if (lastTime && now - lastTime < DEDUP_WINDOW_MS) {
      return;
    }

    this.lastEventKeys.set(dedupeKey, now);

    this.buffer.push({
      ...payload,
      createdAt: new Date().toISOString(),
    });

    // Force flush if buffer is full
    if (this.buffer.length >= MAX_BUFFER_SIZE) {
      void this.flush();
    }
  }

  /**
   * Batch-insert all buffered logs to Supabase.
   * Safe to call multiple times; guards against concurrent flushes.
   */
  async flush(): Promise<void> {
    if (this.isFlushing || this.buffer.length === 0) return;
    this.isFlushing = true;

    const logsToSend = [...this.buffer];
    this.buffer = [];

    try {
      const payload = logsToSend.map((log) => ({
        user_id: log.userId || null,
        student_name: log.studentName || null,
        category: log.category,
        event_type: log.eventType,
        status: log.status,
        device_info: log.deviceInfo || null,
        details: log.details || null,
        created_at: log.createdAt,
      }));

      await rpc<void>('insert_activity_logs', { p_logs: payload });
    } catch {
      // On failure, push logs back to buffer so they aren't lost.
      // Limit buffer to avoid unbounded growth on persistent failures.
      this.buffer = [...logsToSend, ...this.buffer].slice(0, MAX_BUFFER_SIZE * 2);
    } finally {
      this.isFlushing = false;
    }

    // Prune old dedup keys
    const cutoff = Date.now() - DEDUP_WINDOW_MS * 2;
    for (const [key, ts] of this.lastEventKeys) {
      if (ts < cutoff) {
        this.lastEventKeys.delete(key);
      }
    }
  }
}

// ─── Helpers ─────────────────────────────────────────────────

function getDeviceString(): string {
  try {
    const os = Platform.OS;
    const version = Platform.Version;

    if (os === 'web') {
      return 'Desktop / Web';
    }

    return `${os.charAt(0).toUpperCase() + os.slice(1)} / ${version}`;
  } catch {
    return 'Unknown Device';
  }
}

function compactDetails(obj: Record<string, unknown>): Record<string, unknown> | undefined {
  const entries = Object.entries(obj).filter(
    ([, v]) => v !== undefined && v !== null && v !== '',
  );

  return entries.length > 0 ? Object.fromEntries(entries) : undefined;
}

// ─── Singleton Export ────────────────────────────────────────

export const activityLog = new ActivityLogger();
