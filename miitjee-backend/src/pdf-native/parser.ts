import {
  BackendPdfNativeAttempt,
  BackendPdfNativeAttemptAnswer,
  BackendPdfNativeQuestion,
  BackendPdfNativeResultPayload,
  BackendPdfNativeTest,
  BackendQuestionSubmissionStatus,
  BackendSubjectScoreBreakdown,
  SavePdfNativeBankRequest,
  SavePdfNativeBankResponse,
  SubmitBackendPdfNativeAttemptRequest,
} from './types';

/**
 * Strictly validate and process a batch of PDF-Native questions before saving to Question Bank.
 */
export function validateAndProcessBankQuestions(
  payload: SavePdfNativeBankRequest
): SavePdfNativeBankResponse {
  const rawQuestions = payload.questions || [];
  const errors: string[] = [];
  const validQuestions: BackendPdfNativeQuestion[] = [];

  let approvedCount = 0;
  let needsReviewCount = 0;
  let rejectedCount = 0;

  for (let i = 0; i < rawQuestions.length; i++) {
    const q = rawQuestions[i];
    if (!q) continue;

    const qLabel = `Q${q.question_number || i + 1}`;

    if (!q.pdf_id || !q.pdf_id.trim()) {
      errors.push(`${qLabel}: missing pdf_id`);
      continue;
    }

    if (!q.question_number || !q.question_number.trim()) {
      errors.push(`${qLabel}: missing question_number`);
      continue;
    }

    if (!q.bbox || typeof q.bbox.x !== 'number' || typeof q.bbox.y !== 'number' || q.bbox.width <= 0 || q.bbox.height <= 0) {
      errors.push(`${qLabel}: invalid bbox coordinates`);
      continue;
    }

    let status = q.review_status || 'NEEDS_REVIEW';

    if ((!q.correct_answer || !q.correct_answer.trim()) && status === 'APPROVED') {
      status = 'NEEDS_REVIEW';
    }

    if (status === 'APPROVED') approvedCount++;
    else if (status === 'REJECTED') rejectedCount++;
    else needsReviewCount++;

    validQuestions.push({
      ...q,
      review_status: status,
      subject: q.subject || 'Physics',
      marks: typeof q.marks === 'number' && !isNaN(q.marks) ? q.marks : 4,
      negative_marks: typeof q.negative_marks === 'number' && !isNaN(q.negative_marks) ? q.negative_marks : 1,
    });
  }

  return {
    success: errors.length === 0,
    pdf_id: payload.pdf_id,
    total_questions: rawQuestions.length,
    saved_count: validQuestions.length,
    updated_count: 0,
    approved_count: approvedCount,
    needs_review_count: needsReviewCount,
    rejected_count: rejectedCount,
    errors: errors.length > 0 ? errors : undefined,
  };
}

/**
 * Deterministic scoring logic for PDF-Native test submissions.
 */
export function scoreBackendPdfNativeAttempt(
  payload: SubmitBackendPdfNativeAttemptRequest,
  testQuestions: BackendPdfNativeQuestion[]
): BackendPdfNativeAttempt {
  const answersMap = payload.answers || {};

  let totalScore = 0;
  let correctCount = 0;
  let wrongCount = 0;
  let unattemptedCount = 0;

  const evaluatedAnswers: BackendPdfNativeAttemptAnswer[] = [];

  for (const q of testQuestions) {
    if (!q.correct_answer || !q.correct_answer.trim()) {
      throw new Error(`Data Integrity Error: Question Q${q.question_number} is missing an answer key.`);
    }

    const rawSelected = answersMap[q.id];
    const isAttempted =
      rawSelected !== null &&
      rawSelected !== undefined &&
      typeof rawSelected === 'string' &&
      rawSelected.trim().length > 0;

    let status: BackendQuestionSubmissionStatus = 'UNATTEMPTED';
    let awardedMarks = 0;
    let selectedAnswer: string | null = null;

    if (!isAttempted) {
      status = 'UNATTEMPTED';
      awardedMarks = 0;
      unattemptedCount++;
    } else {
      selectedAnswer = rawSelected.trim();
      const cleanCorrect = q.correct_answer.trim();

      const normSel = selectedAnswer.replace(/^Option\s+/i, '');
      const normCorr = cleanCorrect.replace(/^Option\s+/i, '');

      if (normSel === normCorr) {
        status = 'CORRECT';
        awardedMarks = q.marks ?? 4;
        correctCount++;
      } else {
        status = 'WRONG';
        awardedMarks = -(q.negative_marks ?? 1);
        wrongCount++;
      }
    }

    totalScore += awardedMarks;

    evaluatedAnswers.push({
      question_id: q.id,
      question_number: q.question_number,
      selected_answer: selectedAnswer,
      correct_answer: q.correct_answer.trim(),
      status,
      awarded_marks: awardedMarks,
      subject: q.subject || 'Physics',
    });
  }

  const nowIso = new Date().toISOString();

  return {
    id: `attempt_${Date.now()}`,
    test_id: payload.testId,
    user_id: payload.userId || null,
    student_name: payload.studentName || null,
    total_questions: testQuestions.length,
    attempted_count: correctCount + wrongCount,
    correct_count: correctCount,
    wrong_count: wrongCount,
    unattempted_count: unattemptedCount,
    total_score: totalScore,
    answers: evaluatedAnswers,
    created_at: nowIso,
  };
}

/**
 * Calculate authoritative subject breakdown and rank-based percentile for an attempt.
 */
export function calculateBackendPdfNativeResultPayload(
  attempt: BackendPdfNativeAttempt,
  test: BackendPdfNativeTest | null,
  allAttemptsForTest: BackendPdfNativeAttempt[]
): BackendPdfNativeResultPayload {
  const testSubject = test?.subject || 'Physics';
  const singleSubjects = ['Physics', 'Chemistry', 'Mathematics', 'Biology'];
  const isSingleSubject = singleSubjects.includes(testSubject);

  const subjectMap = new Map<string, { total: number; correct: number; wrong: number; unattempted: number; score: number }>();

  for (const ans of attempt.answers) {
    const subName = isSingleSubject ? testSubject : (ans.subject || 'Physics');
    if (!subjectMap.has(subName)) {
      subjectMap.set(subName, { total: 0, correct: 0, wrong: 0, unattempted: 0, score: 0 });
    }

    const cur = subjectMap.get(subName)!;
    cur.total += 1;
    if (ans.status === 'CORRECT') {
      cur.correct += 1;
      cur.score += ans.awarded_marks;
    } else if (ans.status === 'WRONG') {
      cur.wrong += 1;
      cur.score += ans.awarded_marks;
    } else {
      cur.unattempted += 1;
    }
  }

  const subjectBreakdowns: BackendSubjectScoreBreakdown[] = [];

  subjectMap.forEach((val, subName) => {
    const maxMarks = val.total * 4;
    const pct = maxMarks > 0 ? Number(((val.score / maxMarks) * 100).toFixed(2)) : 0;
    subjectBreakdowns.push({
      subject: subName,
      total_questions: val.total,
      correct_count: val.correct,
      wrong_count: val.wrong,
      unattempted_count: val.unattempted,
      attempted_count: val.correct + val.wrong,
      score: val.score,
      max_marks: maxMarks,
      percentage: pct,
    });
  });

  const totalMaxMarks = attempt.total_questions * 4;
  const totalPct = totalMaxMarks > 0 ? Number(((attempt.total_score / totalMaxMarks) * 100).toFixed(2)) : 0;

  const totalBreakdown: BackendSubjectScoreBreakdown = {
    subject: 'TOTAL',
    total_questions: attempt.total_questions,
    correct_count: attempt.correct_count,
    wrong_count: attempt.wrong_count,
    unattempted_count: attempt.unattempted_count,
    attempted_count: attempt.attempted_count,
    score: attempt.total_score,
    max_marks: totalMaxMarks,
    percentage: totalPct,
  };

  // Rank-based Percentile Calculation (requires comparison population N >= 2)
  let percentile: number | null = null;
  let percentileMessage: string | undefined = undefined;

  // Filter attempts: Same test, submitted attempts, deduplicated per student (latest attempt per student)
  const studentAttemptMap = new Map<string, BackendPdfNativeAttempt>();
  if (Array.isArray(allAttemptsForTest)) {
    for (const a of allAttemptsForTest) {
      if (a.test_id === attempt.test_id) {
        const studentKey = (a.user_id && a.user_id.trim()) || (a.student_name && a.student_name.trim()) || a.id;
        // Keep latest submitted attempt per student
        studentAttemptMap.set(studentKey, a);
      }
    }
  }

  const distinctAttempts = Array.from(studentAttemptMap.values());
  const n = distinctAttempts.length;

  if (n > 1) {
    const targetScore = attempt.total_score;
    let strictlyLowerCount = 0;
    let tiedCount = 0;

    for (const a of distinctAttempts) {
      if (a.total_score < targetScore) {
        strictlyLowerCount++;
      } else if (a.total_score === targetScore) {
        tiedCount++;
      }
    }

    // Psychometric Tie-Aware Percentile Formula: ((strictlyLower + 0.5 * tied) / N) * 100
    percentile = Number((((strictlyLowerCount + 0.5 * tiedCount) / n) * 100).toFixed(2));
  } else {
    percentileMessage = 'Percentile will be available after the comparison population is established.';
  }

  return {
    attempt_id: attempt.id,
    student_name: attempt.student_name || 'Student',
    test_id: attempt.test_id,
    test_title: test?.title || 'PDF-Native Test',
    test_subject: testSubject,
    is_single_subject: isSingleSubject,
    subjects: subjectBreakdowns,
    total: totalBreakdown,
    percentile,
    percentile_message: percentileMessage,
  };
}
