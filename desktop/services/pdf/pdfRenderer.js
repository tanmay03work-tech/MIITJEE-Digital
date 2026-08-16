const path = require('path');
const fs = require('fs');

/**
 * Local Desktop PDF Renderer Service for MIITJEE CBT Desktop Application.
 * Leverages Chromium's native HTML5 Canvas engine inside Electron.
 * 
 * Rules:
 * - NO NodeCanvasFactory
 * - NO native Cairo / Pango C++ binaries
 * - NO native Sharp / libvips C++ binaries
 * - Default DPI = 150, Support 300 DPI
 */

/**
 * Helper to calculate scale factor for target DPI.
 * Standard PDF resolution = 72 points per inch.
 * Scale = targetDpi / 72.0
 */
function getScaleForDpi(dpi = 150) {
  return dpi / 72.0;
}

/**
 * Render a single PDF page into a PNG Buffer inside Electron.
 * @param {string} pdfPath - Absolute or relative path to PDF file.
 * @param {number} pageNumber - 1-indexed page number.
 * @param {number} dpi - Target DPI (150 default, 300 high detail).
 * @param {object} [windowRef] - Optional BrowserWindow reference to execute rendering in Chromium context.
 * @returns {Promise<{ pngBuffer: Buffer, base64Png: string, width: number, height: number, dpi: number, pageNumber: number }>}
 */
async function renderPdfPage(pdfPath, pageNumber, dpi = 150, windowRef = null) {
  if (!pdfPath || !fs.existsSync(pdfPath)) {
    throw new Error(`PDF file not found at path: ${pdfPath}`);
  }

  const absolutePdfPath = path.resolve(pdfPath);
  const pdfBytes = fs.readFileSync(absolutePdfPath);
  const pdfBase64 = pdfBytes.toString('base64');
  const scale = getScaleForDpi(dpi);

  // JavaScript code to execute inside Chromium browser context with native HTML5 Canvas
  const renderScript = `
    (async function() {
      try {
        if (!window.pdfjsLib) {
          // Dynamically load pdf.js from CDN/legacy if not attached
          await new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
            script.onload = resolve;
            script.onerror = reject;
            document.head.appendChild(script);
          });
          window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
        }

        const rawData = atob('${pdfBase64}');
        const uint8Array = new Uint8Array(rawData.length);
        for (let i = 0; i < rawData.length; i++) {
          uint8Array[i] = rawData.charCodeAt(i);
        }

        const pdfDoc = await window.pdfjsLib.getDocument({ data: uint8Array }).promise;
        if (${pageNumber} < 1 || ${pageNumber} > pdfDoc.numPages) {
          throw new Error('Requested page ${pageNumber} out of range (1-' + pdfDoc.numPages + ')');
        }

        const page = await pdfDoc.getPage(${pageNumber});
        const viewport = page.getViewport({ scale: ${scale} });

        const canvas = document.createElement('canvas');
        canvas.width = Math.floor(viewport.width);
        canvas.height = Math.floor(viewport.height);
        const ctx = canvas.getContext('2d');

        const renderContext = {
          canvasContext: ctx,
          viewport: viewport
        };

        await page.render(renderContext).promise;
        const dataUrl = canvas.toDataURL('image/png');
        
        return {
          success: true,
          dataUrl: dataUrl,
          width: canvas.width,
          height: canvas.height,
          pageNumber: ${pageNumber},
          totalPages: pdfDoc.numPages
        };
      } catch (err) {
        return {
          success: false,
          error: err.message || String(err)
        };
      }
    })();
  `;

  let result;
  if (windowRef && windowRef.webContents) {
    result = await windowRef.webContents.executeJavaScript(renderScript);
  } else {
    // Fallback headless Electron execution if no window passed
    const { BrowserWindow } = require('electron');
    const win = new BrowserWindow({
      show: false,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        webSecurity: false
      }
    });
    try {
      await win.loadURL('about:blank');
      result = await win.webContents.executeJavaScript(renderScript);
    } finally {
      if (!win.isDestroyed()) win.close();
    }
  }

  if (!result || !result.success) {
    throw new Error(`PDF rendering failed for page ${pageNumber}: ${result?.error || 'Unknown error'}`);
  }

  const base64Data = result.dataUrl.replace(/^data:image\/png;base64,/, '');
  const pngBuffer = Buffer.from(base64Data, 'base64');

  return {
    pngBuffer,
    base64Png: base64Data,
    width: result.width,
    height: result.height,
    dpi,
    pageNumber: result.pageNumber,
    totalPages: result.totalPages
  };
}

/**
 * Render multiple PDF pages into PNG Buffers.
 * @param {string} pdfPath - Path to PDF.
 * @param {number[]} pageNumbers - Array of 1-indexed page numbers.
 * @param {number} dpi - Target DPI (default 150).
 * @param {object} [windowRef] - BrowserWindow instance.
 * @returns {Promise<Array<{ pngBuffer: Buffer, width: number, height: number, dpi: number, pageNumber: number }>>}
 */
async function renderPdfPages(pdfPath, pageNumbers, dpi = 150, windowRef = null) {
  const results = [];
  for (const pageNum of pageNumbers) {
    const rendered = await renderPdfPage(pdfPath, pageNum, dpi, windowRef);
    results.push(rendered);
  }
  return results;
}

module.exports = {
  renderPdfPage,
  renderPdfPages,
  getScaleForDpi
};
