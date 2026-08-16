import * as pdfjsLib from 'pdfjs-dist';
import { PdfPageMetadata, PdfTextItem } from './pdfNativeTypes';

// Configure worker for web browser environment
if (typeof window !== 'undefined' && pdfjsLib.GlobalWorkerOptions) {
  if (!pdfjsLib.GlobalWorkerOptions.workerSrc) {
    pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
  }
}

/**
 * Load PDF document from ArrayBuffer or URL and extract pages metadata with text items & top-left coordinates.
 */
export async function extractPdfPagesMetadata(
  source: ArrayBuffer | string
): Promise<{ pdfDoc: pdfjsLib.PDFDocumentProxy; pagesMetadata: PdfPageMetadata[] }> {
  let loadingTask: pdfjsLib.PDFDocumentLoadingTask;

  if (typeof source === 'string') {
    loadingTask = pdfjsLib.getDocument(source);
  } else {
    loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(source.slice(0)) });
  }

  const pdfDoc = await loadingTask.promise;
  const pagesMetadata: PdfPageMetadata[] = [];

  for (let pageNum = 1; pageNum <= pdfDoc.numPages; pageNum++) {
    const page = await pdfDoc.getPage(pageNum);
    const viewport = page.getViewport({ scale: 1.0 }); // 72 DPI baseline points
    const textContent = await page.getTextContent();

    const items: PdfTextItem[] = [];

    for (const rawItem of textContent.items) {
      if (!('str' in rawItem) || !rawItem.str || !rawItem.str.trim()) {
        continue;
      }

      const item = rawItem as { str: string; transform: number[]; width: number; height: number };
      const transform = item.transform; // [scaleX, skewY, skewX, scaleY, tx, ty]
      const tx = transform[4] ?? 0;
      const ty = transform[5] ?? 0;
      const fontHeight = Math.abs(transform[3] ?? 0) || item.height || 10;
      const itemWidth = item.width || 10;

      // Convert PDF bottom-left Y coordinate to top-left Y coordinate in points
      const yTop = Math.max(0, viewport.height - ty - fontHeight);

      items.push({
        str: item.str,
        x: tx,
        y: yTop,
        width: itemWidth,
        height: fontHeight,
        pageNumber: pageNum,
      });
    }

    // Sort items roughly top-to-bottom for initial analysis
    items.sort((a, b) => Math.abs(a.y - b.y) < 3 ? a.x - b.x : a.y - b.y);

    pagesMetadata.push({
      pageNumber: pageNum,
      width: viewport.width,
      height: viewport.height,
      items,
    });
  }

  return { pdfDoc, pagesMetadata };
}
