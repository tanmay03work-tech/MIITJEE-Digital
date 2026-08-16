const { app } = require('electron');
const path = require('path');
const fs = require('fs');
const { parseAnswerKeyGridText, reconcileQuestionsWithAnswerKey } = require('../services/pdf/answerKeyExtractor');

function log(msg) {
  process.stdout.write(msg + '\n');
}

app.on('window-all-closed', (e) => e.preventDefault());

app.whenReady().then(async () => {
  log('==================================================');
  log('PHASE 6 — ANSWER KEY EXTRACTION AUTOMATED VERIFICATION');
  log('==================================================');

  try {
    // Test 1: Grid Text Parsing Test on Synchroniser Page 8 Text
    log('[Test 1] Testing parseAnswerKeyGridText on Synchroniser Page 8 grid text...');
    const page8TextSample = `
MIITJEE Classes
Synchroniser (Answer Key)
91 - B
92 - B
93 - A
94 - B
113 - B
132 - B
138 - C
139 - C
180 - A
`.trim();

    const gridMap = parseAnswerKeyGridText(page8TextSample);
    log(`  - Parsed ${Object.keys(gridMap).length} answer key entries from grid text.`);
    log(`  - Q94 Answer: ${gridMap['94']}`);
    log(`  - Q113 Answer: ${gridMap['113']}`);
    log(`  - Q132 Answer: ${gridMap['132']}`);
    log(`  - Q138 Answer: ${gridMap['138']}`);
    log(`  - Q139 Answer: ${gridMap['139']}`);

    if (gridMap['94'] !== 'B' || gridMap['113'] !== 'B' || gridMap['132'] !== 'B' || gridMap['138'] !== 'C' || gridMap['139'] !== 'C') {
      throw new Error('Grid text parsing failed for reference questions!');
    }

    // Test 2: Strict Question Number Reconciliation Test (Anti-FIFO)
    log('\n[Test 2] Testing strict question_number reconciliation (Anti-FIFO validation)...');
    
    // Out of order question array to prove non-positional matching
    const sampleQuestions = [
      {
        question_number: '138',
        question_text: 'A diagram showing an axon terminal and a synapse is given...',
        options: ['A', 'B', 'C', 'D'],
        correct_answer: 'C',
        review_status: 'APPROVED',
        review_reasons: []
      },
      {
        question_number: '113',
        question_text: 'Given below is a diagram of the left human hindlimb...',
        options: ['A', 'B', 'C', 'D'],
        correct_answer: 'B',
        review_status: 'APPROVED',
        review_reasons: []
      },
      // Conflicting answer test (Question says A, Answer Key says B)
      {
        question_number: '94',
        question_text: 'In a population in Hardy-Weinberg equilibrium...',
        options: ['A', 'B', 'C', 'D'],
        correct_answer: 'A', // Conflict!
        review_status: 'APPROVED',
        review_reasons: []
      },
      // Missing Answer Key entry test (Q999 not in Answer Key)
      {
        question_number: '999',
        question_text: 'Question without answer key entry...',
        options: ['A', 'B', 'C', 'D'],
        correct_answer: '', // Missing!
        review_status: 'APPROVED',
        review_reasons: []
      }
    ];

    const reconciled = reconcileQuestionsWithAnswerKey(sampleQuestions, gridMap);
    log(`  - Reconciled ${reconciled.length} questions successfully.`);

    const q138Rec = reconciled.find(q => q.question_number === '138');
    log(`  - Q138 Match check: ${q138Rec?.correct_answer === 'C' && q138Rec?.review_status === 'APPROVED' ? 'PASS' : 'FAIL'}`);

    const q113Rec = reconciled.find(q => q.question_number === '113');
    log(`  - Q113 Match check: ${q113Rec?.correct_answer === 'B' && q113Rec?.review_status === 'APPROVED' ? 'PASS' : 'FAIL'}`);

    const q94Rec = reconciled.find(q => q.question_number === '94');
    log(`  - Q94 Mismatch check: ${q94Rec?.review_status === 'NEEDS_REVIEW' && q94Rec?.review_reasons.some(r => r.includes('ANSWER_KEY_MISMATCH')) ? 'PASS (Flagged Mismatch)' : 'FAIL'}`);

    const q999Rec = reconciled.find(q => q.question_number === '999');
    log(`  - Q999 Missing Answer Key check: ${q999Rec?.review_status === 'NEEDS_REVIEW' && q999Rec?.review_reasons.some(r => r.includes('MISSING_ANSWER_KEY')) ? 'PASS (Flagged Missing)' : 'FAIL'}`);

    if (q138Rec?.review_status !== 'APPROVED' || q113Rec?.review_status !== 'APPROVED') {
      throw new Error('Valid question reconciliation failed!');
    }

    if (q94Rec?.review_status !== 'NEEDS_REVIEW' || q999Rec?.review_status !== 'NEEDS_REVIEW') {
      throw new Error('Mismatch / missing answer key flagging failed!');
    }

    log('\n--------------------------------------------------');
    log('PHASE 6 VERIFICATION RESULT: ANSWER KEY EXTRACTION PASSED SUCCESSFULLY!');
    log('--------------------------------------------------');

    setTimeout(() => app.exit(0), 100);
  } catch (err) {
    log(`\n[FAIL] Phase 6 Verification Error: ${err.message}`);
    setTimeout(() => app.exit(1), 100);
  }
});
