export interface PersistedQuestionRecord {
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
}

export interface SaveQuestionsResult {
  success: boolean;
  setId: string;
  savedCount: number;
  approvedCount: number;
  needsReviewCount: number;
  questions: PersistedQuestionRecord[];
}

export declare function saveQuestionsToStore(params: {
  setId: string;
  questions: any[];
  backendUrl?: string;
}): Promise<SaveQuestionsResult>;
