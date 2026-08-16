const { app } = require('electron');
const path = require('path');
const fs = require('fs');
const { saveQuestionsToStore } = require('../services/questions/questionStore');

const LOCAL_BACKEND_URL = 'http://127.0.0.1:8787';

function log(msg) {
  process.stdout.write(msg + '\n');
}

app.on('window-all-closed', (e) => e.preventDefault());

app.whenReady().then(async () => {
  log('==================================================');
  log('PHASE 5 — QUESTION PERSISTENCE & NEEDS_REVIEW VERIFICATION');
  log('==================================================');

  try {
    // 1. Security Audit: Check client code for service role key
    log('[Test 1] Security Audit: Checking desktop client source code for service-role keys...');
    const storeClientSource = fs.readFileSync(path.join(__dirname, '../services/questions/questionStore.js'), 'utf8');
    const hasServiceRoleKey = /service_role_key\s*=\s*['"]|eyJhbGciOi/i.test(storeClientSource);
    log(`  - Hardcoded Service-Role Key check: ${hasServiceRoleKey ? 'FAIL (Exposed!)' : 'PASS (Secure)'}`);
    if (hasServiceRoleKey) {
      throw new Error('SECURITY VIOLATION: Service role key detected in Desktop client!');
    }

    // 2. Prepare Sample Batch with Valid and Questionable Extraction Records
    log('\n[Test 2] Preparing test question batch (Valid + Questionable records)...');
    const batch = [
      // Record 1: Valid Q113 with Diagram -> Should be APPROVED
      {
        question_number: '113',
        question_text: 'Given below is a diagram of the left human hindlimb as seen from the front...',
        options: ['Tibia and tarsals', 'Femur and fibula', 'Fibula and phalanges', 'Femur and tarsals'],
        correct_answer: 'Femur and fibula',
        explanation: 'Femur and fibula are incorrectly labelled in figure',
        has_diagram: true,
        diagram_bbox: [17, 551, 248, 777],
        image_url: '/api/pdf/diagram/synchroniser_test/q_113_p2.png',
        source_page: 2,
        confidence_score: 0.98
      },
      // Record 2: Question marked has_diagram:true but image_url is missing -> Should trigger NEEDS_REVIEW (MISSING_DIAGRAM_URL)
      {
        question_number: '114',
        question_text: 'Diagram missing image test question...',
        options: ['Opt A', 'Opt B', 'Opt C', 'Opt D'],
        correct_answer: 'Opt A',
        explanation: 'Missing diagram image',
        has_diagram: true,
        diagram_bbox: [100, 100, 200, 200],
        image_url: null,
        source_page: 2,
        confidence_score: 0.90
      },
      // Record 3: Question with fewer than 4 options -> Should trigger NEEDS_REVIEW (INVALID_OPTIONS_COUNT)
      {
        question_number: '115',
        question_text: 'Invalid options count test question...',
        options: ['Opt A', 'Opt B'],
        correct_answer: 'Opt A',
        explanation: 'Incomplete options list',
        has_diagram: false,
        diagram_bbox: [0, 0, 0, 0],
        image_url: null,
        source_page: 2,
        confidence_score: 0.95
      },
      // Record 4: Question with low confidence score (<0.85) -> Should trigger NEEDS_REVIEW (LOW_CONFIDENCE_SCORE)
      {
        question_number: '116',
        question_text: 'Low confidence test question...',
        options: ['Opt A', 'Opt B', 'Opt C', 'Opt D'],
        correct_answer: 'Opt B',
        explanation: 'Low model confidence',
        has_diagram: false,
        diagram_bbox: [0, 0, 0, 0],
        image_url: null,
        source_page: 2,
        confidence_score: 0.72
      },
      // Record 5: Duplicate Question Number -> Should trigger NEEDS_REVIEW (DUPLICATE_QUESTION_NUMBER)
      {
        question_number: '113',
        question_text: 'Duplicate Q113 question prompt...',
        options: ['Opt A', 'Opt B', 'Opt C', 'Opt D'],
        correct_answer: 'Opt A',
        explanation: 'Duplicate entry',
        has_diagram: false,
        diagram_bbox: [0, 0, 0, 0],
        image_url: null,
        source_page: 2,
        confidence_score: 0.95
      }
    ];

    // 3. Save Batch via Backend Proxy
    log('\n[Test 3] Submitting question batch to backend proxy POST /api/pdf/save-questions...');
    const result = await saveQuestionsToStore({
      setId: 'synchroniser_persistence_test',
      questions: batch,
      backendUrl: LOCAL_BACKEND_URL
    });

    log('  - Save HTTP Response: SUCCESS');
    log(`  - Total Saved Count: ${result.savedCount}`);
    log(`  - Approved Count: ${result.approvedCount}`);
    log(`  - Needs Review Count: ${result.needsReviewCount}`);

    if (result.savedCount !== 5) {
      throw new Error(`Expected 5 saved questions, got ${result.savedCount}`);
    }

    if (result.approvedCount !== 1) {
      throw new Error(`Expected exactly 1 APPROVED question (Q113), got ${result.approvedCount}`);
    }

    if (result.needsReviewCount !== 4) {
      throw new Error(`Expected exactly 4 NEEDS_REVIEW questions, got ${result.needsReviewCount}`);
    }

    // 4. Audit Individual Review Reasons
    log('\n[Test 4] Auditing individual question review reasons...');

    const q113 = result.questions.find(q => q.question_number === '113' && q.review_status === 'APPROVED');
    log(`  - Q113 APPROVED Check: ${q113 ? 'PASS' : 'FAIL'}`);
    if (!q113) throw new Error('Q113 was expected to be APPROVED!');

    const q114 = result.questions.find(q => q.question_number === '114');
    log(`  - Q114 NEEDS_REVIEW Reasons: [${q114?.review_reasons.join('; ')}]`);
    if (!q114?.review_reasons.some(r => r.includes('MISSING_DIAGRAM_URL'))) {
      throw new Error('Q114 failed to trigger MISSING_DIAGRAM_URL rule!');
    }

    const q115 = result.questions.find(q => q.question_number === '115');
    log(`  - Q115 NEEDS_REVIEW Reasons: [${q115?.review_reasons.join('; ')}]`);
    if (!q115?.review_reasons.some(r => r.includes('INVALID_OPTIONS_COUNT'))) {
      throw new Error('Q115 failed to trigger INVALID_OPTIONS_COUNT rule!');
    }

    const q116 = result.questions.find(q => q.question_number === '116');
    log(`  - Q116 NEEDS_REVIEW Reasons: [${q116?.review_reasons.join('; ')}]`);
    if (!q116?.review_reasons.some(r => r.includes('LOW_CONFIDENCE_SCORE'))) {
      throw new Error('Q116 failed to trigger LOW_CONFIDENCE_SCORE rule!');
    }

    const qDup = result.questions.find(q => q.review_reasons.some(r => r.includes('DUPLICATE_QUESTION_NUMBER')));
    log(`  - Duplicate Q113 NEEDS_REVIEW Reasons: [${qDup?.review_reasons.join('; ')}]`);
    if (!qDup) throw new Error('Duplicate question failed to trigger DUPLICATE_QUESTION_NUMBER rule!');

    log('\n--------------------------------------------------');
    log('PHASE 5 VERIFICATION RESULT: QUESTION PERSISTENCE & NEEDS_REVIEW PASSED SUCCESSFULLY!');
    log('--------------------------------------------------');

    setTimeout(() => app.exit(0), 100);
  } catch (err) {
    log(`\n[FAIL] Phase 5 Verification Error: ${err.message}`);
    setTimeout(() => app.exit(1), 100);
  }
});
