import {
  CreatePdfNativeSetRequest,
  PdfNativeQuestion,
  PdfNativeSet,
  PdfNativeSetQuestion,
  PdfNativeSetStatus,
  UpdatePdfNativeSetRequest,
} from './pdfNativeTypes';
import { deleteRows, insertRow, selectRows, updateRows, upsertRows } from '../supabase/client';
import { PdfNativeQuestionRow, PdfNativeSetQuestionRow, PdfNativeSetRow } from '../supabase/types';
import {
  deleteLocalPdfNativeSet,
  getLocalPdfNativeQuestions,
  getLocalPdfNativeSet,
  getLocalPdfNativeSetQuestions,
  getLocalPdfNativeSets,
  getLocalPdfNativeTestSets,
  saveLocalPdfNativeSet,
  updateLocalPdfNativeSet,
} from './pdfNativeLocalStorage';

export interface SetValidationResult {
  isValid: boolean;
  errors: string[];
}

/**
 * Validate PDF-Native Set creation / update payload.
 */
export function validatePdfNativeSet(
  payload: CreatePdfNativeSetRequest | UpdatePdfNativeSetRequest,
  availableQuestionsMap?: Map<string, PdfNativeQuestion>
): SetValidationResult {
  const errors: string[] = [];

  if (!payload.set_name || !payload.set_name.trim()) {
    errors.push('Set name is required.');
  }

  if (payload.question_ids) {
    if (!Array.isArray(payload.question_ids) || payload.question_ids.length === 0) {
      errors.push('At least one question must be selected for the Set.');
    } else {
      const seenIds = new Set<string>();
      for (const qId of payload.question_ids) {
        if (seenIds.has(qId)) {
          errors.push(`Duplicate question found in Set selection (ID: ${qId}).`);
        }
        seenIds.add(qId);

        if (availableQuestionsMap) {
          const q = availableQuestionsMap.get(qId);
          if (q && (!q.correct_answer || !q.correct_answer.trim()) && q.review_status === 'APPROVED') {
            errors.push(`Question Q${q.question_number} is APPROVED but missing an answer key.`);
          }
        }
      }
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}

/**
 * Create a new PDF-Native Set with ordered question relationships.
 */
export async function createPdfNativeSet(
  payload: CreatePdfNativeSetRequest
): Promise<{ success: boolean; set: PdfNativeSet }> {
  const setId = `set_${Date.now()}`;
  const nowIso = new Date().toISOString();

  const newSet: PdfNativeSet = {
    id: setId,
    set_name: payload.set_name.trim(),
    source_pdf_id: payload.source_pdf_id,
    pdf_url: payload.pdf_url ?? null,
    subject: payload.subject || 'Physics',
    description: payload.description ? payload.description.trim() : null,
    total_questions: payload.question_ids.length,
    status: payload.status || 'READY',
    created_at: nowIso,
    updated_at: nowIso,
  };

  // 1. Save locally first
  await saveLocalPdfNativeSet(newSet, payload.question_ids);

  // 2. Save to Supabase
  try {
    const setRow: PdfNativeSetRow = {
      id: setId,
      set_name: newSet.set_name,
      source_pdf_id: newSet.source_pdf_id,
      pdf_url: newSet.pdf_url ?? null,
      subject: newSet.subject,
      description: newSet.description ?? null,
      total_questions: newSet.total_questions,
      status: newSet.status,
      created_at: nowIso,
      updated_at: nowIso,
    };

    await insertRow('pdf_native_sets', setRow);

    const relationRows: PdfNativeSetQuestionRow[] = payload.question_ids.map((qId, idx) => ({
      id: `sq_${setId}_${idx + 1}`,
      set_id: setId,
      question_id: qId,
      order_index: idx + 1,
      created_at: nowIso,
    }));

    if (relationRows.length > 0) {
      await upsertRows('pdf_native_set_questions', relationRows, 'set_id,question_id');
    }
  } catch (err) {
    console.warn('[createPdfNativeSet] Remote Supabase insert skipped (saved locally):', err);
  }

  return {
    success: true,
    set: newSet,
  };
}

/**
 * List all PDF-Native Sets.
 */
export async function listPdfNativeSets(): Promise<PdfNativeSet[]> {
  try {
    const rows = await selectRows<PdfNativeSetRow & { pdf_native_set_questions?: { count: number }[] }>(
      'pdf_native_sets',
      '*,pdf_native_set_questions(count)',
      {
        order: 'created_at.desc',
      }
    );

    if (rows && rows.length > 0) {
      return rows.map((r) => {
        const firstSq = Array.isArray(r.pdf_native_set_questions) ? r.pdf_native_set_questions[0] : undefined;
        const actualCount = firstSq ? Number(firstSq.count) : (r.total_questions ?? 0);

        return {
          id: r.id,
          set_name: r.set_name,
          source_pdf_id: r.source_pdf_id,
          pdf_url: r.pdf_url,
          subject: (r.subject || 'Physics') as any,
          description: r.description,
          total_questions: actualCount,
          status: r.status as PdfNativeSetStatus,
          created_at: r.created_at,
          updated_at: r.updated_at,
        };
      }).sort((a, b) => {
        const dateA = new Date(a.created_at || 0).getTime();
        const dateB = new Date(b.created_at || 0).getTime();
        return dateB - dateA;
      });
    }
  } catch (err) {
    console.warn('[listPdfNativeSets] Supabase query skipped, using local store fallback:', err);
  }

  const localSets = await getLocalPdfNativeSets();
  return localSets.sort((a, b) => {
    const dateA = new Date(a.created_at || 0).getTime();
    const dateB = new Date(b.created_at || 0).getTime();
    return dateB - dateA;
  });
}

/**
 * Get a single PDF-Native Set by ID.
 */
export async function getPdfNativeSetById(setId: string): Promise<PdfNativeSet | null> {
  try {
    const rows = await selectRows<PdfNativeSetRow & { pdf_native_set_questions?: { count: number }[] }>(
      'pdf_native_sets',
      '*,pdf_native_set_questions(count)',
      {
        id: `eq.${setId}`,
      }
    );
    if (rows && rows.length > 0) {
      const r = rows[0];
      if (r) {
        const firstSq = Array.isArray(r.pdf_native_set_questions) ? r.pdf_native_set_questions[0] : undefined;
        const actualCount = firstSq ? Number(firstSq.count) : (r.total_questions ?? 0);

        return {
          id: r.id,
          set_name: r.set_name,
          source_pdf_id: r.source_pdf_id,
          pdf_url: r.pdf_url,
          subject: (r.subject || 'Physics') as any,
          description: r.description,
          total_questions: actualCount,
          status: r.status as PdfNativeSetStatus,
          created_at: r.created_at,
          updated_at: r.updated_at,
        };
      }
    }
  } catch (err) {
    console.warn('[getPdfNativeSetById] Supabase fetch skipped:', err);
  }

  const localSet = await getLocalPdfNativeSet(setId);
  if (localSet) return localSet;

  return null;
}

/**
 * Get ordered questions for a PDF-Native Set.
 */
export async function getPdfNativeSetQuestions(setId: string): Promise<PdfNativeQuestion[]> {
  const questions: PdfNativeQuestion[] = [];

  // 1. Try Supabase
  try {
    const relations = await selectRows<PdfNativeSetQuestionRow>('pdf_native_set_questions', '*', {
      set_id: `eq.${setId}`,
      order: 'order_index.asc',
    });

    if (relations && relations.length > 0) {
      let setRow: any = null;
      try {
        const sets = await selectRows<{ id: string; source_pdf_id?: string; pdf_id?: string; pdf_url?: string }>('pdf_native_sets', '*', {
          id: `eq.${setId}`,
          limit: 1,
        });
        if (sets && sets.length > 0) setRow = sets[0];
      } catch {
        // Continue
      }

      const qIds = relations.map((r) => r.question_id);
      let qRows: PdfNativeQuestionRow[] = [];
      try {
        qRows = await selectRows<PdfNativeQuestionRow>('pdf_native_questions', '*', {
          id: `in.(${qIds.join(',')})`,
        });
      } catch {
        qRows = [];
      }

      const qMap = new Map<string, PdfNativeQuestion>();
      const localQList = await getLocalPdfNativeQuestions();
      localQList.forEach((q) => qMap.set(q.id, q));

      const setPdfId = setRow?.source_pdf_id || setRow?.pdf_id || '';
      const setPdfUrl = setRow?.pdf_url || '';

      qRows.forEach((q) => {
        const rawBbox = q.bbox as any;
        const regions = Array.isArray(rawBbox?.regions)
          ? rawBbox.regions
          : Array.isArray((q as any).regions)
          ? (q as any).regions
          : undefined;

        const cleanBbox = {
          x: Number(rawBbox?.x ?? 0),
          y: Number(rawBbox?.y ?? 0),
          width: Number(rawBbox?.width ?? 0),
          height: Number(rawBbox?.height ?? 0),
        };

        qMap.set(q.id, {
          id: q.id,
          pdf_id: q.pdf_id || setPdfId,
          pdf_url: q.pdf_url || setPdfUrl,
          question_number: q.question_number,
          page_start: Number(q.page_start) || 1,
          page_end: Number(q.page_end) || Number(q.page_start) || 1,
          bbox: cleanBbox,
          regions: regions && regions.length > 0 ? regions : undefined,
          subject: (q.subject || 'Physics') as any,
          chapter: q.chapter,
          topic: q.topic,
          question_type: (q.question_type || 'MCQ') as any,
          correct_answer: q.correct_answer,
          marks: Number(q.marks) || 4,
          negative_marks: Number(q.negative_marks) || 1,
          review_status: (q.review_status || 'APPROVED') as any,
          raw_detected_text: q.raw_text ?? undefined,
        });
      });

      for (const rel of relations) {
        const q = qMap.get(rel.question_id);
        if (q) {
          questions.push(q);
        }
      }

      if (questions.length > 0) {
        return questions;
      }
    }
  } catch (err) {
    console.warn('[getPdfNativeSetQuestions] Supabase fetch skipped:', err);
  }

  // 2. Fallback to local persistent store
  try {
    const localSq = await getLocalPdfNativeSetQuestions(setId);
    if (localSq && localSq.length > 0) {
      const localQList = await getLocalPdfNativeQuestions();
      const localQMap = new Map<string, PdfNativeQuestion>(localQList.map((q) => [q.id, q]));

      // Fetch any missing questions from remote
      const missingIds = localSq.filter((sq) => !localQMap.has(sq.question_id)).map((sq) => sq.question_id);
      if (missingIds.length > 0) {
        try {
          const remoteRows = await selectRows<PdfNativeQuestionRow>('pdf_native_questions', '*', {
            id: `in.(${missingIds.join(',')})`,
          });
          if (remoteRows) {
            remoteRows.forEach((q) => {
              localQMap.set(q.id, {
                id: q.id,
                pdf_id: q.pdf_id,
                pdf_url: q.pdf_url,
                question_number: q.question_number,
                page_start: q.page_start,
                page_end: q.page_end,
                bbox: q.bbox,
                subject: (q.subject || 'Physics') as any,
                chapter: q.chapter,
                topic: q.topic,
                question_type: (q.question_type || 'MCQ') as any,
                correct_answer: q.correct_answer,
                marks: Number(q.marks) || 4,
                negative_marks: Number(q.negative_marks) || 1,
                review_status: (q.review_status || 'APPROVED') as any,
                raw_detected_text: q.raw_text ?? undefined,
              });
            });
          }
        } catch {
          // Ignore
        }
      }

      for (const sq of localSq) {
        const q = localQMap.get(sq.question_id);
        if (q) {
          questions.push(q);
        }
      }

      if (questions.length > 0) {
        return questions;
      }
    }
  } catch (err) {
    console.warn('[getPdfNativeSetQuestions] Local fetch error:', err);
  }

  // 3. Fallback: If set has no relations yet, find questions with matching source_pdf_id or subject
  try {
    const setObj = await getPdfNativeSetById(setId);
    if (setObj) {
      const allLocalQ = await getLocalPdfNativeQuestions();
      const matchingQ = allLocalQ.filter(
        (q) =>
          (setObj.source_pdf_id && q.pdf_id === setObj.source_pdf_id) ||
          (setObj.pdf_url && q.pdf_url === setObj.pdf_url) ||
          q.subject === setObj.subject
      );
      if (matchingQ.length > 0) {
        return matchingQ;
      }
    }
  } catch {
    // Ignore
  }

  return questions;
}

/**
 * Update an existing PDF-Native Set.
 */
export async function updatePdfNativeSet(
  payload: UpdatePdfNativeSetRequest
): Promise<{ success: boolean; set: PdfNativeSet }> {
  const existing = await getPdfNativeSetById(payload.id);
  if (!existing) {
    throw new Error(`Set not found (ID: ${payload.id})`);
  }

  const nowIso = new Date().toISOString();
  const updatedSet: PdfNativeSet = {
    ...existing,
    set_name: payload.set_name !== undefined ? payload.set_name.trim() : existing.set_name,
    subject: payload.subject !== undefined ? payload.subject : existing.subject,
    description: payload.description !== undefined ? payload.description : existing.description,
    status: payload.status !== undefined ? payload.status : existing.status,
    total_questions: payload.question_ids ? payload.question_ids.length : existing.total_questions,
    updated_at: nowIso,
  };

  // 1. Update locally
  await updateLocalPdfNativeSet(updatedSet, payload.question_ids);

  // 2. Update Supabase
  try {
    const rowUpdate: Partial<PdfNativeSetRow> = {
      set_name: updatedSet.set_name,
      subject: updatedSet.subject,
      description: updatedSet.description ?? null,
      status: updatedSet.status,
      total_questions: updatedSet.total_questions,
      updated_at: nowIso,
    };

    await updateRows('pdf_native_sets', rowUpdate, { id: `eq.${payload.id}` });

    if (payload.question_ids) {
      const relationRows: PdfNativeSetQuestionRow[] = payload.question_ids.map((qId, idx) => ({
        id: `sq_${payload.id}_${idx + 1}`,
        set_id: payload.id,
        question_id: qId,
        order_index: idx + 1,
        created_at: nowIso,
      }));

      if (relationRows.length > 0) {
        await upsertRows('pdf_native_set_questions', relationRows, 'set_id,question_id');
      }
    }
  } catch (err) {
    console.warn('[updatePdfNativeSet] Supabase update skipped:', err);
  }

  return {
    success: true,
    set: updatedSet,
  };
}

/**
 * Delete a PDF-Native Set safely.
 * IMPORTANT: Deleting a Set deletes the set and set-question relations ONLY.
 * It NEVER deletes the shared questions or the source PDF.
 * If the Set is referenced in an active Test, it prevents deletion to preserve test integrity.
 */
export async function deletePdfNativeSet(setId: string): Promise<void> {
  // Check if linked to any active tests locally or remotely
  const localTestSets = await getLocalPdfNativeTestSets();
  const isLinkedLocally = localTestSets.some((ts) => ts.set_id === setId);

  let isLinkedRemotely = false;
  try {
    const remoteLinks = await selectRows<{ id: string }>('pdf_native_test_sets', 'id', {
      set_id: `eq.${setId}`,
    });
    if (remoteLinks && remoteLinks.length > 0) {
      isLinkedRemotely = true;
    }
  } catch {
    // Ignore
  }

  if (isLinkedLocally || isLinkedRemotely) {
    throw new Error(
      `Cannot delete Question Set because it is referenced by an existing Test. Please remove the Set from the Test configuration or delete the Test first.`
    );
  }

  // 1. Delete locally
  await deleteLocalPdfNativeSet(setId);

  // 2. Delete from Supabase
  try {
    await deleteRows('pdf_native_sets', { id: `eq.${setId}` });
  } catch (err) {
    console.warn('[deletePdfNativeSet] Supabase delete skipped:', err);
  }
}
