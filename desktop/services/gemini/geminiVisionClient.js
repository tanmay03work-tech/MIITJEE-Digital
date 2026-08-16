const https = require('https');

/**
 * Gemini Vision Page Analysis Client for MIITJEE CBT Desktop Application.
 * 
 * SECURITY MANDATE:
 * - GEMINI_API_KEY MUST NOT be bundled in Desktop app.
 * - Desktop sends rendered page image (base64 PNG) to Cloudflare Worker backend proxy.
 * - Backend handles Gemini API auth and returns structured JSON.
 */

const DEFAULT_BACKEND_URL = process.env.MIITJEE_BACKEND_URL || 'https://miitjee-backend.miitjee-api.workers.dev';

/**
 * Perform Multimodal Vision Page Analysis using Gemini 2.5 Flash via Backend Proxy.
 * 
 * @param {object} params
 * @param {string} params.base64Png - Base64 encoded PNG image of rendered page.
 * @param {number} params.pageNumber - 1-indexed page number.
 * @param {string} [params.backendUrl] - Cloudflare Worker backend URL.
 * @param {string} [params.apiKey] - Optional direct Gemini API key for local dev/testing.
 * @returns {Promise<Array<QuestionExtractionResult>>}
 */
async function analyzePageWithGeminiVision({ base64Png, pageNumber, backendUrl = DEFAULT_BACKEND_URL, apiKey = null }) {
  if (!base64Png) {
    throw new Error('base64Png is required for Gemini Vision page analysis');
  }

  const prompt = `
You are an expert AI exam extractor using Multimodal Vision.

Parse this rendered PDF exam page (Page ${pageNumber}) with highest precision.

UNIFIED MASTER PDF INTELLIGENCE RULES:
1. LAYOUT & READING ORDER:
   - Understand 2-column and multi-column exam paper layouts.
   - Question prompt text may start at the bottom of Column 1 and its diagram/options may wrap to Column 2. Read logically by question number (e.g. Q91, Q113, Q132, Q138, Q139).

2. DIAGRAM & IMAGE BOUNDING BOX DETECTION:
   - Set "has_diagram": true if question or options contain visual diagrams, graphs, circuits, geometry figures, chemical structures, synapse drawings, or hindlimb/bone figures.
   - For every diagram, return "diagram_bbox": [ymin, xmin, ymax, xmax] as normalized integers from 0 to 1000.
   - If no diagram is present for the question, return "diagram_bbox": [0, 0, 0, 0].

3. MATHEMATICAL & SCIENCE NOTATION PRESERVATION:
   - Preserve math formulas, physics equations, superscripts (e.g. x², T⁻², 2pq), subscripts (e.g. H₂SO₄, x₁), Greek letters (α, β, γ, θ, μ, Ω, λ, ρ, Δ, ω, π), fractions, chemical reactions, and symbols (≤, ≥, ∞, ±).
   - Set "has_complex_math": true if question contains non-trivial math/chemical notation.

4. STRUCTURED QUESTION FORMAT:
   - Extract question_number (e.g. "94", "113", "132", "138", "139").
   - Extract options array (4 options for MCQ).
   - Set source_page = ${pageNumber}.
   - Set confidence_score between 0.0 and 1.0.

Return valid JSON strictly matching the response schema.
`.trim();

  // If a direct API key is supplied (e.g. during local PoC/tests), call Gemini API directly
  // Otherwise call Cloudflare Worker proxy endpoint.
  const resolvedApiKey = apiKey || process.env.GEMINI_API_KEY;

  if (resolvedApiKey) {
    return callGeminiRestApiDirectly({ base64Png, pageNumber, prompt, apiKey: resolvedApiKey });
  }

  return callGeminiBackendProxy({ base64Png, pageNumber, prompt, backendUrl });
}

/**
 * Direct REST API call to Gemini 2.5 Flash (used during local PoC / testing when key is in env).
 */
async function callGeminiRestApiDirectly({ base64Png, pageNumber, prompt, apiKey }) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;

  const payload = {
    contents: [
      {
        parts: [
          {
            inline_data: {
              mime_type: 'image/png',
              data: base64Png
            }
          },
          { text: prompt }
        ]
      }
    ],
    generationConfig: {
      temperature: 0.1,
      responseMimeType: 'application/json',
      responseSchema: {
        type: 'OBJECT',
        properties: {
          questions: {
            type: 'ARRAY',
            items: {
              type: 'OBJECT',
              properties: {
                question_number: { type: 'STRING' },
                question_text: { type: 'STRING' },
                options: {
                  type: 'ARRAY',
                  items: { type: 'STRING' }
                },
                correct_answer: { type: 'STRING' },
                explanation: { type: 'STRING' },
                has_diagram: { type: 'BOOLEAN' },
                diagram_bbox: {
                  type: 'ARRAY',
                  items: { type: 'INTEGER' }
                },
                source_page: { type: 'INTEGER' },
                has_complex_math: { type: 'BOOLEAN' },
                confidence_score: { type: 'NUMBER' }
              },
              required: [
                'question_number',
                'question_text',
                'options',
                'correct_answer',
                'has_diagram',
                'diagram_bbox',
                'source_page',
                'has_complex_math',
                'confidence_score'
              ]
            }
          }
        },
        required: ['questions']
      }
    }
  };

  const responseText = await httpPostJson(url, payload);
  const data = JSON.parse(responseText);

  const rawJsonText = data.candidates?.[0]?.content?.parts?.[0]?.text ?? '{"questions":[]}';
  const parsed = JSON.parse(rawJsonText);
  const questions = Array.isArray(parsed.questions) ? parsed.questions : [];

  return sanitizeQuestions(questions, pageNumber);
}

/**
 * Proxy API call to Cloudflare Worker backend.
 */
async function callGeminiBackendProxy({ base64Png, pageNumber, prompt, backendUrl }) {
  const url = `${backendUrl.replace(/\/$/, '')}/api/pdf/vision-parse`;
  const payload = {
    pageNumber,
    base64Png,
    prompt
  };

  const responseText = await httpPostJson(url, payload);
  const parsed = JSON.parse(responseText);
  const questions = Array.isArray(parsed.questions) ? parsed.questions : [];

  return sanitizeQuestions(questions, pageNumber);
}

function sanitizeQuestions(questions, pageNumber) {
  return questions.map(q => {
    const bbox = Array.isArray(q.diagram_bbox) && q.diagram_bbox.length === 4
      ? q.diagram_bbox.map(n => Math.max(0, Math.min(1000, Number(n) || 0)))
      : [0, 0, 0, 0];

    const hasDiagram = Boolean(q.has_diagram) && !(bbox[0] === 0 && bbox[1] === 0 && bbox[2] === 0 && bbox[3] === 0);

    return {
      question_number: String(q.question_number || '').trim(),
      question_text: String(q.question_text || '').trim(),
      options: Array.isArray(q.options) ? q.options.map(opt => String(opt).trim()) : [],
      correct_answer: String(q.correct_answer || '').trim(),
      explanation: String(q.explanation || '').trim(),
      has_diagram: hasDiagram,
      diagram_bbox: bbox,
      source_page: Number(q.source_page) || pageNumber,
      has_complex_math: Boolean(q.has_complex_math),
      confidence_score: Number(q.confidence_score) || 0.9
    };
  });
}

function httpPostJson(urlStr, dataObj) {
  return new Promise((resolve, reject) => {
    const url = new URL(urlStr);
    const bodyStr = JSON.stringify(dataObj);

    const options = {
      hostname: url.hostname,
      port: url.port || (url.protocol === 'https:' ? 443 : 80),
      path: url.pathname + url.search,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(bodyStr)
      }
    };

    const req = https.request(options, (res) => {
      let responseBody = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => { responseBody += chunk; });
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(responseBody);
        } else {
          reject(new Error(`HTTP ${res.statusCode}: ${responseBody}`));
        }
      });
    });

    req.on('error', (err) => reject(err));
    req.write(bodyStr);
    req.end();
  });
}

module.exports = {
  analyzePageWithGeminiVision,
  sanitizeQuestions
};
