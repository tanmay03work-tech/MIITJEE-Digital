import {
  PdfNativeReviewPayload,
  PdfNativeReviewQuestion,
  QuestionSubmissionStatus,
} from './pdfNativeTypes';
import { selectRows } from '../supabase/client';
import {
  PdfNativeAttemptAnswerRow,
  PdfNativeAttemptRow,
  PdfNativeQuestionRow,
  PdfNativeTestRow,
} from '../supabase/types';
import {
  getLocalPdfNativeAttempt,
  getLocalPdfNativeQuestions,
  getLocalPdfNativeTests,
} from './pdfNativeLocalStorage';

declare const process: { env: Record<string, string> };

/**
 * Fetch authoritative PDF-Native question-wise answer review dataset for an attempt from Supabase or local persistent storage.
 */
export async function fetchPdfNativeReview(attemptId: string): Promise<PdfNativeReviewPayload> {
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

      const qIds = (answerRows || []).map((a) => a.question_id);
      let questionRows: PdfNativeQuestionRow[] = [];
      if (qIds.length > 0) {
        questionRows =
          (await selectRows<PdfNativeQuestionRow>('pdf_native_questions', '*', {
            id: `in.(${qIds.join(',')})`,
          })) || [];
      }

      const qMap = new Map(questionRows.map((q) => [q.id, q]));
      const testSubject = test?.subject || 'Physics';
      const singleSubjects = ['Physics', 'Chemistry', 'Mathematics', 'Biology'];
      const isSingleSubject = singleSubjects.includes(testSubject);

      const reviewQuestions: PdfNativeReviewQuestion[] = (answerRows || []).map((ans) => {
        const bankQ = qMap.get(ans.question_id);
        return {
          question_id: ans.question_id,
          question_number: ans.question_number,
          subject: isSingleSubject ? testSubject : bankQ?.subject || 'Physics',
          page_start: bankQ?.page_start || 1,
          page_end: bankQ?.page_end || 1,
          bbox: bankQ?.bbox || { x: 10, y: 10, width: 290, height: 100 },
          pdf_id: bankQ?.pdf_id || 'ref',
          pdf_url: bankQ?.pdf_url,
          selected_answer: ans.selected_answer,
          correct_answer: ans.correct_answer,
          status: ans.status as QuestionSubmissionStatus,
          awarded_marks: Number(ans.awarded_marks),
        };
      });

      return {
        attempt_id: attempt.id,
        student_name: attempt.student_name || 'Student',
        test_id: attempt.test_id,
        test_title: test?.title || 'PDF-Native Test',
        test_subject: testSubject,
        is_single_subject: isSingleSubject,
        questions: reviewQuestions,
      };
    }
  } catch (err) {
    console.warn('[fetchPdfNativeReview] Supabase error, trying local fallback:', err);
  }

  // 2. Local fallback
  try {
    const localAttempt = await getLocalPdfNativeAttempt(attemptId);
    if (localAttempt) {
      const localTests = await getLocalPdfNativeTests();
      const localTest = localTests.find((t) => t.id === localAttempt.test_id) || null;
      const localQuestions = await getLocalPdfNativeQuestions();
      const localQMap = new Map(localQuestions.map((q) => [q.id, q]));

      const testSubject = localTest?.subject || 'Physics';
      const singleSubjects = ['Physics', 'Chemistry', 'Mathematics', 'Biology'];
      const isSingleSubject = singleSubjects.includes(testSubject);

      const reviewQuestions: PdfNativeReviewQuestion[] = (localAttempt.answers || []).map((ans) => {
        const bankQ = localQMap.get(ans.question_id);
        return {
          question_id: ans.question_id,
          question_number: ans.question_number,
          subject: isSingleSubject ? testSubject : bankQ?.subject || ans.subject || 'Physics',
          page_start: bankQ?.page_start || 1,
          page_end: bankQ?.page_end || 1,
          bbox: bankQ?.bbox || { x: 10, y: 10, width: 290, height: 100 },
          pdf_id: bankQ?.pdf_id || 'ref',
          pdf_url: bankQ?.pdf_url,
          selected_answer: ans.selected_answer,
          correct_answer: ans.correct_answer,
          status: ans.status,
          awarded_marks: Number(ans.awarded_marks),
        };
      });

      return {
        attempt_id: localAttempt.id,
        student_name: localAttempt.student_name || 'Student',
        test_id: localAttempt.test_id,
        test_title: localTest?.title || 'PDF-Native Test',
        test_subject: testSubject,
        is_single_subject: isSingleSubject,
        questions: reviewQuestions,
      };
    }
  } catch (localErr) {
    console.warn('[fetchPdfNativeReview] Local review error:', localErr);
  }

  // 3. Worker fallback
  const backendUrl =
    (typeof process !== 'undefined' && process.env && process.env.MIITJEE_BACKEND_URL) ||
    'http://127.0.0.1:8787';

  const res = await fetch(
    `${backendUrl}/api/pdf-native/review?attempt_id=${encodeURIComponent(attemptId)}`
  );

  if (!res.ok) {
    const errJson = await res.json().catch(() => ({}));
    throw new Error(errJson.error || 'Failed to fetch PDF-Native review dataset');
  }

  const data = await res.json();
  return data.review;
}
