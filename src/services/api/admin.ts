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
import { deleteRows, getAuthenticatedAccessToken, insertRow, insertRows, rpc, selectRows, updateRows } from '../supabase/client';
import { useAuthStore } from '../../store/authStore';
import { mapActivityLog, mapAnalytics, mapAutoSubmitEvent, mapBatch, mapEnquiry, mapEnrollmentQuery, mapProfile, mapQuestionAnalytics, mapResult, mapScholarshipRegistration, mapStudentAnalytics, mapTest, mapTestAnalytics, mapViolationSummary, normalizeAssetUrl } from '../supabase/mappers';
import { ActivityLogRow, AnalyticsRow, AutoSubmitEventRow, BatchRow, EnquiryRow, EnrollmentQueryRow, ProfileRow, QuestionAnalyticsRow, ResultRow, ScholarshipRegistrationRow, StudentAnalyticsRow, TestAnalyticsRow, TestRow, ViolationSummaryRow } from '../supabase/types';
import { coerceDurationMinutes } from '../../utils/formatters';
import { logWarn } from '../../utils/logger';
import { getAllLocalStandardAttempts } from './tests';

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

export function invalidateAdminCache() {
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

  // Merge local standard attempts (Navigator batch test etc.)
  try {
    const stdAttempts = await getAllLocalStandardAttempts();
    const filteredStd = userId
      ? stdAttempts.filter((a) => a.userId === userId || a.userId === 'guest_user')
      : stdAttempts;

    for (const a of filteredStd) {
      if (!mappedRows.some((r) => r.id === a.id)) {
        mappedRows.push(a);
      }
    }
  } catch {
    // Ignore
  }

  setCachedRows(cacheKey, mappedRows);
  return mappedRows;
}

export async function fetchResults(userId?: string, options?: PageOptions): Promise<TestResult[]> {
  return fetchResultsPage(userId, options);
}

export async function createTest(payload: CreateTestPayload): Promise<TestItem> {
  const safeDurationMinutes = coerceDurationMinutes(payload.durationMinutes);
  const rawBatchId = payload.batchId?.trim();
  const isOpenForAll = Boolean(payload.isOpenForAll) || !rawBatchId || rawBatchId === 'ALL' || rawBatchId.toLowerCase() === 'all batches';
  // Use a known existing batch (e.g. ELEVATOR or specified batch) for the initial create RPC, then decouple batch via update_test_details if Open for All
  const initialBatchId = (!isOpenForAll && rawBatchId && rawBatchId !== 'ALL') ? rawBatchId : 'ELEVATOR';

  // 1. Invoke create_test_with_questions (SECURITY DEFINER)
  const row = await rpc<TestRow>(endpoints.admin.createTest, {
    p_title: payload.title,
    p_description: payload.description,
    p_duration_minutes: safeDurationMinutes,
    p_batch_id: initialBatchId,
    p_type: payload.type,
    p_subject: payload.subject,
    p_scholarship_admission_class: payload.scholarshipAdmissionClass ?? null,
    p_scholarship_target_exam: payload.scholarshipTargetExam ?? null,
    p_questions: payload.questions,
    p_scheduled_at: payload.scheduledAt,
    p_is_open_for_all: isOpenForAll,
  });

  // 2. If Open for All, update the test details to clear batch_id and set is_open_for_all: true
  if (isOpenForAll && row?.id) {
    try {
      await rpc<TestRow>(endpoints.admin.updateTest, {
        p_test_id: row.id,
        p_title: payload.title,
        p_description: payload.description,
        p_duration_minutes: safeDurationMinutes,
        p_batch_id: null,
        p_type: payload.type,
        p_subject: payload.subject,
        p_scheduled_at: payload.scheduledAt,
        p_scholarship_admission_class: payload.scholarshipAdmissionClass ?? null,
        p_scholarship_target_exam: payload.scholarshipTargetExam ?? null,
        p_is_open_for_all: true,
      });
    } catch {
      // Best-effort update
    }
  }

  invalidateAdminCache();
  const mapped = mapTest(row);
  if (isOpenForAll) {
    mapped.isOpenForAll = true;
    mapped.batchId = undefined;
    mapped.accessMode = 'OPEN_FOR_ALL';
  }
  return mapped;
}

export async function updateTest(payload: UpdateTestPayload): Promise<TestItem> {
  const safeDurationMinutes = coerceDurationMinutes(payload.durationMinutes);
  const rawBatchId = payload.batchId?.trim();
  const isOpenForAll = Boolean(payload.isOpenForAll) || !rawBatchId || rawBatchId === 'ALL' || rawBatchId.toLowerCase() === 'all batches';
  const resolvedBatchId = isOpenForAll
    ? null
    : (rawBatchId && rawBatchId !== 'ALL' && rawBatchId.toLowerCase() !== 'all batches' ? rawBatchId : null);

  const row = await rpc<TestRow>(endpoints.admin.updateTest, {
    p_test_id: payload.testId,
    p_title: payload.title,
    p_description: payload.description,
    p_duration_minutes: safeDurationMinutes,
    p_batch_id: resolvedBatchId,
    p_type: payload.type,
    p_subject: payload.subject,
    p_scheduled_at: payload.scheduledAt,
    p_scholarship_admission_class: payload.scholarshipAdmissionClass ?? null,
    p_scholarship_target_exam: payload.scholarshipTargetExam ?? null,
    p_is_open_for_all: isOpenForAll,
  });

  invalidateAdminCache();
  const mapped = mapTest(row);
  if (isOpenForAll) {
    mapped.isOpenForAll = true;
    mapped.batchId = undefined;
    mapped.accessMode = 'OPEN_FOR_ALL';
  }
  return mapped;
}

export async function setTestStarted(testId: string, isStarted: boolean): Promise<TestItem> {
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
    position?: number | null;
  };

  let rows: QuestionRow[] = [];
  let fetchError: Error | null = null;

  try {
    rows = await selectRows<QuestionRow>(
      'questions',
      'id,question,options,type,image_url,correct_answer,position',
      {
        set_id: `eq.${setId}`,
        order: 'position.asc,id.asc',
        limit: 1000,
      },
    );
  } catch (err) {
    try {
      rows = await selectRows<QuestionRow>(
        'questions',
        'id,question,options,type,image_url,correct_answer',
        {
          set_id: `eq.${setId}`,
          order: 'id.asc',
          limit: 1000,
        },
      );
    } catch (fallbackErr) {
      fetchError = fallbackErr instanceof Error ? fallbackErr : new Error(String(fallbackErr));
    }
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

  const sortedRows = [...(rows || [])].sort((a, b) => {
    const posA = typeof a.position === 'number' && a.position > 0 ? a.position : Number(a.id);
    const posB = typeof b.position === 'number' && b.position > 0 ? b.position : Number(b.id);
    if (posA !== posB) return posA - posB;
    return Number(a.id) - Number(b.id);
  });

  return sortedRows.map((row) => ({
    id: Number(row.id),
    setId,
    position: typeof row.position === 'number' ? row.position : undefined,
    question: row.question,
    options: Array.isArray(row.options) ? row.options : typeof row.options === 'string' ? JSON.parse(row.options) : [],
    type: row.type,
    imageUrl: normalizeAssetUrl(row.image_url),
    correctAnswer: row.correct_answer,
  }));
}

export async function reorderQuestionSet(setId: number, questionIds: number[]): Promise<{ success: boolean; set_id: number; updated_count?: number }> {
  try {
    const res = await rpc<{ success: boolean; set_id: number; updated_count?: number }>('reorder_question_set', {
      p_set_id: setId,
      p_question_ids: questionIds,
    });
    invalidateAdminCache();
    return res;
  } catch (err) {
    console.warn('[reorderQuestionSet] RPC call failed, falling back to batch updateRows:', err);
    for (let i = 0; i < questionIds.length; i++) {
      await updateRows('questions', { position: i + 1 }, { id: `eq.${questionIds[i]}`, set_id: `eq.${setId}` });
    }
    invalidateAdminCache();
    return { success: true, set_id: setId, updated_count: questionIds.length };
  }
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
  try {
    const res = await workerRequest<{
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
    invalidateAdminCache();
    return res;
  } catch (workerErr) {
    console.warn('[createQuestionSet] Worker request failed, attempting direct Supabase insert:', workerErr);

    let nextSetId = 1;
    try {
      const existing = await selectRows<{ set_id: number }>('question_sets', 'set_id', {
        order: 'set_id.desc',
        limit: 1,
      });
      if (existing && existing.length > 0 && existing[0]?.set_id) {
        nextSetId = Number(existing[0].set_id) + 1;
      }
    } catch {
      nextSetId = Math.floor(Date.now() / 1000);
    }

    const insertedSets = await insertRows<{ set_id: number; pdf_name: string; question_count: number }>('question_sets', [
      {
        set_id: nextSetId,
        pdf_name: payload.pdfName,
        question_count: payload.questions.length,
      },
    ]);
    const setRow = insertedSets[0] ?? {
      set_id: nextSetId,
      pdf_name: payload.pdfName,
      question_count: payload.questions.length,
    };

    const qRows = payload.questions.map((q, idx) => ({
      set_id: setRow.set_id,
      position: idx + 1,
      question: q.question || '',
      options: q.options || [],
      correct_answer: q.correct_answer || '',
      type: q.type || 'mcq',
      explanation: q.explanation ?? '',
      image_url: q.image_url || null,
    }));
    await insertRows('questions', qRows);
    invalidateAdminCache();
    return {
      success: true,
      set_id: setRow.set_id,
      pdf_name: setRow.pdf_name,
      question_count: setRow.question_count,
    };
  }
}

export async function updateQuestionInSet(payload: {
  id: number;
  question: string;
  options: string[];
  correct_answer: string;
  type: 'mcq' | 'integer';
  explanation?: string;
  image_url?: string | null;
}) {
  const res = await updateRows('questions', {
    question: payload.question,
    options: payload.options,
    correct_answer: payload.correct_answer,
    type: payload.type,
    explanation: payload.explanation ?? '',
    image_url: payload.image_url ?? null,
  }, {
    id: `eq.${payload.id}`,
  });
  invalidateAdminCache();
  return res;
}

export async function addQuestionToSet(payload: {
  setId: number;
  question: string;
  options: string[];
  correct_answer: string;
  type: 'mcq' | 'integer';
  explanation?: string;
  image_url?: string | null;
}): Promise<QuestionBankQuestion> {
  const qRow = {
    set_id: payload.setId,
    question: payload.question,
    options: payload.options,
    correct_answer: payload.correct_answer,
    type: payload.type,
    explanation: payload.explanation ?? '',
    image_url: payload.image_url ?? null,
  };

  const inserted = await insertRows<{
    id: number;
    set_id: number;
    question: string;
    options: string[];
    correct_answer: string;
    type: 'mcq' | 'integer';
    image_url: string | null;
  }>('questions', [qRow]);

  const insertedRow = inserted && inserted[0];

  try {
    const existingSets = await selectRows<{ set_id: number; question_count: number }>('question_sets', 'set_id,question_count', {
      set_id: `eq.${payload.setId}`,
      limit: 1,
    });
    if (existingSets && existingSets[0]) {
      const currentCount = Number(existingSets[0].question_count) || 0;
      await updateRows('question_sets', { question_count: currentCount + 1 }, { set_id: `eq.${payload.setId}` });
    }
  } catch (err) {
    console.warn('[addQuestionToSet] Failed to increment question_sets count:', err);
  }

  invalidateAdminCache();

  return {
    id: insertedRow ? Number(insertedRow.id) : Date.now(),
    setId: payload.setId,
    question: payload.question,
    options: payload.options,
    type: payload.type,
    imageUrl: normalizeAssetUrl(payload.image_url),
    correctAnswer: payload.correct_answer,
  };
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

export interface AdminDiagnosticSession {
  sessionId: string;
  testId: string;
  testTitle: string;
  userId: string;
  studentName: string;
  batchId?: string;
  status: string;
  currentQuestionIndex: number;
  attemptedCount: number;
  unattemptedCount: number;
  flaggedCount: number;
  violationsCount: number;
  timeExtendedMinutes: number;
  deviceInfo?: string;
  lastActiveAt: string;
  issueCode: string;
  issueReason: string;
  suggestedAction: string;
}

export async function fetchAdminDiagnostics(testId?: string): Promise<AdminDiagnosticSession[]> {
  try {
    const rows = await rpc<Array<{
      session_id: string;
      test_id: string;
      test_title: string;
      user_id: string;
      student_name: string;
      batch_id: string | null;
      status: string;
      current_question_index: number;
      attempted_count: number;
      unattempted_count: number;
      flagged_count: number;
      violations_count: number;
      time_extended_minutes: number;
      device_info: string | null;
      last_active_at: string;
      issue_code: string;
      issue_reason: string;
      suggested_action: string;
    }>>('admin_get_diagnostics_sessions', {
      p_test_id: testId || null,
    });

    return (rows || []).map((row) => ({
      sessionId: row.session_id,
      testId: row.test_id,
      testTitle: row.test_title,
      userId: row.user_id,
      studentName: row.student_name,
      batchId: row.batch_id || undefined,
      status: row.status,
      currentQuestionIndex: row.current_question_index ?? 0,
      attemptedCount: row.attempted_count ?? 0,
      unattemptedCount: row.unattempted_count ?? 0,
      flaggedCount: row.flagged_count ?? 0,
      violationsCount: row.violations_count ?? 0,
      timeExtendedMinutes: row.time_extended_minutes ?? 0,
      deviceInfo: row.device_info || undefined,
      lastActiveAt: row.last_active_at,
      issueCode: row.issue_code,
      issueReason: row.issue_reason,
      suggestedAction: row.suggested_action,
    }));
  } catch (rpcError) {
    // Fallback: query active_exam_sessions directly if RPC not yet migrated
    const sessions = await selectRows<any>('active_exam_sessions', '*');
    if (!sessions || sessions.length === 0) return [];

    return sessions
      .filter((s: any) => !testId || s.test_id === testId)
      .map((s: any) => ({
        sessionId: s.id,
        testId: s.test_id,
        testTitle: s.test_title || 'Active Examination',
        userId: s.user_id,
        studentName: s.student_name || 'Student',
        batchId: s.batch_id,
        status: s.status || 'IN_PROGRESS',
        currentQuestionIndex: s.current_question_index ?? 0,
        attemptedCount: s.attempted_count ?? 0,
        unattemptedCount: s.unattempted_count ?? 0,
        flaggedCount: s.flagged_count ?? 0,
        violationsCount: s.violations_count ?? 0,
        timeExtendedMinutes: s.time_extended_minutes ?? 0,
        deviceInfo: s.device_info,
        lastActiveAt: s.last_active_at || new Date().toISOString(),
        issueCode: s.violations_count >= 3 ? 'MAX_TAB_VIOLATIONS' : s.status || 'ACTIVE_MONITORING',
        issueReason: s.violations_count >= 3
          ? 'Student reached maximum tab-switch violation limit.'
          : `Session status: ${s.status || 'IN_PROGRESS'}.`,
        suggestedAction: s.violations_count >= 3 ? 'Reset warnings or force submit.' : 'Session active.',
      }));
  }
}

export async function adminForceSubmitSession(sessionId: string): Promise<boolean> {
  const result = await rpc<boolean>('admin_force_submit_session', {
    p_session_id: sessionId,
  });
  return Boolean(result);
}

export async function adminExtendSessionTime(sessionId: string, minutes = 15): Promise<boolean> {
  const result = await rpc<boolean>('admin_extend_session_time', {
    p_session_id: sessionId,
    p_minutes: minutes,
  });
  return Boolean(result);
}

export async function adminResetSessionWarnings(sessionId: string): Promise<boolean> {
  const result = await rpc<boolean>('admin_reset_session_warnings', {
    p_session_id: sessionId,
  });
  return Boolean(result);
}
