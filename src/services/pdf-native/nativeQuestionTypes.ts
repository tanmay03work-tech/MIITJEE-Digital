import { PdfNativeBBox, QuestionSubject, QuestionType } from './pdfNativeTypes';

export type NativeRenderingStatus = 'NATIVE_READY' | 'NEEDS_REVIEW' | 'FAILED';

export type NativeBlockType = 'TEXT' | 'FORMULA' | 'IMAGE' | 'TABLE';

export interface NativeTextBlock {
  type: 'TEXT';
  content: string;
  isHeading?: boolean;
  orderIndex: number;
}

export interface NativeFormulaBlock {
  type: 'FORMULA';
  latex?: string;
  rawText: string;
  isBlockMath?: boolean;
  orderIndex: number;
}

export interface NativeImageBlock {
  type: 'IMAGE';
  id: string;
  bbox: PdfNativeBBox;
  imageUrl?: string;
  svgData?: string;
  caption?: string;
  orderIndex: number;
}

export interface NativeTableBlock {
  type: 'TABLE';
  headers?: string[];
  rows: string[][];
  orderIndex: number;
}

export type NativeQuestionBlock =
  | NativeTextBlock
  | NativeFormulaBlock
  | NativeImageBlock
  | NativeTableBlock;

export interface NativeOptionItem {
  id: string;
  label: 'A' | 'B' | 'C' | 'D' | string;
  text: string;
  visualAssetUrl?: string | null;
  isCorrect?: boolean;
}

export interface NativeDiagramItem {
  id: string;
  bbox: PdfNativeBBox;
  imageUrl?: string;
  caption?: string;
}

export interface NativeQuestionStructure {
  id: string;
  pdfId: string;
  questionNumber: string;
  subject: QuestionSubject;
  questionType: QuestionType;
  pageNumber: number;
  bbox: PdfNativeBBox;
  promptText: string;
  blocks: NativeQuestionBlock[];
  options: NativeOptionItem[];
  diagrams: NativeDiagramItem[];
  correctAnswer: string | null;
  marks: number;
  negativeMarks: number;
  status: NativeRenderingStatus;
  reviewReason?: string;
  rawText?: string;
}
