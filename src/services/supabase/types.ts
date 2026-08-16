export interface SupabaseSession {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  expires_at?: number;
  token_type: string;
  user: {
    id: string;
    email?: string;
    user_metadata?: Record<string, unknown>;
    app_metadata?: Record<string, unknown>;
  };
}

export interface ProfileRow {
  id: string;
  full_name: string;
  email: string;
  role: 'student' | 'miitjee_student' | 'admin';
  approval_status: 'approved' | 'pending';
  batch_id: string | null;
  target_exam: string;
  class_label: string;
  avatar_seed: string;
  rank: number | null;
  average_score: number | null;
  streak_days: number | null;
}

export interface CourseRow {
  id: string;
  title: string;
  category: string;
  rating: number;
  students: number;
  price_label: string;
  cover_color: string;
}

export interface BatchRow {
  id: string;
  label: string;
  target_exam: string;
  class_label: string;
  description: string | null;
  image_url: string | null;
}

export interface EnquiryRow {
  id: string;
  user_id: string | null;
  full_name: string;
  phone: string;
  email: string;
  message: string;
  created_at: string;
}

export interface TestRow {
  id: string;
  title: string;
  description: string;
  duration_minutes: number;
  question_count: number;
  batch_id: string | null;
  type: 'weekly' | 'scholarship';
  subject: string;
  scheduled_at: string;
  is_published: boolean;
  is_started: boolean;
  started_at: string | null;
  scholarship_admission_class: '8th' | '9th' | '10th' | 'jee' | 'neet' | null;
  scholarship_target_exam: 'boards' | 'jee' | 'neet' | null;
  share_code?: string | null;
  is_open_for_all?: boolean;
  is_link_revoked?: boolean;
  link_expires_at?: string | null;
}

export interface TestQuestionRow {
  id: string;
  test_id: string;
  question_type: 'mcq' | 'integer';
  prompt: string;
  options: string[];
  correct_answer: string;
  integer_answer: number | null;
  explanation: string;
  image_url: string | null;
  option_image_urls?: string[] | null;
  source_page?: number | null;
  source_region?: string | null;
  subject_label: string | null;
}

export interface SetRow {
  id: string;
  title: string;
  subject: string;
  created_at: string;
}

export interface QuestionRow {
  id: number;
  set_id: number;
  question: string;
  image_url: string | null;
  options: string[];
  correct_answer: string;
  type: 'mcq' | 'integer';
  explanation: string;
  created_at: string;
}

export interface LeaderboardRow {
  user_id: string;
  full_name: string;
  batch_id: string | null;
  score: number;
  percentile: number;
  rank: number;
  tests_attempted?: number;
  is_current_user?: boolean;
}

export interface ResultRow {
  id?: string;
  attempt_id?: string;
  result_id?: string;
  test_id: string;
  user_id: string;
  student_name?: string;
  score: number;
  correct_answers: number;
  wrong_answers?: number;
  unattempted?: number;
  total_questions: number;
  rank?: number;
  percentile: number;
  submitted_at: string;
}

export interface AnalyticsRow {
  total_users: number;
  total_students: number;
  total_admins: number;
  total_tests: number;
  total_questions: number;
  total_attempts: number;
  avg_score: number;
  attempts_last_24h: number;
  active_students_last_7d: number;
}

export interface ReviewRow {
  question_id: string;
  test_id: string;
  question_type: 'mcq' | 'integer';
  prompt: string;
  options: string[];
  user_answer: string;
  correct_answer: string;
  is_correct: boolean;
  is_unattempted?: boolean;
  explanation: string;
  image_url: string | null;
}

export interface QuestionAnalyticsRow {
  question_id: string;
  prompt: string;
  total_attempts: number;
  correct_count: number;
  accuracy_percent: number;
}

export interface TestAnalyticsRow {
  test_id: string;
  title: string;
  attempts: number;
  avg_score: number;
  highest_score: number;
}

export interface StudentAnalyticsRow {
  user_id: string;
  full_name: string;
  tests_attempted: number;
  avg_score: number;
  best_score: number;
  avg_percentile?: number;
}

export interface ViolationSummaryRow {
  user_id: string;
  full_name: string;
  email: string;
  batch_id: string | null;
  violation_count: number;
  last_violation_at: string | null;
  last_violation_type: string | null;
  is_suspicious: boolean;
}

export interface AutoSubmitEventRow {
  event_id: number | string;
  user_id: string;
  full_name: string;
  email: string;
  batch_id: string | null;
  test_id: string;
  test_title: string;
  auto_submitted_at: string;
}

export interface EnrollmentQueryRow {
  id: string;
  user_id: string;
  full_name: string;
  email: string;
  batch_id: string;
  batch_label: string;
  phone: string;
  message: string;
  status: string;
  created_at: string;
}

export interface ScholarshipRegistrationRow {
  id: string;
  test_id: string;
  test_title: string;
  user_id: string;
  full_name: string;
  email: string;
  phone: string;
  city: string;
  class_label: string;
  target_exam: string;
  created_at: string;
}

export interface SubmitAttemptRpcResponse {
  result: ResultRow;
  leaderboard?: LeaderboardRow[];
  overall_leaderboard?: LeaderboardRow[];
  user?: ProfileRow | null;
}

export interface StudentInsightSummaryRow {
  tests_attempted: number;
  avg_score: number;
  avg_percentile: number;
  best_score: number;
  best_percentile: number;
  latest_score: number;
  latest_percentile: number;
  improvement_score: number;
}

export interface StudentInsightHistoryRow {
  attempt_id: string;
  test_id: string;
  test_title: string;
  subject: string;
  score: number;
  percentile: number;
  rank: number;
  submitted_at: string;
}

export interface StudentSubjectInsightRow {
  subject: string;
  attempts: number;
  total_questions: number;
  correct_answers: number;
  accuracy_percent: number;
  avg_score: number;
  avg_percentile: number;
  latest_score: number;
  latest_percentile: number;
  recent_delta: number;
}

export interface StudentInsightsRpcResponse {
  summary: StudentInsightSummaryRow;
  history: StudentInsightHistoryRow[];
  subject_breakdown: StudentSubjectInsightRow[];
  weak_areas: StudentSubjectInsightRow[];
}

export interface ActivityLogRow {
  id: string;
  user_id: string | null;
  student_name: string | null;
  category: string;
  event_type: string;
  status: string;
  device_info: string | null;
  details: Record<string, unknown> | null;
  created_at: string;
}

export interface PdfNativeQuestionRow {
  id: string;
  pdf_id: string;
  pdf_url: string;
  question_number: string;
  page_start: number;
  page_end: number;
  bbox: { x: number; y: number; width: number; height: number };
  regions?: Array<{ id: string; pageNumber: number; bbox: { x: number; y: number; width: number; height: number }; role?: string; orderIndex: number; label?: string }>;
  subject: string;
  chapter: string | null;
  topic: string | null;
  question_type: string;
  correct_answer: string | null;
  marks: number;
  negative_marks: number;
  review_status: string;
  raw_text: string | null;
  created_at: string;
  updated_at: string;
}

export interface PdfNativeTestRow {
  id: string;
  title: string;
  description: string | null;
  duration_minutes: number;
  subject: string;
  total_questions: number;
  status: 'DRAFT' | 'READY' | 'LIVE' | 'ARCHIVED';
  visibility?: 'OPEN_FOR_ALL' | 'BATCH_ONLY';
  starts_at?: string;
  ends_at?: string | null;
  created_at: string;
  updated_at: string;
}

export interface PdfNativeTestSetRow {
  id: string;
  test_id: string;
  set_id: string;
  order_index: number;
  created_at: string;
}

export interface PdfNativeTestBatchAccessRow {
  id: string;
  test_id: string;
  batch_id: string;
  created_at: string;
}

export interface PdfNativeTestSectionRow {
  id: string;
  test_id: string;
  set_id?: string | null;
  subject: string;
  question_type?: string;
  section_order: number;
  question_start: number;
  question_end: number;
  mcq_count: number;
  integer_count: number;
  correct_marks: number;
  negative_marks: number;
  created_at: string;
  updated_at: string;
}

export interface PdfNativeTestQuestionRow {
  id: string;
  test_id: string;
  question_id: string;
  order_index: number;
  created_at: string;
}

export interface PdfNativeAttemptRow {
  id: string;
  test_id: string;
  user_id: string | null;
  student_name: string | null;
  total_questions: number;
  attempted_count: number;
  correct_count: number;
  wrong_count: number;
  unattempted_count: number;
  total_score: number;
  created_at: string;
}

export interface PdfNativeAttemptAnswerRow {
  id: string;
  attempt_id: string;
  question_id: string;
  question_number: string;
  selected_answer: string | null;
  correct_answer: string;
  status: 'CORRECT' | 'WRONG' | 'UNATTEMPTED';
  awarded_marks: number;
  created_at: string;
}

export interface PdfNativeSetRow {
  id: string;
  set_name: string;
  source_pdf_id: string;
  pdf_url: string | null;
  subject: string;
  description: string | null;
  total_questions: number;
  status: 'DRAFT' | 'READY' | 'ARCHIVED';
  created_at: string;
  updated_at: string;
}

export interface PdfNativeSetQuestionRow {
  id: string;
  set_id: string;
  question_id: string;
  order_index: number;
  created_at: string;
}


