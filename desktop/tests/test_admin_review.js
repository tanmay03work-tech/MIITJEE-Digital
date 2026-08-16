const { app } = require('electron');
const path = require('path');
const fs = require('fs');
const { saveQuestionsToStore } = require('../services/questions/questionStore');
const { fetchQuestionsForReview, approveQuestion } = require('../services/admin/adminReviewService');

const LOCAL_BACKEND_URL = 'http://127.0.0.1:8787';

function log(msg) {
  process.stdout.write(msg + '\n');
}

app.on('window-all-closed', (e) => e.preventDefault());

app.whenReady().then(async () => {
  log('==================================================');
  log('PHASE 8 — ADMIN REVIEW & QUESTION APPROVAL VERIFICATION');
  log('==================================================');

  const testSetId = `admin_review_test_set_${Date.now()}`;

  try {
    // 1. Seed Batch into Question Store
    log(`[Test 1] Seeding test questions into store for set ${testSetId}...`);
    const seedBatch = [
      {
        question_number: '113',
        question_text: 'Given below is a diagram of the left human hindlimb...',
        options: ['Opt A', 'Opt B', 'Opt C', 'Opt D'],
        correct_answer: 'Femur and fibula',
        has_diagram: true,
        diagram_bbox: [17, 551, 248, 777],
        image_url: `/api/pdf/diagram/${testSetId}/q_113_p2.png`,
        source_page: 2,
        confidence_score: 0.98
      },
      {
        question_number: '114',
        question_text: 'Missing diagram image test question...',
        options: ['Opt A', 'Opt B', 'Opt C', 'Opt D'],
        correct_answer: 'Opt A',
        has_diagram: true,
        diagram_bbox: [100, 100, 200, 200],
        image_url: null, // Triggers NEEDS_REVIEW
        source_page: 2,
        confidence_score: 0.90
      },
      {
        question_number: '115',
        question_text: 'Incomplete options count test question...',
        options: ['Opt A', 'Opt B'], // Triggers NEEDS_REVIEW
        correct_answer: 'Opt A',
        has_diagram: false,
        diagram_bbox: [0, 0, 0, 0],
        image_url: null,
        source_page: 2,
        confidence_score: 0.95
      }
    ];

    const saveResult = await saveQuestionsToStore({
      setId: testSetId,
      questions: seedBatch,
      backendUrl: LOCAL_BACKEND_URL
    });

    log(`  - Seeded ${saveResult.savedCount} questions: ${saveResult.approvedCount} APPROVED, ${saveResult.needsReviewCount} NEEDS_REVIEW.`);
    if (saveResult.approvedCount !== 1 || saveResult.needsReviewCount !== 2) {
      throw new Error('Seed batch status distribution mismatch!');
    }

    // 2. Fetch NEEDS_REVIEW List
    log('\n[Test 2] Fetching questions filtered by status="NEEDS_REVIEW"...');
    const needsReviewList = await fetchQuestionsForReview({
      status: 'NEEDS_REVIEW',
      setId: testSetId,
      backendUrl: LOCAL_BACKEND_URL
    });

    log(`  - Fetched ${needsReviewList.length} NEEDS_REVIEW questions.`);
    log(`  - Returned Question Numbers: [${needsReviewList.map(q => q.question_number).join(', ')}]`);

    if (needsReviewList.length !== 2) {
      throw new Error(`Expected 2 NEEDS_REVIEW questions, got ${needsReviewList.length}`);
    }

    // 3. Admin Correction & Approval Test
    const targetQ114 = needsReviewList.find(q => q.question_number === '114');
    if (!targetQ114) throw new Error('Q114 not found in NEEDS_REVIEW list!');

    log(`\n[Test 3] Admin approving Q114 (ID: ${targetQ114.id}) after supplying valid diagram URL...`);
    log(`  - Pre-approval status: "${targetQ114.review_status}", reasons: [${targetQ114.review_reasons.join('; ')}]`);

    const approvedQ114 = await approveQuestion({
      questionId: targetQ114.id,
      updatedFields: {
        image_url: `/api/pdf/diagram/${testSetId}/q_114_p2.png`
      },
      backendUrl: LOCAL_BACKEND_URL
    });

    log(`  - Post-approval status: "${approvedQ114.review_status}" (Expected: "APPROVED")`);
    log(`  - Post-approval reasons length: ${approvedQ114.review_reasons.length} (Expected: 0)`);
    log(`  - Updated Image URL: "${approvedQ114.image_url}"`);

    if (approvedQ114.review_status !== 'APPROVED' || approvedQ114.review_reasons.length !== 0) {
      throw new Error('Approval transition failed!');
    }

    // 4. Re-Query Verification
    log('\n[Test 4] Re-querying review lists after Q114 approval...');
    const updatedNeedsReview = await fetchQuestionsForReview({
      status: 'NEEDS_REVIEW',
      setId: testSetId,
      backendUrl: LOCAL_BACKEND_URL
    });

    const updatedApproved = await fetchQuestionsForReview({
      status: 'APPROVED',
      setId: testSetId,
      backendUrl: LOCAL_BACKEND_URL
    });

    log(`  - Updated NEEDS_REVIEW count: ${updatedNeedsReview.length} (Expected: 1)`);
    log(`  - Updated APPROVED count: ${updatedApproved.length} (Expected: 2)`);

    if (updatedNeedsReview.length !== 1 || updatedApproved.length !== 2) {
      throw new Error('Re-query counts mismatch after approval!');
    }

    log('\n--------------------------------------------------');
    log('PHASE 8 VERIFICATION RESULT: ADMIN REVIEW & APPROVAL PASSED SUCCESSFULLY!');
    log('--------------------------------------------------');

    setTimeout(() => app.exit(0), 100);
  } catch (err) {
    log(`\n[FAIL] Phase 8 Verification Error: ${err.message}`);
    setTimeout(() => app.exit(1), 100);
  }
});
