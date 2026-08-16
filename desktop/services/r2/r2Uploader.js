const path = require('path');
const fs = require('fs');

/**
 * Desktop R2 Uploader Service for MIITJEE CBT Application.
 * 
 * SECURITY MANDATE:
 * - Desktop application MUST NOT contain R2 secret keys, credentials, or Supabase service-role keys.
 * - Desktop sends cropped PNG diagram buffer to existing Cloudflare Worker backend.
 * - Cloudflare Worker authenticates, validates, stores in R2, and returns deterministic image reference.
 */

const DEFAULT_BACKEND_URL = process.env.MIITJEE_BACKEND_URL || 'https://miitjee-backend.miitjee-api.workers.dev';

/**
 * Helper to fetch using Electron net API or Node fetch
 */
async function fetchPayload(url, options) {
  let fetchFn = globalThis.fetch;
  try {
    const { net } = require('electron');
    if (net && net.fetch) fetchFn = net.fetch;
  } catch (e) {
    // Fallback to global fetch
  }
  return fetchFn(url, options);
}

/**
 * Upload cropped diagram image to R2 via Cloudflare Worker backend.
 * 
 * @param {object} params
 * @param {string} params.setId - Question set / paper identifier (e.g. "synchroniser_101")
 * @param {string} params.questionNumber - Question number (e.g. "113")
 * @param {number} params.pageNumber - Source page number (e.g. 2)
 * @param {Buffer|string} params.croppedBuffer - Cropped PNG image Buffer or base64 string
 * @param {string} [params.backendUrl] - Cloudflare Worker backend URL
 * @returns {Promise<{ success: boolean, key: string, imageUrl: string, byteSize: number }>}
 */
async function uploadDiagramToR2({ setId, questionNumber, pageNumber, croppedBuffer, backendUrl = DEFAULT_BACKEND_URL }) {
  if (!setId || !questionNumber) {
    throw new Error('setId and questionNumber are required for R2 diagram upload');
  }

  let base64Png = '';
  if (Buffer.isBuffer(croppedBuffer)) {
    base64Png = croppedBuffer.toString('base64');
  } else if (typeof croppedBuffer === 'string') {
    base64Png = croppedBuffer.replace(/^data:image\/png;base64,/, '');
  } else {
    throw new Error('croppedBuffer must be a Buffer or Base64 string');
  }

  const endpoint = `${backendUrl.replace(/\/$/, '')}/api/pdf/upload-diagram`;
  const payload = {
    setId: String(setId).trim(),
    questionNumber: String(questionNumber).trim(),
    pageNumber: Number(pageNumber) || 1,
    base64Png
  };

  const response = await fetchPayload(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`HTTP ${response.status}: ${errorText}`);
  }

  const result = await response.json();
  if (!result || !result.success) {
    throw new Error(`R2 upload failed: ${result?.error || 'Unknown error'}`);
  }

  return {
    success: true,
    key: result.key,
    imageUrl: result.imageUrl,
    byteSize: result.byteSize
  };
}

/**
 * Verify diagram accessibility from R2 storage.
 * @param {string} imageUrl - Diagram image path / URL returned from upload
 * @param {string} [backendUrl] - Backend URL
 * @returns {Promise<{ isAccessible: boolean, status: number, contentType: string, isPngValid: boolean }>}
 */
async function verifyDiagramAccess(imageUrl, backendUrl = DEFAULT_BACKEND_URL) {
  const fullUrl = imageUrl.startsWith('http') ? imageUrl : `${backendUrl.replace(/\/$/, '')}${imageUrl}`;

  try {
    const res = await fetchPayload(fullUrl, { method: 'GET' });
    const arrayBuffer = await res.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const isPngHeaderValid = buffer.length >= 4 && buffer[0] === 137 && buffer[1] === 80 && buffer[2] === 78 && buffer[3] === 71;

    return {
      isAccessible: res.status === 200,
      status: res.status,
      contentType: res.headers.get('content-type') || '',
      isPngValid: isPngHeaderValid,
      byteSize: buffer.length
    };
  } catch (err) {
    return {
      isAccessible: false,
      status: 0,
      contentType: '',
      isPngValid: false,
      error: err.message
    };
  }
}

module.exports = {
  uploadDiagramToR2,
  verifyDiagramAccess
};
