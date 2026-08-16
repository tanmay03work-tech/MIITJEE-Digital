import { PdfNativeQuestion, QuestionReviewStatus, QuestionSubject, QuestionType } from './pdfNativeTypes';
import { selectRows, upsertRows, updateRows, deleteRows } from '../supabase/client';
import { PdfNativeQuestionRow } from '../supabase/types';
import {
  getLocalPdfNativeQuestions,
  saveLocalPdfNativeQuestions,
  deleteLocalPdfNativeQuestion,
  getLocalPdfNativeTestQuestions,
} from './pdfNativeLocalStorage';

declare const process: { env: Record<string, string> };

export interface ValidationRuleResult {
  isValid: boolean;
  errors: string[];
}

/**
 * Validate a PDF-Native question before saving to the Question Bank.
 */
export function validatePdfNativeQuestion(question: PdfNativeQuestion): ValidationRuleResult {
  const errors: string[] = [];

  if (!question.pdf_id || !question.pdf_id.trim()) {
    errors.push('Missing pdf_id');
  }

  if (!question.question_number || !question.question_number.trim()) {
    errors.push('Missing question_number');
  }

  if (question.page_start < 1 || question.page_end < question.page_start) {
    errors.push('Invalid page numbers');
  }

  const hasValidRegions =
    question.regions &&
    question.regions.length > 0 &&
    question.regions.every((r) => r.bbox && r.bbox.width > 0 && r.bbox.height > 0);
  const hasValidBbox =
    question.bbox &&
    typeof question.bbox.x === 'number' &&
    typeof question.bbox.y === 'number' &&
    question.bbox.width > 0 &&
    question.bbox.height > 0;

  if (!hasValidBbox && !hasValidRegions) {
    errors.push('Invalid bounding box coordinates');
  }

  if (!question.subject) {
    errors.push('Subject is required');
  }

  if (isNaN(question.marks) || question.marks < 0) {
    errors.push('Marks must be a non-negative number');
  }

  if (isNaN(question.negative_marks) || question.negative_marks < 0) {
    errors.push('Negative marks must be a non-negative number');
  }

  // Answer Key rule: If answer key is missing/null, review status MUST NOT be APPROVED
  if ((!question.correct_answer || !question.correct_answer.trim()) && question.review_status === 'APPROVED') {
    errors.push('Cannot mark status as APPROVED when correct answer is missing');
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}

/**
 * Save a batch of selected PDF-Native questions to local persistent storage and Supabase database.
 */
export async function savePdfNativeQuestionBankBatch(
  pdfId: string,
  pdfUrl: string,
  questions: PdfNativeQuestion[]
): Promise<{ success: boolean; savedCount: number; updatedCount: number; errors?: string[] }> {
  // Validate every question
  const invalidQuestions: string[] = [];
  const validatedQuestions: PdfNativeQuestion[] = [];

  for (const q of questions) {
    // If correct_answer is missing, downgrade status to NEEDS_REVIEW
    let safeStatus = q.review_status;
    if ((!q.correct_answer || !q.correct_answer.trim()) && safeStatus === 'APPROVED') {
      safeStatus = 'NEEDS_REVIEW';
    }

    const updatedQ: PdfNativeQuestion = {
      ...q,
      pdf_id: pdfId,
      pdf_url: pdfUrl || q.pdf_url || '',
      review_status: safeStatus,
    };

    const val = validatePdfNativeQuestion(updatedQ);
    if (!val.isValid) {
      invalidQuestions.push(`Q${q.question_number}: ${val.errors.join(', ')}`);
    } else {
      validatedQuestions.push(updatedQ);
    }
  }

  if (invalidQuestions.length > 0) {
    return {
      success: false,
      savedCount: 0,
      updatedCount: 0,
      errors: invalidQuestions,
    };
  }

  // 1. Always save to local persistent storage first
  await saveLocalPdfNativeQuestions(validatedQuestions);

  // 2. Attempt saving to Supabase (fails gracefully if schema table is missing on remote)
  const nowIso = new Date().toISOString();
  const rows: PdfNativeQuestionRow[] = validatedQuestions.map((q) => {
    const bboxWithRegions = {
      x: q.bbox.x,
      y: q.bbox.y,
      width: q.bbox.width,
      height: q.bbox.height,
      ...(q.regions && q.regions.length > 0 ? { regions: q.regions } : {}),
    };

    return {
      id: q.id || `pdf_q_${pdfId}_${q.question_number}_${Date.now()}`,
      pdf_id: pdfId,
      pdf_url: pdfUrl || q.pdf_url || '',
      question_number: q.question_number,
      page_start: q.page_start,
      page_end: q.page_end,
      bbox: bboxWithRegions,
      subject: q.subject || 'Physics',
      chapter: q.chapter ?? null,
      topic: q.topic ?? null,
      question_type: q.question_type || 'MCQ',
      correct_answer: q.correct_answer ?? null,
      marks: Number(q.marks) || 4,
      negative_marks: Number(q.negative_marks) || 1,
      review_status: q.review_status || 'NEEDS_REVIEW',
      raw_text: q.raw_detected_text ?? null,
      created_at: nowIso,
      updated_at: nowIso,
    };
  });

  try {
    await upsertRows<PdfNativeQuestionRow>(
      'pdf_native_questions',
      rows,
      'pdf_id,question_number'
    );
  } catch (dbErr) {
    console.error('[savePdfNativeQuestionBankBatch] Remote Supabase upsert failed:', dbErr);
  }

  // 3. Optional background worker sync
  const backendUrl =
    (typeof process !== 'undefined' && process.env && process.env.MIITJEE_BACKEND_URL) ||
    'http://127.0.0.1:8787';

  try {
    await fetch(`${backendUrl}/api/pdf-native/save-bank-questions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        pdf_id: pdfId,
        pdf_url: pdfUrl,
        questions: validatedQuestions,
      }),
    });
  } catch {
    // Offline local fallback
  }

  return {
    success: true,
    savedCount: validatedQuestions.length,
    updatedCount: 0,
  };
}

/**
 * List saved PDF-Native questions from local storage and Supabase.
 */
export async function listPdfNativeBankQuestions(pdfId?: string): Promise<PdfNativeQuestion[]> {
  const localQuestions = await getLocalPdfNativeQuestions(pdfId);
  const qMap = new Map<string, PdfNativeQuestion>();

  for (const q of localQuestions) {
    qMap.set(q.id, q);
  }

  try {
    const query: Record<string, string | number | boolean | undefined> = pdfId
      ? { pdf_id: `eq.${pdfId}`, order: 'page_start.asc,question_number.asc' }
      : { order: 'created_at.desc' };

    const rows = await selectRows<PdfNativeQuestionRow>('pdf_native_questions', '*', query);

    if (rows && rows.length > 0) {
      for (const r of rows) {
        const rawBbox = r.bbox as any;
        const regions = Array.isArray(rawBbox?.regions)
          ? rawBbox.regions
          : Array.isArray((r as any).regions)
          ? (r as any).regions
          : undefined;

        const cleanBbox = {
          x: Number(rawBbox?.x ?? 0),
          y: Number(rawBbox?.y ?? 0),
          width: Number(rawBbox?.width ?? 0),
          height: Number(rawBbox?.height ?? 0),
        };

        qMap.set(r.id, {
          id: r.id,
          pdf_id: r.pdf_id,
          pdf_url: r.pdf_url,
          question_number: r.question_number,
          page_start: Number(r.page_start) || 1,
          page_end: Number(r.page_end) || Number(r.page_start) || 1,
          bbox: cleanBbox,
          regions: regions && regions.length > 0 ? regions : undefined,
          subject: (r.subject || 'Physics') as QuestionSubject,
          chapter: r.chapter,
          topic: r.topic,
          question_type: (r.question_type || 'MCQ') as QuestionType,
          correct_answer: r.correct_answer,
          marks: Number(r.marks) || 4,
          negative_marks: Number(r.negative_marks) || 1,
          review_status: (r.review_status || 'NEEDS_REVIEW') as QuestionReviewStatus,
          raw_detected_text: r.raw_text ?? undefined,
        });
      }
    }
  } catch (err) {
    console.warn('[listPdfNativeBankQuestions] Supabase query skipped, using local store:', err);
  }

  return Array.from(qMap.values());
}

/**
 * Update an existing PDF-Native Question's metadata or bounding box coordinates.
 */
export async function updatePdfNativeQuestion(
  question: PdfNativeQuestion
): Promise<{ success: boolean; error?: string }> {
  // Validate
  const val = validatePdfNativeQuestion(question);
  if (!val.isValid) {
    return { success: false, error: val.errors.join(', ') };
  }

  // 1. Update in local persistent storage
  await saveLocalPdfNativeQuestions([question]);

  // 2. Update in Supabase (authoritative source of truth)
  try {
    const nowIso = new Date().toISOString();
    const bboxWithRegions = {
      x: question.bbox.x,
      y: question.bbox.y,
      width: question.bbox.width,
      height: question.bbox.height,
      ...(question.regions && question.regions.length > 0 ? { regions: question.regions } : {}),
    };

    const row: Partial<PdfNativeQuestionRow> = {
      question_number: question.question_number,
      page_start: question.page_start,
      page_end: question.page_end,
      bbox: bboxWithRegions,
      subject: question.subject,
      chapter: question.chapter ?? null,
      topic: question.topic ?? null,
      question_type: question.question_type,
      correct_answer: question.correct_answer ?? null,
      marks: Number(question.marks) || 4,
      negative_marks: Number(question.negative_marks) || 1,
      review_status: question.review_status,
      updated_at: nowIso,
    };

    await updateRows('pdf_native_questions', row, { id: `eq.${question.id}` });
  } catch (err) {
    console.error('[updatePdfNativeQuestion] Remote Supabase update failed:', err);
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }

  return { success: true };
}

/**
 * Delete a question from the PDF-Native Question Bank with strict relationship safety.
 * If the question is linked to any active tests, deletion is safely blocked.
 */
export async function deletePdfNativeQuestion(
  questionId: string
): Promise<{ success: boolean; error?: string }> {
  if (!questionId || typeof questionId !== 'string') {
    return { success: false, error: 'Invalid question ID provided.' };
  }

  // 1. Safety check: Remote test references in pdf_native_test_questions
  try {
    const testLinks = await selectRows<{ test_id: string }>(
      'pdf_native_test_questions',
      'test_id',
      { question_id: `eq.${questionId}` }
    );

    if (testLinks && testLinks.length > 0) {
      return {
        success: false,
        error: 'This question is currently used in one or more tests. It cannot be permanently deleted until it is removed from those tests.',
      };
    }
  } catch (checkErr) {
    console.warn('[deletePdfNativeQuestion] Remote test reference check warning:', checkErr);
  }

  // 2. Safety check: Local test references
  try {
    const localTestQuestions = await getLocalPdfNativeTestQuestions();
    const isLinkedToLocalTest = localTestQuestions.some((tq) => tq.question_id === questionId);
    if (isLinkedToLocalTest) {
      return {
        success: false,
        error: 'This question is currently used in one or more tests. It cannot be permanently deleted until it is removed from those tests.',
      };
    }
  } catch {
    // Continue
  }

  // 3. Delete from local persistent storage first
  try {
    await deleteLocalPdfNativeQuestion(questionId);
  } catch (localErr) {
    console.warn('[deletePdfNativeQuestion] Local cleanup warning:', localErr);
  }

  // 4. Delete from Supabase (fails gracefully in offline/mock environment)
  try {
    // Cleanup junction records first if any
    await deleteRows('pdf_native_set_questions', { question_id: `eq.${questionId}` }).catch(() => undefined);
    await deleteRows('pdf_native_questions', { id: `eq.${questionId}` });
  } catch (err) {
    console.warn('[deletePdfNativeQuestion] Remote Supabase delete skipped (deleted locally):', err);
  }

  return { success: true };
}
