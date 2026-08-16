import {
  PdfNativeAttempt,
  PdfNativeAttemptAnswer,
  PdfNativeResultPayload,
  SubjectScoreBreakdown,
} from './pdfNativeTypes';
import { selectRows } from '../supabase/client';
import {
  PdfNativeAttemptAnswerRow,
  PdfNativeAttemptRow,
  PdfNativeTestRow,
} from '../supabase/types';
import {
  getLocalPdfNativeAttempt,
  getLocalPdfNativeAttemptsForTest,
  getLocalPdfNativeTests,
} from './pdfNativeLocalStorage';

declare const process: { env: Record<string, string> };

/**
 * Fetch authoritative PDF-Native result payload for a completed test attempt from Supabase or local persistent storage.
 */
export async function fetchPdfNativeResult(attemptId: string): Promise<PdfNativeResultPayload> {
  // 1. Try Supabase first
  try {
    const attemptRows = await selectRows<PdfNativeAttemptRow>('pdf_native_attempts', '*', {
      id: `eq.${attemptId}`,
    });

    const attempt = attemptRows?.[0];

    if (attempt) {
      const testRows = await selectRows<PdfNativeTestRow>('pdf_native_tests', '*', {
        id: `eq.${attempt.test_id}`,
      });
      const test = testRows?.[0] || null;

      const answerRows = await selectRows<PdfNativeAttemptAnswerRow>(
        'pdf_native_attempt_answers',
        '*',
        { attempt_id: `eq.${attemptId}` }
      );

      const allTestAttempts = await selectRows<PdfNativeAttemptRow>('pdf_native_attempts', '*', {
        test_id: `eq.${attempt.test_id}`,
      });

      const testSubject = test?.subject || 'Physics';
      const singleSubjects = ['Physics', 'Chemistry', 'Mathematics', 'Biology'];
      const isSingleSubject = singleSubjects.includes(testSubject);

      const subjectMap = new Map<
        string,
        { total: number; correct: number; wrong: number; unattempted: number; score: number }
      >();

      (answerRows || []).forEach((ans) => {
        const subName = isSingleSubject ? testSubject : 'Physics';
        if (!subjectMap.has(subName)) {
          subjectMap.set(subName, { total: 0, correct: 0, wrong: 0, unattempted: 0, score: 0 });
        }

        const cur = subjectMap.get(subName)!;
        cur.total += 1;
        if (ans.status === 'CORRECT') {
          cur.correct += 1;
          cur.score += Number(ans.awarded_marks);
        } else if (ans.status === 'WRONG') {
          cur.wrong += 1;
          cur.score += Number(ans.awarded_marks);
        } else {
          cur.unattempted += 1;
        }
      });

      const subjectBreakdowns: SubjectScoreBreakdown[] = [];
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
      const totalScoreNum = Number(attempt.total_score);
      const totalPct = totalMaxMarks > 0 ? Number(((totalScoreNum / totalMaxMarks) * 100).toFixed(2)) : 0;

      const totalBreakdown: SubjectScoreBreakdown = {
        subject: 'TOTAL',
        total_questions: attempt.total_questions,
        correct_count: attempt.correct_count,
        wrong_count: attempt.wrong_count,
        unattempted_count: attempt.unattempted_count,
        attempted_count: attempt.attempted_count,
        score: totalScoreNum,
        max_marks: totalMaxMarks,
        percentage: totalPct,
      };

      let percentile: number | null = null;
      let percentileMessage: string | undefined = undefined;

      const distinctAttempts = allTestAttempts || [];
      const n = distinctAttempts.length;

      if (n > 1) {
        let strictlyLower = 0;
        let tied = 0;
        for (const a of distinctAttempts) {
          const s = Number(a.total_score);
          if (s < totalScoreNum) strictlyLower++;
          else if (s === totalScoreNum) tied++;
        }
        percentile = Number((((strictlyLower + 0.5 * tied) / n) * 100).toFixed(2));
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
  } catch (err) {
    console.warn('[fetchPdfNativeResult] Supabase error, trying local fallback:', err);
  }

  // 2. Local store fallback
  try {
    const localAttempt = await getLocalPdfNativeAttempt(attemptId);
    if (localAttempt) {
      const localTests = await getLocalPdfNativeTests();
      const localTest = localTests.find((t) => t.id === localAttempt.test_id) || null;
      const testSubject = localTest?.subject || 'Physics';
      const singleSubjects = ['Physics', 'Chemistry', 'Mathematics', 'Biology'];
      const isSingleSubject = singleSubjects.includes(testSubject);

      const subjectMap = new Map<
        string,
        { total: number; correct: number; wrong: number; unattempted: number; score: number }
      >();

      (localAttempt.answers || []).forEach((ans) => {
        const subName = isSingleSubject ? testSubject : ans.subject || 'Physics';
        if (!subjectMap.has(subName)) {
          subjectMap.set(subName, { total: 0, correct: 0, wrong: 0, unattempted: 0, score: 0 });
        }

        const cur = subjectMap.get(subName)!;
        cur.total += 1;
        if (ans.status === 'CORRECT') {
          cur.correct += 1;
          cur.score += Number(ans.awarded_marks);
        } else if (ans.status === 'WRONG') {
          cur.wrong += 1;
          cur.score += Number(ans.awarded_marks);
        } else {
          cur.unattempted += 1;
        }
      });

      const subjectBreakdowns: SubjectScoreBreakdown[] = [];
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

      const totalMaxMarks = localAttempt.total_questions * 4;
      const totalScoreNum = Number(localAttempt.total_score);
      const totalPct = totalMaxMarks > 0 ? Number(((totalScoreNum / totalMaxMarks) * 100).toFixed(2)) : 0;

      const totalBreakdown: SubjectScoreBreakdown = {
        subject: 'TOTAL',
        total_questions: localAttempt.total_questions,
        correct_count: localAttempt.correct_count,
        wrong_count: localAttempt.wrong_count,
        unattempted_count: localAttempt.unattempted_count,
        attempted_count: localAttempt.attempted_count,
        score: totalScoreNum,
        max_marks: totalMaxMarks,
        percentage: totalPct,
      };

      const allTestAttempts = await getLocalPdfNativeAttemptsForTest(localAttempt.test_id);
      let percentile: number | null = null;
      let percentileMessage: string | undefined = undefined;
      const n = allTestAttempts.length;

      if (n > 1) {
        let strictlyLower = 0;
        let tied = 0;
        for (const a of allTestAttempts) {
          const s = Number(a.total_score);
          if (s < totalScoreNum) strictlyLower++;
          else if (s === totalScoreNum) tied++;
        }
        percentile = Number((((strictlyLower + 0.5 * tied) / n) * 100).toFixed(2));
      } else {
        percentileMessage = 'Percentile will be available after the comparison population is established.';
      }

      return {
        attempt_id: localAttempt.id,
        student_name: localAttempt.student_name || 'Student',
        test_id: localAttempt.test_id,
        test_title: localTest?.title || 'PDF-Native Test',
        test_subject: testSubject,
        is_single_subject: isSingleSubject,
        subjects: subjectBreakdowns,
        total: totalBreakdown,
        percentile,
        percentile_message: percentileMessage,
      };
    }
  } catch (localErr) {
    console.warn('[fetchPdfNativeResult] Local result error:', localErr);
  }

  // 3. Fallback to worker
  const backendUrl =
    (typeof process !== 'undefined' && process.env && process.env.MIITJEE_BACKEND_URL) ||
    'http://127.0.0.1:8787';

  const res = await fetch(`${backendUrl}/api/pdf-native/result?attempt_id=${encodeURIComponent(attemptId)}`);

  if (!res.ok) {
    const errJson = await res.json().catch(() => ({}));
    throw new Error(errJson.error || 'Failed to fetch PDF-Native result details');
  }

  const data = await res.json();
  return data.result;
}
