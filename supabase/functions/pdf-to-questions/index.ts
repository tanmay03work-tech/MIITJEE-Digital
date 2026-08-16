import { PDFDocument } from 'https://cdn.skypack.dev/pdf-lib@^1.17.1?min';

declare const Deno: {
  env: {
    get(name: string): string | undefined;
  };
  serve(handler: (request: Request) => Response | Promise<Response>): void;
};

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const AI_TIMEOUT_MS = 60_000;
const PAGES_PER_BATCH = 3;

type AiQuestion = {
  type: 'mcq' | 'integer';
  question: string;
  options: string[];
  correctAnswer?: string;
  correct_answer?: string;
  integerAnswer?: number;
  explanation: string;
  image: string | null;
  has_image?: boolean;
  source_region?: string | null;
  option_image_urls?: string[];
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function errorResponse(status: number, message: string) {
  return jsonResponse({ error: message }, status);
}

function getRequiredEnv(name: string) {
  const value = Deno.env.get(name);
  if (!value) {
    throw new Error(`${name} is not configured.`);
  }
  return value;
}

function normalizeGeminiModelName(value?: string | null) {
  const normalized = value?.trim() ?? '';
  if (!normalized) {
    return 'gemini-2.5-flash';
  }

  return normalized.replace(/^models\//, '');
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

async function fetchPdfBytesFromUrl(pdfUrl: string): Promise<{ arrayBuffer: ArrayBuffer; base64: string }> {
  const response = await fetch(pdfUrl);
  if (!response.ok) {
    throw new Error(`Failed to download PDF from URL (${response.status})`);
  }
  const arrayBuffer = await response.arrayBuffer();
  const base64 = arrayBufferToBase64(arrayBuffer);
  return { arrayBuffer, base64 };
}

async function splitPdfIntoBatches(arrayBuffer: ArrayBuffer, pagesPerBatch = PAGES_PER_BATCH): Promise<{ batches: string[]; totalPages: number }> {
  try {
    const srcDoc = await PDFDocument.load(arrayBuffer, { ignoreEncryption: true });
    const totalPages = srcDoc.getPageCount();

    if (totalPages <= pagesPerBatch) {
      return {
        batches: [arrayBufferToBase64(arrayBuffer)],
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
      batches.push(arrayBufferToBase64(subBytes.buffer));
    }

    return { batches, totalPages };
  } catch (error) {
    console.warn('pdf-lib split failed, falling back to full PDF base64:', error);
    return {
      batches: [arrayBufferToBase64(arrayBuffer)],
      totalPages: 1,
    };
  }
}

async function callGeminiVisionForPdfBatch(
  pdfBase64: string,
  batchIndex: number,
  totalBatches: number,
  answerKeyBase64?: string,
): Promise<AiQuestion[]> {
  const apiKey = getRequiredEnv('GEMINI_API_KEY');
  const model = normalizeGeminiModelName(Deno.env.get('GEMINI_MODEL'));

  const prompt = `
You are an expert AI exam extractor using Multimodal Vision.

Parse this PDF chunk (Batch ${batchIndex + 1} of ${totalBatches}, 3 pages max per batch) and extract all exam questions with highest precision.

UNIFIED MASTER PDF INTELLIGENCE RULES:
1. SINGLE PDF INTEGRATION & ANSWER KEY MATCHING:
   - The PDF document may contain Questions, Answer Key tables (e.g. 'Synchroniser (Answer Key)' or grid '91 - B', '92 - B'...), and Detailed Solutions (e.g. 'Synchroniser (Solutions)' or 'Solution:(Correct Answer: B)').
   - Carefully inspect Answer Key tables, Solution blocks, and highlighted correct options within the document.
   - Automatically populate "correct_answer" with the verified option letter ('A', 'B', 'C', 'D') or numeric integer answer.
   - Automatically populate "explanation" with step-by-step solutions present in the document.

2. MATH & SCIENCE FORMULA PRESERVATION:
   - Support text, mathematical equations, Physics formulas, Chemistry formulas, Greek symbols (α, β, γ, θ, μ, Ω, λ, ρ, Δ, ω, π, ε), superscripts (x², T⁻²), subscripts (H₂SO₄, x₁), and tables.
   - Keep powers/exponents readable: return 'x^2', 'x²', 'T^-2', '[ML^-1T^-2]', 'μ0', 'ρ', 'θ', 'λ', 'α', 'β', 'Δ', '≤', '≥', '∞' as math text. Never flatten 'x²' to 'x2' or 'H₂O' to 'H2O'.

3. DIAGRAM & VISUAL CONTENT EXTRACTION:
   - Set "has_image": true if question or options contain visual diagrams, graphs, circuits, geometry figures, chemical structures, or image options.
   - Populate "source_region": location description of visual element (e.g. 'Q113 hindlimb diagram', 'Q138 axon terminal diagram').

4. QUESTION STRUCTURE & NUMBERING:
   - For MCQ, return exactly 4 options copied from the PDF.
   - Extract every valid question in order, matching offset question numbers (e.g. Q91, Q92... Q180).

Return valid JSON strictly matching:
{
  "questions": [
    {
      "type": "mcq",
      "question": "Question prompt text",
      "options": ["Option A", "Option B", "Option C", "Option D"],
      "correct_answer": "Option A",
      "explanation": "Explanation if present",
      "has_image": false,
      "source_region": null
    }
  ]
}
`.trim();

  const inlineParts: any[] = [
    {
      inline_data: {
        mime_type: 'application/pdf',
        data: pdfBase64,
      },
    },
  ];

  if (answerKeyBase64) {
    inlineParts.push({
      inline_data: {
        mime_type: 'application/pdf',
        data: answerKeyBase64,
      },
    });
  }

  inlineParts.push({ text: prompt });

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), AI_TIMEOUT_MS);

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: inlineParts }],
          generationConfig: {
            temperature: 0.1,
            responseMimeType: 'application/json',
          },
        }),
        signal: controller.signal,
      },
    );

    clearTimeout(timer);

    if (!response.ok) {
      const details = await response.text();
      throw new Error(`Gemini PDF extraction failed with status ${response.status}: ${details}`);
    }

    const payload = await response.json();
    const rawText = payload.candidates?.[0]?.content?.parts?.[0]?.text ?? '{"questions":[]}';
    const cleanedText = rawText.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(cleanedText);

    return Array.isArray(parsed.questions) ? parsed.questions : [];
  } catch (error) {
    clearTimeout(timer);
    console.error(`Gemini Batch ${batchIndex + 1} error:`, error);
    return [];
  }
}

Deno.serve(async (request: Request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const body = await request.json();
    const pdfUrl = body.pdfUrl || body.pdf_url;
    const answerKeyPdfUrl = body.answerKeyPdfUrl || body.answer_key_pdf_url;

    if (!pdfUrl) {
      return errorResponse(400, 'pdfUrl is required.');
    }

    console.log(`[pdf-to-questions] Downloading Questions PDF: ${pdfUrl}`);
    const { arrayBuffer } = await fetchPdfBytesFromUrl(pdfUrl);

    let answerKeyBase64: string | undefined;
    if (answerKeyPdfUrl) {
      try {
        const akRes = await fetchPdfBytesFromUrl(answerKeyPdfUrl);
        answerKeyBase64 = akRes.base64;
        console.log('[pdf-to-questions] Downloaded Answer Key PDF successfully.');
      } catch (akError) {
        console.warn('[pdf-to-questions] Failed to download Answer Key PDF:', akError);
      }
    }

    // Split PDF into 3-page batches
    const { batches, totalPages } = await splitPdfIntoBatches(arrayBuffer, PAGES_PER_BATCH);
    console.log(`[pdf-to-questions] Processing ${totalPages} total pages across ${batches.length} 3-page batches.`);

    const allQuestions: AiQuestion[] = [];
    const warnings: string[] = [];

    // Process all 3-page batches sequentially
    for (let idx = 0; idx < batches.length; idx++) {
      const batchBase64 = batches[idx];
      if (!batchBase64) continue;

      const startPage = idx * PAGES_PER_BATCH + 1;
      const endPage = Math.min((idx + 1) * PAGES_PER_BATCH, totalPages);
      console.log(`[pdf-to-questions] Processing Batch ${idx + 1}/${batches.length} (Pages ${startPage}-${endPage})...`);

      const batchQuestions = await callGeminiVisionForPdfBatch(batchBase64, idx, batches.length, answerKeyBase64);
      allQuestions.push(...batchQuestions);
    }

    console.log(`[pdf-to-questions] Extraction complete: ${allQuestions.length} questions extracted from ${totalPages} pages.`);

    return jsonResponse({
      questions: allQuestions.map((q) => ({
        type: q.type === 'integer' ? 'integer' : 'mcq',
        question: q.question ?? '',
        options: Array.isArray(q.options) ? q.options : [],
        correctAnswer: q.correctAnswer ?? q.correct_answer ?? '',
        explanation: q.explanation ?? '',
        image: q.image ?? null,
        has_image: Boolean(q.has_image),
        source_region: q.source_region ?? null,
      })),
      warnings,
      totalPages,
      batchCount: batches.length,
    });
  } catch (error) {
    console.error('[pdf-to-questions] Edge function failed:', error);
    return errorResponse(500, error instanceof Error ? error.message : 'Unexpected PDF import failure.');
  }
});
