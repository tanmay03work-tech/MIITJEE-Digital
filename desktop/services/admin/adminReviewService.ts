export interface ReviewQuestionRecord {
  id: string;
  set_id: string;
  question_number: string;
  question_text: string;
  options: string[];
  correct_answer: string;
  explanation: string;
  has_diagram: boolean;
  image_url: string | null;
  source_page: number;
  confidence_score: number;
  review_status: 'APPROVED' | 'NEEDS_REVIEW';
  review_reasons: string[];
  created_at: string;
  updated_at?: string;
}

export declare function fetchQuestionsForReview(params?: {
  status?: 'NEEDS_REVIEW' | 'APPROVED';
  setId?: string;
  backendUrl?: string;
}): Promise<ReviewQuestionRecord[]>;

export declare function approveQuestion(params: {
  questionId: string;
  updatedFields?: Partial<ReviewQuestionRecord>;
  backendUrl?: string;
}): Promise<ReviewQuestionRecord>;
