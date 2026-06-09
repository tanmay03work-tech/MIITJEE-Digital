export type UserRole = 'student' | 'miitjee_student' | 'admin';
export type ApprovalStatus = 'approved' | 'pending';
export type TestType = 'weekly' | 'scholarship';
export type QuestionType = 'mcq' | 'integer';
export type LeaderboardScope = 'overall_history' | 'test_wise';
export type ScholarshipAdmissionClass = '8th' | '9th' | '10th' | 'jee' | 'neet';
export type ScholarshipTargetExam = 'boards' | 'jee' | 'neet';
export type QuickActionTarget =
  | 'tests'
  | 'leaderboard'
  | 'profile'
  | 'batches'
  | 'enquiry'
  | 'terms'
  | 'privacy'
  | 'admin'
  | 'create-test'
  | 'manage-users'
  | 'results'
  | 'scholarship-registrations'
  | 'batch-access-requests'
  | 'general-enquiries';

export interface AppUser {
  id: string;
  fullName: string;
  email: string;
  role: UserRole;
  approvalStatus: ApprovalStatus;
  batchId?: string;
  targetExam: string;
  classLabel: string;
  rank: number;
  averageScore: number;
  streakDays: number;
  avatarSeed: string;
}

export interface Course {
  id: string;
  title: string;
  category: string;
  rating: number;
  students: number;
  priceLabel: string;
  coverColor: string;
}

export interface Batch {
  id: string;
  label: string;
  targetExam: string;
  classLabel: string;
  description?: string;
  imageUrl?: string | null;
}

export interface TestItem {
  id: string;
  title: string;
  description: string;
  durationMinutes: number;
  questionCount: number;
  batchId?: string;
  type: TestType;
  subject: string;
  scheduledAt: string;
  isPublished: boolean;
  isStarted: boolean;
  startedAt?: string | null;
  scholarshipAdmissionClass?: ScholarshipAdmissionClass;
  scholarshipTargetExam?: ScholarshipTargetExam;
}

export interface TestQuestion {
  id: string;
  testId: string;
  type: QuestionType;
  prompt: string;
  options: string[];
  correctAnswer: string;
  integerAnswer?: number;
  explanation: string;
  imageUrl?: string | null;
  subjectLabel?: string;
}

export interface TestResult {
  id: string;
  testId: string;
  userId: string;
  score: number;
  correctAnswers: number;
  totalQuestions: number;
  rank: number;
  percentile: number;
  submittedAt: string;
}

export interface TestAttemptReviewItem {
  questionId: string;
  testId: string;
  questionType: QuestionType;
  prompt: string;
  options: string[];
  userAnswer: string;
  correctAnswer: string;
  isCorrect: boolean;
  explanation: string;
  imageUrl?: string | null;
}

export interface LeaderboardEntry {
  userId: string;
  fullName: string;
  batchId?: string;
  score: number;
  percentile: number;
  rank: number;
  testsAttempted?: number;
  isCurrentUser?: boolean;
}

export interface AnalyticsSnapshot {
  totalUsers: number;
  totalStudents: number;
  totalAdmins: number;
  totalTests: number;
  totalQuestions: number;
  totalAttempts: number;
  avgScore: number;
  attemptsLast24h: number;
  activeStudentsLast7d: number;
}

export interface QuestionAnalytics {
  questionId: string;
  prompt: string;
  totalAttempts: number;
  correctCount: number;
  accuracyPercent: number;
}

export interface TestAnalytics {
  testId: string;
  title: string;
  attempts: number;
  avgScore: number;
  highestScore: number;
}

export interface StudentAnalytics {
  userId: string;
  fullName: string;
  testsAttempted: number;
  avgScore: number;
  bestScore: number;
  avgPercentile?: number;
}

export interface ViolationSummary {
  userId: string;
  fullName: string;
  email: string;
  batchId?: string;
  violationCount: number;
  lastViolationAt?: string;
  lastViolationType?: string;
  isSuspicious: boolean;
}

export interface AutoSubmitEvent {
  eventId: string;
  userId: string;
  fullName: string;
  email: string;
  batchId?: string;
  testId: string;
  testTitle: string;
  autoSubmittedAt: string;
}

export interface StudentInsightSummary {
  testsAttempted: number;
  avgScore: number;
  avgPercentile: number;
  bestScore: number;
  bestPercentile: number;
  latestScore: number;
  latestPercentile: number;
  improvementScore: number;
}

export interface StudentInsightHistoryItem {
  attemptId: string;
  testId: string;
  testTitle: string;
  subject: string;
  score: number;
  percentile: number;
  rank: number;
  submittedAt: string;
}

export interface StudentSubjectInsight {
  subject: string;
  attempts: number;
  totalQuestions: number;
  correctAnswers: number;
  accuracyPercent: number;
  avgScore: number;
  avgPercentile: number;
  latestScore: number;
  latestPercentile: number;
  recentDelta: number;
}

export interface StudentInsights {
  summary: StudentInsightSummary;
  history: StudentInsightHistoryItem[];
  subjectBreakdown: StudentSubjectInsight[];
  weakAreas: StudentSubjectInsight[];
}

export interface QuickAction {
  id: string;
  label: string;
  subtitle: string;
  color: string;
  target: QuickActionTarget;
}

export interface CreateTestQuestionPayload {
  type: QuestionType;
  prompt: string;
  options: string[];
  correctOptionIndex: number;
  integerAnswer?: number;
  explanation: string;
  imageUrl?: string | null;
  subjectLabel?: string;
}

export interface CreateTestPayload {
  title: string;
  description: string;
  durationMinutes: number;
  scheduledAt: string;
  batchId?: string;
  type: TestType;
  subject: string;
  scholarshipAdmissionClass?: ScholarshipAdmissionClass;
  scholarshipTargetExam?: ScholarshipTargetExam;
  questions: CreateTestQuestionPayload[];
}

export interface UpdateTestPayload {
  testId: string;
  title: string;
  description: string;
  durationMinutes: number;
  scheduledAt: string;
  batchId?: string;
  type: TestType;
  subject: string;
  scholarshipAdmissionClass?: ScholarshipAdmissionClass;
  scholarshipTargetExam?: ScholarshipTargetExam;
}

export interface SubmitAttemptPayload {
  testId: string;
  userId: string;
  answers: Record<string, string>;
}

export interface SubmittedTestResponse {
  result: TestResult;
  testLeaderboard: LeaderboardEntry[];
  overallLeaderboard: LeaderboardEntry[];
  user?: AppUser;
}

export interface PdfImportPayload {
  pdfUrl: string;
  testTitle?: string;
  subject?: string;
  startQuestionNumber?: number;
  importMode?: 'replace' | 'append';
}

export interface PdfImportResponse {
  questions: Array<{
    type: QuestionType;
    question: string;
    options: string[];
    correctAnswer: string;
    integerAnswer?: number;
    explanation: string;
    image: string | null;
    has_image?: boolean;
  }>;
  warnings: string[];
  provider?: 'openai' | 'gemini';
  ocrTextPreview?: string;
}

export interface QuestionBankSet {
  setId: number;
  pdfName: string;
  questionCount: number;
  createdAt: string;
}

export interface QuestionBankQuestion {
  id: number;
  setId: number;
  question: string;
  options: string[];
  type: QuestionType;
  imageUrl?: string | null;
  correctAnswer: string;
}

export interface AssignBatchPayload {
  userId: string;
  batchId?: string;
  promoteToMiitjeeStudent?: boolean;
}

export interface CreateBatchPayload {
  id?: string;
  label: string;
  targetExam: string;
  classLabel: string;
  description: string;
  imageUrl?: string | null;
}

export interface EnrollmentQueryPayload {
  batchId: string;
  phone: string;
  message: string;
}

export interface EnquiryPayload {
  fullName: string;
  phone: string;
  email: string;
  message: string;
}

export interface ScholarshipRegistrationPayload {
  testId: string;
  fullName: string;
  email: string;
  phone: string;
  city: string;
  classLabel: ScholarshipAdmissionClass;
  targetExam: ScholarshipTargetExam;
}

export interface EnrollmentQueryRecord {
  id: string;
  userId: string;
  fullName: string;
  email: string;
  batchId: string;
  batchLabel: string;
  phone: string;
  message: string;
  status: string;
  createdAt: string;
}

export interface ScholarshipRegistrationRecord {
  id: string;
  testId: string;
  testTitle: string;
  userId: string;
  fullName: string;
  email: string;
  phone: string;
  city: string;
  classLabel: ScholarshipAdmissionClass;
  targetExam: ScholarshipTargetExam;
  createdAt: string;
}

export interface EnquiryRecord {
  id: string;
  fullName: string;
  phone: string;
  email: string;
  message: string;
  createdAt: string;
  userId?: string;
}

export interface SignInPayload {
  email: string;
  password: string;
}

export interface SignUpPayload {
  fullName: string;
  email: string;
  password: string;
  requestedRole: 'student' | 'admin';
}
