import {
  CreatePdfNativeTestRequest,
  PdfNativeQuestion,
  PdfNativeTest,
  PdfNativeTestSection,
  PdfNativeTestStatus,
  UpdatePdfNativeTestRequest,
} from './pdfNativeTypes';
import { deleteRows, insertRow, selectRows, updateRows, upsertRows } from '../supabase/client';
import {
  PdfNativeTestQuestionRow,
  PdfNativeTestRow,
  PdfNativeTestSectionRow,
} from '../supabase/types';
import {
  deleteLocalPdfNativeTest,
  getLocalPdfNativeSections,
  getLocalPdfNativeTest,
  getLocalPdfNativeTestQuestions,
  getLocalPdfNativeTests,
  saveLocalPdfNativeSections,
  saveLocalPdfNativeTest,
  updateLocalPdfNativeTest,
  updateLocalPdfNativeTestStatus,
} from './pdfNativeLocalStorage';

declare const process: { env: Record<string, string> };

export interface TestValidationResult {
  isValid: boolean;
  errors: string[];
}

/**
 * Validate Subject Sections configuration.
 */
export function validateSubjectSections(
  sections: PdfNativeTestSection[],
  totalQuestions: number,
  questions?: PdfNativeQuestion[]
): TestValidationResult {
  const errors: string[] = [];

  if (!sections || sections.length === 0) {
    errors.push('At least one subject section is required.');
    return { isValid: false, errors };
  }

  // Sort sections by question_start
  const sorted = [...sections].sort((a, b) => a.question_start - b.question_start);

  for (let i = 0; i < sorted.length; i++) {
    const sec = sorted[i];
    if (!sec) continue;

    if (sec.question_start < 1) {
      errors.push(`Section ${i + 1} (${sec.subject}): Start question must be at least 1.`);
    }
    if (sec.question_end < sec.question_start) {
      errors.push(
        `Section ${i + 1} (${sec.subject}): End question (Q${sec.question_end}) cannot be less than start question (Q${sec.question_start}).`
      );
    }
    if (sec.question_end > totalQuestions) {
      errors.push(
        `Section ${i + 1} (${sec.subject}): End question (Q${sec.question_end}) exceeds total test questions (${totalQuestions}).`
      );
    }

    // Overlap check
    if (i > 0) {
      const prev = sorted[i - 1];
      if (prev && sec.question_start <= prev.question_end) {
        errors.push(
          `Section Overlap Error: Section ${prev.subject} (Q${prev.question_start}–Q${prev.question_end}) overlaps with ${sec.subject} (Q${sec.question_start}–Q${sec.question_end}).`
        );
      }
    }
  }

  // Coverage check: Ensure questions inside each section match section subject
  if (questions && questions.length > 0) {
    sorted.forEach((sec) => {
      if (!sec) return;
      const startIndex = sec.question_start - 1;
      const endIndex = sec.question_end - 1;
      for (let qIdx = startIndex; qIdx <= endIndex; qIdx++) {
        const q = questions[qIdx];
        if (q && q.subject && q.subject !== sec.subject && q.subject !== 'Other') {
          errors.push(
            `Section Contamination: Question Q${q.question_number} is tagged as '${q.subject}' but placed in '${sec.subject}' section.`
          );
        }
      }
    });
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}

/**
 * Validate PDF-Native test creation / update parameters before saving.
 */
export function validatePdfNativeTestCreation(
  payload: CreatePdfNativeTestRequest | UpdatePdfNativeTestRequest,
  availableQuestionsMap: Map<string, PdfNativeQuestion>
): TestValidationResult {
  const errors: string[] = [];

  if (!payload.title || !payload.title.trim()) {
    errors.push('Test title is required');
  }

  if (!Array.isArray(payload.question_ids) || payload.question_ids.length === 0) {
    errors.push('At least one question must be selected for test creation');
  } else {
    const seenIds = new Set<string>();

    for (let i = 0; i < payload.question_ids.length; i++) {
      const qId = payload.question_ids[i];
      if (!qId) continue;

      if (seenIds.has(qId)) {
        errors.push(`Duplicate question found in selection (ID: ${qId})`);
      }
      seenIds.add(qId);

      const questionObj = availableQuestionsMap.get(qId);
      if (!questionObj) continue;

      // Ensure answer key is present
      if (!questionObj.correct_answer || !questionObj.correct_answer.trim()) {
        errors.push(`Question Q${questionObj.question_number} is missing a correct answer key.`);
      }
    }

    // Single-Subject Contamination Guard
    const singleSubjects = ['Physics', 'Chemistry', 'Mathematics', 'Biology'];
    const isSingleSubjectTest =
      payload.exam_type === 'single' || singleSubjects.includes(payload.subject);

    if (isSingleSubjectTest) {
      for (const qId of payload.question_ids) {
        const questionObj = availableQuestionsMap.get(qId);
        if (
          questionObj &&
          questionObj.subject &&
          questionObj.subject !== payload.subject &&
          questionObj.subject !== 'Other'
        ) {
          errors.push(
            `Subject Contamination Error: Single-subject ${payload.subject} test cannot include Question Q${questionObj.question_number} which belongs to '${questionObj.subject}'.`
          );
        }
      }
    }
  }

  if (isNaN(payload.duration_minutes) || payload.duration_minutes <= 0) {
    errors.push('Duration must be a positive number of minutes');
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}

/**
 * Pre-publish final validation checklist.
 */
export function validateTestForPublish(
  test: PdfNativeTest,
  questions: PdfNativeQuestion[],
  sections?: PdfNativeTestSection[]
): TestValidationResult {
  const errors: string[] = [];

  if (!test.title || !test.title.trim()) {
    errors.push('Test title is required.');
  }

  if (!test.duration_minutes || test.duration_minutes <= 0) {
    errors.push('Duration must be greater than 0 minutes.');
  }

  if (!questions || questions.length === 0) {
    errors.push('The test must contain at least one question.');
    return { isValid: false, errors };
  }

  // Check all questions are APPROVED
  const unapproved = questions.filter((q) => q.review_status !== 'APPROVED');
  if (unapproved.length > 0) {
    const firstUn = unapproved[0];
    errors.push(
      `${unapproved.length} question(s) (e.g. Q${firstUn ? firstUn.question_number : ''}) are not in APPROVED status.`
    );
  }

  // Check answer keys and types
  for (const q of questions) {
    if (!q.correct_answer || !q.correct_answer.trim()) {
      errors.push(`Cannot publish test: Question Q${q.question_number} is missing a valid authoritative answer key.`);
      continue;
    }

    const isIntType =
      q.question_type === 'INTEGER' ||
      q.question_type === 'Numerical' ||
      (q.question_type as string) === 'integer';

    if (isIntType) {
      if (isNaN(Number(q.correct_answer.trim()))) {
        errors.push(
          `Question Q${q.question_number} is marked as INTEGER/Numerical but has non-numeric answer key '${q.correct_answer}'.`
        );
      }
    }
  }

  // Check visibility and batches
  if (test.visibility === 'BATCH_ONLY') {
    if (!test.allowed_batches || test.allowed_batches.length === 0) {
      errors.push('At least one target batch must be selected for Specific Batches test visibility.');
    }
  }

  // Check sections for multi-subject
  const isMulti = test.exam_type === 'multi' || test.subject === 'Multi-Subject';
  if (isMulti) {
    const secList = sections || test.sections || [];
    const secVal = validateSubjectSections(secList, questions.length, questions);
    if (!secVal.isValid) {
      errors.push(...secVal.errors);
    }
  } else {
    // Single subject contamination check
    for (const q of questions) {
      if (q.subject && q.subject !== test.subject && q.subject !== 'Other') {
        errors.push(
          `Single-subject ${test.subject} test cannot contain Question Q${q.question_number} (${q.subject}).`
        );
      }
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}

/**
 * Create a new PDF-Native Test configuration atomically.
 */
export async function createPdfNativeTest(
  payload: CreatePdfNativeTestRequest
): Promise<{ success: boolean; test: PdfNativeTest }> {
  const testId = `pdf_test_${Date.now()}`;
  const nowIso = new Date().toISOString();

  const newTest: PdfNativeTest = {
    id: testId,
    title: payload.title.trim(),
    description: payload.description ? payload.description.trim() : null,
    duration_minutes: payload.duration_minutes || 60,
    subject: payload.subject || 'Physics',
    exam_type: payload.exam_type || 'single',
    total_questions: payload.question_ids.length,
    status: payload.status || 'DRAFT',
    visibility: payload.visibility || 'OPEN_FOR_ALL',
    allowed_batches: payload.allowed_batches || [],
    set_ids: payload.set_ids || [],
    starts_at: payload.starts_at || nowIso,
    ends_at: payload.ends_at ?? null,
    sections: payload.sections || [],
    created_at: nowIso,
    updated_at: nowIso,
  };

  // 1. Save to local persistent storage
  await saveLocalPdfNativeTest(
    newTest,
    payload.question_ids,
    payload.sections,
    payload.allowed_batches,
    payload.set_ids
  );

  // 2. Attempt remote Supabase save
  try {
    const testRow: PdfNativeTestRow = {
      id: testId,
      title: newTest.title,
      description: newTest.description ?? null,
      duration_minutes: newTest.duration_minutes,
      subject: newTest.subject,
      total_questions: newTest.total_questions,
      status: newTest.status,
      visibility: newTest.visibility,
      starts_at: newTest.starts_at,
      ends_at: newTest.ends_at,
      created_at: nowIso,
      updated_at: nowIso,
    };

    await insertRow('pdf_native_tests', testRow);

    const relationRows: PdfNativeTestQuestionRow[] = payload.question_ids.map((qId, idx) => ({
      id: `tq_${testId}_${idx + 1}`,
      test_id: testId,
      question_id: qId,
      order_index: idx + 1,
      created_at: nowIso,
    }));

    if (relationRows.length > 0) {
      await upsertRows('pdf_native_test_questions', relationRows, 'test_id,question_id');
    }

    if (payload.set_ids && payload.set_ids.length > 0) {
      const setRows = payload.set_ids.map((sId, idx) => ({
        id: `ts_${testId}_${sId}`,
        test_id: testId,
        set_id: sId,
        order_index: idx + 1,
        created_at: nowIso,
      }));
      await upsertRows('pdf_native_test_sets', setRows, 'test_id,set_id');
    }

    if (payload.sections && payload.sections.length > 0) {
      const secRows: PdfNativeTestSectionRow[] = payload.sections.map((s, idx) => ({
        id: s.id || `sec_${testId}_${idx + 1}`,
        test_id: testId,
        set_id: s.set_id ?? null,
        subject: s.subject,
        question_type: s.question_type || 'MCQ',
        section_order: idx + 1,
        question_start: s.question_start,
        question_end: s.question_end,
        mcq_count: s.mcq_count || 0,
        integer_count: s.integer_count || 0,
        correct_marks: s.correct_marks || 4,
        negative_marks: s.negative_marks || 1,
        created_at: nowIso,
        updated_at: nowIso,
      }));
      await upsertRows('pdf_native_test_sections', secRows, 'test_id,section_order');
    }

    if (payload.visibility === 'BATCH_ONLY' && payload.allowed_batches && payload.allowed_batches.length > 0) {
      const batchRows = payload.allowed_batches.map((bId) => ({
        id: `tba_${testId}_${bId}`,
        test_id: testId,
        batch_id: bId,
        created_at: nowIso,
      }));
      await upsertRows('pdf_native_test_batch_access', batchRows, 'test_id,batch_id');
    }
  } catch (dbErr) {
    console.warn('[createPdfNativeTest] Remote Supabase insert skipped (saved locally):', dbErr);
  }

  return {
    success: true,
    test: newTest,
  };
}

/**
 * Update an existing PDF-Native Test record without creating duplicates.
 */
export async function updatePdfNativeTest(
  payload: UpdatePdfNativeTestRequest
): Promise<{ success: boolean; test: PdfNativeTest }> {
  const nowIso = new Date().toISOString();

  const updatedTest: PdfNativeTest = {
    id: payload.id,
    title: payload.title.trim(),
    description: payload.description ? payload.description.trim() : null,
    duration_minutes: payload.duration_minutes || 60,
    subject: payload.subject || 'Physics',
    exam_type: payload.exam_type || 'single',
    total_questions: payload.question_ids.length,
    status: payload.status,
    visibility: payload.visibility || 'OPEN_FOR_ALL',
    allowed_batches: payload.allowed_batches || [],
    set_ids: payload.set_ids || [],
    starts_at: payload.starts_at || nowIso,
    ends_at: payload.ends_at ?? null,
    sections: payload.sections || [],
    updated_at: nowIso,
  };

  // 1. Update in local storage
  await updateLocalPdfNativeTest(
    updatedTest,
    payload.question_ids,
    payload.sections,
    payload.allowed_batches,
    payload.set_ids
  );

  // 2. Attempt remote Supabase update
  try {
    const testRow: Partial<PdfNativeTestRow> = {
      title: updatedTest.title,
      description: updatedTest.description ?? null,
      duration_minutes: updatedTest.duration_minutes,
      subject: updatedTest.subject,
      total_questions: updatedTest.total_questions,
      status: updatedTest.status,
      visibility: updatedTest.visibility,
      starts_at: updatedTest.starts_at,
      ends_at: updatedTest.ends_at,
      updated_at: nowIso,
    };

    await updateRows('pdf_native_tests', testRow, { id: `eq.${payload.id}` });

    // Sync questions
    const relationRows: PdfNativeTestQuestionRow[] = payload.question_ids.map((qId, idx) => ({
      id: `tq_${payload.id}_${idx + 1}`,
      test_id: payload.id,
      question_id: qId,
      order_index: idx + 1,
      created_at: nowIso,
    }));

    if (relationRows.length > 0) {
      await upsertRows('pdf_native_test_questions', relationRows, 'test_id,question_id');
    }

    if (payload.set_ids && payload.set_ids.length > 0) {
      const setRows = payload.set_ids.map((sId, idx) => ({
        id: `ts_${payload.id}_${sId}`,
        test_id: payload.id,
        set_id: sId,
        order_index: idx + 1,
        created_at: nowIso,
      }));
      await upsertRows('pdf_native_test_sets', setRows, 'test_id,set_id');
    }

    if (payload.sections && payload.sections.length > 0) {
      const secRows: PdfNativeTestSectionRow[] = payload.sections.map((s, idx) => ({
        id: s.id || `sec_${payload.id}_${idx + 1}`,
        test_id: payload.id,
        set_id: s.set_id ?? null,
        subject: s.subject,
        question_type: s.question_type || 'MCQ',
        section_order: idx + 1,
        question_start: s.question_start,
        question_end: s.question_end,
        mcq_count: s.mcq_count || 0,
        integer_count: s.integer_count || 0,
        correct_marks: s.correct_marks || 4,
        negative_marks: s.negative_marks || 1,
        created_at: nowIso,
        updated_at: nowIso,
      }));
      await upsertRows('pdf_native_test_sections', secRows, 'test_id,section_order');
    }

    if (payload.visibility === 'BATCH_ONLY' && payload.allowed_batches && payload.allowed_batches.length > 0) {
      const batchRows = payload.allowed_batches.map((bId) => ({
        id: `tba_${payload.id}_${bId}`,
        test_id: payload.id,
        batch_id: bId,
        created_at: nowIso,
      }));
      await upsertRows('pdf_native_test_batch_access', batchRows, 'test_id,batch_id');
    }
  } catch (dbErr) {
    console.warn('[updatePdfNativeTest] Remote Supabase update skipped (saved locally):', dbErr);
  }

  return {
    success: true,
    test: updatedTest,
  };
}

/**
 * Publish / Make Live a PDF-Native test. Transitions status from DRAFT -> READY.
 */
export async function publishPdfNativeTest(testId: string): Promise<boolean> {
  const success = await updateLocalPdfNativeTestStatus(testId, 'READY');
  try {
    await updateRows(
      'pdf_native_tests',
      { status: 'READY', updated_at: new Date().toISOString() },
      { id: `eq.${testId}` }
    );
  } catch (err) {
    console.warn('[publishPdfNativeTest] Remote update skipped:', err);
  }
  return success;
}

/**
 * Archive or unpublish a test. Transitions status to ARCHIVED.
 */
export async function archivePdfNativeTest(testId: string): Promise<boolean> {
  const success = await updateLocalPdfNativeTestStatus(testId, 'ARCHIVED');
  try {
    await updateRows(
      'pdf_native_tests',
      { status: 'ARCHIVED', updated_at: new Date().toISOString() },
      { id: `eq.${testId}` }
    );
  } catch (err) {
    console.warn('[archivePdfNativeTest] Remote update skipped:', err);
  }
  return success;
}

/**
 * Restore an archived test back to DRAFT.
 */
export async function restorePdfNativeTestDraft(testId: string): Promise<boolean> {
  const success = await updateLocalPdfNativeTestStatus(testId, 'DRAFT');
  try {
    await updateRows(
      'pdf_native_tests',
      { status: 'DRAFT', updated_at: new Date().toISOString() },
      { id: `eq.${testId}` }
    );
  } catch (err) {
    console.warn('[restorePdfNativeTestDraft] Remote update skipped:', err);
  }
  return success;
}

/**
 * Delete a PDF-Native test permanently.
 */
export async function deletePdfNativeTest(testId: string): Promise<void> {
  await deleteLocalPdfNativeTest(testId);
  try {
    await deleteRows('pdf_native_tests', { id: `eq.${testId}` });
  } catch (err) {
    console.warn('[deletePdfNativeTest] Remote delete skipped:', err);
  }
}

/**
 * Get PDF-Native test by ID with sections.
 */
export async function getPdfNativeTestById(testId: string): Promise<PdfNativeTest | null> {
  const localTest = await getLocalPdfNativeTest(testId);
  if (localTest) {
    return localTest;
  }

  try {
    const rows = await selectRows<PdfNativeTestRow>('pdf_native_tests', '*', {
      id: `eq.${testId}`,
    });
    if (rows && rows.length > 0) {
      const r = rows[0];
      if (r) {
        const secRows = await selectRows<PdfNativeTestSectionRow>('pdf_native_test_sections', '*', {
          test_id: `eq.${testId}`,
          order: 'section_order.asc',
        });

        let allowedBatches: string[] = [];
        try {
          const batchRows = await selectRows<{ batch_id: string }>('pdf_native_test_batch_access', 'batch_id', {
            test_id: `eq.${testId}`,
          });
          if (batchRows && batchRows.length > 0) {
            allowedBatches = batchRows.map((b) => b.batch_id);
          }
        } catch {
          // Ignore
        }

        let setIds: string[] = [];
        try {
          const setRows = await selectRows<{ set_id: string }>('pdf_native_test_sets', 'set_id', {
            test_id: `eq.${testId}`,
            order: 'order_index.asc',
          });
          if (setRows && setRows.length > 0) {
            setIds = setRows.map((s) => s.set_id);
          }
        } catch {
          // Ignore
        }

        return {
          id: r.id,
          title: r.title,
          description: r.description,
          duration_minutes: r.duration_minutes,
          subject: r.subject,
          total_questions: r.total_questions,
          status: r.status,
          visibility: (r.visibility as any) || 'OPEN_FOR_ALL',
          allowed_batches: allowedBatches,
          set_ids: setIds,
          starts_at: r.starts_at,
          ends_at: r.ends_at,
          sections: (secRows || []).map((s) => ({
            id: s.id,
            test_id: s.test_id,
            set_id: s.set_id,
            subject: s.subject as any,
            question_type: (s.question_type || 'MCQ') as any,
            section_order: s.section_order,
            question_start: s.question_start,
            question_end: s.question_end,
            mcq_count: s.mcq_count,
            integer_count: s.integer_count,
            correct_marks: Number(s.correct_marks),
            negative_marks: Number(s.negative_marks),
          })),
          created_at: r.created_at,
          updated_at: r.updated_at,
        };
      }
    }
  } catch (err) {
    console.warn('[getPdfNativeTestById] Supabase fetch error:', err);
  }

  return null;
}

/**
 * List all created PDF-Native tests from Supabase and local store.
 */
export async function listPdfNativeTests(): Promise<PdfNativeTest[]> {
  try {
    const rows = await selectRows<PdfNativeTestRow>('pdf_native_tests', '*', {
      order: 'created_at.desc',
    });

    if (rows && rows.length > 0) {
      // Batch-fetch all set_ids and allowed_batches for all tests from junction tables
      let allTestSetRows: { test_id: string; set_id: string; order_index: number }[] = [];
      let allBatchAccessRows: { test_id: string; batch_id: string }[] = [];

      try {
        allTestSetRows = await selectRows<{ test_id: string; set_id: string; order_index: number }>(
          'pdf_native_test_sets',
          'test_id,set_id,order_index',
          { order: 'order_index.asc' }
        );
      } catch {
        // Ignore — junction table may not exist yet
      }

      try {
        allBatchAccessRows = await selectRows<{ test_id: string; batch_id: string }>(
          'pdf_native_test_batch_access',
          'test_id,batch_id',
          {}
        );
      } catch {
        // Ignore — junction table may not exist yet
      }

      // Build lookup maps
      const setIdsByTestId = new Map<string, string[]>();
      for (const ts of allTestSetRows) {
        const arr = setIdsByTestId.get(ts.test_id) || [];
        arr.push(ts.set_id);
        setIdsByTestId.set(ts.test_id, arr);
      }

      const batchesByTestId = new Map<string, string[]>();
      for (const ba of allBatchAccessRows) {
        const arr = batchesByTestId.get(ba.test_id) || [];
        arr.push(ba.batch_id);
        batchesByTestId.set(ba.test_id, arr);
      }

      return rows.map((r) => {
        const remoteSetIds = setIdsByTestId.get(r.id) || [];
        const remoteBatches = batchesByTestId.get(r.id) || [];

        return {
          id: r.id,
          title: r.title,
          description: r.description,
          duration_minutes: r.duration_minutes,
          subject: r.subject,
          total_questions: r.total_questions,
          status: r.status,
          visibility: (r.visibility as any) || 'OPEN_FOR_ALL',
          starts_at: r.starts_at,
          ends_at: r.ends_at !== undefined ? r.ends_at : null,
          allowed_batches: remoteBatches,
          set_ids: remoteSetIds,
          sections: [],
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
    console.warn('[listPdfNativeTests] Supabase query skipped, using local store fallback:', err);
  }

  const localTests = await getLocalPdfNativeTests();
  return localTests.sort((a, b) => {
    const dateA = new Date(a.created_at || 0).getTime();
    const dateB = new Date(b.created_at || 0).getTime();
    return dateB - dateA;
  });
}
