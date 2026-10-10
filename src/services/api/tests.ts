import {
  EnquiryPayload,
  EnrollmentQueryPayload,
  ExamLinkResolution,
  LeaderboardEntry,
  LeaderboardScope,
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
import { areNumericAnswersEquivalent, normalizeNumericAnswer } from '../../utils/numericAnswer';
import { endpoints } from './config';
import { Platform } from 'react-native';
import { activityLog } from './activityLogger';
import { useAuthStore } from '../../store/authStore';
import { useAppStore } from '../../store/appStore';
import { getAuthenticatedAccessToken, insertRow, invokeEdgeFunction, rpc, selectRows, updateRows } from '../supabase/client';
import { mapLeaderboard, mapQuestion, mapResult, mapReviewRow, mapStudentInsights, mapSubmittedAttempt, mapTest } from '../supabase/mappers';
import { LeaderboardRow, ResultRow, ReviewRow, StudentInsightsRpcResponse, SubmitAttemptRpcResponse, TestQuestionRow, TestRow } from '../supabase/types';
import { uploadExamAsset } from './storage';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { invalidateAdminCache } from './admin';
const STORAGE_KEYS_STD = {
  ATTEMPTS: '@miitjee:standard_test_attempts',
  REVIEWS: '@miitjee:standard_test_reviews',
};

let memoryStdAttempts: TestResult[] = [];
let memoryStdReviews: Record<string, TestAttemptReviewItem[]> = {};

export async function saveLocalStandardAttempt(
  result: TestResult,
  reviewItems: TestAttemptReviewItem[]
): Promise<void> {
  const existing = await getAllLocalStandardAttempts();
  const updated = [result, ...existing.filter((r) => r.id !== result.id && !(r.testId === result.testId && r.userId === result.userId))];
  memoryStdAttempts = updated;
  memoryStdReviews[result.id] = reviewItems;

  try {
    await AsyncStorage.setItem(STORAGE_KEYS_STD.ATTEMPTS, JSON.stringify(updated));
    await AsyncStorage.setItem(STORAGE_KEYS_STD.REVIEWS, JSON.stringify(memoryStdReviews));
  } catch (err) {
    // Memory cache maintained
  }
}

export async function getAllLocalStandardAttempts(): Promise<TestResult[]> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEYS_STD.ATTEMPTS);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        memoryStdAttempts = parsed;
      }
    }
  } catch {
    // Use memory cache
  }
  return memoryStdAttempts;
}

export async function getLocalStandardAttempt(resultId: string): Promise<TestResult | null> {
  const all = await getAllLocalStandardAttempts();
  return all.find((r) => r.id === resultId) || null;
}

export async function getLocalStandardAttemptByTestId(testId: string, userId?: string): Promise<TestResult | null> {
  const all = await getAllLocalStandardAttempts();
  if (userId) {
    return all.find((r) => r.testId === testId && r.userId === userId) || null;
  }
  return all.find((r) => r.testId === testId && r.userId === 'guest_user') || null;
}

export async function getLocalStandardAttemptReviews(resultId: string): Promise<TestAttemptReviewItem[] | null> {
  if (memoryStdReviews[resultId]) {
    return memoryStdReviews[resultId];
  }
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEYS_STD.REVIEWS);
    if (raw) {
      const parsed = JSON.parse(raw);
      memoryStdReviews = { ...memoryStdReviews, ...parsed };
      if (memoryStdReviews[resultId]) {
        return memoryStdReviews[resultId];
      }
    }
  } catch {
    // Use memory cache
  }
  return null;
}



export async function fetchTests(): Promise<TestItem[]> {
  const signedInUser = useAuthStore.getState().user;
  const userRole = (signedInUser?.role as string) || '';
  const isAdminOrFaculty = userRole === 'admin' || userRole === 'faculty';

  const filterVisibleTests = (rows: TestItem[]) =>
    rows.filter((test) => {
      // Admin/Faculty can see all tests in management (including drafts)
      if (isAdminOrFaculty) return true;

      // Draft or unpublished tests are NEVER visible to students
      if (test.isPublished === false) return false;

      // Miitjee student scholarship filter (outside scholarship registrations)
      if (signedInUser?.role === 'miitjee_student' && test.type === 'scholarship') return false;

      // Batch-restricted tests are only visible to students in that batch
      if (test.accessMode === 'RESTRICTED_BATCH' && test.allowedBatches && test.allowedBatches.length > 0) {
        if (!signedInUser?.batchId || !test.allowedBatches.includes(signedInUser.batchId)) {
          return false;
        }
      }

      return true;
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

  // Filter out previous/dummy test artifacts
  const isOldTest = (t: TestItem) =>
    t.id.includes('1163869') ||
    (t.title || '').toLowerCase().includes('11th_morning_physics') ||
    (t.title || '').toLowerCase().includes('1163869');

  const cleanStandardTests = standardTests.filter((t) => !isOldTest(t));
  return cleanStandardTests;
}

function isUuid(id: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
}

export async function fetchQuestions(testId: string, _testTitle?: string): Promise<TestQuestion[]> {
  try {
    const rpcRows = await rpc<TestQuestionRow[]>(endpoints.tests.studentQuestions, {
      p_test_id: testId,
    }, {
      retryable: true,
    });
    if (rpcRows && rpcRows.length > 0) {
      return rpcRows.map(mapQuestion);
    }
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

    // Secondary attempt with availableQuestions
    try {
      const fallbackRows = await rpc<TestQuestionRow[]>(endpoints.tests.availableQuestions, {
        p_test_id: testId,
      }, {
        retryable: false,
      });
      if (fallbackRows && fallbackRows.length > 0) {
        return fallbackRows.map(mapQuestion);
      }
    } catch {
      // Insecure REST query selecting correct_answer is strictly omitted
    }
  }

  return [];
}

async function submitStandardAttemptDirect(payload: SubmitAttemptPayload): Promise<SubmittedTestResponse> {
  const currentUser = useAuthStore.getState().user;
  const activeUserId = payload.userId || currentUser?.id || 'guest_user';
  const studentName = payload.studentName || currentUser?.fullName || 'Student';

  // 1. Fetch questions and test details
  let questionRows: Array<{
    id: string;
    correct_answer: string;
    integer_answer?: number | null;
    prompt?: string;
    options?: string[];
    explanation?: string;
    subjectLabel?: string;
    imageUrl?: string | null;
    type?: string;
  }> = [];
  let correctMarks = 4;
  let wrongMarks = -1;

  try {
    const [fetchedQs, testRows] = await Promise.all([
      fetchQuestions(payload.testId).catch(() => []),
      selectRows<TestRow>('tests', '*', { id: `eq.${payload.testId}` }).catch(() => []),
    ]);
    const testRow = testRows[0];
    correctMarks = Number(testRow?.correct_marks) || 4;
    wrongMarks =
      testRow?.wrong_marks !== undefined && testRow?.wrong_marks !== null
        ? -Math.abs(Number(testRow.wrong_marks))
        : -1;

    if (fetchedQs && fetchedQs.length > 0) {
      questionRows = fetchedQs.map((q) => ({
        id: q.id,
        correct_answer: q.correctAnswer || (q.integerAnswer !== null && q.integerAnswer !== undefined ? String(q.integerAnswer) : ''),
        integer_answer: q.integerAnswer,
        prompt: q.prompt,
        options: q.options,
        explanation: q.explanation,
        subjectLabel: q.subjectLabel,
        imageUrl: q.imageUrl,
        type: q.type,
      }));
    }
  } catch {
    questionRows = [];
  }

  let correctAnswers = 0;
  let wrongAnswers = 0;
  let unattempted = 0;
  let score = 0;

  const evaluatedAnswers: Array<{
    question_id: string;
    selected_answer: string;
    correct_answer: string;
    is_correct: boolean;
  }> = [];

  const reviewItems: TestAttemptReviewItem[] = [];

  questionRows.forEach((q, idx) => {
    const rawSelected =
      payload.answers[q.id] ??
      payload.answers[`${payload.testId}_draft_${idx + 1}`] ??
      payload.answers[`draft_${idx + 1}`];

    const isAttempted =
      rawSelected !== null &&
      rawSelected !== undefined &&
      typeof rawSelected === 'string' &&
      rawSelected.trim().length > 0;

    const cleanCorrect = (q.correct_answer || '').trim();

    if (!isAttempted) {
      unattempted++;
      evaluatedAnswers.push({
        question_id: q.id,
        selected_answer: '',
        correct_answer: cleanCorrect,
        is_correct: false,
      });

      reviewItems.push({
        questionId: q.id,
        testId: payload.testId,
        questionType: (q.type as any) || 'mcq',
        prompt: q.prompt || `Question ${idx + 1}`,
        options: q.options || ['A', 'B', 'C', 'D'],
        userAnswer: '',
        correctAnswer: cleanCorrect,
        isCorrect: false,
        isUnattempted: true,
        explanation: q.explanation || `Correct Answer: ${cleanCorrect}`,
        imageUrl: q.imageUrl,
      });
    } else {
      const selected = rawSelected.trim();
      const normSelected = selected.replace(/^Option\s+/i, '').trim().toLowerCase();
      let normCorrect = cleanCorrect.replace(/^Option\s+/i, '').trim().toLowerCase();

      // Check option letter vs text matching (e.g., student selected 'A' and option text in DB is matched)
      if (q.options && Array.isArray(q.options) && /^[a-d]$/i.test(normSelected)) {
        const optIdx = normSelected.toUpperCase().charCodeAt(0) - 65;
        const optText = (q.options[optIdx] || '').trim().toLowerCase();
        if (optText === normCorrect || normSelected === normCorrect) {
          normCorrect = normSelected;
        }
      }

      const isIntegerQuestion = q.type === 'integer' || q.integer_answer !== null && q.integer_answer !== undefined;
      const isNumericMatch = isIntegerQuestion && areNumericAnswersEquivalent(selected, q.integer_answer ?? cleanCorrect);

      const isMatch = normSelected === normCorrect || isNumericMatch;

      if (isMatch) {
        correctAnswers++;
        score += correctMarks;
        evaluatedAnswers.push({
          question_id: q.id,
          selected_answer: selected,
          correct_answer: cleanCorrect,
          is_correct: true,
        });

        reviewItems.push({
          questionId: q.id,
          testId: payload.testId,
          questionType: (q.type as any) || 'mcq',
          prompt: q.prompt || `Question ${idx + 1}`,
          options: q.options || ['A', 'B', 'C', 'D'],
          userAnswer: selected,
          correctAnswer: cleanCorrect,
          isCorrect: true,
          isUnattempted: false,
          explanation: q.explanation || `Correct Answer: ${cleanCorrect}`,
          imageUrl: q.imageUrl,
        });
      } else {
        wrongAnswers++;
        score += wrongMarks;
        evaluatedAnswers.push({
          question_id: q.id,
          selected_answer: selected,
          correct_answer: cleanCorrect,
          is_correct: false,
        });

        reviewItems.push({
          questionId: q.id,
          testId: payload.testId,
          questionType: (q.type as any) || 'mcq',
          prompt: q.prompt || `Question ${idx + 1}`,
          options: q.options || ['A', 'B', 'C', 'D'],
          userAnswer: selected,
          correctAnswer: cleanCorrect,
          isCorrect: false,
          isUnattempted: false,
          explanation: q.explanation || `Correct Answer: ${cleanCorrect}`,
          imageUrl: q.imageUrl,
        });
      }
    }
  });

  const totalQuestions = questionRows.length;
  const now = new Date().toISOString();
  const attemptId = `attempt_nav_${Date.now()}`;

  // 2. Insert into test_attempts table if possible
  let attemptRow: any = null;
  try {
    attemptRow = await insertRow('test_attempts', {
      test_id: payload.testId,
      user_id: activeUserId,
      student_name: studentName,
      answers: payload.answers,
      score,
      correct_answers: correctAnswers,
      wrong_answers: wrongAnswers,
      unattempted,
      total_questions: totalQuestions,
      percentile: 0,
      submitted_at: now,
    });
  } catch (err) {
    attemptRow = {
      id: attemptId,
      test_id: payload.testId,
      user_id: activeUserId,
      student_name: studentName,
      score,
      correct_answers: correctAnswers,
      wrong_answers: wrongAnswers,
      unattempted,
      total_questions: totalQuestions,
      percentile: 0,
      submitted_at: now,
    };
  }

  const finalAttemptId = attemptRow?.id || attemptId;

  // 3. Insert into test_attempt_answers table if possible
  if (attemptRow?.id) {
    try {
      const answerRows = evaluatedAnswers.map((ea) => ({
        attempt_id: finalAttemptId,
        question_id: ea.question_id,
        selected_answer: ea.selected_answer,
        correct_answer: ea.correct_answer,
        is_correct: ea.is_correct,
      }));
      await insertRow('test_attempt_answers', answerRows as any);
    } catch {
      // Best-effort table insertion
    }
  }

  const result: TestResult = {
    id: finalAttemptId,
    testId: payload.testId,
    userId: activeUserId,
    studentName,
    score,
    correctAnswers,
    wrongAnswers,
    unattempted,
    totalQuestions,
    rank: 1,
    percentile: 100,
    submittedAt: now,
  };

  // Persist locally for instant loading and offline resiliency
  await saveLocalStandardAttempt(result, reviewItems);
  invalidateAdminCache();

  return {
    result,
    testLeaderboard: [
      {
        userId: activeUserId,
        fullName: studentName,
        score,
        rank: 1,
        percentile: 100,
        testsAttempted: 1,
        isCurrentUser: true,
      },
    ],
    overallLeaderboard: [],
    user: currentUser ?? undefined,
  };
}

export function normalizeUserAnswerForQuestion(val: string | undefined | null, question: TestQuestion): string {
  if (val === undefined || val === null || String(val).trim() === '') {
    return '';
  }

  const raw = String(val).trim();

  if (question.type === 'integer') {
    return normalizeNumericAnswer(raw);
  }
  const normRaw = raw.replace(/^Option\s+/i, '').trim();
  const cleanCorrect = (question.correctAnswer || (question.integerAnswer !== undefined && question.integerAnswer !== null ? String(question.integerAnswer) : '') || '').trim();
  const normCorrect = cleanCorrect.replace(/^Option\s+/i, '').trim();

  if (question.options && Array.isArray(question.options) && question.options.length > 0) {
    const isSingleLetterUser = /^[A-D]$/i.test(normRaw);
    const isSingleLetterCorrect = /^[A-D]$/i.test(normCorrect);

    if (isSingleLetterUser) {
      const optIdx = normRaw.toUpperCase().charCodeAt(0) - 65;
      const optText = (question.options[optIdx] || '').trim();

      if (!isSingleLetterCorrect && optText) {
        return optText;
      }
      return normRaw.toUpperCase();
    } else {
      if (isSingleLetterCorrect) {
        const foundIdx = question.options.findIndex(
          (opt) => (opt || '').trim().toLowerCase() === normRaw.toLowerCase()
        );
        if (foundIdx !== -1) {
          return String.fromCharCode(65 + foundIdx);
        }
      }
      return raw;
    }
  }

  return raw;
}

export async function submitAttempt(payload: SubmitAttemptPayload): Promise<SubmittedTestResponse> {
  // Pre-normalize answers to ensure every question's UUID is populated and option letters match canonical answer format
  let normalizedAnswers: Record<string, string> = {};
  try {
    // Avoid unnecessary remote question refetches during submission bursts
    const cachedQuestions = useAppStore.getState().questionCache[payload.testId];
    const qList =
      payload.questions && payload.questions.length > 0
        ? payload.questions
        : cachedQuestions && cachedQuestions.length > 0
          ? cachedQuestions
          : await fetchQuestions(payload.testId);

    if (qList && qList.length > 0) {
      qList.forEach((q: TestQuestion, idx: number) => {
        const rawVal =
          payload.answers[q.id] ??
          payload.answers[`${payload.testId}_draft_${idx + 1}`] ??
          payload.answers[`draft_${idx + 1}`];
        if (rawVal !== undefined && rawVal !== null && typeof rawVal === 'string' && rawVal.trim().length > 0) {
          const canonicalVal = normalizeUserAnswerForQuestion(rawVal, q);
          if (canonicalVal && canonicalVal.trim().length > 0) {
            normalizedAnswers[q.id] = canonicalVal;
          }
        }
      });
    } else {
      normalizedAnswers = { ...payload.answers };
    }
  } catch {
    normalizedAnswers = { ...payload.answers };
  }

  const effectivePayload: SubmitAttemptPayload = {
    ...payload,
    answers: normalizedAnswers,
  };

  const MAX_BURST_RETRIES = 3;
  let lastError: unknown;

  for (let attempt = 1; attempt <= MAX_BURST_RETRIES; attempt++) {
    try {
      const response = await rpc<SubmitAttemptRpcResponse>(endpoints.tests.submit, {
        p_test_id: effectivePayload.testId,
        p_answers: effectivePayload.answers,
        p_student_name: effectivePayload.studentName ?? null,
      });
      const mapped = mapSubmittedAttempt(response);
      await saveLocalStandardAttempt(mapped.result, []).catch(() => undefined);
      invalidateAdminCache();
      logInfo('Test submission succeeded.', {
        testId: effectivePayload.testId,
        userId: effectivePayload.userId,
        resultId: mapped.result.id,
        score: mapped.result.score,
        attemptNumber: attempt,
      });
      return mapped;
    } catch (error) {
      lastError = error;
      const errorMsg = error instanceof Error ? error.message.toLowerCase() : '';

      // Check for signature overload issue on legacy endpoints
      if (errorMsg.includes('candidate function') || errorMsg.includes('parameter') || errorMsg.includes('overload')) {
        try {
          const legacyResponse = await rpc<SubmitAttemptRpcResponse>(endpoints.tests.submit, {
            p_test_id: effectivePayload.testId,
            p_answers: effectivePayload.answers,
          });
          const legacyMapped = mapSubmittedAttempt(legacyResponse);
          await saveLocalStandardAttempt(legacyMapped.result, []).catch(() => undefined);
          invalidateAdminCache();
          return legacyMapped;
        } catch {
          // Fall through to retry or throw
        }
      }

      // Check if error is transient / concurrency collision / network timeout
      const isTransient =
        errorMsg.includes('network') ||
        errorMsg.includes('failed to fetch') ||
        errorMsg.includes('timeout') ||
        errorMsg.includes('503') ||
        errorMsg.includes('504') ||
        errorMsg.includes('429') ||
        errorMsg.includes('lock') ||
        errorMsg.includes('connection');

      if (isTransient && attempt < MAX_BURST_RETRIES) {
        // Bounded exponential backoff with randomized jitter: 200ms * 2^attempt + random(100..300ms)
        const jitter = Math.floor(Math.random() * 200) + 100;
        const delayMs = Math.min(2500, Math.pow(2, attempt) * 200 + jitter);
        await new Promise((res) => setTimeout(res, delayMs));
        continue;
      }

      break;
    }
  }

  throw lastError;
}

export function normalizeLeaderboardCohort(
  entries: LeaderboardEntry[],
  currentUserId?: string,
): LeaderboardEntry[] {
  if (!entries || entries.length === 0) return [];

  // Sort candidates strictly by score DESC, then testsAttempted DESC, then fullName ASC
  const sorted = [...entries].sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if ((b.testsAttempted ?? 0) !== (a.testsAttempted ?? 0)) {
      return (b.testsAttempted ?? 0) - (a.testsAttempted ?? 0);
    }
    return (a.fullName || '').localeCompare(b.fullName || '');
  });

  const total = sorted.length;

  return sorted.map((entry, idx) => {
    const rank = idx + 1;
    // Official NTA cohort percentile:
    // Percentile = 100 * (Number of candidates with score <= candidate score) / Total candidates
    const countLessOrEqual = sorted.filter((other) => other.score <= entry.score).length;
    const computedPercentile = total <= 1 ? 100 : Math.min(100, Math.max(1, Math.round((countLessOrEqual / total) * 100)));

    return {
      ...entry,
      rank,
      percentile: computedPercentile,
      isCurrentUser: entry.isCurrentUser || (currentUserId ? entry.userId === currentUserId : false),
    };
  });
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

  const rawEntries = rows.map((row) =>
    mapLeaderboard({
      ...row,
      is_current_user: row.user_id === currentUserId,
    }),
  );

  return normalizeLeaderboardCohort(rawEntries, currentUserId);
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
  violationType: 'app_background' | 'app_inactive' | 'web_visibility' | 'web_blur' | 'auto_submit' | 'tab_hidden' | 'tab_returned';
  violationCount?: number;
}) {
  const user = useAuthStore.getState().user;
  const isAutoSubmit = payload.violationType === 'auto_submit';
  const eventType = isAutoSubmit ? 'AUTO_SUBMIT_TRIGGERED' : 'VIOLATION_WARNING';
  const status = isAutoSubmit ? 'failed' : 'warning';
  const reason = isAutoSubmit
    ? 'Maximum tab-switch violations reached; automatic exam submission triggered.'
    : `Tab-switch detected (${payload.violationType}). Warning issued.`;

  activityLog.logExam(eventType, {
    userId: user?.id,
    studentName: user?.fullName,
    testId: payload.testId,
    status,
    reason,
  });
  void activityLog.flush();

  // Update active_exam_sessions table so Admin Diagnostics sees the live warning state immediately
  try {
    if (user?.id) {
      if (isAutoSubmit) {
        await updateRows(
          'active_exam_sessions',
          {
            status: 'AUTO_SUBMITTED',
            last_active_at: new Date().toISOString(),
          },
          {
            test_id: `eq.${payload.testId}`,
            user_id: `eq.${user.id}`,
          },
        );
      } else if (payload.violationCount) {
        await updateRows(
          'active_exam_sessions',
          {
            violations_count: payload.violationCount,
            status: 'WARNING_TRIGGERED',
            last_active_at: new Date().toISOString(),
          },
          {
            test_id: `eq.${payload.testId}`,
            user_id: `eq.${user.id}`,
          },
        );
      }
    }
  } catch {
    // Best-effort session update
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
}

export async function logExamLifecycleEvent(
  eventType: 'TAB_RETURNED' | 'SUBMISSION_STARTED' | 'SUBMISSION_FAILED' | 'SUBMISSION_SUCCEEDED',
  options: {
    testId: string;
    reason?: string;
    score?: number;
  },
) {
  const user = useAuthStore.getState().user;
  const status =
    eventType === 'SUBMISSION_FAILED'
      ? 'failed'
      : eventType === 'SUBMISSION_SUCCEEDED'
        ? 'success'
        : 'info';

  activityLog.logExam(eventType, {
    userId: user?.id,
    studentName: user?.fullName,
    testId: options.testId,
    status,
    reason: options.reason,
    score: options.score,
  });
  void activityLog.flush();

  try {
    await insertRow('admin_activity_logs', {
      user_id: user?.id ?? null,
      student_name: user?.fullName ?? null,
      category: 'exam',
      event_type: eventType,
      status,
      device_info: Platform.OS === 'web' ? 'Web Browser' : Platform.OS,
      details: {
        test_id: options.testId,
        reason: options.reason,
        score: options.score,
      },
    });
  } catch {
    // Best-effort DB insert
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
  const localReviews = await getLocalStandardAttemptReviews(resultId);
  if (localReviews && localReviews.length > 0) {
    return localReviews;
  }

  if (isUuid(resultId)) {
    try {
      const rows = await rpc<ReviewRow[]>(endpoints.tests.review, {
        p_attempt_id: resultId,
      }, {
        retryable: true,
      });
      if (rows && rows.length > 0) {
        return rows.map(mapReviewRow);
      }
    } catch (error) {
      logWarn('fetchAttemptReview RPC denied or failed:', { error: String(error) });
      throw error;
    }
  }

  return [];
}

export async function fetchResultById(resultId: string): Promise<TestResult | null> {
  if (!resultId) {
    return null;
  }

  const localStd = await getLocalStandardAttempt(resultId);
  if (localStd) {
    return localStd;
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
    if (rows && rows[0]) {
      return mapResult(rows[0]);
    }
  } catch {
    // Fall through to test_attempts table
  }

  try {
    const attemptRows = await selectRows<ResultRow>(
      'test_attempts',
      'id,test_id,user_id,student_name,score,correct_answers,wrong_answers,unattempted,total_questions,percentile,submitted_at',
      {
        id: `eq.${resultId}`,
        limit: 1,
      },
    );
    if (attemptRows && attemptRows[0]) {
      return mapResult(attemptRows[0]);
    }
  } catch {
    // Return null
  }

  return null;
}

export async function fetchExistingAttemptForTest(testId: string, userId?: string): Promise<TestResult | null> {
  const localStd = await getLocalStandardAttemptByTestId(testId, userId);
  if (localStd) {
    return localStd;
  }

  if (userId) {
    try {
      const rows = await rpc<ResultRow[]>(endpoints.tests.existingAttempt, {
        p_test_id: testId,
      }, {
        retryable: true,
      });
      if (rows && rows[0]) {
        return mapResult(rows[0]);
      }
    } catch {
      // Fall through to direct query
    }

    try {
      const summaryRows = await selectRows<ResultRow>(
        'test_attempt_summaries',
        'id,test_id,user_id,student_name,score,correct_answers,wrong_answers,unattempted,total_questions,rank,percentile,submitted_at',
        {
          test_id: `eq.${testId}`,
          user_id: `eq.${userId}`,
          limit: 1,
        },
      );
      if (summaryRows && summaryRows[0]) {
        return mapResult(summaryRows[0]);
      }
    } catch {
      // Fall through to test_attempts table
    }

    try {
      const attemptRows = await selectRows<ResultRow>(
        'test_attempts',
        'id,test_id,user_id,student_name,score,correct_answers,wrong_answers,unattempted,total_questions,percentile,submitted_at',
        {
          test_id: `eq.${testId}`,
          user_id: `eq.${userId}`,
          limit: 1,
        },
      );
      if (attemptRows && attemptRows[0]) {
        return mapResult(attemptRows[0]);
      }
    } catch {
      // Return null
    }
  }

  return null;
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
