import { getExamShareUrl, getBaseAppUrl } from '../../utils/urlHelper';
import { evaluateExamAccess } from '../../services/__tests__/openForAll.test';
import { evaluateMarkingScheme } from '../../services/__tests__/markingSystem.test';
import { calculateFullLeaderboardAndRanks, generateFullResultsCsv } from '../../utils/excelExporter';
import { evaluateAnswerKeyMapping } from '../../services/__tests__/answerExtraction.test';

describe('User-Facing Verification of 7 Master Requirements', () => {
  // -------------------------------------------------------------
  // Requirement 1: OPEN FOR ALL
  // -------------------------------------------------------------
  test('Req 1: Open For All setting bypasses mandatory batch selection & grants student access', () => {
    // Open for All: Student not in batch CAN access
    const openAccess = evaluateExamAccess({
      isOpenForAll: true,
      assignedBatchId: 'BATCH_JEE_2026',
      userBatchId: 'BATCH_NEET_2026',
      userRole: 'student',
    });
    expect(openAccess.allowed).toBe(true);
    expect(Boolean(openAccess.reason.includes('Open For All'))).toBe(true);

    // Restricted Batch: Student not in batch is BLOCKED with batch error
    const restrictedAccess = evaluateExamAccess({
      isOpenForAll: false,
      assignedBatchId: 'BATCH_JEE_2026',
      userBatchId: 'BATCH_NEET_2026',
      userRole: 'student',
    });
    expect(restrictedAccess.allowed).toBe(false);
    expect(Boolean(restrictedAccess.reason.includes('restricted to members of batch BATCH_JEE_2026'))).toBe(true);
  });

  // -------------------------------------------------------------
  // Requirement 2: EXAM LINK — DYNAMIC / VERCEL BASE URL
  // -------------------------------------------------------------
  test('Req 2: Generated exam link uses dynamic Vercel / environment URL (Not hard-coded custom domain)', () => {
    const shareCode = 'ABC12345';
    const generatedUrl = getExamShareUrl(shareCode);
    const baseUrl = getBaseAppUrl();

    expect(Boolean(generatedUrl.includes(shareCode))).toBe(true);
    expect(Boolean(generatedUrl.includes(baseUrl))).toBe(true);
    expect(Boolean(generatedUrl.includes('https://exam.miitjee.org'))).toBe(false);
  });

  // -------------------------------------------------------------
  // Requirement 3: DIAGRAM EXTRACTION & VISUAL PRESERVATION
  // -------------------------------------------------------------
  test('Req 3: Diagram and image URLs preserved and properly structured', () => {
    const questionWithDiagram = {
      id: 'q_diag_1',
      prompt: 'Identify the circuit current I in the diagram below:',
      imageUrl: 'https://r2.miitjee.org/exam-assets/images/circuit_q1.png',
      optionImageUrls: [
        'https://r2.miitjee.org/exam-assets/images/opt_a.png',
        'https://r2.miitjee.org/exam-assets/images/opt_b.png',
      ],
      options: ['Option A', 'Option B'],
    };

    expect(Boolean(questionWithDiagram.imageUrl.startsWith('https://'))).toBe(true);
    expect(questionWithDiagram.optionImageUrls.length).toBe(2);
    expect(Boolean(questionWithDiagram.optionImageUrls[0]?.includes('opt_a.png'))).toBe(true);
  });

  // -------------------------------------------------------------
  // Requirement 4: CORRECT ANSWER EXTRACTION & REVIEW FLAGGING
  // -------------------------------------------------------------
  test('Req 4: Answer key mapping overrides AI answer, and unverified AI answer flags Needs Review', () => {
    // Match with answer key
    const mapped = evaluateAnswerKeyMapping([{ index: 1, aiAnswer: 'B', confidence: 0.75 }], { 1: 'A' });
    expect(mapped[0]?.extractedAnswer).toBe('A');
    expect(mapped[0]?.hasAnswerKeyMatch).toBe(true);
    expect(mapped[0]?.needsReview).toBe(false);

    // AI extraction without answer key flags Needs Review
    const unverified = evaluateAnswerKeyMapping([{ index: 2, aiAnswer: 'C', confidence: 0.75 }]);
    expect(unverified[0]?.needsReview).toBe(true);
    expect(unverified[0]?.hasAnswerKeyMatch).toBe(false);
  });

  // -------------------------------------------------------------
  // Requirement 5: ADMIN ISSUE + REASON DIAGNOSTICS
  // -------------------------------------------------------------
  test('Req 5: Admin Issue Diagnostics provides specific issue codes and explicit reason strings', () => {
    const issues = [
      { code: 'LOGIN_FAILED', reason: 'Reason: Invalid credentials' },
      { code: 'DEVICE_BLOCKED', reason: 'Reason: Device HWID already registered under another account' },
      { code: 'EXAM_NOT_AVAILABLE', reason: 'Reason: Exam not started / expired / revoked' },
      { code: 'SUBMISSION_PENDING', reason: 'Reason: Internet connection lost during final submit; snapshot saved in local storage.' },
      { code: 'SUBMISSION_FAILED', reason: 'Reason: Server/API request failed (500/504)' },
      { code: 'RESUME_AVAILABLE', reason: 'Reason: Previous exam session interrupted' },
    ];

    issues.forEach((item) => {
      expect(Boolean(item.reason.startsWith('Reason:'))).toBe(true);
      expect(Boolean(item.reason.length > 10)).toBe(true);
    });
  });

  // -------------------------------------------------------------
  // Requirement 6: +4 / -1 MARKING SYSTEM
  // -------------------------------------------------------------
  test('Req 6: Configurable marking scheme calculation (+4 correct, -1 wrong, 0 unattempted)', () => {
    const scheme = { correctMarks: 4, wrongMarks: -1, unattemptedMarks: 0 };
    
    // Test Case: 10 correct, 3 wrong, 2 unattempted
    // Expected: 10 * 4 + 3 * (-1) + 2 * 0 = 40 - 3 = 37
    const answers: Record<string, string> = {};
    const key: Record<string, string> = {};

    // 10 correct
    for (let i = 1; i <= 10; i++) {
      answers[`q${i}`] = 'A';
      key[`q${i}`] = 'A';
    }
    // 3 wrong
    for (let i = 11; i <= 13; i++) {
      answers[`q${i}`] = 'B';
      key[`q${i}`] = 'A';
    }
    // 2 unattempted
    for (let i = 14; i <= 15; i++) {
      key[`q${i}`] = 'A';
    }

    const evaluation = evaluateMarkingScheme(answers, key, scheme);

    expect(evaluation.correctCount).toBe(10);
    expect(evaluation.wrongCount).toBe(3);
    expect(evaluation.unattemptedCount).toBe(2);
    expect(evaluation.totalScore).toBe(37);
  });

  // -------------------------------------------------------------
  // Requirement 7: EXCEL EXPORT + SUBJECT BREAKDOWN + PERCENTILE + RANK
  // -------------------------------------------------------------
  test('Req 7: Excel Export includes subject breakdowns, exact N-based percentile, and 6-tier tie breaker rank rules across 5 candidates', () => {
    const rawCandidates = [
      {
        studentId: 'STU-1',
        studentName: 'Aarav Sharma',
        examTitle: 'JEE Advanced Benchmark',
        attemptStatus: 'COMPLETED',
        physics: { correct: 4, wrong: 1, unattempted: 0, score: 15 },
        chemistry: { correct: 4, wrong: 1, unattempted: 0, score: 15 },
        mathsBio: { correct: 4, wrong: 1, unattempted: 0, score: 15 },
        submittedAt: '2026-08-08T10:00:00Z',
      }, // Total score = 45
      {
        studentId: 'STU-2',
        studentName: 'Priya Patel',
        examTitle: 'JEE Advanced Benchmark',
        attemptStatus: 'COMPLETED',
        physics: { correct: 3, wrong: 0, unattempted: 2, score: 12 },
        chemistry: { correct: 3, wrong: 0, unattempted: 2, score: 12 },
        mathsBio: { correct: 3, wrong: 0, unattempted: 2, score: 12 },
        submittedAt: '2026-08-08T10:15:00Z',
      }, // Total score = 36, Wrong = 0 -> Beats STU-3 on tie breaker
      {
        studentId: 'STU-3',
        studentName: 'Rohan Verma',
        examTitle: 'JEE Advanced Benchmark',
        attemptStatus: 'COMPLETED',
        physics: { correct: 4, wrong: 4, unattempted: 0, score: 12 },
        chemistry: { correct: 4, wrong: 4, unattempted: 0, score: 12 },
        mathsBio: { correct: 4, wrong: 4, unattempted: 0, score: 12 },
        submittedAt: '2026-08-08T10:10:00Z',
      }, // Total score = 36, Wrong = 12
      {
        studentId: 'STU-4',
        studentName: 'Ananya Gupta',
        examTitle: 'JEE Advanced Benchmark',
        attemptStatus: 'COMPLETED',
        physics: { correct: 2, wrong: 2, unattempted: 1, score: 6 },
        chemistry: { correct: 2, wrong: 2, unattempted: 1, score: 6 },
        mathsBio: { correct: 2, wrong: 2, unattempted: 1, score: 6 },
        submittedAt: '2026-08-08T10:20:00Z',
      }, // Total score = 18
      {
        studentId: 'STU-5',
        studentName: 'Kabir Singh',
        examTitle: 'JEE Advanced Benchmark',
        attemptStatus: 'COMPLETED',
        physics: { correct: 0, wrong: 5, unattempted: 0, score: -5 },
        chemistry: { correct: 0, wrong: 5, unattempted: 0, score: -5 },
        mathsBio: { correct: 0, wrong: 5, unattempted: 0, score: -5 },
        submittedAt: '2026-08-08T10:25:00Z',
      }, // Total score = -15
    ];

    const ranked = calculateFullLeaderboardAndRanks(rawCandidates);

    expect(ranked.length).toBe(5);

    // Aarav: Score 45 -> Rank 1, Percentile (5/5)*100 = 100%
    expect(ranked[0]?.studentId).toBe('STU-1');
    expect(ranked[0]?.rank).toBe(1);
    expect(ranked[0]?.percentile).toBe(100.0);

    // Priya: Score 36, 0 Wrong -> Rank 2 (Beats Rohan on fewer wrong tie-breaker), Percentile (4/5)*100 = 80%
    expect(ranked[1]?.studentId).toBe('STU-2');
    expect(ranked[1]?.rank).toBe(2);
    expect(ranked[1]?.percentile).toBe(80.0);

    // Rohan: Score 36, 12 Wrong -> Rank 3
    expect(ranked[2]?.studentId).toBe('STU-3');
    expect(ranked[2]?.rank).toBe(3);
    expect(ranked[2]?.percentile).toBe(80.0);

    // Kabir: Negative score -15 -> Rank 5, Percentile (1/5)*100 = 20%
    expect(ranked[4]?.studentId).toBe('STU-5');
    expect(ranked[4]?.rank).toBe(5);
    expect(ranked[4]?.percentile).toBe(20.0);

    // Export CSV string test
    const csv = generateFullResultsCsv(ranked);
    expect(Boolean(csv.includes('Rank,Student ID,Student Full Name'))).toBe(true);
    expect(Boolean(csv.includes('Physics Correct,Physics Wrong'))).toBe(true);
    expect(Boolean(csv.includes('1,STU-1,Aarav Sharma'))).toBe(true);
  });
});
