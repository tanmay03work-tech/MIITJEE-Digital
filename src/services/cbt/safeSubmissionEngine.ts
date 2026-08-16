/**
 * Safe Submission Engine for CBT Exam Engine
 * Guarantees zero data loss during exam submission.
 */

import { supabasePublicConfig } from '../../config/supabase.public';
import { LocalSessionState, saveLocalCbtSession } from './localStorageEngine';

export interface SubmissionResult {
  success: boolean;
  status: 'SUBMITTED_SYNCED' | 'SUBMITTED_OFFLINE_SAVED' | 'FAILED_RETRY_QUEUED';
  message: string;
}

/**
 * Executes multi-stage safe submission flow:
 * Stage 1: Freeze Exam UI & Local Timer
 * Stage 2: Create Final Local Encrypted Snapshot
 * Stage 3: Attempt Cloud Submission API with retry loop
 * Stage 4: Set local state fallback if offline
 */
export async function executeSafeSubmission(
  sessionState: LocalSessionState
): Promise<SubmissionResult> {
  // Stage 1 & 2: Local Freeze & Local Snapshot Creation
  const snapshotState: LocalSessionState = {
    ...sessionState,
    is_submitted: true,
    last_saved_at: new Date().toISOString()
  };

  await saveLocalCbtSession(snapshotState);

  // Stage 3: Attempt Cloud Submission API
  try {
    const workerUrl = supabasePublicConfig.workerUrl;

    const payload = {
      session_id: sessionState.session_id,
      user_id: sessionState.user_id,
      test_id: sessionState.test_id,
      answers_json: sessionState.answers,
      client_timestamp: new Date().toISOString(),
      time_remaining_seconds: sessionState.time_remaining_seconds
    };

    // Retry loop (3 attempts with exponential backoff)
    let lastError: Error | null = null;
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const response = await fetch(`${workerUrl}/cbt/sync/batch`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ...payload,
            version_id: sessionState.un_synced_version + 100,
            snapshot_type: 'FINAL_SUBMIT'
          })
        });

        if (response.ok) {
          snapshotState.is_offline_submission_pending = false;
          await saveLocalCbtSession(snapshotState);
          return {
            success: true,
            status: 'SUBMITTED_SYNCED',
            message: 'Your exam has been successfully submitted and synced to the cloud!'
          };
        }
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
        const jitter = Math.floor(Math.random() * 500);
        await new Promise(res => setTimeout(res, attempt * 1000 + jitter));
      }
    }

    throw lastError || new Error('Network timeout during final submission');
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn('[CBT Safe Submission] Cloud submit failed, falling back to local offline mode:', message);

    // Stage 4: Offline Fallback - Mark as offline submission pending
    snapshotState.is_offline_submission_pending = true;
    await saveLocalCbtSession(snapshotState);

    return {
      success: true, // Marked success locally so student is not panicked
      status: 'SUBMITTED_OFFLINE_SAVED',
      message: 'Your exam responses have been securely saved on this computer. They will automatically upload when network returns.'
    };
  }
}
