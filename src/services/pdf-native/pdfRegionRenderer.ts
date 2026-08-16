import * as pdfjsLib from 'pdfjs-dist';
import { PdfNativeBBox, PdfNativeRegion } from './pdfNativeTypes';

declare const process: { env: Record<string, string> };

/**
 * Render a single cropped region of a PDF page to a target Canvas at high resolution.
 * Preserves 100% visual fidelity of original math, formulas, diagrams, fonts, and Hindi/English typography.
 */
export async function renderPdfRegionToCanvas(
  pdfDoc: pdfjsLib.PDFDocumentProxy,
  pageNumber: number,
  bbox: PdfNativeBBox,
  targetCanvas: HTMLCanvasElement,
  renderScale: number = 2.5
): Promise<string> {
  if (!pdfDoc) {
    throw new Error('PDF_LOAD_FAILED: Null or undefined PDF document proxy passed to renderer');
  }

  // 1. Validate Page Number
  const resolvedPage = Math.max(1, Math.min(pageNumber || 1, pdfDoc.numPages));
  if (pageNumber < 1 || pageNumber > pdfDoc.numPages) {
    console.warn(`[pdfRegionRenderer] Page ${pageNumber} out of range [1..${pdfDoc.numPages}]. Clamped to ${resolvedPage}.`);
  }

  // 2. Validate BBox
  if (!bbox || typeof bbox.x !== 'number' || typeof bbox.y !== 'number' || bbox.width <= 0 || bbox.height <= 0) {
    throw new Error(
      `INVALID_BBOX: Invalid bounding box [x=${bbox?.x}, y=${bbox?.y}, w=${bbox?.width}, h=${bbox?.height}]`
    );
  }

  let page: pdfjsLib.PDFPageProxy;
  try {
    page = await pdfDoc.getPage(resolvedPage);
  } catch (pageErr) {
    throw new Error(
      `PDF_PAGE_LOAD_FAILED: Failed to load page ${resolvedPage} of ${pdfDoc.numPages}: ${
        pageErr instanceof Error ? pageErr.message : String(pageErr)
      }`
    );
  }

  const viewport = page.getViewport({ scale: renderScale });

  // 3. Coordinate conversion & clamping in scaled pixel space
  const srcX = Math.max(0, bbox.x * renderScale);
  const srcY = Math.max(0, bbox.y * renderScale);
  const rawW = bbox.width * renderScale;
  const rawH = bbox.height * renderScale;

  const cropX = Math.min(srcX, Math.max(0, viewport.width - 1));
  const cropY = Math.min(srcY, Math.max(0, viewport.height - 1));
  const cropW = Math.max(1, Math.min(rawW, viewport.width - cropX));
  const cropH = Math.max(1, Math.min(rawH, viewport.height - cropY));

  // 4. Offscreen canvas for rendering full page
  const fullCanvas: any =
    typeof document !== 'undefined'
      ? document.createElement('canvas')
      : typeof OffscreenCanvas !== 'undefined'
      ? new OffscreenCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height))
      : targetCanvas;

  fullCanvas.width = Math.ceil(viewport.width);
  fullCanvas.height = Math.ceil(viewport.height);
  const fullCtx = fullCanvas.getContext('2d');

  if (!fullCtx) {
    throw new Error('PDF_CANVAS_RENDER_FAILED: Failed to get 2D rendering context for offscreen PDF page');
  }

  // 4. Render PDF page (in browser: full high-res page render; in node test: mock page fill)
  if (typeof process !== 'undefined' && process.env?.NODE_ENV === 'test') {
    fullCtx.fillStyle = '#FFFFFF';
    fullCtx.fillRect(0, 0, fullCanvas.width, fullCanvas.height);
  } else {
    try {
      await page.render({
        canvasContext: fullCtx,
        viewport,
      }).promise;
    } catch (renderErr) {
      throw new Error(
        `PDF_CANVAS_RENDER_FAILED: Page render error: ${
          renderErr instanceof Error ? renderErr.message : String(renderErr)
        }`
      );
    }
  }

  // 5. Target canvas sizing
  targetCanvas.width = Math.max(1, Math.ceil(cropW));
  targetCanvas.height = Math.max(1, Math.ceil(cropH));

  const targetCtx = targetCanvas.getContext('2d');
  if (!targetCtx) {
    throw new Error('PDF_CANVAS_RENDER_FAILED: Failed to get 2D rendering context for target canvas');
  }

  // 6. Fill white background & crop source canvas
  targetCtx.fillStyle = '#FFFFFF';
  targetCtx.fillRect(0, 0, targetCanvas.width, targetCanvas.height);
  targetCtx.drawImage(
    fullCanvas,
    Math.floor(cropX),
    Math.floor(cropY),
    Math.ceil(cropW),
    Math.ceil(cropH),
    0,
    0,
    targetCanvas.width,
    targetCanvas.height
  );

  return targetCanvas.toDataURL('image/png');
}

export interface RenderableRegionSlice {
  canvas: any;
  width: number;
  height: number;
  role?: string;
  label?: string;
}

/**
 * Render a single region crop slice to an offscreen canvas.
 */
async function renderSingleSlice(
  pdfDoc: pdfjsLib.PDFDocumentProxy,
  pageNumber: number,
  bbox: PdfNativeBBox,
  renderScale: number,
  role?: string,
  label?: string
): Promise<RenderableRegionSlice> {
  const resolvedPage = Math.max(1, Math.min(pageNumber || 1, pdfDoc.numPages));
  const page = await pdfDoc.getPage(resolvedPage);
  const viewport = page.getViewport({ scale: renderScale });

  const srcX = Math.max(0, bbox.x * renderScale);
  const srcY = Math.max(0, bbox.y * renderScale);
  const rawW = bbox.width * renderScale;
  const rawH = bbox.height * renderScale;

  const cropX = Math.min(srcX, Math.max(0, viewport.width - 1));
  const cropY = Math.min(srcY, Math.max(0, viewport.height - 1));
  const cropW = Math.max(1, Math.min(rawW, viewport.width - cropX));
  const cropH = Math.max(1, Math.min(rawH, viewport.height - cropY));

  const pageCanvas: any =
    typeof document !== 'undefined'
      ? document.createElement('canvas')
      : typeof OffscreenCanvas !== 'undefined'
      ? new OffscreenCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height))
      : null;

  if (pageCanvas) {
    pageCanvas.width = Math.ceil(viewport.width);
    pageCanvas.height = Math.ceil(viewport.height);
    const pCtx = pageCanvas.getContext('2d');

    if (pCtx) {
      if (typeof process !== 'undefined' && process.env?.NODE_ENV === 'test') {
        pCtx.fillStyle = '#FFFFFF';
        pCtx.fillRect(0, 0, pageCanvas.width, pageCanvas.height);
      } else {
        await page.render({
          canvasContext: pCtx,
          viewport,
        }).promise;
      }
    }
  }

  const sliceCanvas: any =
    typeof document !== 'undefined'
      ? document.createElement('canvas')
      : typeof OffscreenCanvas !== 'undefined'
      ? new OffscreenCanvas(Math.ceil(cropW), Math.ceil(cropH))
      : null;

  if (sliceCanvas) {
    sliceCanvas.width = Math.ceil(cropW);
    sliceCanvas.height = Math.ceil(cropH);
    const sCtx = sliceCanvas.getContext('2d');
    if (sCtx && pageCanvas) {
      sCtx.fillStyle = '#FFFFFF';
      sCtx.fillRect(0, 0, sliceCanvas.width, sliceCanvas.height);
      sCtx.drawImage(
        pageCanvas,
        Math.floor(cropX),
        Math.floor(cropY),
        Math.ceil(cropW),
        Math.ceil(cropH),
        0,
        0,
        sliceCanvas.width,
        sliceCanvas.height
      );
    }
  }

  return {
    canvas: sliceCanvas,
    width: Math.ceil(cropW),
    height: Math.ceil(cropH),
    role,
    label,
  };
}

/**
 * High-performance Composite PDF Region Renderer.
 * Renders single or multi-region questions directly from the original PDF vector stream.
 * Stacks multi-region crops seamlessly (e.g. Q32 bottom-left stem + upper-right options).
 */
export async function renderPdfQuestionCompositeToCanvas(
  pdfDoc: pdfjsLib.PDFDocumentProxy,
  question: { page_start?: number; bbox?: PdfNativeBBox; regions?: PdfNativeRegion[] },
  targetCanvas: HTMLCanvasElement,
  renderScale: number = 2.5,
  spacingBetweenRegions: number = 14
): Promise<string> {
  if (!pdfDoc) {
    throw new Error('PDF_LOAD_FAILED: Null or undefined PDF document proxy passed to renderer');
  }

  const regions = question.regions && question.regions.length > 0 ? question.regions : null;

  // Single region fast path
  if (!regions || regions.length <= 1) {
    const targetBbox = regions && regions.length === 1 ? regions[0]!.bbox : question.bbox;
    const targetPage = regions && regions.length === 1 ? regions[0]!.pageNumber : question.page_start || 1;

    if (!targetBbox) {
      throw new Error('INVALID_BBOX: Question is missing bounding box');
    }

    return renderPdfRegionToCanvas(pdfDoc, targetPage, targetBbox, targetCanvas, renderScale);
  }

  // Multi-region composition path
  const sortedRegions = [...regions].sort((a, b) => a.orderIndex - b.orderIndex);
  const slices: RenderableRegionSlice[] = [];

  for (const reg of sortedRegions) {
    const slice = await renderSingleSlice(
      pdfDoc,
      reg.pageNumber,
      reg.bbox,
      renderScale,
      reg.role,
      reg.label
    );
    slices.push(slice);
  }

  const maxWidth = Math.max(...slices.map((s) => s.width), 100);
  const totalHeight =
    slices.reduce((sum, s) => sum + s.height, 0) + (slices.length - 1) * spacingBetweenRegions;

  targetCanvas.width = maxWidth;
  targetCanvas.height = totalHeight;

  const targetCtx = targetCanvas.getContext('2d');
  if (!targetCtx) {
    throw new Error('PDF_CANVAS_RENDER_FAILED: Failed to get 2D rendering context for composite target canvas');
  }

  // Fill crisp white background
  targetCtx.fillStyle = '#FFFFFF';
  targetCtx.fillRect(0, 0, targetCanvas.width, targetCanvas.height);

  let currentY = 0;
  for (let idx = 0; idx < slices.length; idx++) {
    const slice = slices[idx]!;

    // Draw separator line and subtle tag if it's an options or continuation block
    if (idx > 0) {
      targetCtx.strokeStyle = '#E2E8F0';
      targetCtx.lineWidth = 1;
      targetCtx.setLineDash([4, 4]);
      targetCtx.beginPath();
      targetCtx.moveTo(0, currentY + spacingBetweenRegions / 2);
      targetCtx.lineTo(targetCanvas.width, currentY + spacingBetweenRegions / 2);
      targetCtx.stroke();
      targetCtx.setLineDash([]);

      currentY += spacingBetweenRegions;
    }

    if (slice.canvas) {
      targetCtx.drawImage(slice.canvas, 0, currentY);
    }
    currentY += slice.height;
  }

  return targetCanvas.toDataURL('image/png');
}

