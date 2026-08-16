const { app } = require('electron');
const path = require('path');
const fs = require('fs');
const { createOrResumeJob, updateJobProgress, getJobStatus } = require('../services/pdf/jobTracker');

const LOCAL_BACKEND_URL = 'http://127.0.0.1:8787';

function log(msg) {
  process.stdout.write(msg + '\n');
}

app.on('window-all-closed', (e) => e.preventDefault());

app.whenReady().then(async () => {
  log('==================================================');
  log('PHASE 7 — PDF IMPORT JOB & RESUMABILITY VERIFICATION');
  log('==================================================');

  const testJobId = `synchroniser_resumability_test_${Date.now()}`;

  try {
    // 1. Initial Job Registration (Fresh Job)
    log(`[Test 1] Registering initial job ${testJobId} (24 pages total)...`);
    const initResult = await createOrResumeJob({
      jobId: testJobId,
      pdfName: 'Synchroniser.pdf',
      totalPages: 24,
      backendUrl: LOCAL_BACKEND_URL
    });

    log(`  - Fresh Job Registration: ${!initResult.isResumed ? 'PASS (Fresh)' : 'FAIL'}`);
    log(`  - Initial Status: "${initResult.job.status}" (Expected: "PENDING")`);
    log(`  - Initial Processed Pages: ${initResult.job.processed_pages}`);

    if (initResult.isResumed || initResult.job.status !== 'PENDING') {
      throw new Error('Fresh job initialization failed!');
    }

    // 2. Process Page 1 and Page 2, then simulate crash
    log('\n[Test 2] Processing Pages 1 & 2, then simulating crash after Page 2...');
    
    // Page 1 update
    await updateJobProgress({
      jobId: testJobId,
      lastProcessedPage: 1,
      questionsDetected: 5,
      questionsCreated: 5,
      needsReviewCount: 0,
      status: 'PROCESSING',
      backendUrl: LOCAL_BACKEND_URL
    });

    // Page 2 update (Q113 with diagram)
    const page2Progress = await updateJobProgress({
      jobId: testJobId,
      lastProcessedPage: 2,
      questionsDetected: 4,
      questionsCreated: 4,
      diagramsDetected: 1,
      diagramsUploaded: 1,
      needsReviewCount: 0,
      status: 'PROCESSING',
      backendUrl: LOCAL_BACKEND_URL
    });

    log(`  - Checkpoint state after Page 2: last_processed_page=${page2Progress.last_processed_page}, questions_created=${page2Progress.questions_created}, diagrams_uploaded=${page2Progress.diagrams_uploaded}`);
    if (page2Progress.last_processed_page !== 2 || page2Progress.diagrams_uploaded !== 1) {
      throw new Error('Page 2 progress checkpoint update failed!');
    }

    log('  - [SIMULATING DESKTOP APP CRASH AT PAGE 2] - Connection closed.');

    // 3. Resume Job from Crash Checkpoint
    log('\n[Test 3] Re-launching application & resuming job from checkpoint...');
    const resumeResult = await createOrResumeJob({
      jobId: testJobId,
      pdfName: 'Synchroniser.pdf',
      totalPages: 24,
      backendUrl: LOCAL_BACKEND_URL
    });

    log(`  - Resume Detection: ${resumeResult.isResumed ? 'PASS (Resumed)' : 'FAIL'}`);
    log(`  - Checkpoint last_processed_page: ${resumeResult.job.last_processed_page}`);

    if (!resumeResult.isResumed || resumeResult.job.last_processed_page !== 2) {
      throw new Error('Job failed to resume from page 2 checkpoint!');
    }

    // Determine next page to process (last_processed_page + 1)
    const resumeStartPage = resumeResult.job.last_processed_page + 1;
    log(`  - Resuming processing directly from Page ${resumeStartPage} (Skipped Pages 1 & 2)...`);

    if (resumeStartPage !== 3) {
      throw new Error(`Expected resume start page to be 3, got ${resumeStartPage}`);
    }

    // 4. Process Page 3 and complete job
    log('\n[Test 4] Processing Page 3 and finalizing import job...');
    const finalJobState = await updateJobProgress({
      jobId: testJobId,
      lastProcessedPage: 3,
      questionsDetected: 5,
      questionsCreated: 5,
      diagramsDetected: 1,
      diagramsUploaded: 1,
      needsReviewCount: 0,
      status: 'COMPLETED',
      backendUrl: LOCAL_BACKEND_URL
    });

    log(`  - Final Job Status: "${finalJobState.status}" (Expected: "COMPLETED")`);
    log(`  - Total Processed Pages: ${finalJobState.processed_pages}`);
    log(`  - Total Questions Created: ${finalJobState.questions_created}`);
    log(`  - Total Diagrams Uploaded: ${finalJobState.diagrams_uploaded}`);

    if (finalJobState.status !== 'COMPLETED' || finalJobState.processed_pages !== 3) {
      throw new Error('Final job completion update failed!');
    }

    log('\n--------------------------------------------------');
    log('PHASE 7 VERIFICATION RESULT: PDF IMPORT JOB & RESUMABILITY PASSED SUCCESSFULLY!');
    log('--------------------------------------------------');

    setTimeout(() => app.exit(0), 100);
  } catch (err) {
    log(`\n[FAIL] Phase 7 Verification Error: ${err.message}`);
    setTimeout(() => app.exit(1), 100);
  }
});
