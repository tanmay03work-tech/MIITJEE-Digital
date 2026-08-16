/**
 * Desktop PDF Import Job Tracker & Resumability Service.
 * 
 * Rules:
 * - Tracks total pages, processed pages, questions detected/created, diagrams uploaded, NEEDS_REVIEW counts.
 * - Handles crash interruption and resume logic (resumes from last_processed_page + 1).
 * - Guarantees idempotency so re-run does not recreate duplicate records or images.
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
 * Create or resume a PDF import job.
 * 
 * @param {object} params
 * @param {string} params.jobId - Unique job identifier (e.g. "synchroniser_import_101")
 * @param {string} params.pdfName - Name of PDF file
 * @param {number} params.totalPages - Total pages in PDF
 * @param {string} [params.backendUrl] - Cloudflare Worker backend URL
 * @returns {Promise<{ isResumed: boolean, job: object }>}
 */
async function createOrResumeJob({ jobId, pdfName, totalPages, backendUrl = DEFAULT_BACKEND_URL }) {
  const endpoint = `${backendUrl.replace(/\/$/, '')}/api/pdf/job/create`;
  const payload = { jobId, pdfName, totalPages };

  const response = await fetchPayload(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Create job failed (${response.status}): ${errorText}`);
  }

  const result = await response.json();
  return {
    isResumed: Boolean(result.isResumed),
    job: result.job
  };
}

/**
 * Update job progress after processing a page.
 * 
 * @param {object} params
 * @param {string} params.jobId - Job ID
 * @param {number} params.lastProcessedPage - Page number just completed
 * @param {number} [params.questionsDetected=0]
 * @param {number} [params.questionsCreated=0]
 * @param {number} [params.diagramsDetected=0]
 * @param {number} [params.diagramsUploaded=0]
 * @param {number} [params.needsReviewCount=0]
 * @param {string} [params.status] - "PROCESSING", "COMPLETED", "FAILED"
 * @param {string} [params.backendUrl]
 * @returns {Promise<object>} Updated job state
 */
async function updateJobProgress({
  jobId,
  lastProcessedPage,
  questionsDetected = 0,
  questionsCreated = 0,
  diagramsDetected = 0,
  diagramsUploaded = 0,
  needsReviewCount = 0,
  status = 'PROCESSING',
  backendUrl = DEFAULT_BACKEND_URL
}) {
  const endpoint = `${backendUrl.replace(/\/$/, '')}/api/pdf/job/${jobId}/progress`;
  const payload = {
    last_processed_page: lastProcessedPage,
    processed_pages: lastProcessedPage,
    questions_detected: questionsDetected,
    questions_created: questionsCreated,
    diagrams_detected: diagramsDetected,
    diagrams_uploaded: diagramsUploaded,
    needs_review_count: needsReviewCount,
    status
  };

  const response = await fetchPayload(endpoint, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Update job progress failed (${response.status}): ${errorText}`);
  }

  const result = await response.json();
  return result.job;
}

/**
 * Get current status of a job.
 * 
 * @param {string} jobId
 * @param {string} [backendUrl]
 * @returns {Promise<object>} Job record
 */
async function getJobStatus(jobId, backendUrl = DEFAULT_BACKEND_URL) {
  const endpoint = `${backendUrl.replace(/\/$/, '')}/api/pdf/job/${jobId}`;
  const response = await fetchPayload(endpoint, { method: 'GET' });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Get job status failed (${response.status}): ${errorText}`);
  }

  const result = await response.json();
  return result.job;
}

module.exports = {
  createOrResumeJob,
  updateJobProgress,
  getJobStatus
};
