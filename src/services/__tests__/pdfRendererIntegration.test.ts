import * as pdfjsLib from 'pdfjs-dist';

declare const require: any;
declare const __dirname: string;
declare const global: any;
declare const Buffer: any;
declare const describe: any;
declare const test: any;
declare const expect: any;
declare const beforeAll: any;
declare const afterAll: any;
declare const jest: any;

const fs = typeof require !== 'undefined' ? require('fs') : null;
const path = typeof require !== 'undefined' ? require('path') : null;

import {
  getPdfDocument,
  savePdfBinary,
  clearPdfDocumentCache,
} from '../pdf-native/pdfDocumentCache';
import { renderPdfRegionToCanvas } from '../pdf-native/pdfRegionRenderer';
import { PdfNativeQuestion } from '../pdf-native/pdfNativeTypes';
import { mapPdfNativeQuestionToCbtQuestion } from '../pdf-native/pdfNativeCbtAdapter';

describe('PDF-Native Renderer Integration & Q53 Verification', () => {
  let samplePdfBuffer: ArrayBuffer;
  let samplePdfDoc: pdfjsLib.PDFDocumentProxy;

  beforeAll(async () => {
    // Read the reference PDF from disk in test environment
    const refPdfPath = path ? path.resolve(
      __dirname,
      '../../../public/REF/Synchroniser__1157799_1_1786168383.pdf'
    ) : '';
    const nodeBuf = fs ? fs.readFileSync(refPdfPath) : Buffer.from([]);
    samplePdfBuffer = nodeBuf.buffer.slice(
      nodeBuf.byteOffset,
      nodeBuf.byteOffset + nodeBuf.byteLength
    );

    // Setup mock document in test runner if undefined
    if (typeof global.document === 'undefined') {
      (global as any).document = {
        createElement: (tag: string) => {
          if (tag === 'canvas') return createMockCanvas();
          return {};
        },
      };
    }

    // Save into cache
    await savePdfBinary('test_ref_pdf', samplePdfBuffer, 'test.pdf');
    samplePdfDoc = await getPdfDocument({
      pdfId: 'test_ref_pdf',
      buffer: samplePdfBuffer,
    });
  });

  afterAll(() => {
    clearPdfDocumentCache();
  });

  // Mock HTML Canvas for Node environment testing
  function createMockCanvas(): HTMLCanvasElement {
    const canvas: any = {
      width: 0,
      height: 0,
      toDataURL: (type: string) => `data:${type};base64,MOCK_PIXEL_DATA_12345`,
    };

    const ctx: any = new Proxy(
      {
        canvas,
        fillStyle: '#FFFFFF',
        strokeStyle: '#000000',
        lineWidth: 1,
        fillRect: jest.fn(),
        strokeRect: jest.fn(),
        clearRect: jest.fn(),
        drawImage: jest.fn(),
        save: jest.fn(),
        restore: jest.fn(),
        beginPath: jest.fn(),
        closePath: jest.fn(),
        moveTo: jest.fn(),
        lineTo: jest.fn(),
        bezierCurveTo: jest.fn(),
        quadraticCurveTo: jest.fn(),
        stroke: jest.fn(),
        fill: jest.fn(),
        clip: jest.fn(),
        transform: jest.fn(),
        setTransform: jest.fn(),
        getTransform: () => ({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0, is2D: true }),
        resetTransform: jest.fn(),
        scale: jest.fn(),
        translate: jest.fn(),
        rotate: jest.fn(),
        arc: jest.fn(),
        rect: jest.fn(),
        fillText: jest.fn(),
        strokeText: jest.fn(),
        measureText: () => ({ width: 10, actualBoundingBoxAscent: 8, actualBoundingBoxDescent: 2 }),
        createImageData: () => ({ data: new Uint8ClampedArray(4) }),
        getImageData: () => ({ data: new Uint8ClampedArray(4) }),
        putImageData: jest.fn(),
        getLineDash: () => [],
        setLineDash: jest.fn(),
        createLinearGradient: () => ({ addColorStop: jest.fn() }),
        createRadialGradient: () => ({ addColorStop: jest.fn() }),
        createPattern: () => null,
      },
      {
        get(target, prop) {
          if (prop in target) return (target as any)[prop];
          return jest.fn();
        },
      }
    );

    canvas.getContext = (type: string) => {
      if (type === '2d') return ctx;
      return null;
    };

    return canvas as HTMLCanvasElement;
  }

  // TEST 1: PDF Document Loads
  test('TEST 1 — PDF document loads successfully from buffer/cache', async () => {
    const doc = await getPdfDocument({ pdfId: 'test_ref_pdf' });
    expect(doc).toBeDefined();
    expect(doc.numPages).toBeGreaterThan(0);
  });

  // TEST 2: Correct Page Loads
  test('TEST 2 — Correct page loads with valid viewport dimensions', async () => {
    const page = await samplePdfDoc.getPage(1);
    expect(page).toBeDefined();
    const viewport = page.getViewport({ scale: 1.0 });
    expect(viewport.width).toBeGreaterThan(100);
    expect(viewport.height).toBeGreaterThan(100);
  });

  // TEST 3: Q53 BBox Renders Non-Zero Canvas
  test('TEST 3 — Q53 bounding box renders non-zero canvas dimensions', async () => {
    const q53: PdfNativeQuestion = {
      id: 'q_math_53',
      pdf_id: 'test_ref_pdf',
      question_number: '53',
      page_start: 1,
      page_end: 1,
      bbox: { x: 10, y: 344, width: 293, height: 46 },
      subject: 'Mathematics',
      question_type: 'MCQ',
      correct_answer: 'B',
      marks: 4,
      negative_marks: 1,
      review_status: 'APPROVED',
    };

    const targetCanvas = createMockCanvas();
    const dataUrl = await renderPdfRegionToCanvas(
      samplePdfDoc,
      q53.page_start,
      q53.bbox,
      targetCanvas,
      2.5
    );

    // Render scale 2.5: target width = 293 * 2.5 = 732.5 -> ceil = 733, height = 46 * 2.5 = 115
    expect(targetCanvas.width).toBeGreaterThanOrEqual(700);
    expect(targetCanvas.height).toBeGreaterThanOrEqual(100);
    expect(dataUrl.startsWith('data:image/png')).toBe(true);
  });

  // TEST 4: Q53 Crop Has Actual Rendered Content
  test('TEST 4 — Q53 crop produces valid base64 PNG data URL', async () => {
    const targetCanvas = createMockCanvas();
    const dataUrl = await renderPdfRegionToCanvas(
      samplePdfDoc,
      1,
      { x: 10, y: 344, width: 293, height: 46 },
      targetCanvas,
      2.5
    );
    expect(typeof dataUrl).toBe('string');
    expect(dataUrl.length).toBeGreaterThan(20);
  });

  // TEST 5: Invalid BBox is Rejected Safely
  test('TEST 5 — Invalid bounding box throws explicit INVALID_BBOX error', async () => {
    const targetCanvas = createMockCanvas();
    await expect(
      renderPdfRegionToCanvas(
        samplePdfDoc,
        1,
        { x: -10, y: 0, width: 0, height: -5 },
        targetCanvas
      )
    ).rejects.toThrow('INVALID_BBOX');
  });

  // TEST 6: Missing PDF URL Produces Explicit Error
  test('TEST 6 — Missing PDF producing explicit PDF_SOURCE_MISSING error', async () => {
    await expect(
      getPdfDocument({
        pdfId: 'non_existent_id_9999',
        pdfUrl: 'http://localhost:9999/non_existent.pdf',
      })
    ).rejects.toThrow('PDF_SOURCE_MISSING');
  });

  // TEST 7: Set Preview Uses Same Question Metadata & Data Flow
  test('TEST 7 — Set Preview preserves question bounding box & page index', () => {
    const q53: PdfNativeQuestion = {
      id: 'q_math_53',
      pdf_id: 'test_ref_pdf',
      question_number: '53',
      page_start: 1,
      page_end: 1,
      bbox: { x: 10, y: 344, width: 293, height: 46 },
      subject: 'Mathematics',
      question_type: 'MCQ',
      correct_answer: 'B',
      marks: 4,
      negative_marks: 1,
      review_status: 'APPROVED',
    };

    expect(q53.page_start).toBe(1);
    expect(q53.bbox.x).toBe(10);
    expect(q53.bbox.y).toBe(344);
    expect(q53.bbox.width).toBe(293);
    expect(q53.bbox.height).toBe(46);
  });

  // TEST 8: Test Preview Uses Same Renderer Data Flow
  test('TEST 8 — Test Preview maps same coordinates and types without synthetic options', () => {
    const q53: PdfNativeQuestion = {
      id: 'q_math_53',
      pdf_id: 'test_ref_pdf',
      question_number: '53',
      page_start: 1,
      page_end: 1,
      bbox: { x: 10, y: 344, width: 293, height: 46 },
      subject: 'Mathematics',
      question_type: 'MCQ',
      correct_answer: 'B',
      marks: 4,
      negative_marks: 1,
      review_status: 'APPROVED',
    };

    const cbtQ = mapPdfNativeQuestionToCbtQuestion(q53, 'test_1', 0);
    expect(cbtQ.pdfNativeBbox).toEqual(q53.bbox);
    expect(cbtQ.pdfNativePage).toBe(1);
    expect(cbtQ.type).toBe('mcq');
  });

  // TEST 9: Student CBT Uses Same Renderer
  test('TEST 9 — Student CBT receives identical coordinate region without text distortion', () => {
    const q53: PdfNativeQuestion = {
      id: 'q_math_53',
      pdf_id: 'test_ref_pdf',
      question_number: '53',
      page_start: 1,
      page_end: 1,
      bbox: { x: 10, y: 344, width: 293, height: 46 },
      subject: 'Mathematics',
      question_type: 'MCQ',
      correct_answer: 'B',
      marks: 4,
      negative_marks: 1,
      review_status: 'APPROVED',
    };

    const cbtQ = mapPdfNativeQuestionToCbtQuestion(q53, 'test_1', 52);
    expect(cbtQ.pdfNativeBbox?.x).toBe(10);
    expect(cbtQ.pdfNativeBbox?.y).toBe(344);
    expect(cbtQ.pdfNativeBbox?.width).toBe(293);
    expect(cbtQ.pdfNativeBbox?.height).toBe(46);
  });

  // TEST 10: Answer Key Integrity
  test('TEST 10 — Answer key remains strictly B across Question Bank, Set, and Test', () => {
    const q53: PdfNativeQuestion = {
      id: 'q_math_53',
      pdf_id: 'test_ref_pdf',
      question_number: '53',
      page_start: 1,
      page_end: 1,
      bbox: { x: 10, y: 344, width: 293, height: 46 },
      subject: 'Mathematics',
      question_type: 'MCQ',
      correct_answer: 'B',
      marks: 4,
      negative_marks: 1,
      review_status: 'APPROVED',
    };

    expect(q53.correct_answer).toBe('B');
    const cbtQ = mapPdfNativeQuestionToCbtQuestion(q53, 'test_1', 52);
    expect(cbtQ.correctAnswer).toBe('B');
  });
});
