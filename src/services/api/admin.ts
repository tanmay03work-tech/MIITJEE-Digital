import {
  ActivityLogEntry,
  AnalyticsSnapshot,
  AutoSubmitEvent,
  AppUser,
  AssignBatchPayload,
  Batch,
  CreateBatchPayload,
  EnquiryRecord,
  CreateTestPayload,
  EnrollmentQueryRecord,
  QuestionAnalytics,
  QuestionBankQuestion,
  QuestionBankSet,
  ScholarshipRegistrationRecord,
  StudentAnalytics,
  TestItem,
  TestAnalytics,
  TestResult,
  UpdateTestPayload,
  ViolationSummary,
} from '../../types';
import { appEnv, assertWorkerConfig } from '../../config/env';
import { endpoints } from './config';
import { deleteRows, getAuthenticatedAccessToken, rpc, selectRows } from '../supabase/client';
import { mapActivityLog, mapAnalytics, mapAutoSubmitEvent, mapBatch, mapEnquiry, mapEnrollmentQuery, mapProfile, mapQuestionAnalytics, mapResult, mapScholarshipRegistration, mapStudentAnalytics, mapTest, mapTestAnalytics, mapViolationSummary, normalizeAssetUrl } from '../supabase/mappers';
import { ActivityLogRow, AnalyticsRow, AutoSubmitEventRow, BatchRow, EnquiryRow, EnrollmentQueryRow, ProfileRow, QuestionAnalyticsRow, ResultRow, ScholarshipRegistrationRow, StudentAnalyticsRow, TestAnalyticsRow, TestRow, ViolationSummaryRow } from '../supabase/types';
import { coerceDurationMinutes } from '../../utils/formatters';
import {
  deletePdfNativeTest,
  getPdfNativeTestById,
  listPdfNativeTests,
  publishPdfNativeTest,
  updatePdfNativeTest,
} from '../pdf-native/pdfNativeTestService';
import { mapPdfNativeTestToCbtTestItem } from '../pdf-native/pdfNativeCbtAdapter';
import {
  getLocalPdfNativeAttempts,
  getLocalPdfNativeTestQuestions,
} from '../pdf-native/pdfNativeLocalStorage';

const DEFAULT_PAGE_SIZE = 20;
const PAGE_CACHE_TTL_MS = 45_000;
const BULK_DELETE_PAGE_SIZE = 200;
const pageCache = new Map<string, { timestamp: number; rows: unknown[] }>();

interface PageOptions {
  offset?: number;
  limit?: number;
  search?: string;
}

function getCachedRows<T>(key: string) {
  const cached = pageCache.get(key);
  if (!cached) {
    return null;
  }

  if (Date.now() - cached.timestamp > PAGE_CACHE_TTL_MS) {
    pageCache.delete(key);
    return null;
  }

  return cached.rows as T[];
}

function setCachedRows<T>(key: string, rows: T[]) {
  pageCache.set(key, { timestamp: Date.now(), rows });
}

function invalidateAdminCache() {
  pageCache.clear();
}

function buildPageQuery(options?: PageOptions) {
  return {
    limit: Math.max(1, options?.limit ?? DEFAULT_PAGE_SIZE),
    offset: Math.max(0, options?.offset ?? 0),
  };
}

function normalizeSearchValue(value?: string) {
  return (value ?? '').trim().replace(/[()'",*%]/g, ' ').replace(/\s+/g, ' ');
}

async function listAllAttemptIds() {
  const attemptIds: string[] = [];
  let offset = 0;

  while (true) {
    const rows = await selectRows<{ id: string }>('test_attempt_summaries', 'id', {
      order: 'submitted_at.desc',
      limit: BULK_DELETE_PAGE_SIZE,
      offset,
    });

    if (rows.length === 0) {
      break;
    }

    attemptIds.push(...rows.map((row) => row.id));

    if (rows.length < BULK_DELETE_PAGE_SIZE) {
      break;
    }

    offset += BULK_DELETE_PAGE_SIZE;
  }

  return attemptIds;
}

async function workerRequest<T>(pathname: string, init?: RequestInit) {
  assertWorkerConfig();

  const accessToken = await getAuthenticatedAccessToken();
  const headers = new Headers(init?.headers);
  headers.set('Content-Type', 'application/json');

  if (accessToken) {
    headers.set('Authorization', `Bearer ${accessToken}`);
  }

  const normalizedPath = pathname.startsWith('/') ? pathname : `/${pathname}`;
  const primaryUrl = `${appEnv.workerBaseUrl}${normalizedPath}`;
  const fallbackBase = 'https://miitjee-backend.miitjee-api.workers.dev';

  try {
    const response = await fetch(primaryUrl, {
      ...init,
      headers,
    });

    if (!response.ok) {
      let message = 'Worker request failed.';
      try {
        const body = (await response.json()) as { error?: string; message?: string };
        message = body.error ?? body.message ?? message;
      } catch {
        message = response.statusText || message;
      }

      throw new Error(message);
    }

    return (await response.json()) as T;
  } catch (err) {
    if (appEnv.workerBaseUrl !== fallbackBase && (err instanceof TypeError || (err instanceof Error && err.message.includes('fetch')))) {
      console.warn(`[workerRequest] Primary worker request failed (${primaryUrl}), trying fallback (${fallbackBase}${normalizedPath}):`, err);
      const fallbackUrl = `${fallbackBase}${normalizedPath}`;
      const response = await fetch(fallbackUrl, {
        ...init,
        headers,
      });

      if (!response.ok) {
        let message = 'Worker request failed.';
        try {
          const body = (await response.json()) as { error?: string; message?: string };
          message = body.error ?? body.message ?? message;
        } catch {
          message = response.statusText || message;
        }

        throw new Error(message);
      }

      return (await response.json()) as T;
    }
    throw err;
  }
}

export async function fetchUsersPage(options?: PageOptions): Promise<AppUser[]> {
  const normalizedSearch = normalizeSearchValue(options?.search);
  const cacheKey = `users:${options?.offset ?? 0}:${options?.limit ?? DEFAULT_PAGE_SIZE}:${normalizedSearch.toLowerCase()}`;
  const cached = getCachedRows<AppUser>(cacheKey);
  if (cached) {
    return cached;
  }

  const pageQuery = buildPageQuery(options);
  const rows = await selectRows<ProfileRow>(
    endpoints.admin.users,
    'id,full_name,email,role,approval_status,batch_id,target_exam,class_label,avatar_seed,rank,average_score,streak_days',
    {
    ...(normalizedSearch
      ? {
          or: `(full_name.ilike.*${normalizedSearch}*,email.ilike.*${normalizedSearch}*)`,
        }
      : {}),
    order: 'full_name.asc',
    ...pageQuery,
  });

  const mappedRows = rows.map(mapProfile);
  setCachedRows(cacheKey, mappedRows);
  return mappedRows;
}

export async function fetchUsers(options?: PageOptions): Promise<AppUser[]> {
  return fetchUsersPage(options);
}

export async function fetchAdminTestsPage(options?: PageOptions): Promise<TestItem[]> {
  const cacheKey = `tests:${options?.offset ?? 0}:${options?.limit ?? DEFAULT_PAGE_SIZE}:${options?.search ?? ''}`;
  const cached = getCachedRows<TestItem>(cacheKey);
  if (cached) {
    return cached;
  }

  const pageQuery = buildPageQuery(options);

  let mappedRows: TestItem[] = [];
  try {
    const rows = await selectRows<TestRow>(
      endpoints.tests.list,
      'id,title,description,duration_minutes,question_count,batch_id,type,subject,scheduled_at,is_published,is_started,started_at,scholarship_admission_class,scholarship_target_exam',
      {
        order: 'scheduled_at.asc',
        ...pageQuery,
      },
    );
    mappedRows = rows.map(mapTest);
  } catch (err) {
    console.warn('[fetchAdminTestsPage] Standard tests query fallback:', err);
  }

  // Include PDF-Native tests in admin tests list
  try {
    const pdfNativeRaw = await listPdfNativeTests();
    const pdfNativeItems = pdfNativeRaw.map(mapPdfNativeTestToCbtTestItem);
    mappedRows = [...mappedRows, ...pdfNativeItems];
  } catch (err) {
    console.warn('[fetchAdminTestsPage] Error loading PDF-Native tests:', err);
  }

  if (options?.search) {
    const q = options.search.toLowerCase();
    mappedRows = mappedRows.filter(
      (t) => t.title.toLowerCase().includes(q) || (t.description && t.description.toLowerCase().includes(q))
    );
  }

  setCachedRows(cacheKey, mappedRows);
  return mappedRows;
}

export async function fetchResultsPage(userId?: string, options?: PageOptions): Promise<TestResult[]> {
  const cacheKey = `results:${userId ?? 'all'}:${options?.offset ?? 0}:${options?.limit ?? DEFAULT_PAGE_SIZE}`;
  const cached = getCachedRows<TestResult>(cacheKey);
  if (cached) {
    return cached;
  }

  const pageQuery = buildPageQuery(options);
  let mappedRows: TestResult[] = [];
  try {
    const rows = await selectRows<ResultRow>(
      endpoints.admin.results,
      'id,test_id,user_id,student_name,score,correct_answers,wrong_answers,unattempted,total_questions,rank,percentile,submitted_at',
      {
        ...(userId ? { user_id: `eq.${userId}` } : {}),
        order: 'submitted_at.desc',
        ...pageQuery,
      },
    );
    mappedRows = rows.map(mapResult);
  } catch {
    try {
      const directRows = await selectRows<
        Omit<ResultRow, 'rank'> & {
          rank?: number | null;
        }
      >('test_attempts', 'id,test_id,user_id,student_name,score,correct_answers,wrong_answers,unattempted,total_questions,percentile,submitted_at', {
        ...(userId ? { user_id: `eq.${userId}` } : {}),
        order: 'submitted_at.desc',
        ...pageQuery,
      });
      mappedRows = directRows.map((row) =>
        mapResult({
          ...row,
          rank: row.rank ?? 0,
        } as ResultRow),
      );
    } catch {
      mappedRows = [];
    }
  }

  // Merge Supabase PDF-Native test attempts
  try {
    const pdfRows = await selectRows<{
      id: string;
      test_id: string;
      user_id: string | null;
      student_name: string | null;
      total_score: number | null;
      score: number | null;
      correct_count: number;
      wrong_count: number;
      unattempted_count: number;
      total_questions: number;
      created_at: string;
    }>('pdf_native_attempts', '*', {
      ...(userId ? { user_id: `eq.${userId}` } : {}),
      order: 'created_at.desc',
      ...pageQuery,
    });

    for (const a of pdfRows) {
      if (!mappedRows.some((r) => r.id === a.id)) {
        mappedRows.push({
          id: a.id,
          testId: a.test_id,
          userId: a.user_id || userId || 'guest_user',
          studentName: a.student_name || 'Student',
          score: a.total_score ?? a.score ?? 0,
          correctAnswers: a.correct_count,
          wrongAnswers: a.wrong_count,
          unattempted: a.unattempted_count,
          totalQuestions: a.total_questions,
          rank: 1,
          percentile: 100,
          submittedAt: a.created_at || new Date().toISOString(),
          isPdfNative: true,
        });
      }
    }
  } catch (err) {
    // Only on network error, merge local guest attempts
    try {
      const localPdfAttempts = await getLocalPdfNativeAttempts();
      const filteredPdfAttempts = userId
        ? localPdfAttempts.filter((a) => a.user_id === userId)
        : localPdfAttempts;

      for (const a of filteredPdfAttempts) {
        if (!mappedRows.some((r) => r.id === a.id)) {
          mappedRows.push({
            id: a.id,
            testId: a.test_id,
            userId: a.user_id || userId || 'guest_user',
            studentName: a.student_name || 'Student',
            score: a.total_score,
            correctAnswers: a.correct_count,
            wrongAnswers: a.wrong_count,
            unattempted: a.unattempted_count,
            totalQuestions: a.total_questions,
            rank: 1,
            percentile: 100,
            submittedAt: a.created_at || new Date().toISOString(),
            isPdfNative: true,
          });
        }
      }
    } catch {
      // Ignore
    }
  }

  setCachedRows(cacheKey, mappedRows);
  return mappedRows;
}

export async function fetchResults(userId?: string, options?: PageOptions): Promise<TestResult[]> {
  return fetchResultsPage(userId, options);
}

export async function createTest(payload: CreateTestPayload): Promise<TestItem> {
  const safeDurationMinutes = coerceDurationMinutes(payload.durationMinutes);

  try {
    const row = await rpc<TestRow>(endpoints.admin.createTest, {
      p_title: payload.title,
      p_description: payload.description,
      p_duration_minutes: safeDurationMinutes,
      p_batch_id: payload.batchId ?? null,
      p_type: payload.type,
      p_subject: payload.subject,
      p_scholarship_admission_class: payload.scholarshipAdmissionClass ?? null,
      p_scholarship_target_exam: payload.scholarshipTargetExam ?? null,
      p_questions: payload.questions,
      p_scheduled_at: payload.scheduledAt,
      p_is_open_for_all: payload.isOpenForAll ?? false,
    });
    invalidateAdminCache();
    return mapTest(row);
  } catch (error) {
    const message = error instanceof Error ? error.message.toLowerCase() : '';
    if (message.includes('parameter') || message.includes('function') || message.includes('schema cache')) {
      const row = await rpc<TestRow>(endpoints.admin.createTest, {
        p_title: payload.title,
        p_description: payload.description,
        p_duration_minutes: safeDurationMinutes,
        p_batch_id: payload.batchId ?? null,
        p_type: payload.type,
        p_subject: payload.subject,
        p_scholarship_admission_class: payload.scholarshipAdmissionClass ?? null,
        p_scholarship_target_exam: payload.scholarshipTargetExam ?? null,
        p_questions: payload.questions,
        p_scheduled_at: payload.scheduledAt,
      });
      invalidateAdminCache();
      return mapTest(row);
    }
    throw error;
  }
}

export async function updateTest(payload: UpdateTestPayload): Promise<TestItem> {
  const safeDurationMinutes = coerceDurationMinutes(payload.durationMinutes);

  if (payload.testId.startsWith('pdf_test_')) {
    const existing = await getPdfNativeTestById(payload.testId);
    if (existing) {
      const qRelations = await getLocalPdfNativeTestQuestions(payload.testId);
      const qIds = qRelations.map((tq) => tq.question_id);
      await updatePdfNativeTest({
        id: payload.testId,
        title: payload.title,
        description: payload.description,
        duration_minutes: safeDurationMinutes,
        subject: (payload.subject as any) || existing.subject,
        status: existing.status,
        question_ids: qIds,
        sections: existing.sections,
      });
      const updated = await getPdfNativeTestById(payload.testId);
      invalidateAdminCache();
      if (updated) {
        return mapPdfNativeTestToCbtTestItem(updated);
      }
    }
  }

  try {
    const row = await rpc<TestRow>(endpoints.admin.updateTest, {
      p_test_id: payload.testId,
      p_title: payload.title,
      p_description: payload.description,
      p_duration_minutes: safeDurationMinutes,
      p_batch_id: payload.batchId ?? null,
      p_type: payload.type,
      p_subject: payload.subject,
      p_scheduled_at: payload.scheduledAt,
      p_scholarship_admission_class: payload.scholarshipAdmissionClass ?? null,
      p_scholarship_target_exam: payload.scholarshipTargetExam ?? null,
      p_is_open_for_all: payload.isOpenForAll ?? false,
    });

    invalidateAdminCache();
    return mapTest(row);
  } catch (error) {
    const message = error instanceof Error ? error.message.toLowerCase() : '';
    if (message.includes('parameter') || message.includes('function') || message.includes('schema cache')) {
      const legacyRow = await rpc<TestRow>(endpoints.admin.updateTest, {
        p_test_id: payload.testId,
        p_title: payload.title,
        p_description: payload.description,
        p_duration_minutes: safeDurationMinutes,
        p_batch_id: payload.batchId ?? null,
        p_type: payload.type,
        p_subject: payload.subject,
        p_scheduled_at: payload.scheduledAt,
        p_scholarship_admission_class: payload.scholarshipAdmissionClass ?? null,
        p_scholarship_target_exam: payload.scholarshipTargetExam ?? null,
      });

      invalidateAdminCache();
      return mapTest(legacyRow);
    }
    throw error;
  }
}

export async function setTestStarted(testId: string, isStarted: boolean): Promise<TestItem> {
  if (testId.startsWith('pdf_test_')) {
    await publishPdfNativeTest(testId);
    const pdfNative = await getPdfNativeTestById(testId);
    invalidateAdminCache();
    if (pdfNative) {
      return mapPdfNativeTestToCbtTestItem(pdfNative);
    }
  }

  const row = await rpc<TestRow>(endpoints.admin.setTestStarted, {
    p_test_id: testId,
    p_is_started: isStarted,
  });

  invalidateAdminCache();
  return mapTest(row);
}

export async function createBatch(payload: CreateBatchPayload): Promise<Batch> {
  const row = await rpc<BatchRow>(endpoints.admin.createBatch, {
    p_id: payload.id ?? null,
    p_label: payload.label,
    p_target_exam: payload.targetExam,
    p_class_label: payload.classLabel,
    p_description: payload.description,
    p_image_url: payload.imageUrl ?? null,
  });

  invalidateAdminCache();
  return mapBatch(row);
}

export async function assignBatch(payload: AssignBatchPayload): Promise<AppUser> {
  const row = await rpc<ProfileRow>(endpoints.admin.assignBatch, {
    p_user_id: payload.userId,
    p_batch_id: payload.batchId ?? null,
    p_promote_to_miitjee_student: payload.promoteToMiitjeeStudent ?? false,
  });
  invalidateAdminCache();
  return mapProfile(row);
}

export async function approveAdmin(userId: string): Promise<AppUser> {
  const row = await rpc<ProfileRow>(endpoints.admin.approveAdmin, {
    p_user_id: userId,
  });
  invalidateAdminCache();
  return mapProfile(row);
}

export async function deleteTest(testId: string) {
  if (testId.startsWith('pdf_test_')) {
    await deletePdfNativeTest(testId);
    invalidateAdminCache();
    return;
  }

  await rpc<string>(endpoints.admin.deleteTest, {
    p_test_id: testId,
  });
  invalidateAdminCache();
}

export async function deleteBatch(batchId: string) {
  await rpc<string>(endpoints.admin.deleteBatch, {
    p_batch_id: batchId,
  });
  invalidateAdminCache();
}

export async function deleteAttempt(attemptId: string) {
  await rpc<string>(endpoints.admin.deleteAttempt, {
    p_attempt_id: attemptId,
  });
  invalidateAdminCache();
}

export async function deleteEnrollmentQuery(queryId: string) {
  await rpc<string>(endpoints.admin.deleteEnrollmentQuery, {
    p_query_id: queryId,
  });
  invalidateAdminCache();
}

export async function deleteScholarshipRegistration(registrationId: string) {
  await rpc<string>(endpoints.admin.deleteScholarshipRegistration, {
    p_registration_id: registrationId,
  });
  invalidateAdminCache();
}

export async function deleteGeneralEnquiry(enquiryId: string) {
  await rpc<string>(endpoints.admin.deleteGeneralEnquiry, {
    p_enquiry_id: enquiryId,
  });
  invalidateAdminCache();
}

export async function wipeLeaderboard() {
  try {
    await rpc<string>(endpoints.admin.wipeLeaderboard);
  } catch (error) {
    const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
    const needsSafeDeleteFallback =
      message.includes('delete requires a where clause') ||
      message.includes('where clause');

    if (!needsSafeDeleteFallback) {
      throw error;
    }

    const attemptIds = await listAllAttemptIds();

    for (const attemptId of attemptIds) {
      await rpc<string>(endpoints.admin.deleteAttempt, {
        p_attempt_id: attemptId,
      });
    }
  }

  invalidateAdminCache();
}

export async function fetchAnalytics(): Promise<AnalyticsSnapshot> {
  const row = await rpc<AnalyticsRow>(endpoints.admin.analytics);
  return mapAnalytics(row);
}

export async function fetchQuestionAnalytics(): Promise<QuestionAnalytics[]> {
  const rows = await selectRows<QuestionAnalyticsRow>(
    endpoints.admin.questionAnalytics,
    'question_id,prompt,total_attempts,correct_count,accuracy_percent',
    {
    order: 'accuracy_percent.asc',
    },
  );
  return rows.map(mapQuestionAnalytics);
}

export async function fetchTestAnalytics(): Promise<TestAnalytics[]> {
  const rows = await selectRows<TestAnalyticsRow>(endpoints.admin.testAnalytics, 'test_id,title,attempts,avg_score,highest_score', {
    order: 'attempts.desc',
  });
  return rows.map(mapTestAnalytics);
}

export async function fetchStudentAnalytics(): Promise<StudentAnalytics[]> {
  const rows = await selectRows<StudentAnalyticsRow>(
    endpoints.admin.studentAnalytics,
    'user_id,full_name,tests_attempted,avg_score,best_score,avg_percentile',
    {
    order: 'avg_score.asc',
    },
  );
  return rows.map(mapStudentAnalytics);
}

export async function fetchAutoSubmitEvents(): Promise<AutoSubmitEvent[]> {
  const rows = await selectRows<AutoSubmitEventRow>(
    endpoints.admin.autoSubmitEvents,
    'event_id,user_id,full_name,email,batch_id,test_id,test_title,auto_submitted_at',
    {
    order: 'auto_submitted_at.desc',
    },
  );
  return rows.map(mapAutoSubmitEvent);
}

export async function fetchEnrollmentQueries(): Promise<EnrollmentQueryRecord[]> {
  const rows = await selectRows<EnrollmentQueryRow>(
    endpoints.admin.enrollmentQueries,
    'id,user_id,full_name,email,batch_id,batch_label,phone,message,status,created_at',
    {
    order: 'created_at.desc',
    },
  );
  return rows.map(mapEnrollmentQuery);
}

export async function fetchScholarshipRegistrations(): Promise<ScholarshipRegistrationRecord[]> {
  const rows = await selectRows<ScholarshipRegistrationRow>(
    endpoints.admin.scholarshipRegistrations,
    'id,test_id,test_title,user_id,full_name,email,phone,city,class_label,target_exam,created_at',
    {
    order: 'created_at.desc',
    },
  );
  return rows.map(mapScholarshipRegistration);
}

export async function fetchEnquiries(): Promise<EnquiryRecord[]> {
  const rows = await selectRows<EnquiryRow>(endpoints.admin.enquiries, 'id,user_id,full_name,phone,email,message,created_at', {
    order: 'created_at.desc',
  });
  return rows.map(mapEnquiry);
}

export async function fetchViolationAnalytics(): Promise<ViolationSummary[]> {
  const rows = await selectRows<ViolationSummaryRow>(
    endpoints.admin.violationAnalytics,
    'user_id,full_name,email,batch_id,violation_count,last_violation_at,last_violation_type,is_suspicious',
    {
    order: 'violation_count.desc,last_violation_at.desc',
    },
  );
  return rows.map(mapViolationSummary);
}

export async function fetchActivityLogs(options?: {
  category?: string;
  userId?: string;
  eventType?: string;
  status?: string;
  limit?: number;
  offset?: number;
}): Promise<ActivityLogEntry[]> {
  try {
    const rows = await rpc<ActivityLogRow[]>(endpoints.admin.fetchActivityLogs, {
      p_category: options?.category ?? null,
      p_user_id: options?.userId ?? null,
      p_event_type: options?.eventType ?? null,
      p_status: options?.status ?? null,
      p_limit: options?.limit ?? 50,
      p_offset: options?.offset ?? 0,
    });
    return (rows || []).map(mapActivityLog);
  } catch {
    return [];
  }
}


export async function fetchQuestionSets(): Promise<QuestionBankSet[]> {
  type SetRow = {
    set_id: number;
    pdf_name: string;
    question_count: number;
    created_at: string;
  };

  let rows: SetRow[] = [];
  let fetchError: Error | null = null;

  try {
    rows = await selectRows<SetRow>(
      'question_sets',
      'set_id,pdf_name,question_count,created_at',
      {
        order: 'created_at.desc',
        limit: 200,
      },
    );
  } catch (err) {
    fetchError = err instanceof Error ? err : new Error(String(err));
  }

  if (!rows || rows.length === 0) {
    try {
      rows = await workerRequest<SetRow[]>('/question-sets');
    } catch (workerErr) {
      if (!fetchError) {
        fetchError = workerErr instanceof Error ? workerErr : new Error(String(workerErr));
      }
    }
  }

  if ((!rows || rows.length === 0) && fetchError) {
    throw new Error(`Question Bank API failed: ${fetchError.message}`);
  }

  return (rows || []).map((row) => ({
    setId: Number(row.set_id),
    pdfName: row.pdf_name,
    questionCount: Number(row.question_count),
    createdAt: row.created_at,
  }));
}

export async function fetchQuestionSetQuestions(setId: number): Promise<QuestionBankQuestion[]> {
  type QuestionRow = {
    id: number;
    question: string;
    options: string[];
    type: 'mcq' | 'integer';
    image_url: string | null;
    correct_answer: string;
  };

  let rows: QuestionRow[] = [];
  let fetchError: Error | null = null;

  try {
    rows = await selectRows<QuestionRow>(
      'questions',
      'id,question,options,type,image_url,correct_answer',
      {
        set_id: `eq.${setId}`,
        limit: 500,
      },
    );
  } catch (err) {
    fetchError = err instanceof Error ? err : new Error(String(err));
  }

  if (!rows || rows.length === 0) {
    try {
      rows = await workerRequest<QuestionRow[]>(`/get-questions?set_id=${setId}&include_answers=true`);
    } catch (workerErr) {
      if (!fetchError) {
        fetchError = workerErr instanceof Error ? workerErr : new Error(String(workerErr));
      }
    }
  }

  return (rows || []).map((row) => ({
    id: Number(row.id),
    setId,
    question: row.question,
    options: Array.isArray(row.options) ? row.options : typeof row.options === 'string' ? JSON.parse(row.options) : [],
    type: row.type,
    imageUrl: normalizeAssetUrl(row.image_url),
    correctAnswer: row.correct_answer,
  }));
}

export async function createQuestionSet(payload: {
  pdfName: string;
  questions: Array<{
    question: string;
    options: string[];
    correct_answer: string;
    type: 'mcq' | 'integer';
    explanation?: string;
    image_url?: string | null;
  }>;
}) {
  return workerRequest<{
    success: boolean;
    set_id: number;
    pdf_name: string;
    question_count: number;
  }>('/create-question-set', {
    method: 'POST',
    body: JSON.stringify({
      pdf_name: payload.pdfName,
      questions: payload.questions,
    }),
  });
}

export async function deleteQuestionSet(setId: number) {
  // 1. Try RPC function delete_question_set in Supabase
  try {
    await rpc<string>(endpoints.admin.deleteQuestionSet, {
      p_set_id: setId,
    });
    invalidateAdminCache();
    return { success: true, set_id: setId };
  } catch {
    // RPC might not exist on older DB migration, continue
  }

  // 2. Try Worker endpoint
  try {
    const res = await workerRequest<{ success: boolean; set_id: number }>(`/delete-question-set?set_id=${setId}`, {
      method: 'DELETE',
    });
    if (res?.success) {
      invalidateAdminCache();
      return res;
    }
  } catch {
    // Worker request failed, continue to direct REST
  }

  // 3. Direct REST delete fallback
  try {
    await deleteRows('questions', { set_id: `eq.${setId}` });
  } catch {
    // Ignore questions delete errors if already empty
  }

  await deleteRows('question_sets', { set_id: `eq.${setId}` });
  invalidateAdminCache();
  return { success: true, set_id: setId };
}
