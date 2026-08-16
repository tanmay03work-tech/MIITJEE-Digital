const path = require('path');
const fs = require('fs');

/**
 * Local Desktop Diagram Cropper Service for MIITJEE CBT Application.
 * Crops original rendered PDF page PNGs using Chromium Canvas APIs in Electron.
 * 
 * Rules:
 * - Diagram MUST originate from original rendered PDF page.
 * - Convert normalized [ymin, xmin, ymax, xmax] (0-1000) to pixel coordinates.
 * - Add +5px safety margin buffer.
 * - Clamp coordinates to image boundaries.
 * - Reject invalid bounding boxes.
 */

/**
 * Convert normalized [ymin, xmin, ymax, xmax] (0-1000) to pixel crop rectangle.
 * @param {[number, number, number, number]} bbox - [ymin, xmin, ymax, xmax] normalized 0-1000
 * @param {number} imageWidth - Width of rendered PNG image in pixels
 * @param {number} imageHeight - Height of rendered PNG image in pixels
 * @param {number} [margin=5] - Safety margin padding in pixels
 * @returns {{ x: number, y: number, width: number, height: number, isValid: boolean, error?: string }}
 */
function bboxToPixelRect(bbox, imageWidth, imageHeight, margin = 5) {
  if (!Array.isArray(bbox) || bbox.length !== 4) {
    return { x: 0, y: 0, width: 0, height: 0, isValid: false, error: 'bbox must be an array of 4 numbers' };
  }

  const [ymin, xmin, ymax, xmax] = bbox.map(n => Number(n) || 0);

  // Validation
  if (ymin >= ymax || xmin >= xmax) {
    return { x: 0, y: 0, width: 0, height: 0, isValid: false, error: `Invalid bbox bounds: ymin=${ymin}, ymax=${ymax}, xmin=${xmin}, xmax=${xmax}` };
  }

  if (ymin < 0 || xmin < 0 || ymax > 1000 || xmax > 1000) {
    return { x: 0, y: 0, width: 0, height: 0, isValid: false, error: `Bbox values out of 0-1000 range: [${bbox.join(', ')}]` };
  }

  // Convert 0-1000 to pixel coordinates
  const pxX0 = Math.floor((xmin / 1000.0) * imageWidth);
  const pxY0 = Math.floor((ymin / 1000.0) * imageHeight);
  const pxX1 = Math.ceil((xmax / 1000.0) * imageWidth);
  const pxY1 = Math.ceil((ymax / 1000.0) * imageHeight);

  // Apply safety margin
  const cropX0 = Math.max(0, pxX0 - margin);
  const cropY0 = Math.max(0, pxY0 - margin);
  const cropX1 = Math.min(imageWidth, pxX1 + margin);
  const cropY1 = Math.min(imageHeight, pxY1 + margin);

  const cropW = cropX1 - cropX0;
  const cropH = cropY1 - cropY0;

  if (cropW < 10 || cropH < 10) {
    return { x: 0, y: 0, width: 0, height: 0, isValid: false, error: `Cropped area too small (${cropW}x${cropH} px)` };
  }

  return {
    x: cropX0,
    y: cropY0,
    width: cropW,
    height: cropH,
    isValid: true
  };
}

/**
 * Crop diagram from rendered page PNG buffer inside Electron Chromium context.
 * 
 * @param {object} params
 * @param {Buffer|string} params.pagePngBuffer - Rendered page PNG Buffer or Base64 string
 * @param {[number, number, number, number]} params.bbox - [ymin, xmin, ymax, xmax] 0-1000
 * @param {number} [params.imageWidth] - Rendered image width (optional, calculated if omitted)
 * @param {number} [params.imageHeight] - Rendered image height
 * @param {object} [windowRef] - Optional BrowserWindow reference
 * @returns {Promise<{ croppedBuffer: Buffer, base64Png: string, cropRect: object, isValid: boolean }>}
 */
async function cropDiagramFromPage({ pagePngBuffer, bbox, imageWidth = 0, imageHeight = 0, windowRef = null }) {
  let base64Png = '';
  if (Buffer.isBuffer(pagePngBuffer)) {
    base64Png = pagePngBuffer.toString('base64');
  } else if (typeof pagePngBuffer === 'string') {
    base64Png = pagePngBuffer.replace(/^data:image\/png;base64,/, '');
  } else {
    throw new Error('pagePngBuffer must be a Buffer or Base64 string');
  }

  // Execute crop script inside Chromium browser context with native 2D Canvas
  const cropScript = `
    (async function() {
      try {
        const img = new Image();
        await new Promise((resolve, reject) => {
          img.onload = resolve;
          img.onerror = reject;
          img.src = 'data:image/png;base64,${base64Png}';
        });

        const imgW = img.naturalWidth || ${imageWidth || 1240};
        const imgH = img.naturalHeight || ${imageHeight || 1753};

        const bbox = ${JSON.stringify(bbox)};
        const ymin = Number(bbox[0]) || 0;
        const xmin = Number(bbox[1]) || 0;
        const ymax = Number(bbox[2]) || 0;
        const xmax = Number(bbox[3]) || 0;

        if (ymin >= ymax || xmin >= xmax) {
          return { success: false, error: 'Invalid bbox bounds' };
        }

        const margin = 5;
        const pxX0 = Math.max(0, Math.floor((xmin / 1000.0) * imgW) - margin);
        const pxY0 = Math.max(0, Math.floor((ymin / 1000.0) * imgH) - margin);
        const pxX1 = Math.min(imgW, Math.ceil((xmax / 1000.0) * imgW) + margin);
        const pxY1 = Math.min(imgH, Math.ceil((ymax / 1000.0) * imgH) + margin);

        const cropW = pxX1 - pxX0;
        const cropH = pxY1 - pxY0;

        const canvas = document.createElement('canvas');
        canvas.width = cropW;
        canvas.height = cropH;
        const ctx = canvas.getContext('2d');

        ctx.drawImage(img, pxX0, pxY0, cropW, cropH, 0, 0, cropW, cropH);

        const croppedDataUrl = canvas.toDataURL('image/png');
        return {
          success: true,
          dataUrl: croppedDataUrl,
          cropRect: { x: pxX0, y: pxY0, width: cropW, height: cropH },
          originalWidth: imgW,
          originalHeight: imgH
        };
      } catch (err) {
        return { success: false, error: err.message || String(err) };
      }
    })();
  `;

  let result;
  if (windowRef && windowRef.webContents) {
    result = await windowRef.webContents.executeJavaScript(cropScript);
  } else {
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
      result = await win.webContents.executeJavaScript(cropScript);
    } finally {
      if (!win.isDestroyed()) win.close();
    }
  }

  if (!result || !result.success) {
    throw new Error(`Diagram crop failed: ${result?.error || 'Unknown error'}`);
  }

  const croppedBase64 = result.dataUrl.replace(/^data:image\/png;base64,/, '');
  const croppedBuffer = Buffer.from(croppedBase64, 'base64');

  return {
    croppedBuffer,
    base64Png: croppedBase64,
    cropRect: result.cropRect,
    isValid: true
  };
}

module.exports = {
  bboxToPixelRect,
  cropDiagramFromPage
};
