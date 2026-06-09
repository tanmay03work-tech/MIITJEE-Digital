import {
  AnalyticsSnapshot,
  AutoSubmitEvent,
  AppUser,
  Batch,
  Course,
  EnquiryRecord,
  EnrollmentQueryRecord,
  LeaderboardEntry,
  PdfImportResponse,
  QuestionAnalytics,
  ScholarshipRegistrationRecord,
  StudentAnalytics,
  StudentInsights,
  SubmittedTestResponse,
  TestAnalytics,
  TestItem,
  TestAttemptReviewItem,
  TestQuestion,
  TestResult,
  ViolationSummary,
} from '../../types';
import { appEnv } from '../../config/env';
import { normalizeExamText } from '../../utils/examText';
import { coerceDurationMinutes } from '../../utils/formatters';
import {
  AnalyticsRow,
  AutoSubmitEventRow,
  BatchRow,
  CourseRow,
  EnquiryRow,
  EnrollmentQueryRow,
  LeaderboardRow,
  ProfileRow,
  QuestionAnalyticsRow,
  ResultRow,
  ReviewRow,
  ScholarshipRegistrationRow,
  StudentAnalyticsRow,
  StudentInsightsRpcResponse,
  StudentSubjectInsightRow,
  SubmitAttemptRpcResponse,
  StudentInsightHistoryRow,
  StudentInsightSummaryRow,
  TestAnalyticsRow,
  TestQuestionRow,
  TestRow,
  ViolationSummaryRow,
} from './types';

function normalizeAssetUrl(value?: string | null) {
  if (!value) {
    return undefined;
  }

  if (value.startsWith('http://') || value.startsWith('https://')) {
    return value;
  }

  if (value.startsWith('/storage/v1/')) {
    return `${appEnv.supabaseUrl}${value}`;
  }

  const cleaned = value.replace(/^\/+/, '');
  return `${appEnv.supabaseUrl}/storage/v1/object/public/exam-assets/${cleaned}`;
}

export function mapProfile(row: ProfileRow): AppUser {
  return {
    id: row.id,
    fullName: row.full_name,
    email: row.email,
    role: row.role,
    approvalStatus: row.approval_status,
    batchId: row.batch_id ?? undefined,
    targetExam: row.target_exam,
    classLabel: row.class_label,
    avatarSeed: row.avatar_seed,
    rank: row.rank ?? 0,
    averageScore: row.average_score ?? 0,
    streakDays: row.streak_days ?? 0,
  };
}

export function mapCourse(row: CourseRow): Course {
  return {
    id: row.id,
    title: row.title,
    category: row.category,
    rating: row.rating,
    students: row.students,
    priceLabel: row.price_label,
    coverColor: row.cover_color,
  };
}

export function mapBatch(row: BatchRow): Batch {
  return {
    id: row.id,
    label: row.label,
    targetExam: row.target_exam,
    classLabel: row.class_label,
    description: row.description ?? '',
    imageUrl: normalizeAssetUrl(row.image_url),
  };
}

export function mapEnquiry(row: EnquiryRow): EnquiryRecord {
  return {
    id: row.id,
    userId: row.user_id ?? undefined,
    fullName: row.full_name,
    phone: row.phone,
    email: row.email,
    message: row.message,
    createdAt: row.created_at,
  };
}

export function mapTest(row: TestRow): TestItem {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    durationMinutes: coerceDurationMinutes(row.duration_minutes),
    questionCount: row.question_count,
    batchId: row.batch_id ?? undefined,
    type: row.type,
    subject: row.subject,
    scheduledAt: row.scheduled_at,
    isPublished: row.is_published,
    isStarted: row.is_started ?? false,
    startedAt: row.started_at ?? undefined,
    scholarshipAdmissionClass: row.scholarship_admission_class ?? undefined,
    scholarshipTargetExam: row.scholarship_target_exam ?? undefined,
  };
}

export function mapQuestion(row: TestQuestionRow): TestQuestion {
  return {
    id: row.id,
    testId: row.test_id,
    type: row.question_type,
    prompt: row.prompt,
    options: row.options,
    correctAnswer: row.correct_answer,
    integerAnswer: row.integer_answer ?? undefined,
    explanation: row.explanation,
    imageUrl: normalizeAssetUrl(row.image_url),
    subjectLabel: row.subject_label ?? undefined,
  };
}

export function mapResult(row: ResultRow): TestResult {
  return {
    id: row.id,
    testId: row.test_id,
    userId: row.user_id,
    score: row.score,
    correctAnswers: row.correct_answers,
    totalQuestions: row.total_questions,
    rank: row.rank,
    percentile: row.percentile,
    submittedAt: row.submitted_at,
  };
}

export function mapLeaderboard(row: LeaderboardRow): LeaderboardEntry {
  return {
    userId: row.user_id,
    fullName: row.full_name,
    batchId: row.batch_id ?? undefined,
    score: row.score,
    percentile: row.percentile,
    rank: row.rank,
    testsAttempted: row.tests_attempted,
    isCurrentUser: row.is_current_user,
  };
}

export function mapAnalytics(row: AnalyticsRow | null): AnalyticsSnapshot {
  return {
    totalUsers: row?.total_users ?? 0,
    totalStudents: row?.total_students ?? 0,
    totalAdmins: row?.total_admins ?? 0,
    totalTests: row?.total_tests ?? 0,
    totalQuestions: row?.total_questions ?? 0,
    totalAttempts: row?.total_attempts ?? 0,
    avgScore: row?.avg_score ?? 0,
    attemptsLast24h: row?.attempts_last_24h ?? 0,
    activeStudentsLast7d: row?.active_students_last_7d ?? 0,
  };
}

export function mapSubmittedAttempt(response: SubmitAttemptRpcResponse): SubmittedTestResponse {
  return {
    result: mapResult(response.result),
    testLeaderboard: (response.leaderboard ?? []).map(mapLeaderboard),
    overallLeaderboard: (response.overall_leaderboard ?? []).map(mapLeaderboard),
    user: response.user?.id ? mapProfile(response.user) : undefined,
  };
}

export function mapReviewRow(row: ReviewRow): TestAttemptReviewItem {
  return {
    questionId: row.question_id,
    testId: row.test_id,
    questionType: row.question_type,
    prompt: row.prompt,
    options: row.options,
    userAnswer: row.user_answer,
    correctAnswer: row.correct_answer,
    isCorrect: row.is_correct,
    explanation: row.explanation,
    imageUrl: normalizeAssetUrl(row.image_url),
  };
}

export function mapQuestionAnalytics(row: QuestionAnalyticsRow): QuestionAnalytics {
  return {
    questionId: row.question_id,
    prompt: row.prompt,
    totalAttempts: row.total_attempts,
    correctCount: row.correct_count,
    accuracyPercent: row.accuracy_percent,
  };
}

export function mapTestAnalytics(row: TestAnalyticsRow): TestAnalytics {
  return {
    testId: row.test_id,
    title: row.title,
    attempts: row.attempts,
    avgScore: row.avg_score,
    highestScore: row.highest_score,
  };
}

export function mapStudentAnalytics(row: StudentAnalyticsRow): StudentAnalytics {
  return {
    userId: row.user_id,
    fullName: row.full_name,
    testsAttempted: row.tests_attempted,
    avgScore: row.avg_score,
    bestScore: row.best_score,
    avgPercentile: row.avg_percentile,
  };
}

export function mapViolationSummary(row: ViolationSummaryRow): ViolationSummary {
  return {
    userId: row.user_id,
    fullName: row.full_name,
    email: row.email,
    batchId: row.batch_id ?? undefined,
    violationCount: row.violation_count,
    lastViolationAt: row.last_violation_at ?? undefined,
    lastViolationType: row.last_violation_type ?? undefined,
    isSuspicious: row.is_suspicious,
  };
}

export function mapAutoSubmitEvent(row: AutoSubmitEventRow): AutoSubmitEvent {
  return {
    eventId: String(row.event_id),
    userId: row.user_id,
    fullName: row.full_name,
    email: row.email,
    batchId: row.batch_id ?? undefined,
    testId: row.test_id,
    testTitle: row.test_title,
    autoSubmittedAt: row.auto_submitted_at,
  };
}

function mapStudentInsightSummary(row: StudentInsightSummaryRow) {
  return {
    testsAttempted: row.tests_attempted,
    avgScore: row.avg_score,
    avgPercentile: row.avg_percentile,
    bestScore: row.best_score,
    bestPercentile: row.best_percentile,
    latestScore: row.latest_score,
    latestPercentile: row.latest_percentile,
    improvementScore: row.improvement_score,
  };
}

function mapStudentInsightHistory(row: StudentInsightHistoryRow) {
  return {
    attemptId: row.attempt_id,
    testId: row.test_id,
    testTitle: row.test_title,
    subject: row.subject,
    score: row.score,
    percentile: row.percentile,
    rank: row.rank,
    submittedAt: row.submitted_at,
  };
}

function mapStudentSubjectInsight(row: StudentSubjectInsightRow) {
  return {
    subject: row.subject,
    attempts: row.attempts,
    totalQuestions: row.total_questions,
    correctAnswers: row.correct_answers,
    accuracyPercent: row.accuracy_percent,
    avgScore: row.avg_score,
    avgPercentile: row.avg_percentile,
    latestScore: row.latest_score,
    latestPercentile: row.latest_percentile,
    recentDelta: row.recent_delta,
  };
}

export function mapStudentInsights(response: StudentInsightsRpcResponse): StudentInsights {
  return {
    summary: mapStudentInsightSummary(response.summary),
    history: response.history.map(mapStudentInsightHistory),
    subjectBreakdown: response.subject_breakdown.map(mapStudentSubjectInsight),
    weakAreas: response.weak_areas.map(mapStudentSubjectInsight),
  };
}

export function mapEnrollmentQuery(row: EnrollmentQueryRow): EnrollmentQueryRecord {
  return {
    id: row.id,
    userId: row.user_id,
    fullName: row.full_name,
    email: row.email,
    batchId: row.batch_id,
    batchLabel: row.batch_label,
    phone: row.phone,
    message: row.message,
    status: row.status,
    createdAt: row.created_at,
  };
}

export function mapScholarshipRegistration(row: ScholarshipRegistrationRow): ScholarshipRegistrationRecord {
  return {
    id: row.id,
    testId: row.test_id,
    testTitle: row.test_title,
    userId: row.user_id,
    fullName: row.full_name,
    email: row.email,
    phone: row.phone,
    city: row.city,
    classLabel: row.class_label as ScholarshipRegistrationRecord['classLabel'],
    targetExam: row.target_exam as ScholarshipRegistrationRecord['targetExam'],
    createdAt: row.created_at,
  };
}

export function mapPdfImportQuestion(question: PdfImportResponse['questions'][number]) {
  const normalizedQuestion = normalizeExamText(question.question);
  const normalizedOptions = question.type === 'mcq' ? question.options.map((option) => normalizeExamText(option)) : ['', '', '', ''];
  const normalizedCorrectAnswer = normalizeExamText(question.correctAnswer);

  return {
    type: question.type,
    prompt: normalizedQuestion,
    options: normalizedOptions,
    correctOptionIndex:
      question.type === 'mcq'
        ? Math.max(0, normalizedOptions.findIndex((option) => option === normalizedCorrectAnswer))
        : 0,
    integerAnswer: question.integerAnswer,
    explanation: normalizeExamText(question.explanation),
    imageUrl: question.image,
  };
}
