import { TestItem, TestQuestion } from '../../types';
import { PdfNativeQuestion, PdfNativeTest, QuestionSubject, QuestionType, QuestionReviewStatus, PdfNativeSetQuestion } from './pdfNativeTypes';
import { selectRows } from '../supabase/client';
import { PdfNativeQuestionRow, PdfNativeSetQuestionRow, PdfNativeSetRow, PdfNativeTestQuestionRow, PdfNativeTestRow } from '../supabase/types';
import {
  getLocalPdfNativeQuestions,
  getLocalPdfNativeSetQuestions,
  getLocalPdfNativeSets,
  getLocalPdfNativeTestQuestions,
  getLocalPdfNativeTests,
} from './pdfNativeLocalStorage';
import { listPdfNativeTests, getPdfNativeTestById } from './pdfNativeTestService';
import { getPdfNativeSetQuestions } from './pdfNativeSetService';
import { extractStructuredNativeQuestion } from './pdfNativeStructuredExtractor';
import { PdfPageMetadata } from './pdfNativeTypes';

declare const process: { env: Record<string, string> };

/**
 * Adapter module translating PDF-Native Tests and Questions to existing CBT engine structures.
 */

export function mapPdfNativeTestToCbtTestItem(test: PdfNativeTest): TestItem {
  const isOpenForAll = test.visibility ? test.visibility === 'OPEN_FOR_ALL' : true;
  const startsAt = test.starts_at || test.created_at || new Date().toISOString();
  const endsAt = test.ends_at ?? null;
  const now = Date.now();
  const isStarted = new Date(startsAt).getTime() <= now;

  return {
    id: test.id,
    title: test.title,
    description: test.description || 'PDF-Native CBT Examination',
    durationMinutes: test.duration_minutes || 60,
    questionCount: test.total_questions || 0,
    type: 'weekly',
    subject: test.subject || 'All Subjects',
    scheduledAt: startsAt,
    isPublished: test.status === 'READY' || test.status === 'LIVE',
    isStarted: isStarted,
    startedAt: startsAt,
    isOpenForAll: isOpenForAll,
    batchId: !isOpenForAll && test.allowed_batches && test.allowed_batches.length > 0 ? test.allowed_batches[0] : undefined,
    allowedBatches: test.allowed_batches,
    accessMode: isOpenForAll ? 'OPEN_FOR_ALL' : 'RESTRICTED_BATCH',
    isPdfNative: true,
    correctMarks: 4,
    wrongMarks: 1,
    unattemptedMarks: 0,
  };
}

export function mapPdfNativeQuestionToCbtQuestion(
  q: PdfNativeQuestion,
  testId: string,
  index: number
): TestQuestion {
  const isNumerical =
    q.question_type === 'Numerical' ||
    q.question_type === 'INTEGER' ||
    (q.question_type as string) === 'integer' ||
    (q.question_type as string) === 'numerical';

  const sequentialNumber = String(index + 1);

  return {
    id: q.id,
    testId: testId,
    type: isNumerical ? 'integer' : 'mcq',
    prompt: `Question ${sequentialNumber}`,
    options: isNumerical ? [] : ['A', 'B', 'C', 'D'],
    correctAnswer: q.correct_answer || (isNumerical ? '0' : 'A'),
    explanation: 'Refer to original PDF question region.',
    subjectLabel: q.subject || 'Physics',
    pdfNativeBbox: q.bbox,
    pdfNativeRegions: q.regions,
    pdfNativePage: q.page_start,
    pdfId: q.pdf_id,
    pdfUrl: q.pdf_url,
    nativeStructure: {
      id: q.id,
      pdfId: q.pdf_id,
      questionNumber: q.question_number || sequentialNumber,
      subject: (q.subject || 'Physics') as QuestionSubject,
      questionType: (isNumerical ? 'Numerical' : 'MCQ') as QuestionType,
      pageNumber: q.page_start,
      bbox: q.bbox,
      promptText: `Question ${sequentialNumber}`,
      blocks: [],
      options: isNumerical
        ? []
        : [
            { id: 'opt_A', label: 'A', text: 'Option A' },
            { id: 'opt_B', label: 'B', text: 'Option B' },
            { id: 'opt_C', label: 'C', text: 'Option C' },
            { id: 'opt_D', label: 'D', text: 'Option D' },
          ],
      diagrams: [],
      correctAnswer: q.correct_answer || null,
      marks: q.marks ?? 4,
      negativeMarks: q.negative_marks ?? 1,
      status: 'NATIVE_READY',
    },
  };
}



/**
 * Fetch all READY or LIVE PDF-Native tests translated to TestItem[].
 * Only actual published tests from Manage Tests are returned.
 * Question Sets alone are NEVER auto-injected as tests.
 */
export async function fetchReadyPdfNativeTests(): Promise<TestItem[]> {
  try {
    const allTests = await listPdfNativeTests();
    const readyTests = allTests.filter(
      (t) => (t.status === 'READY' || t.status === 'LIVE') && t.id !== 'test_pdf_native_live_demo'
    );
    return readyTests.map(mapPdfNativeTestToCbtTestItem);
  } catch (err) {
    console.warn('[fetchReadyPdfNativeTests] Error loading tests:', err);
    return [];
  }
}

/**
 * Fetch questions for a PDF-Native test and translate to TestQuestion[].
 */
export async function fetchPdfNativeCbtQuestions(testId: string): Promise<TestQuestion[]> {
  console.log('[PDF-NATIVE ADAPTER] fetchPdfNativeCbtQuestions called for testId:', testId);

  // 1. First priority: Check if test definition has linked sets (the authoritative multi-set configuration)
  try {
    const test = await getPdfNativeTestById(testId);
    console.log('[PDF-NATIVE ADAPTER] Step 1: getPdfNativeTestById result:', test ? `found (set_ids: ${JSON.stringify(test.set_ids)})` : 'null');
    if (test && test.set_ids && test.set_ids.length > 0) {
      const combinedQuestions: TestQuestion[] = [];
      let curIdx = 0;
      for (const sId of test.set_ids) {
        const sQuestions = await getPdfNativeSetQuestions(sId);
        console.log(`[PDF-NATIVE ADAPTER] Step 1: Set ${sId} returned ${sQuestions.length} questions`);
        for (const q of sQuestions) {
          combinedQuestions.push(mapPdfNativeQuestionToCbtQuestion(q, testId, curIdx++));
        }
      }
      if (combinedQuestions.length > 0) {
        console.log('[PDF-NATIVE ADAPTER] Step 1 SUCCESS:', combinedQuestions.length, 'questions from set_ids');
        return combinedQuestions;
      }
    }
  } catch (err) {
    console.warn('[PDF-NATIVE ADAPTER] Step 1 FAILED:', err);
  }

  // 2. Second priority: Check if testId is directly a Set ID
  try {
    const directSetQs = await getPdfNativeSetQuestions(testId);
    console.log('[PDF-NATIVE ADAPTER] Step 2: Direct set query returned', directSetQs?.length || 0, 'questions');
    if (directSetQs && directSetQs.length > 0) {
      return directSetQs.map((q, idx) => mapPdfNativeQuestionToCbtQuestion(q, testId, idx));
    }
  } catch (err) {
    console.warn('[PDF-NATIVE ADAPTER] Step 2 FAILED:', err);
  }

  // 3. Third priority: Try fetching from Supabase direct junction relations
  try {
    let testQuestionRows = await selectRows<PdfNativeTestQuestionRow>(
      'pdf_native_test_questions',
      '*',
      {
        test_id: `eq.${testId}`,
        order: 'order_index.asc',
      }
    );
    console.log('[PDF-NATIVE ADAPTER] Step 3: pdf_native_test_questions returned', testQuestionRows?.length || 0, 'rows');

    if (!testQuestionRows || testQuestionRows.length === 0) {
      const setQuestionRows = await selectRows<{ id: string; set_id: string; question_id: string; order_index: number }>(
        'pdf_native_set_questions',
        '*',
        {
          set_id: `eq.${testId}`,
          order: 'order_index.asc',
        }
      );
      console.log('[PDF-NATIVE ADAPTER] Step 3 fallback: pdf_native_set_questions returned', setQuestionRows?.length || 0, 'rows');
      if (setQuestionRows && setQuestionRows.length > 0) {
        testQuestionRows = setQuestionRows.map((sq) => ({
          id: sq.id,
          test_id: sq.set_id,
          question_id: sq.question_id,
          order_index: sq.order_index,
          created_at: new Date().toISOString(),
        }));
      }
    }

    if (testQuestionRows && testQuestionRows.length > 0) {
      const qIds = testQuestionRows.map((tq) => tq.question_id);
      let questionRows: PdfNativeQuestionRow[] = [];
      try {
        questionRows = await selectRows<PdfNativeQuestionRow>(
          'pdf_native_questions',
          '*',
          {
            id: `in.(${qIds.join(',')})`,
          }
        );
        console.log('[PDF-NATIVE ADAPTER] Step 3: pdf_native_questions returned', questionRows?.length || 0, 'rows for', qIds.length, 'IDs');
      } catch (qErr) {
        console.warn('[PDF-NATIVE ADAPTER] Step 3 question fetch FAILED:', qErr);
        questionRows = [];
      }

      let setRow: any = null;
      try {
        const sets = await selectRows<{ id: string; pdf_id?: string; pdf_url?: string }>('pdf_native_sets', '*', {
          id: `eq.${testId}`,
          limit: 1,
        });
        if (sets && sets.length > 0) setRow = sets[0];
      } catch {
        // Continue
      }

      const qMap = new Map<string, PdfNativeQuestion>();
      const localQList = await getLocalPdfNativeQuestions();
      localQList.forEach((q) => qMap.set(q.id, q));

      questionRows.forEach((q) => {
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
          pdf_id: q.pdf_id || setRow?.pdf_id || 'ref',
          pdf_url: q.pdf_url || setRow?.pdf_url,
          question_number: q.question_number,
          page_start: Number(q.page_start) || 1,
          page_end: Number(q.page_end) || Number(q.page_start) || 1,
          bbox: cleanBbox,
          regions: regions && regions.length > 0 ? regions : undefined,
          subject: (q.subject || 'Physics') as QuestionSubject,
          chapter: q.chapter,
          topic: q.topic,
          question_type: (q.question_type || 'MCQ') as QuestionType,
          correct_answer: q.correct_answer,
          marks: Number(q.marks) || 4,
          negative_marks: Number(q.negative_marks) || 1,
          review_status: (q.review_status || 'APPROVED') as QuestionReviewStatus,
          raw_detected_text: q.raw_text ?? undefined,
        });
      });

      const resultQuestions: TestQuestion[] = [];
      testQuestionRows.forEach((tq, idx) => {
        const q = qMap.get(tq.question_id);
        if (q) {
          resultQuestions.push(mapPdfNativeQuestionToCbtQuestion(q, testId, idx));
        }
      });

      if (resultQuestions.length > 0) {
        console.log('[PDF-NATIVE ADAPTER] Step 3 SUCCESS:', resultQuestions.length, 'questions');
        return resultQuestions;
      }
    }
  } catch (err) {
    console.warn('[PDF-NATIVE ADAPTER] Step 3 FAILED:', err);
  }

  // 4. Fourth priority: Fallback to local persistent store
  try {
    let localTq = await getLocalPdfNativeTestQuestions(testId);
    if (!localTq || localTq.length === 0) {
      const localSq = await getLocalPdfNativeSetQuestions(testId);
      if (localSq && localSq.length > 0) {
        localTq = localSq.map((sq: PdfNativeSetQuestion) => ({
          id: sq.id,
          test_id: sq.set_id,
          question_id: sq.question_id,
          order_index: sq.order_index,
          created_at: sq.created_at,
        }));
      }
    }
    console.log('[PDF-NATIVE ADAPTER] Step 4: Local test questions:', localTq?.length || 0);

    const localQList = await getLocalPdfNativeQuestions();
    const localQMap = new Map<string, PdfNativeQuestion>(localQList.map((q) => [q.id, q]));

    if (localTq && localTq.length > 0) {
      const resultQuestions: TestQuestion[] = [];
      localTq.forEach((tq, idx) => {
        const q = localQMap.get(tq.question_id);
        if (q) {
          resultQuestions.push(mapPdfNativeQuestionToCbtQuestion(q, testId, idx));
        }
      });

      if (resultQuestions.length > 0) {
        console.log('[PDF-NATIVE ADAPTER] Step 4 SUCCESS:', resultQuestions.length, 'questions');
        return resultQuestions;
      }
    }
  } catch (err) {
    console.warn('[PDF-NATIVE ADAPTER] Step 4 FAILED:', err);
  }

  console.warn('[PDF-NATIVE ADAPTER] ALL STEPS FAILED for testId:', testId, '— returning empty array');
  return [];
}

