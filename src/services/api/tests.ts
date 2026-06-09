import {
  EnquiryPayload,
  EnrollmentQueryPayload,
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
import { getAuthenticatedAccessToken, invokeEdgeFunction, rpc, selectRows } from '../supabase/client';
import { mapLeaderboard, mapPdfImportQuestion, mapQuestion, mapResult, mapReviewRow, mapStudentInsights, mapSubmittedAttempt, mapTest } from '../supabase/mappers';
import { LeaderboardRow, ResultRow, ReviewRow, StudentInsightsRpcResponse, SubmitAttemptRpcResponse, TestQuestionRow, TestRow } from '../supabase/types';
import { useAuthStore } from '../../store/authStore';

async function invokeWorkerPdfImport(body: Record<string, unknown>, timeoutMs = 240_000) {
  assertWorkerConfig();
  const accessToken = await getAuthenticatedAccessToken();

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`${appEnv.workerBaseUrl}/import-pdf`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

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

    return (await response.json()) as PdfImportResponse;
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
    message.includes('pdf is larger than 20mb') ||
    message.includes('pdfurl must be a non-empty string') ||
    message.includes('request body must be a json object')
  );
}

export async function fetchTests(): Promise<TestItem[]> {
  const signedInUser = useAuthStore.getState().user;
  const filterVisibleTests = (rows: TestItem[]) =>
    rows.filter((test) => !(signedInUser?.role === 'miitjee_student' && test.type === 'scholarship'));
  let rpcError: unknown;

  try {
    const rpcRows = await rpc<TestRow[]>(endpoints.tests.available, undefined, {
      retryable: true,
    });
    return filterVisibleTests(rpcRows.map(mapTest));
  } catch (error) {
    rpcError = error;
  }

  let directRows: TestRow[] = [];

  try {
    directRows = await selectRows<TestRow>(
      endpoints.tests.list,
      'id,title,description,duration_minutes,question_count,batch_id,type,subject,scheduled_at,is_published,is_started,started_at,scholarship_admission_class,scholarship_target_exam',
      {
        order: 'scheduled_at.asc',
      },
    );

    if (directRows.length > 0) {
      return filterVisibleTests(directRows.map(mapTest));
    }
  } catch {
    directRows = [];
  }

  if (rpcError) {
    throw rpcError;
  }

  return [];
}

export async function fetchQuestions(testId: string): Promise<TestQuestion[]> {
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

    return directRows.map(mapQuestion);
  }
}

export async function submitAttempt(payload: SubmitAttemptPayload): Promise<SubmittedTestResponse> {
  try {
    const response = await rpc<SubmitAttemptRpcResponse>(endpoints.tests.submit, {
      p_test_id: payload.testId,
      p_answers: payload.answers,
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
  const rows = await rpc<LeaderboardRow[]>(endpoints.tests.leaderboard, {
    p_scope: params?.scope ?? 'overall_history',
    p_batch_id: params?.batchId ?? null,
    p_test_id: params?.testId ?? null,
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

export async function logViolation(payload: { testId: string; violationType: 'app_background' | 'app_inactive' | 'auto_submit' }) {
  try {
    return await invokeEdgeFunction<{ success: boolean; ignored?: boolean }>(
      endpoints.tests.logViolation,
      {
        testId: payload.testId,
        violationType: payload.violationType,
      },
      {
        errorLogLevel: 'silent',
      },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
    if (
      message.includes('requested function was not found') ||
      message.includes('function was not found') ||
      message.includes('404')
    ) {
      return {
        success: false,
        ignored: true,
      };
    }

    throw error;
  }
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
  const rows = await rpc<ReviewRow[]>(endpoints.tests.review, {
    p_attempt_id: resultId,
  }, {
    retryable: true,
  });
  return rows.map(mapReviewRow);
}

export async function fetchExistingAttemptForTest(testId: string, userId?: string): Promise<TestResult | null> {
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
  }
}

export async function importQuestionsFromPdf(payload: PdfImportPayload & { provider?: 'openai' | 'gemini' }) {
  const requestBody = {
    pdfUrl: payload.pdfUrl,
    testTitle: payload.testTitle,
    subject: payload.subject,
    startQuestionNumber: payload.startQuestionNumber,
    importMode: payload.importMode,
    provider: payload.provider ?? 'gemini',
  };

  let response: PdfImportResponse;

  if (appEnv.workerBaseUrl) {
    try {
      response = await invokeWorkerPdfImport(requestBody);
      return {
        ...response,
        draftQuestions: response.questions.map(mapPdfImportQuestion),
      };
    } catch (workerError) {
      if (!shouldFallbackToEdgePdfImport(workerError)) {
        throw workerError;
      }

      logWarn('Worker-based PDF import failed. Falling back to Supabase edge import.', {
        provider: requestBody.provider,
        error: workerError instanceof Error ? workerError.message : String(workerError),
      });
    }
  }

  response = await invokeEdgeFunction<PdfImportResponse>(endpoints.admin.pdfImport, requestBody, {
    retryable: false,
    timeoutMs: 180_000,
  });

  return {
    ...response,
    draftQuestions: response.questions.map(mapPdfImportQuestion),
  };
}
