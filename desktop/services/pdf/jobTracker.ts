export interface ImportJobState {
  job_id: string;
  pdf_name: string;
  total_pages: number;
  processed_pages: number;
  last_processed_page: number;
  questions_detected: number;
  questions_created: number;
  diagrams_detected: number;
  diagrams_uploaded: number;
  needs_review_count: number;
  status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
  error_log: string[];
  created_at: string;
  updated_at: string;
}

export declare function createOrResumeJob(params: {
  jobId: string;
  pdfName: string;
  totalPages: number;
  backendUrl?: string;
}): Promise<{ isResumed: boolean; job: ImportJobState }>;

export declare function updateJobProgress(params: {
  jobId: string;
  lastProcessedPage: number;
  questionsDetected?: number;
  questionsCreated?: number;
  diagramsDetected?: number;
  diagramsUploaded?: number;
  needsReviewCount?: number;
  status?: string;
  backendUrl?: string;
}): Promise<ImportJobState>;

export declare function getJobStatus(
  jobId: string,
  backendUrl?: string
): Promise<ImportJobState>;
