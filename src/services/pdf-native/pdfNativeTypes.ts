export interface PdfNativeBBox {
  x: number;      // X position in PDF points
  y: number;      // Y position in PDF points (top-left origin)
  width: number;  // Width in PDF points
  height: number; // Height in PDF points
}

export type QuestionReviewStatus = 'DRAFT' | 'NEEDS_REVIEW' | 'APPROVED' | 'REJECTED';

export type QuestionSubject = 'Physics' | 'Chemistry' | 'Mathematics' | 'Biology' | 'Other';

export type QuestionType = 'MCQ' | 'Numerical' | 'INTEGER' | 'Assertion-Reason' | 'Multiple Correct' | 'Other';

export type RegionRole = 'stem' | 'options' | 'diagram' | 'continuation' | 'table';

export interface PdfNativeRegion {
  id: string;
  pageNumber: number;
  bbox: PdfNativeBBox;
  role?: RegionRole;
  orderIndex: number;
  label?: string;
}

export interface PdfNativeQuestion {
  id: string;
  pdf_id: string;
  pdf_url?: string;
  question_number: string;
  page_start: number;
  page_end: number;
  bbox: PdfNativeBBox;
  regions?: PdfNativeRegion[];
  subject: QuestionSubject;
  chapter?: string | null;
  topic?: string | null;
  question_type: QuestionType;
  correct_answer: string | null;
  marks: number;
  negative_marks: number;
  review_status: QuestionReviewStatus;
  column_index?: number;
  raw_detected_text?: string;
  notes?: string;
}

export interface PdfTextItem {
  str: string;
  x: number;
  y: number;        // top-left Y coordinate in points
  width: number;
  height: number;
  pageNumber: number;
  columnIndex?: number;
}

export interface PdfPageMetadata {
  pageNumber: number;
  width: number;  // page width in PDF points
  height: number; // page height in PDF points
  items: PdfTextItem[];
}

export interface PdfParseResult {
  pdfId: string;
  title: string;
  totalPages: number;
  questions: PdfNativeQuestion[];
  pagesMetadata: PdfPageMetadata[];
}

export type PdfNativeSetStatus = 'DRAFT' | 'READY' | 'ARCHIVED';

export interface PdfNativeSet {
  id: string;
  set_name: string;
  source_pdf_id: string;
  pdf_url?: string | null;
  subject: QuestionSubject;
  description?: string | null;
  total_questions: number;
  status: PdfNativeSetStatus;
  created_at?: string;
  updated_at?: string;
}

export interface PdfNativeSetQuestion {
  id: string;
  set_id: string;
  question_id: string;
  order_index: number;
  question?: PdfNativeQuestion;
  created_at?: string;
}

export interface CreatePdfNativeSetRequest {
  set_name: string;
  source_pdf_id: string;
  pdf_url?: string | null;
  subject: QuestionSubject;
  description?: string | null;
  status?: PdfNativeSetStatus;
  question_ids: string[];
}

export interface UpdatePdfNativeSetRequest {
  id: string;
  set_name?: string;
  subject?: QuestionSubject;
  description?: string | null;
  status?: PdfNativeSetStatus;
  question_ids?: string[];
}

export type PdfNativeTestStatus = 'DRAFT' | 'READY' | 'LIVE' | 'ARCHIVED';
export type TestVisibility = 'OPEN_FOR_ALL' | 'BATCH_ONLY';

export interface PdfNativeTestSection {
  id: string;
  test_id: string;
  set_id?: string | null;
  subject: QuestionSubject;
  question_type?: 'MCQ' | 'INTEGER';
  section_order: number;
  question_start: number; // 1-based start question index
  question_end: number;   // 1-based end question index
  total_questions?: number;
  mcq_count?: number;
  integer_count?: number;
  correct_marks?: number;
  negative_marks?: number;
  created_at?: string;
  updated_at?: string;
}

export interface PdfNativeTestSet {
  id: string;
  test_id: string;
  set_id: string;
  order_index: number;
  created_at?: string;
}

export interface PdfNativeTest {
  id: string;
  title: string;
  description?: string | null;
  duration_minutes: number;
  subject: string;
  exam_type?: 'single' | 'multi';
  total_questions: number;
  status: PdfNativeTestStatus;
  visibility?: TestVisibility;
  allowed_batches?: string[];
  set_ids?: string[];
  starts_at?: string;
  ends_at?: string | null;
  sections?: PdfNativeTestSection[];
  created_at?: string;
  updated_at?: string;
}

export interface PdfNativeTestQuestion {
  id: string;
  test_id: string;
  question_id: string;
  order_index: number;
  question?: PdfNativeQuestion;
  created_at?: string;
}

export interface CreatePdfNativeTestRequest {
  title: string;
  description?: string;
  duration_minutes: number;
  subject: string;
  exam_type?: 'single' | 'multi';
  status: PdfNativeTestStatus;
  visibility?: TestVisibility;
  allowed_batches?: string[];
  set_ids?: string[];
  starts_at?: string;
  ends_at?: string | null;
  question_ids: string[];
  sections?: PdfNativeTestSection[];
}

export interface UpdatePdfNativeTestRequest {
  id: string;
  title: string;
  description?: string | null;
  duration_minutes: number;
  subject: string;
  exam_type?: 'single' | 'multi';
  status: PdfNativeTestStatus;
  visibility?: TestVisibility;
  allowed_batches?: string[];
  set_ids?: string[];
  starts_at?: string;
  ends_at?: string | null;
  question_ids: string[];
  sections?: PdfNativeTestSection[];
}

export type QuestionSubmissionStatus = 'CORRECT' | 'WRONG' | 'UNATTEMPTED';

export interface PdfNativeAttemptAnswer {
  question_id: string;
  question_number: string;
  selected_answer: string | null;
  correct_answer: string;
  status: QuestionSubmissionStatus;
  awarded_marks: number;
  subject?: string;
}

export interface PdfNativeAttempt {
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
  answers: PdfNativeAttemptAnswer[];
  created_at?: string;
}

export interface SubmitPdfNativeAttemptPayload {
  testId: string;
  userId?: string;
  studentName?: string;
  answers: Record<string, string>;
}

export interface SubjectScoreBreakdown {
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

export interface PdfNativeResultPayload {
  attempt_id: string;
  student_name: string;
  test_id: string;
  test_title: string;
  test_subject: string;
  is_single_subject: boolean;
  subjects: SubjectScoreBreakdown[];
  total: SubjectScoreBreakdown;
  percentile: number | null;
  percentile_message?: string;
}

export interface PdfNativeReviewQuestion {
  question_id: string;
  question_number: string;
  subject: string;
  page_start: number;
  page_end: number;
  bbox: PdfNativeBBox;
  pdf_id: string;
  pdf_url?: string;
  selected_answer: string | null;
  correct_answer: string | null;
  status: QuestionSubmissionStatus;
  awarded_marks: number;
}

export interface PdfNativeReviewPayload {
  attempt_id: string;
  student_name: string;
  test_id: string;
  test_title: string;
  test_subject: string;
  is_single_subject: boolean;
  questions: PdfNativeReviewQuestion[];
}
