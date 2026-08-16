/**
 * Desktop Question Store Service for MIITJEE CBT Application.
 * 
 * SECURITY MANDATE:
 * - Desktop application MUST NOT contain database master keys or secret credentials.
 * - Desktop sends extracted questions to existing Cloudflare Worker backend.
 * - Cloudflare Worker authenticates admin, evaluates NEEDS_REVIEW rules, and persists to PostgreSQL.
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
 * Persist extracted question objects to backend with NEEDS_REVIEW validation.
 * 
 * @param {object} params
 * @param {string} params.setId - Question set / paper identifier
 * @param {Array<object>} params.questions - Array of question objects extracted from PDF
 * @param {string} [params.backendUrl] - Cloudflare Worker backend URL
 * @returns {Promise<{ success: boolean, setId: string, savedCount: number, approvedCount: number, needsReviewCount: number, questions: Array<object> }>}
 */
async function saveQuestionsToStore({ setId, questions, backendUrl = DEFAULT_BACKEND_URL }) {
  if (!setId || !Array.isArray(questions) || questions.length === 0) {
    throw new Error('setId and a non-empty questions array are required for question persistence');
  }

  const endpoint = `${backendUrl.replace(/\/$/, '')}/api/pdf/save-questions`;
  const payload = {
    setId: String(setId).trim(),
    questions
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
    throw new Error(`Save questions failed: ${result?.error || 'Unknown error'}`);
  }

  return {
    success: true,
    setId: result.setId,
    savedCount: result.savedCount,
    approvedCount: result.approvedCount,
    needsReviewCount: result.needsReviewCount,
    questions: result.questions
  };
}

module.exports = {
  saveQuestionsToStore
};
