import {
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
import { getAuthenticatedAccessToken, rpc, selectRows } from '../supabase/client';
import { mapAnalytics, mapAutoSubmitEvent, mapBatch, mapEnquiry, mapEnrollmentQuery, mapProfile, mapQuestionAnalytics, mapResult, mapScholarshipRegistration, mapStudentAnalytics, mapTest, mapTestAnalytics, mapViolationSummary } from '../supabase/mappers';
import { AnalyticsRow, AutoSubmitEventRow, BatchRow, EnquiryRow, EnrollmentQueryRow, ProfileRow, QuestionAnalyticsRow, ResultRow, ScholarshipRegistrationRow, StudentAnalyticsRow, TestAnalyticsRow, TestRow, ViolationSummaryRow } from '../supabase/types';
import { coerceDurationMinutes } from '../../utils/formatters';

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
  const response = await fetch(`${appEnv.workerBaseUrl}${normalizedPath}`, {
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
  const cacheKey = `tests:${options?.offset ?? 0}:${options?.limit ?? DEFAULT_PAGE_SIZE}`;
  const cached = getCachedRows<TestItem>(cacheKey);
  if (cached) {
    return cached;
  }

  const pageQuery = buildPageQuery(options);

  const rows = await selectRows<TestRow>(
    endpoints.tests.list,
    'id,title,description,duration_minutes,question_count,batch_id,type,subject,scheduled_at,is_published,is_started,started_at,scholarship_admission_class,scholarship_target_exam',
    {
      order: 'scheduled_at.asc',
      ...pageQuery,
    },
  );
  const mappedRows = rows.map(mapTest);
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
  try {
    const rows = await selectRows<ResultRow>(
      endpoints.admin.results,
      'id,test_id,user_id,score,correct_answers,total_questions,rank,percentile,submitted_at',
      {
        ...(userId ? { user_id: `eq.${userId}` } : {}),
        order: 'submitted_at.desc',
        ...pageQuery,
      },
    );
    const mappedRows = rows.map(mapResult);
    setCachedRows(cacheKey, mappedRows);
    return mappedRows;
  } catch {
    const directRows = await selectRows<
      Omit<ResultRow, 'rank'> & {
        rank?: number | null;
      }
    >('test_attempts', 'id,test_id,user_id,score,correct_answers,total_questions,percentile,submitted_at', {
      ...(userId ? { user_id: `eq.${userId}` } : {}),
      order: 'submitted_at.desc',
      ...pageQuery,
    });
    const mappedRows = directRows.map((row) =>
      mapResult({
        ...row,
        rank: row.rank ?? 0,
      } as ResultRow),
    );
    setCachedRows(cacheKey, mappedRows);
    return mappedRows;
  }
}

export async function fetchResults(userId?: string, options?: PageOptions): Promise<TestResult[]> {
  return fetchResultsPage(userId, options);
}

export async function createTest(payload: CreateTestPayload): Promise<TestItem> {
  const safeDurationMinutes = coerceDurationMinutes(payload.durationMinutes);

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

export async function updateTest(payload: UpdateTestPayload): Promise<TestItem> {
  const safeDurationMinutes = coerceDurationMinutes(payload.durationMinutes);

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
  });

  invalidateAdminCache();
  return mapTest(row);
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

export async function fetchQuestionSets(): Promise<QuestionBankSet[]> {
  const rows = await workerRequest<Array<{
    set_id: number;
    pdf_name: string;
    question_count: number;
    created_at: string;
  }>>('/question-sets');

  return rows.map((row) => ({
    setId: row.set_id,
    pdfName: row.pdf_name,
    questionCount: row.question_count,
    createdAt: row.created_at,
  }));
}

export async function fetchQuestionSetQuestions(setId: number): Promise<QuestionBankQuestion[]> {
  const rows = await workerRequest<Array<{
    id: number;
    question: string;
    options: string[];
    type: 'mcq' | 'integer';
    image_url: string | null;
    correct_answer: string;
  }>>(`/get-questions?set_id=${setId}&include_answers=true`);

  return rows.map((row) => ({
    id: row.id,
    setId,
    question: row.question,
    options: Array.isArray(row.options) ? row.options : [],
    type: row.type,
    imageUrl: row.image_url,
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
