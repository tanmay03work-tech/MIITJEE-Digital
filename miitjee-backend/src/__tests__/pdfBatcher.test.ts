import { PDFDocument } from 'pdf-lib';

declare const Buffer: any;
declare function describe(name: string, fn: () => void): void;
declare function test(name: string, fn: () => void | Promise<void>): void;
declare function expect(actual: any): {
  toBe(expected: any): void;
};

async function createSamplePdf(pageCount: number): Promise<ArrayBuffer> {
  const pdfDoc = await PDFDocument.create();
  for (let i = 0; i < pageCount; i++) {
    const page = pdfDoc.addPage([600, 400]);
    page.drawText(`Question Page ${i + 1}`, { x: 50, y: 350 });
  }
  const bytes = await pdfDoc.save();
  return bytes.buffer as ArrayBuffer;
}

async function splitPdfIntoBatches(arrayBuffer: ArrayBuffer, pagesPerBatch = 10): Promise<{ batches: string[]; totalPages: number }> {
  const srcDoc = await PDFDocument.load(arrayBuffer, { ignoreEncryption: true });
  const totalPages = srcDoc.getPageCount();

  if (totalPages <= pagesPerBatch) {
    return {
      batches: [Buffer.from(arrayBuffer).toString('base64')],
      totalPages,
    };
  }

  const batches: string[] = [];
  for (let start = 0; start < totalPages; start += pagesPerBatch) {
    const end = Math.min(start + pagesPerBatch, totalPages);
    const subDoc = await PDFDocument.create();
    const pageIndices = Array.from({ length: end - start }, (_, i) => start + i);
    const copiedPages = await subDoc.copyPages(srcDoc, pageIndices);
    copiedPages.forEach((page: any) => subDoc.addPage(page));
    const subBytes = await subDoc.save();
    batches.push(Buffer.from(subBytes).toString('base64'));
  }

  return { batches, totalPages };
}

describe('PDF Auto-Batcher Slicing Engine', () => {
  test('correctly splits a 25-page PDF into 3 batches of 10, 10, and 5 pages', async () => {
    const pdfBuffer = await createSamplePdf(25);
    const { batches, totalPages } = await splitPdfIntoBatches(pdfBuffer, 10);

    expect(totalPages).toBe(25);
    expect(batches.length).toBe(3);

    const batch1Doc = await PDFDocument.load(Buffer.from(batches[0]!, 'base64'));
    const batch2Doc = await PDFDocument.load(Buffer.from(batches[1]!, 'base64'));
    const batch3Doc = await PDFDocument.load(Buffer.from(batches[2]!, 'base64'));

    expect(batch1Doc.getPageCount()).toBe(10);
    expect(batch2Doc.getPageCount()).toBe(10);
    expect(batch3Doc.getPageCount()).toBe(5);
  });

  test('does not slice PDFs with 10 pages or fewer', async () => {
    const pdfBuffer = await createSamplePdf(7);
    const { batches, totalPages } = await splitPdfIntoBatches(pdfBuffer, 10);

    expect(totalPages).toBe(7);
    expect(batches.length).toBe(1);
  });
});
