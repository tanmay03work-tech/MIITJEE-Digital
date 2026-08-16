import { calculateBackendPdfNativeResultPayload, scoreBackendPdfNativeAttempt, validateAndProcessBankQuestions } from './parser';
import {
  BackendPdfNativeAttempt,
  BackendPdfNativeQuestion,
  BackendPdfNativeReviewPayload,
  BackendPdfNativeReviewQuestion,
  BackendPdfNativeTest,
  BackendPdfNativeTestQuestion,
  CreateBackendPdfNativeTestRequest,
  SavePdfNativeBankRequest,
  SubmitBackendPdfNativeAttemptRequest,
} from './types';

// In-memory persistent caches
const pdfNativeBankStore = new Map<string, BackendPdfNativeQuestion[]>();
const allQuestionsMap = new Map<string, BackendPdfNativeQuestion>();

const pdfNativeTestsStore: BackendPdfNativeTest[] = [];
const pdfNativeTestQuestionsStore: BackendPdfNativeTestQuestion[] = [];
const pdfNativeAttemptsStore: BackendPdfNativeAttempt[] = [];

/**
 * Handle HTTP routes under /api/pdf-native/*
 */
export async function handlePdfNativeRoutes(request: Request): Promise<Response | null> {
  const url = new URL(request.url);
  const path = url.pathname;

  // POST /api/pdf-native/save-bank-questions
  if (request.method === 'POST' && path === '/api/pdf-native/save-bank-questions') {
    try {
      const body = (await request.json()) as SavePdfNativeBankRequest;
      if (!body || !body.pdf_id || !Array.isArray(body.questions)) {
        return Response.json(
          { error: 'Invalid request body. Expected pdf_id and questions array.' },
          { status: 400 }
        );
      }

      const result = validateAndProcessBankQuestions(body);

      if (!result.success) {
        return Response.json({ error: 'Validation failed', details: result.errors }, { status: 400 });
      }

      const existing = pdfNativeBankStore.get(body.pdf_id) || [];
      const updatedMap = new Map<string, BackendPdfNativeQuestion>();

      for (const q of existing) {
        updatedMap.set(q.question_number, q);
      }

      let updatedCount = 0;
      let newCount = 0;

      for (const q of body.questions) {
        if (updatedMap.has(q.question_number)) {
          updatedCount++;
        } else {
          newCount++;
        }
        updatedMap.set(q.question_number, q);
        allQuestionsMap.set(q.id, q);
      }

      const finalList = Array.from(updatedMap.values());
      pdfNativeBankStore.set(body.pdf_id, finalList);

      return Response.json({
        success: true,
        pdf_id: body.pdf_id,
        total_questions: finalList.length,
        saved_count: newCount,
        updated_count: updatedCount,
        approved_count: finalList.filter((q) => q.review_status === 'APPROVED').length,
        needs_review_count: finalList.filter((q) => q.review_status === 'NEEDS_REVIEW').length,
        rejected_count: finalList.filter((q) => q.review_status === 'REJECTED').length,
      });
    } catch (err) {
      return Response.json(
        { error: err instanceof Error ? err.message : 'Error saving PDF-native Question Bank items' },
        { status: 500 }
      );
    }
  }

  // GET /api/pdf-native/list-bank-questions?pdf_id=...
  if (request.method === 'GET' && path === '/api/pdf-native/list-bank-questions') {
    const pdfId = url.searchParams.get('pdf_id');
    if (!pdfId) {
      const allList = Array.from(allQuestionsMap.values());
      return Response.json({ success: true, total_count: allList.length, questions: allList });
    }

    const list = pdfNativeBankStore.get(pdfId) || [];
    return Response.json({
      success: true,
      pdf_id: pdfId,
      total_count: list.length,
      questions: list,
    });
  }

  // POST /api/pdf-native/create-test
  if (request.method === 'POST' && path === '/api/pdf-native/create-test') {
    try {
      const body = (await request.json()) as CreateBackendPdfNativeTestRequest;
      if (!body || !body.title || !Array.isArray(body.question_ids)) {
        return Response.json({ error: 'Invalid request body' }, { status: 400 });
      }

      const testId = `pdf_test_${Date.now()}`;
      const nowIso = new Date().toISOString();

      const newTest: BackendPdfNativeTest = {
        id: testId,
        title: body.title.trim(),
        description: body.description ? body.description.trim() : null,
        duration_minutes: body.duration_minutes || 60,
        subject: body.subject || 'Physics',
        total_questions: body.question_ids.length,
        status: body.status || 'DRAFT',
        created_at: nowIso,
        updated_at: nowIso,
      };

      const newRelations: BackendPdfNativeTestQuestion[] = body.question_ids.map((qId, idx) => ({
        id: `tq_${testId}_${idx + 1}`,
        test_id: testId,
        question_id: qId,
        order_index: idx + 1,
        created_at: nowIso,
      }));

      pdfNativeTestsStore.push(newTest);
      pdfNativeTestQuestionsStore.push(...newRelations);

      return Response.json({
        success: true,
        test: newTest,
        total_relations: newRelations.length,
      });
    } catch (err) {
      return Response.json(
        { error: err instanceof Error ? err.message : 'Error creating PDF-native test' },
        { status: 500 }
      );
    }
  }

  // GET /api/pdf-native/list-tests
  if (request.method === 'GET' && path === '/api/pdf-native/list-tests') {
    return Response.json({
      success: true,
      total: pdfNativeTestsStore.length,
      tests: pdfNativeTestsStore,
    });
  }

  // POST /api/pdf-native/submit-attempt (Phase 5A Scoring & Submission)
  if (request.method === 'POST' && path === '/api/pdf-native/submit-attempt') {
    try {
      const body = (await request.json()) as SubmitBackendPdfNativeAttemptRequest;
      if (!body || !body.testId || !body.answers) {
        return Response.json({ error: 'Missing testId or answers payload' }, { status: 400 });
      }

      const allApprovedQuestions = Array.from(allQuestionsMap.values()).filter(
        (q) => q.review_status === 'APPROVED'
      );

      if (allApprovedQuestions.length === 0) {
        return Response.json(
          { error: 'No approved questions found for scoring this test' },
          { status: 400 }
        );
      }

      const attemptResult = scoreBackendPdfNativeAttempt(body, allApprovedQuestions);
      pdfNativeAttemptsStore.push(attemptResult);

      return Response.json({
        success: true,
        attempt: attemptResult,
      });
    } catch (err) {
      return Response.json(
        { error: err instanceof Error ? err.message : 'Failed to process test submission' },
        { status: 500 }
      );
    }
  }

  // GET /api/pdf-native/result?attempt_id=... (Phase 5B Result Details)
  if (request.method === 'GET' && (path === '/api/pdf-native/result' || path.startsWith('/api/pdf-native/result/'))) {
    const attemptId = url.searchParams.get('attempt_id') || path.replace('/api/pdf-native/result/', '');
    if (!attemptId) {
      return Response.json({ error: 'Missing attempt_id query parameter' }, { status: 400 });
    }

    const attempt = pdfNativeAttemptsStore.find((a) => a.id === attemptId) || pdfNativeAttemptsStore[pdfNativeAttemptsStore.length - 1];

    if (!attempt) {
      return Response.json({ error: 'Attempt not found' }, { status: 404 });
    }

    const test = pdfNativeTestsStore.find((t) => t.id === attempt.test_id) || null;
    const sameTestAttempts = pdfNativeAttemptsStore.filter((a) => a.test_id === attempt.test_id);

    const resultPayload = calculateBackendPdfNativeResultPayload(attempt, test, sameTestAttempts);

    return Response.json({
      success: true,
      result: resultPayload,
    });
  }

  // GET /api/pdf-native/review?attempt_id=... (Phase 6 Question-Wise Review)
  if (request.method === 'GET' && (path === '/api/pdf-native/review' || path.startsWith('/api/pdf-native/review/'))) {
    const attemptId = url.searchParams.get('attempt_id') || path.replace('/api/pdf-native/review/', '');
    if (!attemptId) {
      return Response.json({ error: 'Missing attempt_id query parameter' }, { status: 400 });
    }

    const attempt = pdfNativeAttemptsStore.find((a) => a.id === attemptId) || pdfNativeAttemptsStore[pdfNativeAttemptsStore.length - 1];

    if (!attempt) {
      return Response.json({ error: 'Attempt not found' }, { status: 404 });
    }

    const test = pdfNativeTestsStore.find((t) => t.id === attempt.test_id) || null;
    const testSubject = test?.subject || 'Physics';
    const singleSubjects = ['Physics', 'Chemistry', 'Mathematics', 'Biology'];
    const isSingleSubject = singleSubjects.includes(testSubject);

    const reviewQuestions: BackendPdfNativeReviewQuestion[] = attempt.answers.map((ans) => {
      const bankQ = allQuestionsMap.get(ans.question_id);
      return {
        question_id: ans.question_id,
        question_number: ans.question_number,
        subject: bankQ?.subject || ans.subject || 'Physics',
        page_start: bankQ?.page_start || 1,
        page_end: bankQ?.page_end || 1,
        bbox: bankQ?.bbox || { x: 10, y: 10, width: 290, height: 100 },
        pdf_id: bankQ?.pdf_id || 'ref',
        pdf_url: bankQ?.pdf_url,
        selected_answer: ans.selected_answer,
        correct_answer: ans.correct_answer,
        status: ans.status,
        awarded_marks: ans.awarded_marks,
      };
    });

    const reviewPayload: BackendPdfNativeReviewPayload = {
      attempt_id: attempt.id,
      student_name: attempt.student_name || 'Student',
      test_id: attempt.test_id,
      test_title: test?.title || 'PDF-Native Test',
      test_subject: testSubject,
      is_single_subject: isSingleSubject,
      questions: reviewQuestions,
    };

    return Response.json({
      success: true,
      review: reviewPayload,
    });
  }

  // GET /api/pdf-native/health
  if (request.method === 'GET' && path === '/api/pdf-native/health') {
    return Response.json({ status: 'ok', module: 'pdf-native-scoring-engine' });
  }

  return null;
}
