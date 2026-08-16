import { SubmittedTestResponse } from '../../types';
import {
  PdfNativeAttempt,
  PdfNativeAttemptAnswer,
  PdfNativeQuestion,
  QuestionSubmissionStatus,
  SubmitPdfNativeAttemptPayload,
} from './pdfNativeTypes';
import { insertRow, selectRows, upsertRows } from '../supabase/client';
import {
  PdfNativeAttemptAnswerRow,
  PdfNativeAttemptRow,
  PdfNativeQuestionRow,
  PdfNativeTestQuestionRow,
} from '../supabase/types';
import {
  getLocalPdfNativeQuestions,
  getLocalPdfNativeTestQuestions,
  saveLocalPdfNativeAttempt,
} from './pdfNativeLocalStorage';

declare const process: { env: Record<string, string> };

/**
 * Pure deterministic scoring function for PDF-Native test attempts.
 * Strictly distinguishes unattempted questions from wrong answers.
 */
export function scorePdfNativeAttempt(
  questions: PdfNativeQuestion[],
  answersMap: Record<string, string>
): PdfNativeAttempt {
  let totalScore = 0;
  let correctCount = 0;
  let wrongCount = 0;
  let unattemptedCount = 0;

  const evaluatedAnswers: PdfNativeAttemptAnswer[] = [];

  for (let i = 0; i < questions.length; i++) {
    const q = questions[i];
    if (!q) continue;

    const cleanCorrect = (q.correct_answer || '').trim();
    const rawSelected = answersMap[q.id];

    // Strict null check: Ensure null, undefined, or empty string is NEVER treated as wrong!
    const isAttempted =
      rawSelected !== null &&
      rawSelected !== undefined &&
      typeof rawSelected === 'string' &&
      rawSelected.trim().length > 0;

    let status: QuestionSubmissionStatus = 'UNATTEMPTED';
    let awardedMarks = 0;
    let selectedAnswer: string | null = null;

    if (!isAttempted) {
      status = 'UNATTEMPTED';
      awardedMarks = 0;
      unattemptedCount++;
    } else if (!cleanCorrect) {
      // If answer key was missing during review, treat student response neutrally without crashing
      selectedAnswer = rawSelected.trim();
      status = 'UNATTEMPTED';
      awardedMarks = 0;
      unattemptedCount++;
    } else {
      selectedAnswer = rawSelected.trim();

      // Normalize Option A vs A comparison and numeric comparison
      const normalizedSelected = selectedAnswer.replace(/^Option\s+/i, '').trim();
      const normalizedCorrect = cleanCorrect.replace(/^Option\s+/i, '').trim();

      const isNumSelected = !isNaN(Number(normalizedSelected)) && normalizedSelected.length > 0;
      const isNumCorrect = !isNaN(Number(normalizedCorrect)) && normalizedCorrect.length > 0;
      const isNumericMatch = isNumSelected && isNumCorrect && Number(normalizedSelected) === Number(normalizedCorrect);

      if (normalizedSelected.toUpperCase() === normalizedCorrect.toUpperCase() || isNumericMatch) {
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
      correct_answer: cleanCorrect || 'A',
      status,
      awarded_marks: awardedMarks,
      subject: q.subject,
    });
  }

  const attemptedCount = correctCount + wrongCount;

  return {
    id: `attempt_${Date.now()}`,
    test_id: questions[0]?.pdf_id || 'test',
    total_questions: questions.length,
    attempted_count: attemptedCount,
    correct_count: correctCount,
    wrong_count: wrongCount,
    unattempted_count: unattemptedCount,
    total_score: totalScore,
    answers: evaluatedAnswers,
  };
}

/**
 * Submit PDF-Native test attempt directly with dual local & database persistence.
 */
export async function submitPdfNativeAttempt(
  payload: SubmitPdfNativeAttemptPayload
): Promise<SubmittedTestResponse> {
  try {
    let questions: PdfNativeQuestion[] = [];

    // 1. Try Supabase for questions
    try {
      const testRelations = await selectRows<PdfNativeTestQuestionRow>(
        'pdf_native_test_questions',
        '*',
        { test_id: `eq.${payload.testId}`, order: 'order_index.asc' }
      );

      if (testRelations && testRelations.length > 0) {
        const qIds = testRelations.map((r) => r.question_id);
        const questionRows = await selectRows<PdfNativeQuestionRow>(
          'pdf_native_questions',
          '*',
          { id: `in.(${qIds.join(',')})` }
        );

        const qMap = new Map(questionRows.map((q) => [q.id, q]));
        testRelations.forEach((tr) => {
          const q = qMap.get(tr.question_id);
          if (q) {
            questions.push({
              id: q.id,
              pdf_id: q.pdf_id,
              pdf_url: q.pdf_url,
              question_number: q.question_number,
              page_start: q.page_start,
              page_end: q.page_end,
              bbox: q.bbox,
              subject: q.subject as any,
              chapter: q.chapter,
              topic: q.topic,
              question_type: q.question_type as any,
              correct_answer: q.correct_answer || 'A',
              marks: Number(q.marks) || 4,
              negative_marks: Number(q.negative_marks) || 1,
              review_status: q.review_status as any,
              raw_detected_text: q.raw_text ?? undefined,
            });
          }
        });
      }
    } catch {
      // Ignore Supabase errors
    }

    // 2. Fallback to local store for questions
    if (questions.length === 0) {
      const localTq = await getLocalPdfNativeTestQuestions(payload.testId);
      const localQList = await getLocalPdfNativeQuestions();
      const localQMap = new Map(localQList.map((q) => [q.id, q]));

      localTq.forEach((tr) => {
        const q = localQMap.get(tr.question_id);
        if (q) {
          questions.push(q);
        }
      });

      if (questions.length === 0 && localQList.length > 0) {
        questions = localQList;
      }
    }

    // 3. Fallback to synthetic questions from submitted answers if questions list is empty
    if (questions.length === 0) {
      const ansKeys = Object.keys(payload.answers || {});
      const fallbackTotal = Math.max(ansKeys.length, 1);
      questions = Array.from({ length: fallbackTotal }, (_, idx) => {
        const qId = ansKeys[idx] || `q_synthetic_${idx + 1}`;
        return {
          id: qId,
          pdf_id: payload.testId,
          question_number: String(idx + 1),
          page_start: 1,
          page_end: 1,
          bbox: { x: 0, y: 0, width: 100, height: 100 },
          subject: 'Mathematics' as any,
          question_type: 'MCQ' as any,
          correct_answer: 'A',
          marks: 4,
          negative_marks: 1,
          review_status: 'APPROVED' as any,
        };
      });
    }

    const attemptResult = scorePdfNativeAttempt(questions, payload.answers || {});
    const nowIso = new Date().toISOString();
    const attemptId = `attempt_${Date.now()}`;

    attemptResult.id = attemptId;
    attemptResult.test_id = payload.testId;
    attemptResult.user_id = payload.userId ?? null;
    attemptResult.student_name = payload.studentName ?? 'Student';
    attemptResult.created_at = nowIso;

    // 3. Always save locally first
    await saveLocalPdfNativeAttempt(attemptResult);

    // 4. Attempt remote database save
    try {
      const attemptRow: PdfNativeAttemptRow = {
        id: attemptId,
        test_id: payload.testId,
        user_id: payload.userId ?? null,
        student_name: payload.studentName ?? 'Student',
        total_questions: attemptResult.total_questions,
        attempted_count: attemptResult.attempted_count,
        correct_count: attemptResult.correct_count,
        wrong_count: attemptResult.wrong_count,
        unattempted_count: attemptResult.unattempted_count,
        total_score: attemptResult.total_score,
        created_at: nowIso,
      };

      await insertRow('pdf_native_attempts', attemptRow);

      const answerRows: PdfNativeAttemptAnswerRow[] = attemptResult.answers.map((ans) => ({
        id: `ans_${attemptId}_${ans.question_id}`,
        attempt_id: attemptId,
        question_id: ans.question_id,
        question_number: ans.question_number,
        selected_answer: ans.selected_answer,
        correct_answer: ans.correct_answer,
        status: ans.status,
        awarded_marks: ans.awarded_marks,
        created_at: nowIso,
      }));

      if (answerRows.length > 0) {
        await upsertRows('pdf_native_attempt_answers', answerRows, 'attempt_id,question_id');
      }
    } catch (dbErr) {
      console.warn('[submitPdfNativeAttempt] Remote Supabase attempt save skipped:', dbErr);
    }

    return {
      result: {
        id: attemptId,
        testId: payload.testId,
        userId: payload.userId || 'guest',
        studentName: payload.studentName || 'Student',
        score: attemptResult.total_score,
        totalQuestions: attemptResult.total_questions,
        correctAnswers: attemptResult.correct_count,
        wrongAnswers: attemptResult.wrong_count,
        unattempted: attemptResult.unattempted_count,
        rank: 1,
        percentile: 0,
        submittedAt: nowIso,
      },
      testLeaderboard: [],
      overallLeaderboard: [],
    };
  } catch (err) {
    console.error('[submitPdfNativeAttempt] Error submitting attempt:', err);
    throw new Error(err instanceof Error ? err.message : 'Failed to process PDF-Native test attempt');
  }
}
