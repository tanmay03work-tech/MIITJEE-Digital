import { detectQuestionsFromPdf } from '../pdf-native/pdfQuestionDetector';
import { PdfNativeQuestion, PdfNativeRegion, PdfPageMetadata, PdfTextItem } from '../pdf-native/pdfNativeTypes';
import { renderPdfQuestionCompositeToCanvas, renderPdfRegionToCanvas } from '../pdf-native/pdfRegionRenderer';
import { mapPdfNativeQuestionToCbtQuestion } from '../pdf-native/pdfNativeCbtAdapter';

declare const describe: any;
declare const test: any;
declare const expect: any;
declare const jest: any;

describe('PDF-Native Multi-Region Composition & Q32 Mandatory Validation', () => {
  // Mock PDF Page with 2-Column layout:
  // Left Column (x < 297):
  //   - Q31 (y: 80..300)
  //   - Q32 Stem (y: 560..800 at bottom of page)
  // Right Column (x > 297):
  //   - Q32 Options (1)-(4) (y: 60..190 at upper-right)
  //   - Q33 (y: 220..420)
  //   - Q34..Q39 (y: 440..800)
  const mockPageMetadata: PdfPageMetadata = {
    pageNumber: 1,
    width: 595,
    height: 842,
    items: [
      // Q31 in left column
      { str: '31. An ideal gas undergoes isothermal expansion.', x: 20, y: 80, width: 250, height: 14, pageNumber: 1 },
      { str: 'Find the work done during the process.', x: 20, y: 110, width: 200, height: 14, pageNumber: 1 },
      { str: '(1) nRT ln(V2/V1)  (2) nRT (3) zero (4) infinity', x: 20, y: 150, width: 240, height: 14, pageNumber: 1 },

      // Q32 Stem in bottom-left column
      { str: '32. A spherical mirror of focal length f forms an image', x: 20, y: 560, width: 260, height: 14, pageNumber: 1 },
      { str: 'of an object placed at distance u from the pole.', x: 20, y: 590, width: 240, height: 14, pageNumber: 1 },
      { str: 'If the magnification produced is m = -2, the distance v is:', x: 20, y: 630, width: 255, height: 14, pageNumber: 1 },

      // Q32 Options in upper-right column
      { str: '(1) 2f', x: 320, y: 60, width: 60, height: 14, pageNumber: 1 },
      { str: '(2) -2f', x: 420, y: 60, width: 60, height: 14, pageNumber: 1 },
      { str: '(3) 3f/2', x: 320, y: 100, width: 60, height: 14, pageNumber: 1 },
      { str: '(4) -3f', x: 420, y: 100, width: 60, height: 14, pageNumber: 1 },

      // Q33 starting in right column below Q32 options
      { str: '33. A block of mass m rests on a rough horizontal surface.', x: 320, y: 220, width: 260, height: 14, pageNumber: 1 },
      { str: 'A force F is applied at an angle theta to the horizontal.', x: 320, y: 250, width: 250, height: 14, pageNumber: 1 },
      { str: '(1) mg/(cos theta) (2) mg (3) zero (4) 2mg', x: 320, y: 290, width: 230, height: 14, pageNumber: 1 },

      // Q34 in right column
      { str: '34. The electric flux through a closed surface is:', x: 320, y: 440, width: 240, height: 14, pageNumber: 1 },
      { str: '(1) q/eps0 (2) zero (3) 2q/eps0 (4) q', x: 320, y: 480, width: 220, height: 14, pageNumber: 1 },

      // Q35 in right column
      { str: '35. Magnetic field at the center of circular loop:', x: 320, y: 620, width: 250, height: 14, pageNumber: 1 },
      { str: '(1) mu0 I / (2R) (2) mu0 I / R (3) zero (4) 2 mu0 I / R', x: 320, y: 660, width: 250, height: 14, pageNumber: 1 },
    ],
  };

  test('TEST 1: Q32 is detected with multi-region composition (Stem in Col 0, Options in Col 1)', () => {
    const questions = detectQuestionsFromPdf('pdf_test_split', [mockPageMetadata]);

    expect(questions.length).toBe(5);

    const q31 = questions.find((q) => q.question_number === '31');
    const q32 = questions.find((q) => q.question_number === '32');
    const q33 = questions.find((q) => q.question_number === '33');

    expect(q31).toBeDefined();
    expect(q32).toBeDefined();
    expect(q33).toBeDefined();

    // Standard question Q31 has single bbox (no multi-region)
    expect(q31?.regions).toBeUndefined();
    expect(q31?.bbox.x).toBe(10);
    expect(q31?.bbox.width).toBe(293);

    // Q32 is detected as multi-region
    expect(q32?.regions).toBeDefined();
    expect(q32?.regions?.length).toBe(2);

    const stemRegion = q32?.regions?.[0];
    const optionsRegion = q32?.regions?.[1];

    expect(stemRegion?.role).toBe('stem');
    expect(stemRegion?.pageNumber).toBe(1);
    expect(stemRegion?.bbox.x).toBe(10); // Column 0
    expect(stemRegion?.bbox.y).toBeLessThanOrEqual(560);

    expect(optionsRegion?.role).toBe('options');
    expect(optionsRegion?.pageNumber).toBe(1);
    expect(optionsRegion?.bbox.x).toBe(293); // Column 1
    expect(optionsRegion?.bbox.y).toBeLessThanOrEqual(60);

    // Mandatory check: Q32 options boundary MUST be strictly above Q33 starting Y (y=220)
    const optionsBottom = optionsRegion!.bbox.y + optionsRegion!.bbox.height;
    expect(optionsBottom).toBeLessThanOrEqual(220); // Zero Q33-Q39 overlap!

    // Ambiguity rule: Multi-region split requires faculty review
    expect(q32?.review_status).toBe('NEEDS_REVIEW');
    expect(q32?.notes).toContain('Multi-region split');
  });

  test('TEST 2: Standard question Q33 preserves single bbox and excludes Q32 content', () => {
    const questions = detectQuestionsFromPdf('pdf_test_split', [mockPageMetadata]);
    const q33 = questions.find((q) => q.question_number === '33');

    expect(q33).toBeDefined();
    expect(q33?.regions).toBeUndefined(); // Standard single-region
    expect(q33?.bbox.x).toBe(293); // Column 1
    expect(q33?.bbox.y).toBe(214); // 220 - 6
  });

  test('TEST 3: CBT adapter translates multi-region question with pdfNativeRegions', () => {
    const questions = detectQuestionsFromPdf('pdf_test_split', [mockPageMetadata]);
    const q32 = questions.find((q) => q.question_number === '32')!;

    const cbtQ = mapPdfNativeQuestionToCbtQuestion(q32, 'test_123', 1);

    expect(cbtQ.pdfNativeBbox).toEqual(q32.bbox);
    expect(cbtQ.pdfNativeRegions).toEqual(q32.regions);
    expect(cbtQ.pdfNativeRegions?.length).toBe(2);
    expect(cbtQ.type).toBe('mcq');
  });

  test('TEST 4: renderPdfQuestionCompositeToCanvas renders multi-region Q32 correctly', async () => {
    const mockPage = {
      getViewport: () => ({ width: 595 * 2.5, height: 842 * 2.5 }),
      render: () => ({ promise: Promise.resolve() }),
    };

    const mockPdfDoc: any = {
      numPages: 1,
      getPage: async () => mockPage,
    };

    const targetCanvas: any = {
      width: 0,
      height: 0,
      getContext: () => ({
        fillStyle: '',
        fillRect: jest.fn(),
        drawImage: jest.fn(),
        beginPath: jest.fn(),
        moveTo: jest.fn(),
        lineTo: jest.fn(),
        stroke: jest.fn(),
        setLineDash: jest.fn(),
      }),
      toDataURL: (mime: string) => `data:${mime};base64,MOCK_COMPOSITE_Q32_IMAGE`,
    };

    const questions = detectQuestionsFromPdf('pdf_test_split', [mockPageMetadata]);
    const q32 = questions.find((q) => q.question_number === '32')!;

    const resultDataUrl = await renderPdfQuestionCompositeToCanvas(
      mockPdfDoc,
      q32,
      targetCanvas,
      2.5
    );

    expect(resultDataUrl).toBe('data:image/png;base64,MOCK_COMPOSITE_Q32_IMAGE');
    expect(targetCanvas.width).toBeGreaterThan(0);
    expect(targetCanvas.height).toBeGreaterThan(0);
  });

  test('TEST 5: Single-region questions fallback to standard render without overhead', async () => {
    const mockPage = {
      getViewport: () => ({ width: 595 * 2.5, height: 842 * 2.5 }),
      render: () => ({ promise: Promise.resolve() }),
    };

    const mockPdfDoc: any = {
      numPages: 1,
      getPage: async () => mockPage,
    };

    const targetCanvas: any = {
      width: 0,
      height: 0,
      getContext: () => ({
        fillStyle: '',
        fillRect: jest.fn(),
        drawImage: jest.fn(),
      }),
      toDataURL: (mime: string) => `data:${mime};base64,MOCK_SINGLE_Q31_IMAGE`,
    };

    const questions = detectQuestionsFromPdf('pdf_test_split', [mockPageMetadata]);
    const q31 = questions.find((q) => q.question_number === '31')!;

    const resultDataUrl = await renderPdfQuestionCompositeToCanvas(
      mockPdfDoc,
      q31,
      targetCanvas,
      2.5
    );

    expect(resultDataUrl).toBe('data:image/png;base64,MOCK_SINGLE_Q31_IMAGE');
  });

  test('TEST 6: Faculty can add, remove, and reorder regions dynamically', () => {
    const initialRegion1: PdfNativeRegion = {
      id: 'reg_1',
      pageNumber: 1,
      bbox: { x: 10, y: 550, width: 280, height: 250 },
      role: 'stem',
      orderIndex: 0,
    };

    const initialRegion2: PdfNativeRegion = {
      id: 'reg_2',
      pageNumber: 1,
      bbox: { x: 310, y: 60, width: 270, height: 140 },
      role: 'options',
      orderIndex: 1,
    };

    let regions = [initialRegion1, initialRegion2];

    // Faculty adds Region 3 (e.g. Diagram)
    const diagramRegion: PdfNativeRegion = {
      id: 'reg_3',
      pageNumber: 1,
      bbox: { x: 10, y: 700, width: 200, height: 100 },
      role: 'diagram',
      orderIndex: 2,
    };
    regions = [...regions, diagramRegion];
    expect(regions.length).toBe(3);

    // Faculty reorders Region 3 to index 1 (between stem and options)
    const [moved] = regions.splice(2, 1);
    regions.splice(1, 0, moved!);
    regions = regions.map((r, idx) => ({ ...r, orderIndex: idx }));

    expect(regions[1]?.id).toBe('reg_3');
    expect(regions[1]?.orderIndex).toBe(1);
    expect(regions[2]?.id).toBe('reg_2');
    expect(regions[2]?.orderIndex).toBe(2);

    // Faculty removes a region
    regions = regions.filter((r) => r.id !== 'reg_3').map((r, idx) => ({ ...r, orderIndex: idx }));
    expect(regions.length).toBe(2);
    expect(regions[0]?.id).toBe('reg_1');
    expect(regions[1]?.id).toBe('reg_2');
  });
});
