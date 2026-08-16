export interface AnswerKeyEntry {
  correct_answer: string;
  explanation?: string;
}

export type AnswerKeyMap = Record<string, AnswerKeyEntry | string>;

export declare function parseAnswerKeyGridText(rawText: string): Record<string, string>;

export declare function extractAnswerKeyMap(params: {
  pdfPath: string;
  pageNumber: number;
  dpi?: number;
  backendUrl?: string;
}): Promise<Record<string, AnswerKeyEntry>>;

export declare function reconcileQuestionsWithAnswerKey(
  questions: any[],
  answerKeyMap: AnswerKeyMap
): any[];
