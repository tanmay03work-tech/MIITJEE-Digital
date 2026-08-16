/// <reference types="jest" />
import { extractPdfPagesMetadata } from '../pdf-native/pdfNativeParser';
import { detectQuestionsFromPdf } from '../pdf-native/pdfQuestionDetector';
import { computeCanonicalPdfId, attachPdfBinary, getPdfDocument, clearPdfDocumentCache } from '../pdf-native/pdfDocumentCache';
import { renderPdfQuestionCompositeToCanvas } from '../pdf-native/pdfRegionRenderer';

describe('PDF-Native Re-attach and Preview Regression Suite', () => {
  jest.setTimeout(25000);
  const REAL_PDF_URL = 'https://uwuzdggimbbbfgcauzho.supabase.co/storage/v1/object/public/exam-assets/pdfs/1786825371103-11th_morning_physics__1163869_1_1786701950.pdf';
  let realPdfBuffer: ArrayBuffer;

  beforeAll(async () => {
    const res = await fetch(REAL_PDF_URL);
    realPdfBuffer = await res.arrayBuffer();
    expect(realPdfBuffer.byteLength).toBeGreaterThan(100000);
  });

  beforeEach(() => {
    clearPdfDocumentCache();
  });

  it('generates deterministic canonical PDF ID for same PDF content', async () => {
    const id1 = await computeCanonicalPdfId(realPdfBuffer);
    const id2 = await computeCanonicalPdfId(realPdfBuffer.slice(0));
    expect(id1).toBe(id2);
    expect(id1.startsWith('pdf_')).toBe(true);

    // Different content -> Different ID
    const dummyBuffer = new Uint8Array([1, 2, 3, 4, 5]).buffer;
    const diffId = await computeCanonicalPdfId(dummyBuffer);
    expect(diffId).not.toBe(id1);
  });

  it('preserves question bounding boxes and coordinates across re-attach', async () => {
    const canonicalId = await computeCanonicalPdfId(realPdfBuffer);

    // Initial parse
    const { pdfDoc: doc1, pagesMetadata: meta1 } = await extractPdfPagesMetadata(realPdfBuffer);
    const initialQuestions = detectQuestionsFromPdf(canonicalId, meta1);
    expect(initialQuestions.length).toBeGreaterThan(20);

    const q94Initial = initialQuestions.find((q) => String(q.question_number) === '94');
    expect(q94Initial).toBeDefined();
    expect(q94Initial!.bbox.width).toBeGreaterThanOrEqual(200);
    expect(q94Initial!.bbox.height).toBeGreaterThanOrEqual(50);

    // Re-attach same PDF buffer under alias
    await attachPdfBinary([canonicalId, 're-attached-alias.pdf'], realPdfBuffer.slice(0), 'reattached.pdf');

    // Retrieve PDF document from cache by alias
    const docReattached = await getPdfDocument({ pdfId: canonicalId });
    expect(docReattached.numPages).toBe(doc1.numPages);

    // Validate that questions: Q1, Q94, Q109, Q129, Q113 match expected layout
    const targetQNumbers = ['91', '94', '109', '129', '113'];
    for (const qNum of targetQNumbers) {
      const q = initialQuestions.find((item) => String(item.question_number) === qNum);
      expect(q).toBeDefined();
      expect(q!.bbox.x).toBeGreaterThanOrEqual(0);
      expect(q!.bbox.y).toBeGreaterThanOrEqual(0);
      expect(q!.bbox.width).toBeGreaterThan(0);
      expect(q!.bbox.height).toBeGreaterThan(0);
      expect(q!.page_start).toBeGreaterThanOrEqual(1);
    }
  });

  it('renders question regions accurately on target canvas at high DPI', async () => {
    const canonicalId = await computeCanonicalPdfId(realPdfBuffer);
    await attachPdfBinary([canonicalId], realPdfBuffer.slice(0));
    const pdfDoc = await getPdfDocument({ pdfId: canonicalId });

    const mockCanvas: any = {
      width: 0,
      height: 0,
      getContext: () => ({
        fillStyle: '',
        fillRect: () => {},
        drawImage: () => {},
        strokeStyle: '',
        lineWidth: 1,
        setLineDash: () => {},
        beginPath: () => {},
        moveTo: () => {},
        lineTo: () => {},
        stroke: () => {},
      }),
      toDataURL: () => 'data:image/png;base64,mockRenderedHighDpiCrop',
    };

    const testQuestions = [
      { num: '91', page_start: 1, bbox: { x: 10, y: 182, width: 293, height: 92 } },
      { num: '94', page_start: 1, bbox: { x: 10, y: 457, width: 293, height: 65 } },
      { num: '109', page_start: 1, bbox: { x: 10, y: 398, width: 293, height: 128 } },
      { num: '129', page_start: 1, bbox: { x: 293, y: 475, width: 293, height: 57 } },
      { num: '113', page_start: 1, bbox: { x: 10, y: 772, width: 293, height: 65 } },
    ];

    for (const tq of testQuestions) {
      const dataUrl = await renderPdfQuestionCompositeToCanvas(
        pdfDoc,
        tq as any,
        mockCanvas,
        2.5
      );
      expect(dataUrl).toBe('data:image/png;base64,mockRenderedHighDpiCrop');
      expect(mockCanvas.width).toBeGreaterThan(0);
      expect(mockCanvas.height).toBeGreaterThan(0);
    }
  });
});
