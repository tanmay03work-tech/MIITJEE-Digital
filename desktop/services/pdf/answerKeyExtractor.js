const { renderPdfPage } = require('./pdfRenderer');
const { analyzePageWithGeminiVision } = require('../gemini/geminiVisionClient');

/**
 * Answer Key Extractor Service for MIITJEE CBT Application.
 * 
 * Rules:
 * - Renders answer-key page locally using Chromium Canvas.
 * - Extracts question_number -> correct_answer mapping.
 * - Strictly matches by question_number (NEVER FIFO/positional).
 * - Flags missing or conflicting answers as NEEDS_REVIEW.
 */

const DEFAULT_BACKEND_URL = process.env.MIITJEE_BACKEND_URL || 'https://miitjee-backend.miitjee-api.workers.dev';

/**
 * Parse text stream for grid format like "91 - B", "113 - B", "132 - B", "138 - C".
 * @param {string} rawText
 * @returns {Record<string, string>}
 */
function parseAnswerKeyGridText(rawText) {
  const map = {};
  if (!rawText) return map;

  const regex = /(?:Q|q)?(\d{1,3})\s*[\-:\.\=]\s*([A-Da-d1-4])\b/g;
  let match;

  while ((match = regex.exec(rawText)) !== null) {
    const qNum = match[1].trim();
    const ans = match[2].toUpperCase().trim();
    if (qNum && ans) {
      map[qNum] = ans;
    }
  }

  return map;
}

/**
 * Extract answer key map from an answer key page or buffer using Gemini Vision + Grid Parser.
 * 
 * @param {object} params
 * @param {string} params.pdfPath - Path to PDF file
 * @param {number} params.pageNumber - Answer key page number (e.g. 8)
 * @param {number} [params.dpi=150] - Rendering DPI
 * @param {string} [params.backendUrl] - Cloudflare Worker backend URL
 * @returns {Promise<Record<string, { correct_answer: string, explanation: string }>>}
 */
async function extractAnswerKeyMap({ pdfPath, pageNumber, dpi = 150, backendUrl = DEFAULT_BACKEND_URL }) {
  const pageRender = await renderPdfPage(pdfPath, pageNumber, dpi);

  const prompt = `
You are an expert AI exam answer-key parser.

Extract all question numbers and their corresponding correct answer options from this Answer Key page.

Example formats on page:
- "91 - B", "113 - B", "132 - B", "138 - C", "139 - C"

Return valid JSON strictly matching:
{
  "questions": [
    {
      "question_number": "113",
      "question_text": "Answer key entry for Q113",
      "options": ["A", "B", "C", "D"],
      "correct_answer": "B",
      "explanation": "",
      "has_diagram": false,
      "diagram_bbox": [0, 0, 0, 0],
      "source_page": ${pageNumber},
      "has_complex_math": false,
      "confidence_score": 0.99
    }
  ]
}
`.trim();

  const visionResults = await analyzePageWithGeminiVision({
    base64Png: pageRender.base64Png,
    pageNumber,
    backendUrl,
    prompt
  });

  const resultMap = {};
  for (const item of visionResults) {
    const qNum = String(item.question_number || '').trim();
    const ans = String(item.correct_answer || '').toUpperCase().trim();
    if (qNum && ans) {
      resultMap[qNum] = {
        correct_answer: ans,
        explanation: item.explanation || ''
      };
    }
  }

  return resultMap;
}

/**
 * Reconcile question batch with answer key map by question_number.
 * 
 * @param {Array<object>} questions - Array of extracted question objects
 * @param {Record<string, { correct_answer: string, explanation?: string }|string>} answerKeyMap - Map of question_number -> answer
 * @returns {Array<object>} Reconciled question objects with updated correct_answer and review_status
 */
function reconcileQuestionsWithAnswerKey(questions, answerKeyMap) {
  if (!Array.isArray(questions)) return [];
  if (!answerKeyMap || typeof answerKeyMap !== 'object') return questions;

  return questions.map(q => {
    const qNum = String(q.question_number || '').trim();
    const keyEntry = answerKeyMap[qNum];
    const keyAnswer = typeof keyEntry === 'string' ? keyEntry : keyEntry?.correct_answer;
    const keyExplanation = typeof keyEntry === 'object' ? keyEntry?.explanation : '';

    const updatedReasons = Array.isArray(q.review_reasons) ? [...q.review_reasons] : [];

    if (!keyAnswer) {
      // Missing Answer Key for this question
      if (!q.correct_answer) {
        updatedReasons.push(`MISSING_ANSWER_KEY: No answer key entry found for Question ${qNum}`);
      }
    } else {
      // Verify match or update
      if (!q.correct_answer) {
        q.correct_answer = keyAnswer;
      } else if (q.correct_answer.toUpperCase() !== keyAnswer.toUpperCase()) {
        updatedReasons.push(`ANSWER_KEY_MISMATCH: Question answer (${q.correct_answer}) conflicts with Answer Key (${keyAnswer})`);
      }

      if (keyExplanation && !q.explanation) {
        q.explanation = keyExplanation;
      }
    }

    const reviewStatus = updatedReasons.length > 0 ? 'NEEDS_REVIEW' : 'APPROVED';

    return {
      ...q,
      review_status: reviewStatus,
      review_reasons: updatedReasons
    };
  });
}

module.exports = {
  parseAnswerKeyGridText,
  extractAnswerKeyMap,
  reconcileQuestionsWithAnswerKey
};
