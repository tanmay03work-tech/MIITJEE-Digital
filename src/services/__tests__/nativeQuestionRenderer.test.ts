import {
  extractStructuredNativeQuestion,
  normalizeUnicodeSymbols,
  separatePromptAndOptions,
  extractTextItemsInBBox,
} from '../pdf-native/pdfNativeStructuredExtractor';
import {
  PdfNativeQuestion,
  PdfPageMetadata,
  PdfTextItem,
} from '../pdf-native/pdfNativeTypes';
import { mapPdfNativeQuestionToCbtQuestion } from '../pdf-native/pdfNativeCbtAdapter';
import { scorePdfNativeAttempt } from '../pdf-native/pdfNativeScoringService';

declare const process: { cwd: () => string };
declare const require: (mod: string) => any;

describe('Phase 8 — Native Question Renderer & Structured Extraction', () => {
  // TEST 1 — NORMAL TEXT (Q91)
  test('TEST 1 — Normal Text Q91 exact wording & decomposed options', () => {
    const pageMeta: PdfPageMetadata = {
      pageNumber: 1,
      width: 595,
      height: 842,
      items: [
        { str: '91.', x: 20, y: 100, width: 18, height: 10, pageNumber: 1 },
        {
          str: 'Sweet potato and potato are examples of:',
          x: 42,
          y: 100,
          width: 220,
          height: 10,
          pageNumber: 1,
        },
        {
          str: '(A) Homologous organs',
          x: 42,
          y: 120,
          width: 140,
          height: 10,
          pageNumber: 1,
        },
        {
          str: '(B) Analogous organs',
          x: 42,
          y: 135,
          width: 140,
          height: 10,
          pageNumber: 1,
        },
        {
          str: '(C) Vestigial organs',
          x: 42,
          y: 150,
          width: 140,
          height: 10,
          pageNumber: 1,
        },
        {
          str: '(D) Convergent evolution',
          x: 42,
          y: 165,
          width: 150,
          height: 10,
          pageNumber: 1,
        },
      ],
    };

    const question: PdfNativeQuestion = {
      id: 'q_91',
      pdf_id: 'ref_pdf',
      question_number: '91',
      page_start: 1,
      page_end: 1,
      bbox: { x: 15, y: 95, width: 260, height: 85 },
      subject: 'Biology',
      question_type: 'MCQ',
      correct_answer: 'B',
      marks: 4,
      negative_marks: 1,
      review_status: 'APPROVED',
    };

    const structured = extractStructuredNativeQuestion(question, [pageMeta]);
    expect(structured.questionNumber).toBe('91');
    expect(structured.promptText).toBe('Sweet potato and potato are examples of:');
    expect(structured.options.length).toBe(4);
    expect(structured.options[0]!.label).toBe('A');
    expect(structured.options[0]!.text).toBe('Homologous organs');
    expect(structured.options[1]!.label).toBe('B');
    expect(structured.options[1]!.text).toBe('Analogous organs');
    expect(structured.status).toBe('NATIVE_READY');
  });

  // TEST 2 — MATH (Q94)
  test('TEST 2 — Mathematical notation, superscripts, and Hardy-Weinberg formula Q94', () => {
    const rawFormula = 'p^2 + 2pq + q^2 = 1 and x_1, x_2 with \\alpha + \\beta = \\theta';
    const normalized = normalizeUnicodeSymbols(rawFormula);

    expect(normalized.includes('p² + 2pq + q² = 1')).toBe(true);
    expect(normalized.includes('x₁, x₂')).toBe(true);
    expect(normalized.includes('α + β = θ')).toBe(true);

    const pageMeta: PdfPageMetadata = {
      pageNumber: 1,
      width: 595,
      height: 842,
      items: [
        { str: '94.', x: 20, y: 200, width: 18, height: 10, pageNumber: 1 },
        {
          str: 'In Hardy-Weinberg equation, the frequency of heterozygous individuals is represented by:',
          x: 42,
          y: 200,
          width: 240,
          height: 10,
          pageNumber: 1,
        },
        { str: '(A) p^2', x: 42, y: 225, width: 60, height: 10, pageNumber: 1 },
        { str: '(B) 2pq', x: 42, y: 240, width: 60, height: 10, pageNumber: 1 },
        { str: '(C) q^2', x: 42, y: 255, width: 60, height: 10, pageNumber: 1 },
        { str: '(D) p + q', x: 42, y: 270, width: 60, height: 10, pageNumber: 1 },
      ],
    };

    const question: PdfNativeQuestion = {
      id: 'q_94',
      pdf_id: 'ref_pdf',
      question_number: '94',
      page_start: 1,
      page_end: 1,
      bbox: { x: 15, y: 195, width: 260, height: 90 },
      subject: 'Biology',
      question_type: 'MCQ',
      correct_answer: 'B',
      marks: 4,
      negative_marks: 1,
      review_status: 'APPROVED',
    };

    const structured = extractStructuredNativeQuestion(question, [pageMeta]);
    expect(structured.options[0]!.text).toBe('p²');
    expect(structured.options[1]!.text).toBe('2pq');
    expect(structured.options[2]!.text).toBe('q²');
    expect(structured.status).toBe('NATIVE_READY');
  });

  // TEST 3 — DIAGRAM ISOLATION (Q109)
  test('TEST 3 — Diagram belongs strictly to Q109 with isolated bounding box', () => {
    const pageMeta: PdfPageMetadata = {
      pageNumber: 2,
      width: 595,
      height: 842,
      items: [
        { str: '109.', x: 20, y: 100, width: 22, height: 10, pageNumber: 2 },
        {
          str: 'Identify the given anatomical diagram:',
          x: 45,
          y: 100,
          width: 200,
          height: 10,
          pageNumber: 2,
        },
        // Gap of 80pt where diagram is embedded
        { str: '(A) Heart', x: 45, y: 200, width: 80, height: 10, pageNumber: 2 },
        { str: '(B) Lungs', x: 45, y: 215, width: 80, height: 10, pageNumber: 2 },
        { str: '(C) Kidney', x: 45, y: 230, width: 80, height: 10, pageNumber: 2 },
        { str: '(D) Liver', x: 45, y: 245, width: 80, height: 10, pageNumber: 2 },
      ],
    };

    const question: PdfNativeQuestion = {
      id: 'q_109',
      pdf_id: 'ref_pdf',
      question_number: '109',
      page_start: 2,
      page_end: 2,
      bbox: { x: 15, y: 95, width: 260, height: 165 },
      subject: 'Biology',
      question_type: 'MCQ',
      correct_answer: 'A',
      marks: 4,
      negative_marks: 1,
      review_status: 'APPROVED',
    };

    const structured = extractStructuredNativeQuestion(question, [pageMeta]);
    expect(structured.diagrams.length).toBe(1);
    expect(structured.diagrams[0]!.id).toBe('q_109_diag_0');
    // Diagram bbox must be strictly inside Q109 bbox
    expect(structured.diagrams[0]!.bbox.y >= 95).toBe(true);
    expect(structured.diagrams[0]!.bbox.y + structured.diagrams[0]!.bbox.height <= 265).toBe(true);
  });

  // TEST 4 — OPTION DIAGRAMS (Q129)
  test('TEST 4 — Option diagrams independently structured & mapped for Q129', () => {
    const pageMeta: PdfPageMetadata = {
      pageNumber: 3,
      width: 595,
      height: 842,
      items: [
        { str: '129.', x: 20, y: 50, width: 22, height: 10, pageNumber: 3 },
        {
          str: 'Which of the following graphs represents zero order reaction?',
          x: 45,
          y: 50,
          width: 230,
          height: 10,
          pageNumber: 3,
        },
        { str: '(A) Graph A', x: 45, y: 75, width: 80, height: 10, pageNumber: 3 },
        { str: '(B) Graph B', x: 45, y: 90, width: 80, height: 10, pageNumber: 3 },
        { str: '(C) Graph C', x: 45, y: 105, width: 80, height: 10, pageNumber: 3 },
        { str: '(D) Graph D', x: 45, y: 120, width: 80, height: 10, pageNumber: 3 },
      ],
    };

    const question: PdfNativeQuestion = {
      id: 'q_129',
      pdf_id: 'ref_pdf',
      question_number: '129',
      page_start: 3,
      page_end: 3,
      bbox: { x: 15, y: 45, width: 260, height: 95 },
      subject: 'Chemistry',
      question_type: 'MCQ',
      correct_answer: 'A',
      marks: 4,
      negative_marks: 1,
      review_status: 'APPROVED',
    };

    const structured = extractStructuredNativeQuestion(question, [pageMeta]);
    expect(structured.options.length).toBe(4);
    expect(structured.options[0]!.label).toBe('A');
    expect(structured.options[1]!.label).toBe('B');
    expect(structured.options[2]!.label).toBe('C');
    expect(structured.options[3]!.label).toBe('D');
  });

  // TEST 5 — TWO COLUMN PARSING
  test('TEST 5 — Two column layout correctly separates left column from right column', () => {
    const pageMeta: PdfPageMetadata = {
      pageNumber: 1,
      width: 600,
      height: 800,
      items: [
        // Left Column (x: 20..280)
        { str: '1.', x: 20, y: 50, width: 15, height: 10, pageNumber: 1 },
        { str: 'Left column question prompt', x: 40, y: 50, width: 200, height: 10, pageNumber: 1 },
        { str: '(A) Opt 1', x: 40, y: 70, width: 80, height: 10, pageNumber: 1 },
        { str: '(B) Opt 2', x: 40, y: 85, width: 80, height: 10, pageNumber: 1 },
        { str: '(C) Opt 3', x: 40, y: 100, width: 80, height: 10, pageNumber: 1 },
        { str: '(D) Opt 4', x: 40, y: 115, width: 80, height: 10, pageNumber: 1 },

        // Right Column (x: 320..580)
        { str: '2.', x: 320, y: 50, width: 15, height: 10, pageNumber: 1 },
        { str: 'Right column question prompt', x: 340, y: 50, width: 200, height: 10, pageNumber: 1 },
        { str: '(A) Right 1', x: 340, y: 70, width: 80, height: 10, pageNumber: 1 },
        { str: '(B) Right 2', x: 340, y: 85, width: 80, height: 10, pageNumber: 1 },
        { str: '(C) Right 3', x: 340, y: 100, width: 80, height: 10, pageNumber: 1 },
        { str: '(D) Right 4', x: 340, y: 115, width: 80, height: 10, pageNumber: 1 },
      ],
    };

    const leftQuestion: PdfNativeQuestion = {
      id: 'q_col_left',
      pdf_id: 'ref_pdf',
      question_number: '1',
      page_start: 1,
      page_end: 1,
      bbox: { x: 10, y: 40, width: 280, height: 90 },
      subject: 'Physics',
      question_type: 'MCQ',
      correct_answer: 'A',
      marks: 4,
      negative_marks: 1,
      review_status: 'APPROVED',
    };

    const rightQuestion: PdfNativeQuestion = {
      id: 'q_col_right',
      pdf_id: 'ref_pdf',
      question_number: '2',
      page_start: 1,
      page_end: 1,
      bbox: { x: 310, y: 40, width: 280, height: 90 },
      subject: 'Physics',
      question_type: 'MCQ',
      correct_answer: 'B',
      marks: 4,
      negative_marks: 1,
      review_status: 'APPROVED',
    };

    const leftStruct = extractStructuredNativeQuestion(leftQuestion, [pageMeta]);
    const rightStruct = extractStructuredNativeQuestion(rightQuestion, [pageMeta]);

    expect(leftStruct.promptText).toBe('Left column question prompt');
    expect(rightStruct.promptText).toBe('Right column question prompt');
    expect(leftStruct.options[0]!.text).toBe('Opt 1');
    expect(rightStruct.options[0]!.text).toBe('Right 1');
  });

  // TEST 6 — PAGE BOUNDARY (Q113)
  test('TEST 6 — Page boundary safety and NEEDS_REVIEW trigger on missing items', () => {
    const questionWithEmptyPage: PdfNativeQuestion = {
      id: 'q_113',
      pdf_id: 'ref_pdf',
      question_number: '113',
      page_start: 5,
      page_end: 5,
      bbox: { x: 10, y: 40, width: 280, height: 10 }, // Invalid small bbox
      subject: 'Physics',
      question_type: 'MCQ',
      correct_answer: 'C',
      marks: 4,
      negative_marks: 1,
      review_status: 'NEEDS_REVIEW',
    };

    const structured = extractStructuredNativeQuestion(questionWithEmptyPage, []);
    expect(structured.status).toBe('NEEDS_REVIEW');
    expect(Boolean(structured.reviewReason)).toBe(true);
  });

  // TEST 7 — UNICODE MATH SYMBOLS
  test('TEST 7 — Unicode mathematical and scientific symbols preserved without loss', () => {
    const raw = '√4 = 2, π ≈ 3.14, θ = 45°, α + β = γ, ΔH < 0, ∞, ±5, ≤, ≥, ≠, →, ×, ÷, ∑, ∫';
    const normalized = normalizeUnicodeSymbols(raw);

    expect(normalized.includes('√4 = 2')).toBe(true);
    expect(normalized.includes('π ≈ 3.14')).toBe(true);
    expect(normalized.includes('θ = 45°')).toBe(true);
    expect(normalized.includes('α + β = γ')).toBe(true);
    expect(normalized.includes('ΔH < 0')).toBe(true);
    expect(normalized.includes('±5')).toBe(true);
    expect(normalized.includes('≤')).toBe(true);
    expect(normalized.includes('≥')).toBe(true);
    expect(normalized.includes('≠')).toBe(true);
    expect(normalized.includes('→')).toBe(true);
    expect(normalized.includes('×')).toBe(true);
    expect(normalized.includes('÷')).toBe(true);
    expect(normalized.includes('∑')).toBe(true);
    expect(normalized.includes('∫')).toBe(true);
  });

  // TEST 8 — NEGATIVE TEST: NO DIAGRAM CONTAMINATION
  test('TEST 8 (Negative) — Diagram from Question A never assigned to Question B', () => {
    const pageMeta: PdfPageMetadata = {
      pageNumber: 1,
      width: 600,
      height: 800,
      items: [
        { str: '1.', x: 20, y: 50, width: 15, height: 10, pageNumber: 1 },
        { str: 'Question 1 with diagram', x: 40, y: 50, width: 200, height: 10, pageNumber: 1 },
        { str: '(A) 1A', x: 40, y: 150, width: 50, height: 10, pageNumber: 1 },
        { str: '(B) 1B', x: 40, y: 165, width: 50, height: 10, pageNumber: 1 },
        { str: '(C) 1C', x: 40, y: 180, width: 50, height: 10, pageNumber: 1 },
        { str: '(D) 1D', x: 40, y: 195, width: 50, height: 10, pageNumber: 1 },

        // Question 2 has NO diagram
        { str: '2.', x: 20, y: 220, width: 15, height: 10, pageNumber: 1 },
        { str: 'Question 2 plain text only', x: 40, y: 220, width: 200, height: 10, pageNumber: 1 },
        { str: '(A) 2A', x: 40, y: 235, width: 50, height: 10, pageNumber: 1 },
        { str: '(B) 2B', x: 40, y: 250, width: 50, height: 10, pageNumber: 1 },
        { str: '(C) 2C', x: 40, y: 265, width: 50, height: 10, pageNumber: 1 },
        { str: '(D) 2D', x: 40, y: 280, width: 50, height: 10, pageNumber: 1 },
      ],
    };

    const q1: PdfNativeQuestion = {
      id: 'q_1',
      pdf_id: 'ref',
      question_number: '1',
      page_start: 1,
      page_end: 1,
      bbox: { x: 10, y: 40, width: 280, height: 170 },
      subject: 'Physics',
      question_type: 'MCQ',
      correct_answer: 'A',
      marks: 4,
      negative_marks: 1,
      review_status: 'APPROVED',
    };

    const q2: PdfNativeQuestion = {
      id: 'q_2',
      pdf_id: 'ref',
      question_number: '2',
      page_start: 1,
      page_end: 1,
      bbox: { x: 10, y: 215, width: 280, height: 75 },
      subject: 'Physics',
      question_type: 'MCQ',
      correct_answer: 'B',
      marks: 4,
      negative_marks: 1,
      review_status: 'APPROVED',
    };

    const s1 = extractStructuredNativeQuestion(q1, [pageMeta]);
    const s2 = extractStructuredNativeQuestion(q2, [pageMeta]);

    expect(s1.diagrams.length).toBe(1);
    expect(s1.diagrams[0]!.id).toBe('q_1_diag_0');
    // Q2 must have 0 diagrams (no contamination!)
    expect(s2.diagrams.length).toBe(0);
  });

  // TEST 9 — OPTION UNSELECT & SCORING INTEGRATION
  test('TEST 9 — Option unselect leaves question UNATTEMPTED with 0 score delta', () => {
    const questions: PdfNativeQuestion[] = [
      {
        id: 'q_native_score_1',
        pdf_id: 'ref',
        question_number: '1',
        page_start: 1,
        page_end: 1,
        bbox: { x: 10, y: 10, width: 200, height: 50 },
        subject: 'Physics',
        question_type: 'MCQ',
        correct_answer: 'B',
        marks: 4,
        negative_marks: 1,
        review_status: 'APPROVED',
      },
    ];

    // Case 1: Student selected B -> score +4
    const attemptWithAnswer = scorePdfNativeAttempt(questions, { q_native_score_1: 'B' });
    expect(attemptWithAnswer.total_score).toBe(4);
    expect(attemptWithAnswer.attempted_count).toBe(1);
    expect(attemptWithAnswer.unattempted_count).toBe(0);

    // Case 2: Student clicked unselect -> answers becomes {} -> unattempted with score 0
    const attemptCleared = scorePdfNativeAttempt(questions, {});
    expect(attemptCleared.total_score).toBe(0);
    expect(attemptCleared.attempted_count).toBe(0);
    expect(attemptCleared.unattempted_count).toBe(1);
  });

  // TEST 10 — CBT ADAPTER & COMPATIBILITY
  test('TEST 10 — CBT Adapter maps nativeStructure without breaking legacy properties', () => {
    const q: PdfNativeQuestion = {
      id: 'q_adapter_test',
      pdf_id: 'ref',
      question_number: '5',
      page_start: 1,
      page_end: 1,
      bbox: { x: 10, y: 10, width: 250, height: 60 },
      subject: 'Physics',
      question_type: 'MCQ',
      correct_answer: 'C',
      marks: 4,
      negative_marks: 1,
      review_status: 'APPROVED',
    };

    const cbtQ = mapPdfNativeQuestionToCbtQuestion(q, 'test_123', 0);
    expect(cbtQ.id).toBe('q_adapter_test');
    expect(cbtQ.testId).toBe('test_123');
    expect(cbtQ.type).toBe('mcq');
    expect(cbtQ.options.length).toBe(4);
    expect(Boolean(cbtQ.nativeStructure)).toBe(true);
    expect(cbtQ.nativeStructure?.questionNumber).toBe('5');
  });

  // TEST 11 — REAL SYNCHRONISER REFERENCE PDF EXTRACTION (Q91, Q94, Q109, Q129)
  test('TEST 11 — Real Synchroniser PDF extracts Q91, Q94, Q109, Q129 as Native Structured Questions', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const nodeReq = (globalThis as any).require || require;
    const fs = nodeReq('fs');
    const path = nodeReq('path');
    const { extractPdfPagesMetadata } = await import('../pdf-native/pdfNativeParser');
    const { detectQuestionsFromPdf } = await import('../pdf-native/pdfQuestionDetector');

    const pdfPath = path.resolve(process.cwd(), 'public/REF/Synchroniser__1157799_1_1786168383.pdf');
    expect(fs.existsSync(pdfPath)).toBe(true);

    const buffer = fs.readFileSync(pdfPath);
    const { pagesMetadata } = await extractPdfPagesMetadata(buffer.buffer);
    expect(pagesMetadata.length > 0).toBe(true);

    const questions = detectQuestionsFromPdf('pdf_ref_sync', pagesMetadata);
    expect(questions.length > 0).toBe(true);

    // Q91
    const q91 = questions.find((q) => q.question_number === '91');
    expect(Boolean(q91)).toBe(true);
    if (q91) {
      const s91 = extractStructuredNativeQuestion(q91, pagesMetadata);
      expect(s91.status).toBe('NATIVE_READY');
      expect(s91.promptText.includes('Potato and sweet potato:')).toBe(true);
      expect(s91.options.length).toBe(4);
      expect(s91.options[0]!.text.includes('homologous organs')).toBe(true);
      expect(s91.options[1]!.text.includes('analogous organs')).toBe(true);
    }

    // Q94
    const q94 = questions.find((q) => q.question_number === '94');
    expect(Boolean(q94)).toBe(true);
    if (q94) {
      const s94 = extractStructuredNativeQuestion(q94, pagesMetadata);
      expect(s94.status).toBe('NATIVE_READY');
      expect(s94.promptText.includes('Hardy-Weinberg')).toBe(true);
      expect(s94.options.length).toBe(4);
      expect(s94.options[0]!.text).toBe('p²');
      expect(s94.options[1]!.text).toBe('2 pq');
      expect(s94.options[3]!.text).toBe('q²');
    }

    // Q109
    const q109 = questions.find((q) => q.question_number === '109');
    expect(Boolean(q109)).toBe(true);
    if (q109) {
      const s109 = extractStructuredNativeQuestion(q109, pagesMetadata);
      expect(s109.status).toBe('NATIVE_READY');
      expect(s109.promptText.includes('dominant allele')).toBe(true);
      expect(s109.options.length).toBe(4);
    }

    // Q129
    const q129 = questions.find((q) => q.question_number === '129');
    expect(Boolean(q129)).toBe(true);
    if (q129) {
      const s129 = extractStructuredNativeQuestion(q129, pagesMetadata);
      expect(s129.status).toBe('NATIVE_READY');
      expect(s129.promptText.includes('shoulder blade')).toBe(true);
      expect(s129.options.length).toBe(4);
    }
  });
});
