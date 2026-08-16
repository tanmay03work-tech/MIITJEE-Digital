import AsyncStorage from '@react-native-async-storage/async-storage';
import { CreateTestQuestionPayload, ScholarshipAdmissionClass, ScholarshipTargetExam, TestType } from '../types';

export const EXAM_DRAFT_STORAGE_KEY = 'miitjee:exam-creation-draft';

export interface ExamCreationDraft {
  title: string;
  description: string;
  durationMinutes: string;
  subjectMode: 'single' | 'multi';
  primarySubject: string;
  type: TestType;
  batchId: string;
  scheduleDate: string;
  scheduleTime: string;
  scholarshipAdmissionClass: ScholarshipAdmissionClass;
  scholarshipTargetExam: ScholarshipTargetExam;
  questions: CreateTestQuestionPayload[];
  subjectRangePlan: string;
  isOpenForAll: boolean;
  correctMarks: string;
  wrongMarks: string;
  unattemptedMarks: string;
  status: 'DRAFT' | 'PUBLISHED' | 'ENDED' | 'ARCHIVED';
  savedAt: string;
}

export async function saveExamCreationDraft(draft: Omit<ExamCreationDraft, 'savedAt'>): Promise<void> {
  try {
    const payload: ExamCreationDraft = {
      ...draft,
      savedAt: new Date().toISOString(),
    };
    await AsyncStorage.setItem(EXAM_DRAFT_STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // Best-effort local persistence
  }
}

export async function loadExamCreationDraft(): Promise<ExamCreationDraft | null> {
  try {
    const raw = await AsyncStorage.getItem(EXAM_DRAFT_STORAGE_KEY);
    if (!raw) {
      return null;
    }
    return JSON.parse(raw) as ExamCreationDraft;
  } catch {
    return null;
  }
}

export async function clearExamCreationDraft(): Promise<void> {
  try {
    await AsyncStorage.removeItem(EXAM_DRAFT_STORAGE_KEY);
  } catch {
    // Best-effort removal
  }
}
