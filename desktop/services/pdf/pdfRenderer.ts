/**
 * TypeScript interface definitions for desktop PDF renderer service.
 */

export interface RenderedPdfPage {
  pngBuffer: Buffer;
  base64Png: string;
  width: number;
  height: number;
  dpi: number;
  pageNumber: number;
  totalPages?: number;
}

export interface PdfRendererOptions {
  pdfPath: string;
  pageNumber: number;
  dpi?: number;
}

export declare function renderPdfPage(
  pdfPath: string,
  pageNumber: number,
  dpi?: number,
  windowRef?: any
): Promise<RenderedPdfPage>;

export declare function renderPdfPages(
  pdfPath: string,
  pageNumbers: number[],
  dpi?: number,
  windowRef?: any
): Promise<RenderedPdfPage[]>;
