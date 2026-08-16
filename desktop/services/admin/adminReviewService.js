/**
 * Desktop Admin Review Service for MIITJEE CBT Application.
 * 
 * Enables Admin Panel to:
 * 1. Filter questions by status ("NEEDS_REVIEW" vs "APPROVED").
 * 2. Display original page preview, question text, options, diagram thumbnail, and review failure reasons.
 * 3. Edit and approve questions, transitioning their status from NEEDS_REVIEW to APPROVED.
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
 * Fetch questions matching review status filter.
 * 
 * @param {object} params
 * @param {'NEEDS_REVIEW'|'APPROVED'} [params.status='NEEDS_REVIEW'] - Filter status
 * @param {string} [params.setId] - Optional set ID filter
 * @param {string} [params.backendUrl] - Cloudflare Worker backend URL
 * @returns {Promise<Array<object>>} List of question records
 */
async function fetchQuestionsForReview({ status = 'NEEDS_REVIEW', setId = null, backendUrl = DEFAULT_BACKEND_URL } = {}) {
  let endpoint = `${backendUrl.replace(/\/$/, '')}/api/pdf/questions/review?status=${encodeURIComponent(status)}`;
  if (setId) {
    endpoint += `&setId=${encodeURIComponent(setId)}`;
  }

  const response = await fetchPayload(endpoint, { method: 'GET' });
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Fetch review questions failed (${response.status}): ${errorText}`);
  }

  const result = await response.json();
  return result.questions || [];
}

/**
 * Approve a question after optional admin edits.
 * 
 * @param {object} params
 * @param {string} params.questionId - Unique question record ID
 * @param {object} [params.updatedFields] - Optional edited fields (question_text, options, correct_answer, image_url)
 * @param {string} [params.backendUrl] - Backend URL
 * @returns {Promise<object>} Approved question record
 */
async function approveQuestion({ questionId, updatedFields = {}, backendUrl = DEFAULT_BACKEND_URL }) {
  if (!questionId) {
    throw new Error('questionId is required to approve question');
  }

  const endpoint = `${backendUrl.replace(/\/$/, '')}/api/pdf/questions/${encodeURIComponent(questionId)}/approve`;

  const response = await fetchPayload(endpoint, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(updatedFields)
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Approve question failed (${response.status}): ${errorText}`);
  }

  const result = await response.json();
  return result.question;
}

module.exports = {
  fetchQuestionsForReview,
  approveQuestion
};
