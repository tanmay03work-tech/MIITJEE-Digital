import {
  mapPdfNativeQuestionToCbtQuestion,
  mapPdfNativeTestToCbtTestItem,
  fetchPdfNativeCbtQuestions,
} from '../pdf-native/pdfNativeCbtAdapter';
import {
  createPdfNativeSet,
  deletePdfNativeSet,
  getPdfNativeSetQuestions,
} from '../pdf-native/pdfNativeSetService';
import {
  createPdfNativeTest,
  deletePdfNativeTest,
} from '../pdf-native/pdfNativeTestService';
import {
  savePdfNativeQuestionBankBatch,
} from '../pdf-native/pdfNativeBankService';
import {
  scorePdfNativeAttempt,
  submitPdfNativeAttempt,
} from '../pdf-native/pdfNativeScoringService';
import { PdfNativeQuestion, PdfNativeRegion } from '../pdf-native/pdfNativeTypes';

declare const describe: any;
declare const it: any;
declare const expect: any;
declare const beforeAll: any;
declare const afterAll: any;

describe('PDF-Native CBT Strict Visual Source Enforcement & Fail-Closed Tests', () => {
  let testSetId = '';
  let testExamId = '';
  const sourcePdfUrl = 'https://uwuzdggimbbbfgcauzho.supabase.co/storage/v1/object/public/test-pdfs/original_source.pdf';
  const sourcePdfId = 'pdf_source_math_2026';

  const sampleQuestions: PdfNativeQuestion[] = [
    {
      id: 'q_strict_1',
      pdf_id: sourcePdfId,
      pdf_url: sourcePdfUrl,
      question_number: '1',
      page_start: 1,
      page_end: 1,
      bbox: { x: 50, y: 100, width: 400, height: 200 },
      subject: 'Physics',
      question_type: 'MCQ',
      correct_answer: 'A',
      marks: 4,
      negative_marks: 1,
      review_status: 'APPROVED',
    },
    // Page 2 corrected question (e.g. Q14)
    {
      id: 'q_strict_2',
      pdf_id: sourcePdfId,
      pdf_url: sourcePdfUrl,
      question_number: '2',
      page_start: 2,
      page_end: 2,
      bbox: { x: 60, y: 150, width: 420, height: 180 },
      subject: 'Physics',
      question_type: 'MCQ',
      correct_answer: 'B',
      marks: 4,
      negative_marks: 1,
      review_status: 'APPROVED',
    },
    // Multi-page question (Page 1 stem -> Page 2 options)
    {
      id: 'q_strict_3',
      pdf_id: sourcePdfId,
      pdf_url: sourcePdfUrl,
      question_number: '3',
      page_start: 1,
      page_end: 2,
      bbox: { x: 50, y: 700, width: 400, height: 120 },
      regions: [
        {
          id: 'reg_stem',
          pageNumber: 1,
          bbox: { x: 50, y: 700, width: 400, height: 120 },
          role: 'stem',
          orderIndex: 0,
        },
        {
          id: 'reg_options',
          pageNumber: 2,
          bbox: { x: 50, y: 40, width: 400, height: 160 },
          role: 'options',
          orderIndex: 1,
        },
      ],
      subject: 'Physics',
      question_type: 'MCQ',
      correct_answer: 'C',
      marks: 4,
      negative_marks: 1,
      review_status: 'APPROVED',
    },
    // Numerical integer question
    {
      id: 'q_strict_4',
      pdf_id: sourcePdfId,
      pdf_url: sourcePdfUrl,
      question_number: '4',
      page_start: 2,
      page_end: 2,
      bbox: { x: 50, y: 400, width: 400, height: 150 },
      subject: 'Physics',
      question_type: 'INTEGER',
      correct_answer: '42',
      marks: 4,
      negative_marks: 0,
      review_status: 'APPROVED',
    },
  ];

  beforeAll(async () => {
    // 1. Save questions
    await savePdfNativeQuestionBankBatch(sourcePdfId, sourcePdfUrl, sampleQuestions);

    // 2. Create set
    const setRes = await createPdfNativeSet({
      set_name: 'Strict Rendering Source Set',
      subject: 'Physics',
      source_pdf_id: sourcePdfId,
      pdf_url: sourcePdfUrl,
      question_ids: sampleQuestions.map((q) => q.id),
      status: 'READY',
    });
    testSetId = setRes.set.id;

    // 3. Create test linked to set
    const testRes = await createPdfNativeTest({
      title: 'Strict Rendering Production Exam',
      subject: 'Physics',
      duration_minutes: 60,
      question_ids: sampleQuestions.map((q) => q.id),
      status: 'READY',
      set_ids: [testSetId],
    });
    testExamId = testRes.test.id;
  });

  afterAll(async () => {
    try {
      if (testExamId) await deletePdfNativeTest(testExamId);
      if (testSetId) await deletePdfNativeSet(testSetId);
    } catch {
      // Cleanup
    }
  });

  it('delivers 100% original PDF metadata from Set to student CBT questions without data loss', async () => {
    const cbtQuestions = await fetchPdfNativeCbtQuestions(testExamId);
    expect(cbtQuestions.length).toBe(4);

    const q1 = cbtQuestions[0]!;
    expect(q1.pdfId).toBe(sourcePdfId);
    expect(q1.pdfUrl).toBe(sourcePdfUrl);
    expect(q1.pdfNativePage).toBe(1);
    expect(q1.pdfNativeBbox).toEqual({ x: 50, y: 100, width: 400, height: 200 });

    // Verify Page 2 corrected question
    const q2 = cbtQuestions[1]!;
    expect(q2.pdfNativePage).toBe(2);
    expect(q2.pdfNativeBbox).toEqual({ x: 60, y: 150, width: 420, height: 180 });

    // Verify Multi-region / multi-page question (Page 1 -> Page 2)
    const q3 = cbtQuestions[2]!;
    expect(q3.pdfNativeRegions).toBeDefined();
    expect(q3.pdfNativeRegions!.length).toBe(2);
    expect(q3.pdfNativeRegions![0]!.pageNumber).toBe(1);
    expect(q3.pdfNativeRegions![1]!.pageNumber).toBe(2);

    // Verify Integer question
    const q4 = cbtQuestions[3]!;
    expect(q4.type).toBe('integer');
    expect(q4.pdfNativePage).toBe(2);
  });

  it('maps PDF questions to CBT without HTML option text leakage (PDF is single visual source)', () => {
    const mapped = mapPdfNativeQuestionToCbtQuestion(sampleQuestions[0]!, testExamId, 0);
    expect(mapped.prompt).toBe('Question 1');
    expect(mapped.options).toEqual(['A', 'B', 'C', 'D']);
    expect(mapped.pdfNativeBbox).toEqual({ x: 50, y: 100, width: 400, height: 200 });
    expect(mapped.pdfUrl).toBe(sourcePdfUrl);
  });

  it('verifies student answer selection, submission, and scoring for PDF-Native test', async () => {
    const scoreResult = scorePdfNativeAttempt(sampleQuestions, {
      q_strict_1: 'A', // Correct (+4)
      q_strict_2: 'C', // Wrong (-1)
      q_strict_3: '',  // Unattempted (0)
      q_strict_4: '42', // Correct (+4)
    });

    expect(scoreResult.correct_count).toBe(2);
    expect(scoreResult.wrong_count).toBe(1);
    expect(scoreResult.unattempted_count).toBe(1);
    expect(scoreResult.total_score).toBe(7); // 4 - 1 + 0 + 4 = 7

    const submitResponse = await submitPdfNativeAttempt({
      testId: testExamId,
      userId: 'student_strict_001',
      studentName: 'Aarav Sharma',
      answers: {
        q_strict_1: 'A',
        q_strict_2: 'C',
        q_strict_4: '42',
      },
    });

    expect(submitResponse.result.score).toBe(7);
    expect(submitResponse.result.correctAnswers).toBe(2);
    expect(submitResponse.result.wrongAnswers).toBe(1);
    expect(submitResponse.result.unattempted).toBe(1);
  });
});
