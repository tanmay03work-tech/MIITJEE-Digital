export interface BackendPdfNativeBBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type BackendReviewStatus = 'DRAFT' | 'NEEDS_REVIEW' | 'APPROVED' | 'REJECTED';

export interface BackendPdfNativeQuestion {
  id: string;
  pdf_id: string;
  pdf_url?: string;
  question_number: string;
  page_start: number;
  page_end: number;
  bbox: BackendPdfNativeBBox;
  subject: string;
  chapter?: string | null;
  topic?: string | null;
  question_type: string;
  correct_answer?: string | null;
  marks: number;
  negative_marks: number;
  review_status: BackendReviewStatus;
  column_index?: number;
  raw_detected_text?: string;
  notes?: string;
}

export interface SavePdfNativeBankRequest {
  pdf_id: string;
  pdf_url?: string;
  questions: BackendPdfNativeQuestion[];
}

export interface SavePdfNativeBankResponse {
  success: boolean;
  pdf_id: string;
  total_questions: number;
  saved_count: number;
  updated_count: number;
  approved_count: number;
  needs_review_count: number;
  rejected_count: number;
  errors?: string[];
}

export type BackendTestStatus = 'DRAFT' | 'READY';

export interface CreateBackendPdfNativeTestRequest {
  title: string;
  description?: string;
  duration_minutes: number;
  subject: string;
  status: BackendTestStatus;
  question_ids: string[];
}

export interface BackendPdfNativeTest {
  id: string;
  title: string;
  description?: string | null;
  duration_minutes: number;
  subject: string;
  total_questions: number;
  status: BackendTestStatus;
  created_at: string;
  updated_at: string;
}

export interface BackendPdfNativeTestQuestion {
  id: string;
  test_id: string;
  question_id: string;
  order_index: number;
  created_at: string;
}

export type BackendQuestionSubmissionStatus = 'CORRECT' | 'WRONG' | 'UNATTEMPTED';

export interface BackendPdfNativeAttemptAnswer {
  question_id: string;
  question_number: string;
  selected_answer: string | null;
  correct_answer: string;
  status: BackendQuestionSubmissionStatus;
  awarded_marks: number;
  subject: string;
}

export interface BackendPdfNativeAttempt {
  id: string;
  test_id: string;
  user_id?: string | null;
  student_name?: string | null;
  total_questions: number;
  attempted_count: number;
  correct_count: number;
  wrong_count: number;
  unattempted_count: number;
  total_score: number;
  answers: BackendPdfNativeAttemptAnswer[];
  created_at: string;
}

export interface SubmitBackendPdfNativeAttemptRequest {
  testId: string;
  userId?: string;
  studentName?: string;
  answers: Record<string, string>;
}

export interface BackendSubjectScoreBreakdown {
  subject: string;
  total_questions: number;
  correct_count: number;
  wrong_count: number;
  unattempted_count: number;
  attempted_count: number;
  score: number;
  max_marks: number;
  percentage: number;
}

export interface BackendPdfNativeResultPayload {
  attempt_id: string;
  student_name: string;
  test_id: string;
  test_title: string;
  test_subject: string;
  is_single_subject: boolean;
  subjects: BackendSubjectScoreBreakdown[];
  total: BackendSubjectScoreBreakdown;
  percentile: number | null;
  percentile_message?: string;
}

export interface BackendPdfNativeReviewQuestion {
  question_id: string;
  question_number: string;
  subject: string;
  page_start: number;
  page_end: number;
  bbox: BackendPdfNativeBBox;
  pdf_id: string;
  pdf_url?: string;
  selected_answer: string | null;
  correct_answer: string | null;
  status: BackendQuestionSubmissionStatus;
  awarded_marks: number;
}

export interface BackendPdfNativeReviewPayload {
  attempt_id: string;
  student_name: string;
  test_id: string;
  test_title: string;
  test_subject: string;
  is_single_subject: boolean;
  questions: BackendPdfNativeReviewQuestion[];
}
