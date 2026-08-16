import { create } from 'zustand';

import {
  fetchAnalytics,
  fetchAutoSubmitEvents,
  fetchEnquiries,
  fetchEnrollmentQueries,
  fetchResults,
  fetchScholarshipRegistrations,
  fetchViolationAnalytics,
  fetchUsers,
  assignBatch,
  approveAdmin,
  createBatch,
  createTest,
  updateTest,
  setTestStarted,
  deleteAttempt,
  deleteBatch,
  deleteEnrollmentQuery,
  deleteGeneralEnquiry,
  deleteScholarshipRegistration,
  deleteTest,
  wipeLeaderboard,
  fetchQuestionSets,
  fetchQuestionSetQuestions,
  createQuestionSet,
  deleteQuestionSet,
  fetchActivityLogs,
} from '../services/api/admin';
import { fetchBatches, fetchCourses } from '../services/api/content';
import {
  fetchAttemptReview,
  fetchLeaderboard,
  fetchQuestions,
  fetchStudentInsights,
  fetchTests,
  importQuestionsFromPdf,
  registerScholarshipAttempt,
  submitGeneralEnquiry,
  submitAttempt,
  submitEnrollmentQuery,
} from '../services/api/tests';
import { fetchProfileById } from '../services/api/client';
import { activityLog } from '../services/api/activityLogger';
import { useAuthStore } from './authStore';
import {
  ActivityLogEntry,
  AnalyticsSnapshot,
  AutoSubmitEvent,
  AppUser,
  AssignBatchPayload,
  Batch,
  Course,
  CreateBatchPayload,
  CreateTestPayload,
  EnquiryPayload,
  EnquiryRecord,
  EnrollmentQueryRecord,
  EnrollmentQueryPayload,
  LeaderboardEntry,
  LeaderboardScope,
  PdfImportPayload,
  PdfImportResponse,
  QuestionBankQuestion,
  QuestionBankSet,
  ScholarshipRegistrationPayload,
  ScholarshipRegistrationRecord,
  StudentInsights,
  SubmitAttemptPayload,
  SubmittedTestResponse,
  TestItem,
  TestAttemptReviewItem,
  TestQuestion,
  TestResult,
  UpdateTestPayload,
  ViolationSummary,
} from '../types';
import { normalizeExamText } from '../utils/examText';
import { logError } from '../utils/logger';

interface AppState {
  courses: Course[];
  batches: Batch[];
  tests: TestItem[];
  users: AppUser[];
  results: TestResult[];
  leaderboard: LeaderboardEntry[];
  testLeaderboards: Record<string, LeaderboardEntry[]>;
  leaderboardByScope: Record<string, LeaderboardEntry[]>;
  leaderboardFetchedAt?: number;
  leaderboardFetchedAtByScope: Record<string, number>;
  testLeaderboardFetchedAt: Record<string, number>;
  analytics: AnalyticsSnapshot;
  enquiries: EnquiryRecord[];
  enrollmentQueries: EnrollmentQueryRecord[];
  scholarshipRegistrations: ScholarshipRegistrationRecord[];
  autoSubmitEvents: AutoSubmitEvent[];
  violationAnalytics: ViolationSummary[];
  activityLogs: ActivityLogEntry[];
  studentInsights?: StudentInsights;
  studentInsightsFetchedAt?: number;
  questionCache: Record<string, TestQuestion[]>;
  reviewCache: Record<string, TestAttemptReviewItem[]>;
  questionBankSets: QuestionBankSet[];
  questionBankSelection: QuestionBankQuestion[];
  pendingQuestionBankImport: CreateTestPayload['questions'];
  adminDataFetchedAt?: number;
  isBootstrapping: boolean;
  isAdminDataLoading: boolean;
  isSubmitting: boolean;
  error?: string;
  bootstrap: (currentUser?: AppUser | null) => Promise<void>;
  loadAdminData: (currentUser?: AppUser | null, force?: boolean) => Promise<void>;
  loadActivityLogs: (options?: { category?: string; userId?: string; limit?: number; offset?: number }) => Promise<ActivityLogEntry[]>;
  loadLeaderboard: (payload?: { scope?: LeaderboardScope; batchId?: string | null; testId?: string }) => Promise<LeaderboardEntry[]>;
  loadStudentInsights: (userId?: string) => Promise<StudentInsights>;
  loadQuestions: (testId: string) => Promise<TestQuestion[]>;
  loadReview: (resultId: string) => Promise<TestAttemptReviewItem[]>;
  loadQuestionBankSets: (force?: boolean) => Promise<QuestionBankSet[]>;
  loadQuestionSetQuestions: (setId: number) => Promise<QuestionBankQuestion[]>;
  createQuestionSet: (payload: { pdfName: string; questions: Array<{ question: string; options: string[]; correct_answer: string; type: 'mcq' | 'integer'; explanation?: string; image_url?: string | null }> }) => Promise<{ set_id: number; question_count: number }>;
  deleteQuestionSet: (setId: number) => Promise<void>;
  toggleQuestionBankSelection: (question: QuestionBankQuestion) => void;
  selectAllQuestionBankQuestions: (questions: QuestionBankQuestion[]) => void;
  deselectAllQuestionBankQuestions: (questions: QuestionBankQuestion[]) => void;
  clearQuestionBankSelection: () => void;
  queueSelectedQuestionBankQuestions: () => CreateTestPayload['questions'];
  consumePendingQuestionBankImport: () => CreateTestPayload['questions'];
  importQuestionsFromPdf: (payload: PdfImportPayload) => Promise<
    PdfImportResponse & { draftQuestions: CreateTestPayload['questions'] }
  >;
  submitAttempt: (payload: SubmitAttemptPayload) => Promise<SubmittedTestResponse>;
  submitEnrollmentQuery: (payload: EnrollmentQueryPayload) => Promise<void>;
  registerScholarshipAttempt: (payload: ScholarshipRegistrationPayload) => Promise<void>;
  submitGeneralEnquiry: (payload: EnquiryPayload) => Promise<void>;
  createTest: (payload: CreateTestPayload) => Promise<TestItem>;
  updateTest: (payload: UpdateTestPayload) => Promise<TestItem>;
  setTestStarted: (testId: string, isStarted: boolean) => Promise<TestItem>;
  createBatch: (payload: CreateBatchPayload) => Promise<Batch>;
  assignBatch: (payload: AssignBatchPayload) => Promise<AppUser>;
  approveAdmin: (userId: string) => Promise<AppUser>;
  deleteTest: (testId: string) => Promise<void>;
  deleteBatch: (batchId: string) => Promise<void>;
  wipeLeaderboard: () => Promise<void>;
  deleteAttempt: (attemptId: string) => Promise<void>;
  deleteEnrollmentQuery: (queryId: string) => Promise<void>;
  deleteScholarshipRegistration: (registrationId: string) => Promise<void>;
  deleteGeneralEnquiry: (enquiryId: string) => Promise<void>;
  reset: () => void;
}

const LEADERBOARD_CACHE_TTL_MS = 45_000;
const STUDENT_INSIGHTS_CACHE_TTL_MS = 60_000;
const ADMIN_DATA_CACHE_TTL_MS = 60_000;

function getLeaderboardCacheKey(payload?: { scope?: LeaderboardScope; batchId?: string | null; testId?: string }) {
  const scope = payload?.scope ?? 'overall_history';
  const batchId = payload?.batchId ?? 'self';
  const testId = payload?.testId ?? 'all';
  return `${scope}:${batchId}:${testId}`;
}

function errorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  return 'Unable to load MIITJEE data.';
}

function isSameUserSnapshot(left: AppUser | null | undefined, right: AppUser | null | undefined) {
  if (!left && !right) {
    return true;
  }

  if (!left || !right) {
    return false;
  }

  return (
    left.id === right.id &&
    left.fullName === right.fullName &&
    left.email === right.email &&
    left.role === right.role &&
    left.approvalStatus === right.approvalStatus &&
    left.batchId === right.batchId &&
    left.targetExam === right.targetExam &&
    left.classLabel === right.classLabel &&
    left.rank === right.rank &&
    left.averageScore === right.averageScore &&
    left.streakDays === right.streakDays &&
    left.avatarSeed === right.avatarSeed
  );
}

async function withFallback<T>(loader: () => Promise<T>, fallback: T) {
  try {
    return await loader();
  } catch {
    return fallback;
  }
}

function mapQuestionBankQuestionToDraft(question: QuestionBankQuestion): CreateTestPayload['questions'][number] {
  const normalizedPrompt = normalizeExamText(question.question);
  const normalizedOptions = question.type === 'mcq' ? question.options.map((option) => normalizeExamText(option)) : ['', '', '', ''];
  const normalizedCorrectAnswer = normalizeExamText(question.correctAnswer);
  const correctOptionIndex =
    question.type === 'mcq'
      ? Math.max(0, normalizedOptions.findIndex((option) => option === normalizedCorrectAnswer))
      : 0;

  return {
    type: question.type,
    prompt: normalizedPrompt,
    options: normalizedOptions,
    correctOptionIndex,
    integerAnswer: question.type === 'integer' ? Number(question.correctAnswer) : undefined,
    explanation: '',
    imageUrl: question.imageUrl ?? null,
    subjectLabel: '',
  };
}

export const useAppStore = create<AppState>((set, get) => ({
  courses: [],
  batches: [],
  tests: [],
  users: [],
  results: [],
  leaderboard: [],
  testLeaderboards: {},
  leaderboardByScope: {},
  leaderboardFetchedAt: undefined,
  leaderboardFetchedAtByScope: {},
  testLeaderboardFetchedAt: {},
  analytics: {
    totalUsers: 0,
    totalStudents: 0,
    totalAdmins: 0,
    totalTests: 0,
    totalQuestions: 0,
    totalAttempts: 0,
    avgScore: 0,
    attemptsLast24h: 0,
    activeStudentsLast7d: 0,
  },
  enquiries: [],
  enrollmentQueries: [],
  scholarshipRegistrations: [],
  autoSubmitEvents: [],
  violationAnalytics: [],
  activityLogs: [],
  studentInsights: undefined,
  studentInsightsFetchedAt: undefined,
  questionCache: {},
  reviewCache: {},
  questionBankSets: [],
  questionBankSelection: [],
  pendingQuestionBankImport: [],
  adminDataFetchedAt: undefined,
  isBootstrapping: false,
  isAdminDataLoading: false,
  isSubmitting: false,
  error: undefined,
  bootstrap: async (currentUser) => {
    set({ isBootstrapping: true, error: undefined });

    try {
      const refreshedCurrentUser = currentUser
        ? await withFallback(() => fetchProfileById(currentUser.id), currentUser)
        : null;

      const [batches, tests, results] = await Promise.all([
        withFallback(() => fetchBatches(), get().batches),
        withFallback(() => fetchTests(), get().tests),
        withFallback(
          () =>
            fetchResults(
              refreshedCurrentUser?.role === 'admin' && refreshedCurrentUser.approvalStatus === 'approved'
                ? refreshedCurrentUser.id
                : refreshedCurrentUser?.id ?? currentUser?.id,
            ),
          get().results,
        ),
      ]);

      const refreshedSignedInUser = refreshedCurrentUser
        ? refreshedCurrentUser
        : null;
      if (refreshedSignedInUser && !isSameUserSnapshot(useAuthStore.getState().user, refreshedSignedInUser)) {
        useAuthStore.getState().setUser(refreshedSignedInUser);
      }

      set({
        batches,
        tests,
        results,
        users:
          refreshedCurrentUser?.role === 'admin' && refreshedCurrentUser.approvalStatus === 'approved'
            ? get().users
            : [],
        analytics:
          refreshedCurrentUser?.role === 'admin' && refreshedCurrentUser.approvalStatus === 'approved'
            ? get().analytics
            : {
                totalUsers: 0,
                totalStudents: 0,
                totalAdmins: 0,
                totalTests: 0,
                totalQuestions: 0,
                totalAttempts: 0,
                avgScore: 0,
                attemptsLast24h: 0,
                activeStudentsLast7d: 0,
              },
        enquiries:
          refreshedCurrentUser?.role === 'admin' && refreshedCurrentUser.approvalStatus === 'approved'
            ? get().enquiries
            : [],
        enrollmentQueries:
          refreshedCurrentUser?.role === 'admin' && refreshedCurrentUser.approvalStatus === 'approved'
            ? get().enrollmentQueries
            : [],
        scholarshipRegistrations:
          refreshedCurrentUser?.role === 'admin' && refreshedCurrentUser.approvalStatus === 'approved'
            ? get().scholarshipRegistrations
            : [],
        autoSubmitEvents:
          refreshedCurrentUser?.role === 'admin' && refreshedCurrentUser.approvalStatus === 'approved'
            ? get().autoSubmitEvents
            : [],
        violationAnalytics:
          refreshedCurrentUser?.role === 'admin' && refreshedCurrentUser.approvalStatus === 'approved'
            ? get().violationAnalytics
            : [],
        studentInsights: currentUser ? get().studentInsights : undefined,
        isBootstrapping: false,
      });

      const shouldPrefetchLeaderboard =
        !(refreshedCurrentUser?.role === 'admin' && refreshedCurrentUser.approvalStatus === 'approved');

      void Promise.all([
        withFallback(() => fetchCourses(), get().courses),
        shouldPrefetchLeaderboard
          ? withFallback(
              () =>
                fetchLeaderboard(
                  {
                    scope: 'overall_history',
                  },
                  refreshedCurrentUser?.id ?? currentUser?.id,
                ),
              get().leaderboard,
            )
          : Promise.resolve(get().leaderboard),
      ]).then(([courses, leaderboard]) => {
        set({
          courses,
          leaderboard,
          leaderboardFetchedAt: Date.now(),
          leaderboardByScope: {
            [getLeaderboardCacheKey({ scope: 'overall_history', batchId: shouldPrefetchLeaderboard ? refreshedCurrentUser?.batchId ?? null : undefined })]: leaderboard,
          },
          leaderboardFetchedAtByScope: {
            [getLeaderboardCacheKey({ scope: 'overall_history', batchId: shouldPrefetchLeaderboard ? refreshedCurrentUser?.batchId ?? null : undefined })]: Date.now(),
          },
        });
      });
    } catch (error) {
      set({
        error: errorMessage(error),
        isBootstrapping: false,
      });
    }
  },
  loadAdminData: async (currentUser, force = false) => {
    const resolvedUser = currentUser ?? useAuthStore.getState().user;
    const isApprovedAdmin = resolvedUser?.role === 'admin' && resolvedUser.approvalStatus === 'approved';

    if (!isApprovedAdmin) {
      return;
    }

    const now = Date.now();
    const cachedAt = get().adminDataFetchedAt;
    const hasCachedAdminData =
      get().users.length > 0 ||
      get().autoSubmitEvents.length > 0 ||
      get().violationAnalytics.length > 0 ||
      get().enrollmentQueries.length > 0 ||
      get().scholarshipRegistrations.length > 0 ||
      get().enquiries.length > 0;

    if (!force && cachedAt && now - cachedAt < ADMIN_DATA_CACHE_TTL_MS && hasCachedAdminData) {
      return;
    }

    set({ isAdminDataLoading: !hasCachedAdminData, error: undefined });

    try {
      const [users, analytics] = await Promise.all([
        withFallback(() => fetchUsers({ limit: 20, offset: 0 }), get().users),
        withFallback(() => fetchAnalytics(), get().analytics),
      ]);

      const refreshedSignedInUser = users.find((user) => user.id === resolvedUser.id) ?? resolvedUser;
      if (!isSameUserSnapshot(useAuthStore.getState().user, refreshedSignedInUser)) {
        useAuthStore.getState().setUser(refreshedSignedInUser);
      }

      set({
        users,
        analytics,
        adminDataFetchedAt: now,
        isAdminDataLoading: false,
      });

      void Promise.all([
        withFallback(() => fetchAutoSubmitEvents(), get().autoSubmitEvents),
        withFallback(() => fetchViolationAnalytics(), get().violationAnalytics),
        withFallback(() => fetchEnrollmentQueries(), get().enrollmentQueries),
        withFallback(() => fetchScholarshipRegistrations(), get().scholarshipRegistrations),
        withFallback(() => fetchEnquiries(), get().enquiries),
        withFallback(() => fetchResults(undefined, { limit: 20, offset: 0 }), get().results),
      ])
        .then(([autoSubmitEvents, violationAnalytics, enrollmentQueries, scholarshipRegistrations, enquiries, results]) => {
          set({
            autoSubmitEvents,
            violationAnalytics,
            enrollmentQueries,
            scholarshipRegistrations,
            enquiries,
            results,
            adminDataFetchedAt: Date.now(),
          });
        })
        .catch((error) => {
          set({
            error: errorMessage(error),
          });
        });
    } catch (error) {
      set({
        error: errorMessage(error),
        isAdminDataLoading: false,
      });
    }
  },
  loadActivityLogs: async (options) => {
    const logs = await fetchActivityLogs(options);
    set({ activityLogs: logs });
    return logs;
  },
  loadLeaderboard: async (payload) => {
    const scope = payload?.scope ?? 'overall_history';
    const testId = payload?.testId;
    const now = Date.now();
    const cacheKey = getLeaderboardCacheKey(payload);

    if (scope === 'test_wise' && testId) {
      const cachedLeaderboard = get().testLeaderboards[testId];
      const cachedAt = get().testLeaderboardFetchedAt[testId];
      if (cachedLeaderboard && cachedAt && now - cachedAt < LEADERBOARD_CACHE_TTL_MS) {
        return cachedLeaderboard;
      }
    }

    if (scope === 'overall_history') {
      const cachedLeaderboard = get().leaderboardByScope[cacheKey] ?? get().leaderboard;
      const cachedAt = get().leaderboardFetchedAtByScope[cacheKey] ?? get().leaderboardFetchedAt;
      if (cachedLeaderboard.length > 0 && cachedAt && now - cachedAt < LEADERBOARD_CACHE_TTL_MS) {
        return cachedLeaderboard;
      }
    }

    const signedInUser = useAuthStore.getState().user;
    const leaderboard = await fetchLeaderboard(
      {
        scope,
        batchId: payload?.batchId ?? null,
        testId,
      },
      signedInUser?.id,
    );

    if (scope === 'test_wise' && testId) {
      set((state) => ({
        testLeaderboards: {
          ...state.testLeaderboards,
          [testId]: leaderboard,
        },
        testLeaderboardFetchedAt: {
          ...state.testLeaderboardFetchedAt,
          [testId]: now,
        },
      }));
      return leaderboard;
    }

    set((state) => ({
      leaderboard: leaderboard,
      leaderboardFetchedAt: now,
      leaderboardByScope: {
        ...state.leaderboardByScope,
        [cacheKey]: leaderboard,
      },
      leaderboardFetchedAtByScope: {
        ...state.leaderboardFetchedAtByScope,
        [cacheKey]: now,
      },
    }));
    return leaderboard;
  },
  loadStudentInsights: async (userId) => {
    const cachedInsights = get().studentInsights;
    const cachedAt = get().studentInsightsFetchedAt;
    const now = Date.now();
    if (cachedInsights && cachedAt && now - cachedAt < STUDENT_INSIGHTS_CACHE_TTL_MS) {
      return cachedInsights;
    }

    const resolvedUserId = userId ?? useAuthStore.getState().user?.id;
    const insights = await fetchStudentInsights(resolvedUserId);
    set({ studentInsights: insights, studentInsightsFetchedAt: now });
    return insights;
  },
  loadQuestions: async (testId) => {
    const cached = get().questionCache[testId];
    if (cached && cached.length > 0) {
      return cached;
    }

    const questions = await fetchQuestions(testId);
    if (questions && questions.length > 0) {
      set((state) => ({
        questionCache: {
          ...state.questionCache,
          [testId]: questions,
        },
      }));
    }
    return questions;
  },
  loadReview: async (resultId) => {
    const cached = get().reviewCache[resultId];
    if (cached) {
      return cached;
    }

    const review = await fetchAttemptReview(resultId);
    set((state) => ({
      reviewCache: {
        ...state.reviewCache,
        [resultId]: review,
      },
    }));
    return review;
  },
  loadQuestionBankSets: async (force = false) => {
    if (!force && get().questionBankSets.length > 0) {
      return get().questionBankSets;
    }

    const sets = await fetchQuestionSets();
    set({ questionBankSets: sets });
    return sets;
  },
  loadQuestionSetQuestions: async (setId) => fetchQuestionSetQuestions(setId),
  createQuestionSet: async (payload) => {
    const created = await createQuestionSet(payload);
    const currentUser = useAuthStore.getState().user;
    activityLog.logAdminAction('QUESTION_SET_CREATED', {
      adminUserId: currentUser?.id,
      adminName: currentUser?.fullName,
      targetId: String(created.set_id),
      targetName: payload.pdfName,
    });
    set((state) => ({
      questionBankSets: [
        {
          setId: created.set_id,
          pdfName: payload.pdfName,
          questionCount: created.question_count,
          createdAt: new Date().toISOString(),
        },
        ...state.questionBankSets.filter((entry) => entry.setId !== created.set_id),
      ],
    }));
    return created;
  },
  deleteQuestionSet: async (setId) => {
    await deleteQuestionSet(setId);
    const currentUser = useAuthStore.getState().user;
    activityLog.logAdminAction('QUESTION_SET_DELETED', {
      adminUserId: currentUser?.id,
      adminName: currentUser?.fullName,
      targetId: String(setId),
    });
    set((state) => ({
      questionBankSets: state.questionBankSets.filter((entry) => entry.setId !== setId),
      questionBankSelection: state.questionBankSelection.filter((entry) => entry.setId !== setId),
    }));
  },
  toggleQuestionBankSelection: (question) =>
    set((state) => {
      const exists = state.questionBankSelection.some((entry) => entry.id === question.id);
      return {
        questionBankSelection: exists
          ? state.questionBankSelection.filter((entry) => entry.id !== question.id)
          : [...state.questionBankSelection, question],
      };
    }),
  selectAllQuestionBankQuestions: (questions) =>
    set((state) => {
      const existingIds = new Set(state.questionBankSelection.map((q) => q.id));
      const newItems = questions.filter((q) => !existingIds.has(q.id));
      return {
        questionBankSelection: [...state.questionBankSelection, ...newItems],
      };
    }),
  deselectAllQuestionBankQuestions: (questions) =>
    set((state) => {
      const idsToRemove = new Set(questions.map((q) => q.id));
      return {
        questionBankSelection: state.questionBankSelection.filter((q) => !idsToRemove.has(q.id)),
      };
    }),
  clearQuestionBankSelection: () => set({ questionBankSelection: [] }),
  queueSelectedQuestionBankQuestions: () => {
    const queued = get().questionBankSelection.map(mapQuestionBankQuestionToDraft);
    set({
      pendingQuestionBankImport: queued,
      questionBankSelection: [],
    });
    return queued;
  },
  consumePendingQuestionBankImport: () => {
    const queued = get().pendingQuestionBankImport;
    set({ pendingQuestionBankImport: [] });
    return queued;
  },
  importQuestionsFromPdf: async (payload) => importQuestionsFromPdf({ ...payload, provider: 'gemini' }),
  submitAttempt: async (payload) => {
    set({ isSubmitting: true, error: undefined });

    try {
      const response = await submitAttempt(payload);
      const signedInUser = useAuthStore.getState().user;

      activityLog.logExam('TEST_SUBMITTED', {
        userId: payload.userId,
        studentName: signedInUser?.fullName,
        testId: payload.testId,
        status: 'success',
        score: response.result.score,
      });

      if (response.user && signedInUser?.id === response.user.id) {
        useAuthStore.getState().setUser(response.user);
      }

      set((state) => ({
        results: [response.result, ...state.results.filter((entry) => entry.id !== response.result.id)],
        leaderboard: response.overallLeaderboard,
        leaderboardFetchedAt: Date.now(),
        testLeaderboards: {
          ...state.testLeaderboards,
          [response.result.testId]: response.testLeaderboard,
        },
        testLeaderboardFetchedAt: {
          ...state.testLeaderboardFetchedAt,
          [response.result.testId]: Date.now(),
        },
        users: response.user
          ? state.users.map((user) => (user.id === response.user?.id ? response.user : user))
          : state.users,
        analytics: {
          ...state.analytics,
          totalAttempts: state.analytics.totalAttempts + 1,
        },
        studentInsights: undefined,
        isSubmitting: false,
      }));
      return response;
    } catch (error) {
      logError('Test submission state update failed.', error, {
        testId: payload.testId,
        userId: payload.userId,
      });
      set({ isSubmitting: false, error: errorMessage(error) });
      throw error;
    }
  },
  submitEnrollmentQuery: async (payload) => {
    set({ error: undefined });

    try {
      await submitEnrollmentQuery(payload);
      set({
        adminDataFetchedAt: undefined,
      });
    } catch (error) {
      set({ error: errorMessage(error) });
      throw error;
    }
  },
  registerScholarshipAttempt: async (payload) => {
    set({ error: undefined });

    try {
      await registerScholarshipAttempt(payload);
    } catch (error) {
      set({ error: errorMessage(error) });
      throw error;
    }
  },
  submitGeneralEnquiry: async (payload) => {
    set({ error: undefined });

    try {
      await submitGeneralEnquiry(payload);
      const currentUser = useAuthStore.getState().user;
      set((state) => ({
        enquiries: [
          {
            id: `local-enquiry-${Date.now()}`,
            userId: currentUser?.id,
            fullName: payload.fullName,
            phone: payload.phone,
            email: payload.email,
            message: payload.message,
            createdAt: new Date().toISOString(),
          },
          ...state.enquiries,
        ],
        adminDataFetchedAt: undefined,
      }));
    } catch (error) {
      set({ error: errorMessage(error) });
      throw error;
    }
  },
  createTest: async (payload) => {
    const test = await createTest(payload);
    const currentUser = useAuthStore.getState().user;
    activityLog.logAdminAction('TEST_CREATED', {
      adminUserId: currentUser?.id,
      adminName: currentUser?.fullName,
      targetId: test.id,
      targetName: test.title,
    });

    const questions = payload.questions.map((question, index) => ({
      id: `${test.id}_draft_${index + 1}`,
      testId: test.id,
      type: question.type,
      prompt: question.prompt,
      options: question.type === 'mcq' ? question.options : [],
      correctAnswer:
        question.type === 'integer'
          ? String(question.integerAnswer ?? '')
          : question.options[question.correctOptionIndex] ?? question.options[0] ?? '',
      integerAnswer: question.integerAnswer,
      explanation: question.explanation,
      imageUrl: question.imageUrl,
      subjectLabel: question.subjectLabel,
    }));

    set((state) => ({
      tests: [test, ...state.tests],
      questionCache: {
        ...state.questionCache,
        [test.id]: questions,
      },
    }));

    return test;
  },
  updateTest: async (payload) => {
    const updatedTest = await updateTest(payload);
    const currentUser = useAuthStore.getState().user;
    activityLog.logAdminAction('TEST_UPDATED', {
      adminUserId: currentUser?.id,
      adminName: currentUser?.fullName,
      targetId: updatedTest.id,
      targetName: updatedTest.title,
    });

    set((state) => ({
      tests: state.tests
        .map((test) => (test.id === updatedTest.id ? updatedTest : test))
        .sort((left, right) => new Date(left.scheduledAt).getTime() - new Date(right.scheduledAt).getTime()),
      studentInsights: undefined,
    }));

    return updatedTest;
  },
  setTestStarted: async (testId, isStarted) => {
    const updatedTest = await setTestStarted(testId, isStarted);
    const currentUser = useAuthStore.getState().user;
    activityLog.logAdminAction(isStarted ? 'TEST_STARTED' : 'TEST_STOPPED', {
      adminUserId: currentUser?.id,
      adminName: currentUser?.fullName,
      targetId: updatedTest.id,
      targetName: updatedTest.title,
    });

    set((state) => ({
      tests: state.tests.map((test) => (test.id === updatedTest.id ? updatedTest : test)),
    }));

    return updatedTest;
  },
  createBatch: async (payload) => {
    const batch = await createBatch(payload);
    const currentUser = useAuthStore.getState().user;
    activityLog.logAdminAction('BATCH_CREATED', {
      adminUserId: currentUser?.id,
      adminName: currentUser?.fullName,
      targetId: batch.id,
      targetName: batch.label,
    });

    set((state) => ({
      batches: [...state.batches, batch].sort((left, right) => left.label.localeCompare(right.label)),
    }));

    return batch;
  },
  assignBatch: async (payload) => {
    const updatedUser = await assignBatch(payload);
    const currentUser = useAuthStore.getState().user;
    activityLog.logAdminAction('USER_ROLE_CHANGED', {
      adminUserId: currentUser?.id,
      adminName: currentUser?.fullName,
      targetId: updatedUser.id,
      targetName: `${updatedUser.fullName} (${updatedUser.role})`,
    });
    const signedInUser = useAuthStore.getState().user;
    if (signedInUser?.id === updatedUser.id) {
      useAuthStore.getState().setUser(updatedUser);
    }
    set((state) => ({
      users: state.users.map((user) => (user.id === updatedUser.id ? updatedUser : user)),
    }));
    return updatedUser;
  },
  approveAdmin: async (userId) => {
    const updatedUser = await approveAdmin(userId);
    const currentUser = useAuthStore.getState().user;
    activityLog.logAdminAction('USER_ROLE_CHANGED', {
      adminUserId: currentUser?.id,
      adminName: currentUser?.fullName,
      targetId: updatedUser.id,
      targetName: `${updatedUser.fullName} (admin approved)`,
    });
    const signedInUser = useAuthStore.getState().user;
    if (signedInUser?.id === updatedUser.id) {
      useAuthStore.getState().setUser(updatedUser);
    }
    set((state) => ({
      users: state.users.map((user) => (user.id === updatedUser.id ? updatedUser : user)),
    }));
    return updatedUser;
  },
  deleteTest: async (testId) => {
    await deleteTest(testId);
    const currentUser = useAuthStore.getState().user;
    activityLog.logAdminAction('TEST_DELETED', {
      adminUserId: currentUser?.id,
      adminName: currentUser?.fullName,
      targetId: testId,
    });
    set((state) => ({
      tests: state.tests.filter((test) => test.id !== testId),
      questionCache: Object.fromEntries(Object.entries(state.questionCache).filter(([key]) => key !== testId)),
      testLeaderboards: Object.fromEntries(Object.entries(state.testLeaderboards).filter(([key]) => key !== testId)),
      testLeaderboardFetchedAt: Object.fromEntries(Object.entries(state.testLeaderboardFetchedAt).filter(([key]) => key !== testId)),
      analytics: {
        ...state.analytics,
        totalTests: Math.max(0, state.analytics.totalTests - 1),
      },
      studentInsights: undefined,
    }));
  },
  deleteBatch: async (batchId) => {
    await deleteBatch(batchId);
    const currentUser = useAuthStore.getState().user;
    activityLog.logAdminAction('BATCH_DELETED', {
      adminUserId: currentUser?.id,
      adminName: currentUser?.fullName,
      targetId: batchId,
    });
    const signedInUser = useAuthStore.getState().user;
    if (signedInUser?.batchId === batchId) {
      useAuthStore.getState().setUser({
        ...signedInUser,
        batchId: undefined,
        role: signedInUser.role === 'miitjee_student' ? 'student' : signedInUser.role,
      });
    }
    set((state) => ({
      batches: state.batches.filter((batch) => batch.id !== batchId),
      users: state.users.map((user) =>
        user.batchId === batchId
          ? {
              ...user,
              batchId: undefined,
              role: user.role === 'miitjee_student' ? 'student' : user.role,
            }
          : user,
      ),
      enrollmentQueries: state.enrollmentQueries.filter((query) => query.batchId !== batchId),
    }));
  },
  wipeLeaderboard: async () => {
    await wipeLeaderboard();
    const currentUser = useAuthStore.getState().user;
    activityLog.logAdminAction('LEADERBOARD_WIPED', {
      adminUserId: currentUser?.id,
      adminName: currentUser?.fullName,
    });
    set((state) => ({
      results: [],
      leaderboard: [],
      testLeaderboards: {},
      leaderboardByScope: {},
      leaderboardFetchedAt: undefined,
      leaderboardFetchedAtByScope: {},
      testLeaderboardFetchedAt: {},
      reviewCache: {},
      analytics: {
        ...state.analytics,
        totalAttempts: 0,
      },
      studentInsights: undefined,
    }));
  },
  deleteAttempt: async (attemptId) => {
    await deleteAttempt(attemptId);
    const currentUser = useAuthStore.getState().user;
    activityLog.logAdminAction('ATTEMPT_DELETED', {
      adminUserId: currentUser?.id,
      adminName: currentUser?.fullName,
      targetId: attemptId,
    });
    set((state) => ({
      results: state.results.filter((result) => result.id !== attemptId),
      reviewCache: Object.fromEntries(Object.entries(state.reviewCache).filter(([key]) => key !== attemptId)),
      analytics: {
        ...state.analytics,
        totalAttempts: Math.max(0, state.analytics.totalAttempts - 1),
      },
      studentInsights: undefined,
    }));
  },
  deleteEnrollmentQuery: async (queryId) => {
    await deleteEnrollmentQuery(queryId);
    set((state) => ({
      enrollmentQueries: state.enrollmentQueries.filter((query) => query.id !== queryId),
    }));
  },
  deleteScholarshipRegistration: async (registrationId) => {
    await deleteScholarshipRegistration(registrationId);
    set((state) => ({
      scholarshipRegistrations: state.scholarshipRegistrations.filter((entry) => entry.id !== registrationId),
    }));
  },
  deleteGeneralEnquiry: async (enquiryId) => {
    await deleteGeneralEnquiry(enquiryId);
    set((state) => ({
      enquiries: state.enquiries.filter((entry) => entry.id !== enquiryId),
    }));
  },
  reset: () =>
    set({
      courses: [],
      batches: [],
      tests: [],
      users: [],
      results: [],
      leaderboard: [],
      testLeaderboards: {},
      leaderboardByScope: {},
      leaderboardFetchedAt: undefined,
      leaderboardFetchedAtByScope: {},
      testLeaderboardFetchedAt: {},
      analytics: {
        totalUsers: 0,
        totalStudents: 0,
        totalAdmins: 0,
        totalTests: 0,
        totalQuestions: 0,
        totalAttempts: 0,
        avgScore: 0,
        attemptsLast24h: 0,
        activeStudentsLast7d: 0,
      },
      enquiries: [],
      enrollmentQueries: [],
      scholarshipRegistrations: [],
      autoSubmitEvents: [],
      violationAnalytics: [],
      studentInsights: undefined,
      studentInsightsFetchedAt: undefined,
      questionCache: {},
      reviewCache: {},
      questionBankSets: [],
      questionBankSelection: [],
      pendingQuestionBankImport: [],
      adminDataFetchedAt: undefined,
      isBootstrapping: false,
      isAdminDataLoading: false,
      isSubmitting: false,
      error: undefined,
    }),
}));
