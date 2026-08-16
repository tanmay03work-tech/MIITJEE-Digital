export interface QuestionExtractionResult {
  question_number: string;
  question_text: string;
  options: string[];
  correct_answer: string;
  explanation: string;
  has_diagram: boolean;
  diagram_bbox: [number, number, number, number]; // [ymin, xmin, ymax, xmax] 0-1000
  source_page: number;
  has_complex_math: boolean;
  confidence_score: number;
}

export interface VisionAnalysisOptions {
  base64Png: string;
  pageNumber: number;
  backendUrl?: string;
  apiKey?: string;
}

export declare function analyzePageWithGeminiVision(
  options: VisionAnalysisOptions
): Promise<QuestionExtractionResult[]>;
