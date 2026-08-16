/**
 * Background Synchronization Worker for CBT Exam Engine
 * Features:
 * - 10-Second Batched Sync with ±2s random Jitter
 * - Decoupled Non-Blocking Architecture
 * - Network Disconnection Resiliency & Auto-Resume
 * - Version-based Conflict Resolution
 */

import { supabasePublicConfig } from '../../config/supabase.public';
import { clearSyncedQueue, getUnsyncedQueue } from './localStorageEngine';

export interface BackgroundSyncConfig {
  sessionId: string;
  userId: string;
  testId: string;
  baseIntervalMs?: number; // Default 10,000ms
  getTimeRemainingSeconds: () => number;
  getAllLocalAnswers: () => Record<string, unknown>;
  onSyncSuccess?: (syncedVersion: number, serverTime: string) => void;
  onSyncError?: (errorMsg: string) => void;
}

export class CbtBackgroundSyncWorker {
  private timerId: ReturnType<typeof setTimeout> | null = null;
  private isRunning = false;
  private currentVersion = 1;
  private isSyncing = false;

  constructor(private config: BackgroundSyncConfig) {}

  public start(): void {
    if (this.isRunning) return;
    this.isRunning = true;
    console.log(`[CBT Sync Worker] Started for Session: ${this.config.sessionId}`);
    this.scheduleNextSync();
  }

  public stop(): void {
    this.isRunning = false;
    if (this.timerId) {
      clearTimeout(this.timerId);
      this.timerId = null;
    }
    console.log(`[CBT Sync Worker] Stopped for Session: ${this.config.sessionId}`);
  }

  private scheduleNextSync(): void {
    if (!this.isRunning) return;

    // Add random jitter of ±2,000ms to prevent thundering herd effect across 300 students
    const baseMs = this.config.baseIntervalMs || 10_000;
    const jitter = Math.floor(Math.random() * 4000) - 2000; // -2000ms to +2000ms
    const interval = Math.max(5000, baseMs + jitter);

    this.timerId = setTimeout(() => {
      this.performSync().finally(() => {
        if (this.isRunning) this.scheduleNextSync();
      });
    }, interval);
  }

  public async performSync(): Promise<boolean> {
    if (this.isSyncing) return false;
    this.isSyncing = true;

    try {
      const queueItems = await getUnsyncedQueue(this.config.sessionId);
      const allAnswers = this.config.getAllLocalAnswers();

      // If no new queued changes and no urgent heartbeat needed, skip
      if (queueItems.length === 0 && Math.random() > 0.3) {
        this.isSyncing = false;
        return true;
      }

      this.currentVersion++;
      const workerUrl = supabasePublicConfig.workerUrl;

      const payload = {
        session_id: this.config.sessionId,
        user_id: this.config.userId,
        test_id: this.config.testId,
        version_id: this.currentVersion,
        time_remaining_seconds: this.config.getTimeRemainingSeconds(),
        answers_json: allAnswers,
        client_timestamp: new Date().toISOString()
      };

      const response = await fetch(`${workerUrl}/cbt/sync/batch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        throw new Error(`Sync HTTP error ${response.status}`);
      }

      const resData = await response.json() as {
        success: boolean;
        synced_version: number;
        server_timestamp: string;
      };

      // Clear local queue items up to this version
      await clearSyncedQueue(this.config.sessionId, this.currentVersion);

      if (this.config.onSyncSuccess) {
        this.config.onSyncSuccess(resData.synced_version, resData.server_timestamp);
      }

      this.isSyncing = false;
      return true;
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      console.warn(`[CBT Sync Worker] Sync failed (Offline/Network Error): ${errorMsg}`);
      if (this.config.onSyncError) {
        this.config.onSyncError(errorMsg);
      }
      this.isSyncing = false;
      return false;
    }
  }
}
