/// <reference types="jest" />
import { extractPdfPagesMetadata } from '../pdf-native/pdfNativeParser';
import { detectQuestionsFromPdf } from '../pdf-native/pdfQuestionDetector';

describe('PDF Reattach & Coordinate Audit', () => {
  jest.setTimeout(25000);
  it('loads real PDF, detects questions with proper point coordinates, and verifies rendering', async () => {
    const PDF_URL = 'https://uwuzdggimbbbfgcauzho.supabase.co/storage/v1/object/public/exam-assets/pdfs/1786825371103-11th_morning_physics__1163869_1_1786701950.pdf';
    const res = await fetch(PDF_URL);
    const buffer = await res.arrayBuffer();
    expect(buffer.byteLength).toBeGreaterThan(100000);

    const { pdfDoc, pagesMetadata } = await extractPdfPagesMetadata(buffer);
    expect(pdfDoc.numPages).toBe(24);
    expect(pagesMetadata[0]!.width).toBeCloseTo(595, 0);
    expect(pagesMetadata[0]!.height).toBeCloseTo(842, 0);

    console.log('[PDF-NATIVE AUDIT] Page 1 dimensions:', pagesMetadata[0]!.width, 'x', pagesMetadata[0]!.height);

    const questions = detectQuestionsFromPdf('pdf_test_real', pagesMetadata);
    console.log('[PDF-NATIVE AUDIT] Detected questions count:', questions.length);

    expect(questions.length).toBeGreaterThanOrEqual(25);

    const firstQ = questions[0]!;
    console.log('[PDF-NATIVE PREVIEW DEBUG]');
    console.log('question_id:', firstQ.id);
    console.log('pdf_id:', firstQ.pdf_id);
    console.log('page:', firstQ.page_start);
    console.log('bbox:', JSON.stringify(firstQ.bbox));
    console.log('pdf_document_width:', pagesMetadata[0]!.width);
    console.log('pdf_document_height:', pagesMetadata[0]!.height);

    expect(firstQ.bbox.width).toBeGreaterThanOrEqual(150);
    expect(firstQ.bbox.height).toBeGreaterThanOrEqual(40);
    expect(firstQ.bbox.x).toBeGreaterThanOrEqual(0);
    expect(firstQ.bbox.y).toBeGreaterThanOrEqual(0);
    expect(firstQ.bbox.x + firstQ.bbox.width).toBeLessThanOrEqual(pagesMetadata[0]!.width + 20);

    // Test specific questions: Q94, Q109, Q129, Q113
    const q94 = questions.find((q) => String(q.question_number) === '94');
    expect(q94).toBeDefined();
    console.log('Q94 bbox:', JSON.stringify(q94!.bbox));

    const q109 = questions.find((q) => String(q.question_number) === '109');
    expect(q109).toBeDefined();
    console.log('Q109 bbox:', JSON.stringify(q109!.bbox));

    const q129 = questions.find((q) => String(q.question_number) === '129');
    expect(q129).toBeDefined();
    console.log('Q129 bbox:', JSON.stringify(q129!.bbox));

    const q113 = questions.find((q) => String(q.question_number) === '113');
    expect(q113).toBeDefined();
    console.log('Q113 bbox:', JSON.stringify(q113!.bbox));
  });
});
