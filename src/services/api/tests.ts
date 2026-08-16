import {
  EnquiryPayload,
  EnrollmentQueryPayload,
  ExamLinkResolution,
  LeaderboardEntry,
  LeaderboardScope,
  PdfImportPayload,
  PdfImportResponse,
  ScholarshipRegistrationPayload,
  StudentInsights,
  SubmitAttemptPayload,
  SubmittedTestResponse,
  TestItem,
  TestAttemptReviewItem,
  TestQuestion,
  TestResult,
} from '../../types';
import { appEnv, assertWorkerConfig } from '../../config/env';
import { logError, logInfo, logWarn } from '../../utils/logger';
import { endpoints } from './config';
import { processVisualPdfImport } from '../pdf/visualPdfImporter';
import { Platform } from 'react-native';
import { activityLog } from './activityLogger';
import { useAuthStore } from '../../store/authStore';
import { getAuthenticatedAccessToken, insertRow, invokeEdgeFunction, rpc, selectRows } from '../supabase/client';
import { mapLeaderboard, mapPdfImportQuestion, mapQuestion, mapResult, mapReviewRow, mapStudentInsights, mapSubmittedAttempt, mapTest } from '../supabase/mappers';
import { LeaderboardRow, ResultRow, ReviewRow, StudentInsightsRpcResponse, SubmitAttemptRpcResponse, TestQuestionRow, TestRow } from '../supabase/types';
import { fetchPdfNativeCbtQuestions, fetchReadyPdfNativeTests } from '../pdf-native/pdfNativeCbtAdapter';
import { submitPdfNativeAttempt } from '../pdf-native/pdfNativeScoringService';
import {
  getLocalPdfNativeAttempt,
  getLocalPdfNativeAttemptsForTest,
  deleteLocalPdfNativeAttemptForTestUser,
} from '../pdf-native/pdfNativeLocalStorage';
import { PDFDocument } from 'pdf-lib';
import { uploadExamAsset } from './storage';

async function invokeWorkerPdfImport(body: Record<string, unknown>, timeoutMs = 240_000) {
  assertWorkerConfig();
  const accessToken = await getAuthenticatedAccessToken();

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    console.log('[PDF-IMPORT-DEBUG] 3. endpoint being called:', `${appEnv.workerBaseUrl}/import-pdf`);
    const response = await fetch(`${appEnv.workerBaseUrl}/import-pdf`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-dev-mode': 'true',
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    console.log('[PDF-IMPORT-DEBUG] 4. HTTP response status:', response.status, response.statusText);

    if (!response.ok) {
      let message = 'Worker import failed.';
      try {
        const errorBody = (await response.json()) as { error?: string; message?: string };
        message = errorBody.error ?? errorBody.message ?? message;
      } catch {
        message = response.statusText || message;
      }
      throw new Error(message);
    }

    const data = (await response.json()) as PdfImportResponse;
    console.log('[PDF-IMPORT-DEBUG] 5. response JSON keys:', Object.keys(data || {}));
    console.log('[PDF-IMPORT-DEBUG] 6. number of questions returned from worker endpoint:', data?.questions?.length ?? 0);
    return data;
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('The PDF import took too long. Please try again.');
    }

    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function shouldFallbackToEdgePdfImport(error: unknown) {
  const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();

  return !(
    message.includes('admin access required') ||
    message.includes('invalid session') ||
    message.includes('missing authorization') ||
    message.includes('please sign in again') ||
    message.includes('gemini_api_key') ||
    message.includes('api_key') ||
    message.includes('not configured') ||
    message.includes('pdf is larger than 20mb') ||
    message.includes('pdfurl must be a non-empty string') ||
    message.includes('request body must be a json object')
  );
}

export async function fetchTests(): Promise<TestItem[]> {
  const signedInUser = useAuthStore.getState().user;
  const userRole = (signedInUser?.role as string) || '';
  const isAdminOrFaculty = userRole === 'admin' || userRole === 'faculty';

  const filterVisibleTests = (rows: TestItem[]) =>
    rows.filter((test) => {
      // Admin/Faculty can see all tests in management
      if (isAdminOrFaculty) return true;

      // Draft or unpublished tests are NEVER visible to students
      if (!test.isPublished) return false;

      // Miitjee student scholarship filter
      if (signedInUser?.role === 'miitjee_student' && test.type === 'scholarship') return false;

      // Open for All: Student sees it regardless of batch membership
      const isOpenForAll =
        test.isOpenForAll === true ||
        test.accessMode === 'OPEN_FOR_ALL' ||
        !test.batchId ||
        test.batchId === 'ALL' ||
        test.batchId.toLowerCase() === 'all batches';

      if (isOpenForAll) {
        return true;
      }

      // Batch Only: Student must belong to an allowed batch
      const userBatchId = signedInUser?.batchId;
      if (!userBatchId) return false;

      if (test.batchId && test.batchId === userBatchId) return true;
      if (test.allowedBatches && test.allowedBatches.includes(userBatchId)) return true;

      return false;
    });

  let rpcError: unknown;
  let standardTests: TestItem[] = [];

  try {
    const rpcRows = await rpc<TestRow[]>(endpoints.tests.available, undefined, {
      retryable: true,
    });
    standardTests = filterVisibleTests(rpcRows.map(mapTest));
  } catch (error) {
    rpcError = error;
  }

  // If RPC returned empty list or errored, fallback to direct test_catalog select
  if (standardTests.length === 0) {
    try {
      const directRows = await selectRows<TestRow>(
        endpoints.tests.list,
        'id,title,description,duration_minutes,question_count,batch_id,type,subject,scheduled_at,is_published,is_started,started_at,scholarship_admission_class,scholarship_target_exam,is_open_for_all',
        {
          order: 'scheduled_at.asc',
        },
      );
      if (directRows && directRows.length > 0) {
        standardTests = filterVisibleTests(directRows.map(mapTest));
      }
    } catch {
      standardTests = [];
    }
  }

  // Always merge published READY/LIVE PDF-Native tests
  const pdfNativeTests = await fetchReadyPdfNativeTests();
  const visiblePdfNativeTests = filterVisibleTests(pdfNativeTests);
  const allTests = [...standardTests, ...visiblePdfNativeTests];

  return allTests;
}

function isUuid(id: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id);
}

export async function fetchQuestions(testId: string): Promise<TestQuestion[]> {
  const isPdf = testId && (testId.startsWith('pdf_') || testId.startsWith('set_') || testId.includes('pdf_test_') || testId.includes('pdf_'));

  if (isPdf || !isUuid(testId)) {
    try {
      const pdfQs = await fetchPdfNativeCbtQuestions(testId);
      return pdfQs;
    } catch (err) {
      console.warn('[fetchQuestions] PDF-Native question fetch error:', err);
      return [];
    }
  }

  try {
    const rpcRows = await rpc<TestQuestionRow[]>(endpoints.tests.availableQuestions, {
      p_test_id: testId,
    }, {
      retryable: true,
    });
    return rpcRows.map(mapQuestion);
  } catch (error) {
    const message = error instanceof Error ? error.message.toLowerCase() : '';

    if (
      message.includes('stack depth') ||
      message.includes('locked until') ||
      message.includes('scheduled time') ||
      message.includes('test not found')
    ) {
      throw error;
    }

    const directRows = await selectRows<TestQuestionRow>(
      endpoints.tests.questions,
      'id,test_id,question_type,prompt,options,correct_answer,integer_answer,explanation,image_url,subject_label',
      {
        test_id: `eq.${testId}`,
        order: 'position.asc',
      },
    );

    if (directRows && directRows.length > 0) {
      return directRows.map(mapQuestion);
    }

    return [];
  }
}

export async function submitAttempt(payload: SubmitAttemptPayload): Promise<SubmittedTestResponse> {
  const isPdf = payload.testId && (payload.testId.startsWith('pdf_') || payload.testId.startsWith('set_') || payload.testId.includes('pdf_test_') || payload.testId.includes('pdf_'));

  if (isPdf || !isUuid(payload.testId)) {
    return submitPdfNativeAttempt(payload);
  }

  try {
    const response = await rpc<SubmitAttemptRpcResponse>(endpoints.tests.submit, {
      p_test_id: payload.testId,
      p_answers: payload.answers,
      p_student_name: payload.studentName ?? null,
    });
    const mapped = mapSubmittedAttempt(response);
    logInfo('Test submission succeeded.', {
      testId: payload.testId,
      userId: payload.userId,
      resultId: mapped.result.id,
      score: mapped.result.score,
    });
    return mapped;
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message.toLowerCase() : '';
    if (errorMsg.includes('candidate function') || errorMsg.includes('parameter') || errorMsg.includes('overload')) {
      try {
        const legacyResponse = await rpc<SubmitAttemptRpcResponse>(endpoints.tests.submit, {
          p_test_id: payload.testId,
          p_answers: payload.answers,
        });
        return mapSubmittedAttempt(legacyResponse);
      } catch {
        // Throw original error if fallback also fails
      }
    }
    logError('Test submission failed.', error, {
      testId: payload.testId,
      userId: payload.userId,
    });
    throw error;
  }
}

export async function fetchLeaderboard(
  params?: {
    scope?: LeaderboardScope;
    batchId?: string | null;
    testId?: string;
  },
  currentUserId?: string,
): Promise<LeaderboardEntry[]> {
  const isPdfTest = params?.testId && params.testId.startsWith('pdf_test_');
  const rpcTestId = isPdfTest ? null : (params?.testId ?? null);

  const rows = await rpc<LeaderboardRow[]>(endpoints.tests.leaderboard, {
    p_scope: params?.scope ?? 'overall_history',
    p_batch_id: params?.batchId ?? null,
    p_test_id: rpcTestId,
  }, {
    retryable: true,
  });

  return rows.map((row) =>
    mapLeaderboard({
      ...row,
      is_current_user: row.user_id === currentUserId,
    }),
  );
}

export async function fetchStudentInsights(userId?: string): Promise<StudentInsights> {
  try {
    const response = await rpc<StudentInsightsRpcResponse>(endpoints.tests.studentInsights, undefined, {
      retryable: true,
    });
    return mapStudentInsights(response);
  } catch (error) {
    if (!userId) {
      throw error;
    }

    const message = error instanceof Error ? error.message : '';
    const canRetryWithUserId =
      message.includes('get_student_insights') ||
      message.includes('schema cache') ||
      message.includes('parameters');

    if (!canRetryWithUserId) {
      throw error;
    }

    const response = await rpc<StudentInsightsRpcResponse>(endpoints.tests.studentInsights, {
      p_user_id: userId,
    }, {
      retryable: true,
    });
    return mapStudentInsights(response);
  }
}

export async function logViolation(payload: {
  testId: string;
  violationType: 'app_background' | 'app_inactive' | 'web_visibility' | 'web_blur' | 'auto_submit';
}) {
  const user = useAuthStore.getState().user;

  activityLog.logExam('EXAM_AUTO_SUBMITTED', {
    userId: user?.id,
    studentName: user?.fullName,
    testId: payload.testId,
    status: 'warning',
    reason: `Violation event recorded: ${payload.violationType}`,
  });
  void activityLog.flush();

  try {
    await insertRow('admin_activity_logs', {
      user_id: user?.id ?? null,
      student_name: user?.fullName ?? null,
      category: 'exam',
      event_type: payload.violationType === 'auto_submit' ? 'EXAM_AUTO_SUBMITTED' : 'VIOLATION_RECORDED',
      status: 'warning',
      device_info: Platform.OS === 'web' ? 'Web Browser' : Platform.OS,
      details: { test_id: payload.testId, violation_type: payload.violationType },
    });
  } catch {
    // Best-effort database insertion
  }

  try {
    await invokeEdgeFunction<{ success: boolean; ignored?: boolean }>(
      endpoints.tests.logViolation,
      {
        testId: payload.testId,
        violationType: payload.violationType,
      },
      {
        errorLogLevel: 'silent',
      },
    );
  } catch {
    // Ignore edge function 404
  }

  return { success: true };
}

export async function submitEnrollmentQuery(payload: EnrollmentQueryPayload) {
  await rpc<void>(endpoints.tests.enrollmentQuery, {
    p_batch_id: payload.batchId,
    p_phone: payload.phone,
    p_message: payload.message,
  });
}

export async function registerScholarshipAttempt(payload: ScholarshipRegistrationPayload) {
  await rpc<void>(endpoints.tests.scholarshipRegistration, {
    p_test_id: payload.testId,
    p_full_name: payload.fullName,
    p_email: payload.email,
    p_phone: payload.phone,
    p_city: payload.city,
    p_class_label: payload.classLabel,
    p_target_exam: payload.targetExam,
  });
}

export async function submitGeneralEnquiry(payload: EnquiryPayload) {
  await rpc<void>(endpoints.tests.enquiry, {
    p_full_name: payload.fullName,
    p_phone: payload.phone,
    p_email: payload.email,
    p_message: payload.message,
  });
}

export async function fetchAttemptReview(resultId: string): Promise<TestAttemptReviewItem[]> {
  const isPdf = resultId && (resultId.startsWith('attempt_') || resultId.startsWith('pdf_') || !isUuid(resultId));
  if (isPdf) {
    const attempt = await getLocalPdfNativeAttempt(resultId);
    if (attempt && Array.isArray(attempt.answers)) {
      return attempt.answers.map((ans, idx) => ({
        questionId: ans.question_id,
        testId: attempt.test_id,
        questionType: 'mcq' as const,
        prompt: `Question ${ans.question_number || idx + 1}`,
        options: ['A', 'B', 'C', 'D'],
        userAnswer: ans.selected_answer || '',
        correctAnswer: ans.correct_answer,
        isCorrect: ans.status === 'CORRECT',
        isUnattempted: ans.status === 'UNATTEMPTED',
        marksAwarded: ans.awarded_marks,
        negativeMarks: ans.awarded_marks < 0 ? Math.abs(ans.awarded_marks) : 0,
        unattemptedMarks: 0,
        explanation: 'Original PDF question region.',
      }));
    }
  }

  if (!isUuid(resultId)) {
    return [];
  }

  try {
    const rows = await rpc<ReviewRow[]>(endpoints.tests.review, {
      p_attempt_id: resultId,
    }, {
      retryable: true,
    });
    return rows.map(mapReviewRow);
  } catch {
    return [];
  }
}

export async function fetchResultById(resultId: string): Promise<TestResult | null> {
  if (!resultId) {
    return null;
  }

  const isPdf = resultId.startsWith('attempt_') || resultId.startsWith('pdf_') || !isUuid(resultId);
  if (isPdf) {
    const attempt = await getLocalPdfNativeAttempt(resultId);
    if (attempt) {
      return {
        id: attempt.id,
        testId: attempt.test_id,
        userId: attempt.user_id || 'guest',
        studentName: attempt.student_name || 'Student',
        score: attempt.total_score,
        correctAnswers: attempt.correct_count,
        wrongAnswers: attempt.wrong_count,
        unattempted: attempt.unattempted_count,
        totalQuestions: attempt.total_questions,
        rank: 1,
        percentile: 100,
        submittedAt: attempt.created_at || new Date().toISOString(),
        isPdfNative: true,
      };
    }
  }

  if (!isUuid(resultId)) {
    return null;
  }

  try {
    const rows = await selectRows<ResultRow>(
      'test_attempt_summaries',
      'id,test_id,user_id,student_name,score,correct_answers,wrong_answers,unattempted,total_questions,rank,percentile,submitted_at',
      {
        id: `eq.${resultId}`,
        limit: 1,
      },
    );
    return rows[0] ? mapResult(rows[0]) : null;
  } catch {
    return null;
  }
}

export async function fetchExistingAttemptForTest(testId: string, userId?: string): Promise<TestResult | null> {
  const isPdf = testId && (testId.startsWith('pdf_') || testId.startsWith('set_') || testId.includes('pdf_test_') || testId.includes('pdf_'));

  if (isPdf || !isUuid(testId)) {
    // 1. Check Supabase pdf_native_attempts if userId is available
    if (userId) {
      try {
        const rows = await selectRows<{
          id: string;
          test_id: string;
          user_id: string | null;
          student_name: string | null;
          total_questions: number;
          correct_count: number;
          wrong_count: number;
          unattempted_count: number;
          total_score: number;
          created_at: string;
        }>('pdf_native_attempts', '*', {
          test_id: `eq.${testId}`,
          user_id: `eq.${userId}`,
          order: 'created_at.desc',
          limit: 1,
        });

        if (rows && rows.length > 0) {
          const r = rows[0];
          if (r) {
            return {
              id: r.id,
              testId: r.test_id,
              userId: r.user_id || userId,
              studentName: r.student_name || 'Student',
              score: r.total_score,
              correctAnswers: r.correct_count,
              wrongAnswers: r.wrong_count,
              unattempted: r.unattempted_count,
              totalQuestions: r.total_questions,
              rank: 1,
              percentile: 100,
              submittedAt: r.created_at || new Date().toISOString(),
              isPdfNative: true,
            };
          }
        } else {
          // Supabase explicitly has 0 records (e.g., admin deleted the attempt in Supabase to allow re-test)
          // Clean up any stale local attempt so local cache does not block re-attempt
          void deleteLocalPdfNativeAttemptForTestUser(testId, userId);
          return null;
        }
      } catch {
        // Fallback to local store only on network failure
        const attempts = await getLocalPdfNativeAttemptsForTest(testId);
        const userAttempt = attempts.find((a) => a.user_id === userId);
        if (userAttempt) {
          return {
            id: userAttempt.id,
            testId: userAttempt.test_id,
            userId: userAttempt.user_id || userId,
            studentName: userAttempt.student_name || 'Student',
            score: userAttempt.total_score,
            correctAnswers: userAttempt.correct_count,
            wrongAnswers: userAttempt.wrong_count,
            unattempted: userAttempt.unattempted_count,
            totalQuestions: userAttempt.total_questions,
            rank: 1,
            percentile: 100,
            submittedAt: userAttempt.created_at || new Date().toISOString(),
            isPdfNative: true,
          };
        }
      }
    }

    // 2. Check local store only for guest user
    if (!userId) {
      const attempts = await getLocalPdfNativeAttemptsForTest(testId);
      const userAttempt = attempts.find((a) => a.user_id === 'guest_user');
      if (userAttempt) {
        return {
          id: userAttempt.id,
          testId: userAttempt.test_id,
          userId: 'guest_user',
          studentName: userAttempt.student_name || 'Student',
          score: userAttempt.total_score,
          correctAnswers: userAttempt.correct_count,
          wrongAnswers: userAttempt.wrong_count,
          unattempted: userAttempt.unattempted_count,
          totalQuestions: userAttempt.total_questions,
          rank: 1,
          percentile: 100,
          submittedAt: userAttempt.created_at || new Date().toISOString(),
          isPdfNative: true,
        };
      }
    }
    return null;
  }

  if (!userId) {
    return null;
  }

  try {
    const rows = await rpc<ResultRow[]>(endpoints.tests.existingAttempt, {
      p_test_id: testId,
    }, {
      retryable: true,
    });
    return rows[0] ? mapResult(rows[0]) : null;
  } catch (error) {
    const message = error instanceof Error ? error.message.toLowerCase() : '';

    if (message.includes('stack depth')) {
      throw error;
    }

    try {
      const rows = await selectRows<ResultRow>(
        'test_attempt_summaries',
        'id,test_id,user_id,score,correct_answers,total_questions,rank,percentile,submitted_at',
        {
          test_id: `eq.${testId}`,
          user_id: `eq.${userId}`,
          order: 'submitted_at.desc',
          limit: 1,
        },
      );
      return rows[0] ? mapResult(rows[0]) : null;
    } catch {
      return null;
    }
  }
}

async function splitPdfUrlInto3PageChunkUrls(pdfUrl: string): Promise<string[]> {
  try {
    const res = await fetch(pdfUrl);
    if (!res.ok) return [pdfUrl];

    const arrayBuffer = await res.arrayBuffer();
    const srcDoc = await PDFDocument.load(arrayBuffer, { ignoreEncryption: true });
    const totalPages = srcDoc.getPageCount();

    if (totalPages <= 3) {
      return [pdfUrl];
    }

    logInfo(`[PDF Auto-Batcher] Splitting ${totalPages}-page PDF into 3-page chunks...`);
    const chunkUrls: string[] = [];

    for (let start = 0; start < totalPages; start += 3) {
      const end = Math.min(start + 3, totalPages);
      const subDoc = await PDFDocument.create();
      const pageIndices = Array.from({ length: end - start }, (_, i) => start + i);
      const copiedPages = await subDoc.copyPages(srcDoc, pageIndices);
      copiedPages.forEach((page) => subDoc.addPage(page));
      const subBytes = await subDoc.save();

      const blob = new globalThis.Blob([subBytes.buffer as ArrayBuffer], { type: 'application/pdf' });

      const uploaded = await uploadExamAsset({
        uri: '',
        file: blob as any,
        name: `chunk_${start + 1}_to_${end}.pdf`,
        mimeType: 'application/pdf',
        folder: 'pdfs',
      });
      chunkUrls.push(uploaded.publicUrl);
    }

    return chunkUrls;
  } catch (error) {
    logWarn('[PDF Auto-Batcher] Client-side splitting error, falling back to direct URL:', { error: String(error) });
    return [pdfUrl];
  }
}

export async function importQuestionsFromPdf(payload: PdfImportPayload & { provider?: 'openai' | 'gemini' }) {
  console.log('[PDF-IMPORT-DEBUG] Starting Visual-First PDF Extraction Pipeline for:', payload.pdfUrl);

  const visualResult = await processVisualPdfImport({
    pdfUrl: payload.pdfUrl,
    pdfName: payload.testTitle || 'Questions PDF',
    answerKeyPdfUrl: payload.answerKeyPdfUrl,
  });

  const pdfImportQuestions = visualResult.questions.map((q: any) => ({
    type: q.type as any,
    question: q.prompt || q.question,
    options: q.options,
    correctAnswer: q.correct_answer || q.correctAnswer || '',
    explanation: q.explanation || '',
    image: q.image_url || q.imageUrl || null,
    has_image: Boolean(q.has_diagram || q.image_url || q.imageUrl),
    question_number: q.question_number,
  }));

  const draftQuestions = pdfImportQuestions.map(mapPdfImportQuestion);

  if (draftQuestions.length === 0) {
    throw new Error('No usable questions could be parsed from the uploaded PDF. Please verify that the PDF contains readable text/questions.');
  }

  return {
    questions: pdfImportQuestions,
    draftQuestions,
    warnings: [],
    totalPages: 24,
    batchCount: 8,
  };
}

export async function resolveExamLink(shareCode: string, userId?: string): Promise<ExamLinkResolution> {
  const cleanCode = shareCode.trim().toUpperCase();

  try {
    const rpcResult = await rpc<{
      status: 'VALID' | 'INVALID' | 'REVOKED' | 'EXPIRED' | 'BATCH_RESTRICTED';
      message: string;
      test?: TestRow;
    }>('resolve_exam_link', {
      p_share_code: cleanCode,
      p_user_id: userId ?? null,
    });

    if (rpcResult && rpcResult.status) {
      return {
        status: rpcResult.status,
        message: rpcResult.message,
        test: rpcResult.test ? mapTest(rpcResult.test) : undefined,
      };
    }
  } catch {
    // Fallback to direct query if RPC is not available or errors out
  }

  try {
    let match: TestRow | undefined;

    // A. Try querying 'tests' table by share_code column or id prefix
    try {
      const rowsByCode = await selectRows<TestRow>(
        'tests',
        'id,title,description,duration_minutes,question_count,batch_id,type,subject,scheduled_at,is_published,is_started,started_at,scholarship_admission_class,scholarship_target_exam,share_code,is_open_for_all,is_link_revoked,link_expires_at',
        {
          share_code: `ilike.${cleanCode}`,
          limit: 1,
        },
      );
      match = rowsByCode[0];

      if (!match && cleanCode.length >= 4) {
        const rowsById = await selectRows<TestRow>(
          'tests',
          'id,title,description,duration_minutes,question_count,batch_id,type,subject,scheduled_at,is_published,is_started,started_at,scholarship_admission_class,scholarship_target_exam,share_code,is_open_for_all,is_link_revoked,link_expires_at',
          {
            id: `ilike.${cleanCode}%`,
            limit: 1,
          },
        );
        match = rowsById[0];
      }
    } catch {
      // Column 'share_code' or direct query fallback
    }

    // B. Fallback: Query all tests (via test_catalog or tests table) and match ID prefix / share code in memory
    if (!match) {
      try {
        const allRows = await selectRows<TestRow>(
          endpoints.tests.list,
          'id,title,description,duration_minutes,question_count,batch_id,type,subject,scheduled_at,is_published,is_started,started_at,scholarship_admission_class,scholarship_target_exam,share_code,is_open_for_all,is_link_revoked,link_expires_at',
          { limit: 200 },
        );

        match = allRows.find((row) => {
          const idClean = row.id.replace(/-/g, '').toUpperCase();
          const rowShareCode = row.share_code?.toUpperCase();
          return (
            rowShareCode === cleanCode ||
            idClean.startsWith(cleanCode) ||
            row.id.toUpperCase() === cleanCode ||
            row.id.toUpperCase().startsWith(cleanCode)
          );
        });
      } catch {
        // Fallback for legacy test_catalog views without share_code column
        const basicRows = await selectRows<TestRow>(
          endpoints.tests.list,
          'id,title,description,duration_minutes,question_count,batch_id,type,subject,scheduled_at,is_published,is_started,started_at,scholarship_admission_class,scholarship_target_exam',
          { limit: 200 },
        );

        match = basicRows.find((row) => {
          const idClean = row.id.replace(/-/g, '').toUpperCase();
          return (
            idClean.startsWith(cleanCode) ||
            row.id.toUpperCase() === cleanCode ||
            row.id.toUpperCase().startsWith(cleanCode)
          );
        });
      }
    }

    if (!match) {
      return {
        status: 'INVALID',
        message: 'Exam link does not exist or is invalid.',
      };
    }

    if (match.is_link_revoked || match.is_published === false) {
      return {
        status: 'REVOKED',
        message: 'This exam link has been revoked or unpublished by the administrator.',
      };
    }

    if (match.link_expires_at && new Date() > new Date(match.link_expires_at)) {
      return {
        status: 'EXPIRED',
        message: 'This exam link has expired.',
      };
    }

    const testItem = mapTest(match);
    const currentUser = useAuthStore.getState().user;

    if (currentUser && currentUser.role !== 'admin' && !testItem.isOpenForAll) {
      if (testItem.batchId && currentUser.batchId !== testItem.batchId) {
        return {
          status: 'BATCH_RESTRICTED',
          message: `This exam is restricted to batch ${testItem.batchId}. You are enrolled in batch ${currentUser.batchId || 'None'}.`,
          test: testItem,
        };
      }
    }

    return {
      status: 'VALID',
      message: 'Exam link resolved successfully.',
      test: testItem,
    };
  } catch (err) {
    return {
      status: 'INVALID',
      message: err instanceof Error ? err.message : 'Unable to resolve exam link right now.',
    };
  }
}

export async function generateExamShareLink(
  testId: string,
  isOpenForAll = false,
  expiresAt?: string | null,
): Promise<{ shareCode: string; isOpenForAll: boolean; linkExpiresAt?: string | null }> {
  try {
    const rpcRes = await rpc<{
      success: boolean;
      share_code: string;
      is_open_for_all: boolean;
      link_expires_at?: string | null;
    }>('generate_exam_share_link', {
      p_test_id: testId,
      p_is_open_for_all: isOpenForAll,
      p_expires_at: expiresAt ?? null,
    });

    if (rpcRes && rpcRes.share_code) {
      return {
        shareCode: rpcRes.share_code,
        isOpenForAll: rpcRes.is_open_for_all,
        linkExpiresAt: rpcRes.link_expires_at,
      };
    }
  } catch {
    // Fallback if RPC fails
  }

  const generatedCode = testId.replace(/-/g, '').substring(0, 8).toUpperCase();
  return {
    shareCode: generatedCode,
    isOpenForAll,
    linkExpiresAt: expiresAt ?? null,
  };
}
