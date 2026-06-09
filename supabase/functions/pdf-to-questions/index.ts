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

const AUTH_TIMEOUT_MS = 8_000;
const OCR_TIMEOUT_MS = 45_000;
const AI_TIMEOUT_MS = 45_000;

type AiQuestion =
  | {
      type: 'mcq';
      question: string;
      options: string[];
      correctAnswer?: string;
      correct_answer?: string;
      explanation: string;
      image: string | null;
      has_image?: boolean;
    }
  | {
      type: 'integer';
      question: string;
      integerAnswer: number;
      explanation: string;
      image: string | null;
      has_image?: boolean;
      options?: string[];
      correctAnswer?: string;
      correct_answer?: string;
    };

type Provider = 'openai' | 'gemini';

type ExtractedQuestionCandidate = {
  index: number;
  rawText: string;
  extractedOptions: string[];
};

type AiCleanupQuestion = {
  index: number;
  question: string;
  type?: 'mcq' | 'integer';
  correctAnswer?: string;
  correct_answer?: string;
  explanation?: string;
  has_image?: boolean;
  image?: string | null;
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

function hasEnv(name: string) {
  const value = Deno.env.get(name);
  return typeof value === 'string' && value.trim().length > 0;
}

function normalizeGeminiModelName(value?: string | null) {
  const normalized = value?.trim() ?? '';
  if (!normalized) {
    return 'gemini-2.5-flash';
  }

  return normalized.replace(/^models\//, '');
}

function getBearerToken(request: Request) {
  const authorization = request.headers.get('authorization') ?? request.headers.get('Authorization');
  if (!authorization?.toLowerCase().startsWith('bearer ')) {
    return null;
  }

  return authorization.slice(7).trim();
}

function decodeBase64Url(value: string) {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
  return atob(padded);
}

function getJwtPayload(token: string) {
  const parts = token.split('.');
  if (parts.length < 2 || !parts[1]) {
    throw new Error('Invalid JWT format.');
  }

  const rawPayload = decodeBase64Url(parts[1]);
  return JSON.parse(rawPayload) as {
    sub?: string;
    exp?: number;
    aud?: string | string[];
    role?: string;
  };
}

function isAbortError(error: unknown) {
  return error instanceof Error && error.name === 'AbortError';
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
}

async function parseRequestBody(request: Request) {
  try {
    return await request.json() as {
      pdfUrl?: string;
      provider?: Provider;
      testTitle?: string;
      subject?: string;
      startQuestionNumber?: number;
      importMode?: 'replace' | 'append';
    };
  } catch {
    throw errorResponse(400, 'Invalid JSON body.');
  }
}

async function requireApprovedAdmin(request: Request) {
  const token = getBearerToken(request);
  if (!token) {
    throw errorResponse(401, 'Missing authorization token.');
  }

  let jwtPayload: ReturnType<typeof getJwtPayload>;
  try {
    jwtPayload = getJwtPayload(token);
  } catch {
    throw errorResponse(401, 'Invalid JWT.');
  }

  const nowInSeconds = Math.floor(Date.now() / 1000);
  if (!jwtPayload.sub || (jwtPayload.exp && jwtPayload.exp <= nowInSeconds)) {
    throw errorResponse(401, 'Expired or malformed JWT.');
  }

  const supabaseUrl = getRequiredEnv('SUPABASE_URL');
  const supabaseAnonKey = getRequiredEnv('SUPABASE_ANON_KEY');
  const serviceRoleKey = getRequiredEnv('SUPABASE_SERVICE_ROLE_KEY');

  let userResponse: Response;
  try {
    userResponse = await fetchWithTimeout(`${supabaseUrl}/auth/v1/user`, {
      headers: {
        apikey: supabaseAnonKey,
        Authorization: `Bearer ${token}`,
      },
    }, AUTH_TIMEOUT_MS);
  } catch (error) {
    if (isAbortError(error)) {
      throw errorResponse(504, 'Timed out while verifying the user session.');
    }

    throw errorResponse(401, 'Unable to verify the user session.');
  }

  if (!userResponse.ok) {
    throw errorResponse(401, 'Invalid JWT.');
  }

  const user = await userResponse.json() as { id?: string };
  if (!user.id || user.id !== jwtPayload.sub) {
    throw errorResponse(401, 'Authenticated user mismatch.');
  }

  let profileResponse: Response;
  try {
    profileResponse = await fetchWithTimeout(
      `${supabaseUrl}/rest/v1/profiles?select=id,role,approval_status&id=eq.${encodeURIComponent(user.id)}`,
      {
        headers: {
          apikey: serviceRoleKey,
          Authorization: `Bearer ${serviceRoleKey}`,
        },
      },
      AUTH_TIMEOUT_MS,
    );
  } catch (error) {
    if (isAbortError(error)) {
      throw errorResponse(504, 'Timed out while verifying admin access.');
    }

    throw errorResponse(500, 'Unable to verify admin access.');
  }

  if (!profileResponse.ok) {
    throw errorResponse(500, 'Unable to verify admin access.');
  }

  const profiles = await profileResponse.json() as Array<{ role?: string; approval_status?: string }>;
  const profile = profiles[0];

  if (!profile || profile.role !== 'admin' || profile.approval_status !== 'approved') {
    throw errorResponse(403, 'Approved admin access is required for PDF import.');
  }

  return user.id;
}

function chunkText(text: string, maxChars = 12000) {
  const chunks: string[] = [];
  let remaining = text.trim();

  while (remaining.length > maxChars) {
    let splitIndex = remaining.lastIndexOf('\n', maxChars);
    if (splitIndex < maxChars * 0.6) {
      splitIndex = maxChars;
    }
    chunks.push(remaining.slice(0, splitIndex));
    remaining = remaining.slice(splitIndex).trim();
  }

  if (remaining.length > 0) {
    chunks.push(remaining);
  }

  return chunks;
}

function normalizeText(text: string) {
  return text
    .replace(/\r\n/g, ' ')
    .replace(/\r/g, ' ')
    .replace(/\n/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function repairExamMojibake(value: string) {
  return value
    .replace(/Â²/g, '²')
    .replace(/Â³/g, '³')
    .replace(/â‰¤/g, '≤')
    .replace(/â‰¥/g, '≥')
    .replace(/âˆž/g, '∞')
    .replace(/âˆ’/g, '−')
    .replace(/â€“|â€”/g, '-')
    .replace(/â‹…/g, '·')
    .replace(/Î¼|Âµ/g, 'μ')
    .replace(/Ï/g, 'ρ')
    .replace(/Î¸/g, 'θ')
    .replace(/Î»/g, 'λ')
    .replace(/Î±/g, 'α')
    .replace(/Î²/g, 'β')
    .replace(/Î”|âˆ†/g, 'Δ')
    .replace(/Ï‰/g, 'ω');
}

function normalizeDimensionExpression(expression: string) {
  return expression
    .replace(/\s+/g, '')
    .replace(/([A-Za-zΑ-Ωα-ωμΩ])(-?\d+)(?=[A-Za-zΑ-Ωα-ωμΩ]|$)/g, '$1^$2');
}

function normalizeExamText(value: string) {
  return repairExamMojibake(value)
    .replace(/\[([^[\]]+)\]/g, (_, expression: string) => `[${normalizeDimensionExpression(expression)}]`)
    .replace(/(^|[^A-Za-z0-9])([A-Za-zΑ-Ωα-ωμΩ])([23])(?=\s*(?:[/=+*\-),\].:;]))/g, '$1$2^$3')
    .replace(/([μρλθω])o\b/gi, '$10');
}

function cleanQuestionBlock(block: string) {
  return block
    .replace(/\s+/g, ' ')
    .trim();
}

function splitQuestions(text: string) {
  return text.match(/Q\d+\.[\s\S]*?(?=Q\d+\.|$)/g) || [];
}

function parseQuestion(block: string) {
  const cleanedBlock = cleanQuestionBlock(block);
  const qMatch = cleanedBlock.match(/Q\d+\.\s*([\s\S]*?)\s*A\./);
  const question = qMatch ? qMatch[1].trim() : null;

  const oMatch = cleanedBlock.match(/A\.\s*([\s\S]*?)\s*B\.\s*([\s\S]*?)\s*C\.\s*([\s\S]*?)\s*D\.\s*([\s\S]*?)(?=\s*Q\d+\.|$)/);
  if (!oMatch) {
    return null;
  }

  const options = [
    oMatch[1]?.trim() ?? '',
    oMatch[2]?.trim() ?? '',
    oMatch[3]?.trim() ?? '',
    oMatch[4]?.trim() ?? '',
  ];

  if (!question || options.length !== 4 || options.some((option) => !option)) {
    return null;
  }

  return {
    question,
    options,
    type: 'mcq' as const,
    correct_answer: null,
    explanation: null,
    has_image: false,
  };
}

function sanitizeQuestion(question: AiQuestion) {
  if (question.type === 'mcq') {
    return {
      type: 'mcq' as const,
      question: normalizeExamText(question.question?.trim() ?? ''),
      options: Array.isArray(question.options) ? question.options.map((item) => normalizeExamText(String(item).trim())).slice(0, 4) : [],
      correctAnswer: normalizeExamText((question.correctAnswer ?? question.correct_answer ?? '').trim()),
      explanation: normalizeExamText(question.explanation?.trim() ?? ''),
      image: question.image ?? null,
      has_image: Boolean(question.has_image),
    };
  }

  const integerAnswer = question.correctAnswer ?? question.correct_answer ?? question.integerAnswer;

  return {
    type: 'integer' as const,
    question: normalizeExamText(question.question?.trim() ?? ''),
    options: Array.isArray(question.options) ? question.options.map((item) => normalizeExamText(String(item).trim())).slice(0, 4) : [],
    integerAnswer: Number(integerAnswer ?? 0),
    correctAnswer: normalizeExamText(String(integerAnswer ?? '').trim()),
    explanation: normalizeExamText(question.explanation?.trim() ?? ''),
    image: question.image ?? null,
    has_image: Boolean(question.has_image),
  };
}

function parseJsonResponse(raw: string) {
  const cleaned = raw.replace(/```json|```/g, '').trim();
  const parsed = JSON.parse(cleaned) as { questions?: AiQuestion[]; warnings?: string[] };

  return {
    questions: Array.isArray(parsed.questions) ? parsed.questions.map(sanitizeQuestion) : [],
    warnings: Array.isArray(parsed.warnings) ? parsed.warnings.map(String) : [],
  };
}

function sanitizeCleanupQuestion(question: AiCleanupQuestion) {
  return {
    index: Number(question.index),
    question: normalizeExamText(question.question?.trim() ?? ''),
    type: question.type === 'integer' ? 'integer' as const : 'mcq' as const,
    correctAnswer: normalizeExamText(String(question.correctAnswer ?? question.correct_answer ?? '').trim()),
    explanation: normalizeExamText(question.explanation?.trim() ?? ''),
    image: question.image ?? null,
    has_image: Boolean(question.has_image),
  };
}

function parseCleanupJsonResponse(raw: string) {
  const cleaned = raw.replace(/```json|```/g, '').trim();
  const parsed = JSON.parse(cleaned) as { questions?: AiCleanupQuestion[]; warnings?: string[] };

  return {
    questions: Array.isArray(parsed.questions) ? parsed.questions.map(sanitizeCleanupQuestion) : [],
    warnings: Array.isArray(parsed.warnings) ? parsed.warnings.map(String) : [],
  };
}

async function extractPdfText(pdfUrl: string) {
  const apiKey = getRequiredEnv('OCR_SPACE_API_KEY');

  let response: Response;
  try {
    response = await fetchWithTimeout('https://api.ocr.space/parse/image', {
      method: 'POST',
      headers: {
        apikey: apiKey,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        url: pdfUrl,
        filetype: 'PDF',
        OCREngine: '2',
        isOverlayRequired: 'false',
        scale: 'true',
        detectOrientation: 'true',
      }),
    }, OCR_TIMEOUT_MS);
  } catch (error) {
    if (isAbortError(error)) {
      throw new Error('OCR request timed out.');
    }

    throw error;
  }

  if (!response.ok) {
    throw new Error(`OCR.Space request failed with ${response.status}.`);
  }

  const payload = await response.json() as {
    IsErroredOnProcessing?: boolean;
    ErrorMessage?: string[] | string;
    ParsedResults?: Array<{ ParsedText?: string }>;
  };

  if (payload.IsErroredOnProcessing) {
    const message = Array.isArray(payload.ErrorMessage) ? payload.ErrorMessage.join(', ') : payload.ErrorMessage;
    throw new Error(message || 'OCR failed to parse the PDF.');
  }

  const text = (payload.ParsedResults ?? [])
    .map((item) => item.ParsedText ?? '')
    .join('\n')
    .trim();

  if (!text) {
    throw new Error('OCR extracted empty text from the PDF.');
  }

  return text;
}

function buildPrompt(
  chunk: string,
  context?: {
    testTitle?: string;
    subject?: string;
    startQuestionNumber?: number;
    importMode?: 'replace' | 'append';
  },
) {
  const metadata = [
    context?.testTitle ? `Paper title: ${context.testTitle}` : null,
    context?.subject ? `Subject: ${context.subject}` : null,
    context?.importMode === 'append' && context.startQuestionNumber
      ? `This PDF chunk continues an existing draft. The next new question should be question ${context.startQuestionNumber}.`
      : null,
  ].filter(Boolean).join('\n');

  return `
You are cleaning previously extracted exam questions.

You will receive raw OCR question blocks plus options already extracted outside the model.

Return for each item:
- index
- question (cleaned question text only)
- correct_answer (if present)
- explanation (if present)
- type: 'mcq' or 'integer'

Additionally:
- Detect if the question contains ANY visual content: diagram, graph, table, chart, figure, image.
- If yes, set "has_image": true.
- Else, set "has_image": false.

Rules:
- Return valid JSON only.
- Preserve math symbols (≤ ≥ ∞ log²).
- Fix OCR errors.
- Keep exponents readable as `x^2`, `x²`, `T^-2`, `[ML^-1T^-2]`, `μ0`, `ρ`, `θ`, `λ`, `α`, `β`, `Δ`, `≤`, `≥`, `∞`; never flatten them to `x2`, `T2`, `uo`, or OCR garbage.
- Do not include visual content inside text.
- Do not describe the diagram/table.
- Only mark has_image true/false.
- Keep options to 4 for MCQ.
- For integer questions, use an empty options array.
- If OCR text is messy or answers are missing, still return the question and mention uncertainty in warnings.
- For invalid items, skip them and add a warning.
- Preserve the order of questions from the text.
- If this is a continuation chunk, do not restart numbering or duplicate earlier questions.
- Use this JSON shape:
{
  "questions": [
    {
      "type": "mcq",
      "question": "",
      "options": ["", "", "", ""],
      "correct_answer": "",
      "explanation": "",
      "has_image": false
    },
    {
      "type": "integer",
      "question": "",
      "options": [],
      "correct_answer": "",
      "explanation": "",
      "has_image": false
    }
  ],
  "warnings": []
}

${metadata ? `Context:\n${metadata}\n` : ''}

Exam text:
${chunk}
`.trim();
}

function buildQuestionCleanupPrompt(
  candidates: ExtractedQuestionCandidate[],
  context?: {
    testTitle?: string;
    subject?: string;
    startQuestionNumber?: number;
    importMode?: 'replace' | 'append';
  },
) {
  const metadata = [
    context?.testTitle ? `Paper title: ${context.testTitle}` : null,
    context?.subject ? `Subject: ${context.subject}` : null,
    context?.importMode === 'append' && context.startQuestionNumber
      ? `This PDF chunk continues an existing draft. The next new question should be question ${context.startQuestionNumber}.`
      : null,
  ].filter(Boolean).join('\n');

  return `
You are cleaning previously extracted exam questions.

You will receive raw OCR question blocks plus options already extracted outside the model.

Return for each item:
- index
- question (cleaned question text only)
- correct_answer (if present)
- explanation (if present)
- type: 'mcq' or 'integer'

Additionally:
- Detect if the question contains ANY visual content: diagram, graph, table, chart, figure, image.
- If yes, set "has_image": true.
- Else, set "has_image": false.

Rules:
- Return valid JSON only.
- Preserve math symbols.
- Keep exponents readable as `x^2`, `x²`, `T^-2`, `[ML^-1T^-2]`, `μ0`, `ρ`, `θ`, `λ`, `α`, `β`, `Δ`, `≤`, `≥`, `∞`; never flatten them to `x2`, `T2`, `uo`, or OCR garbage.
- Fix OCR errors in the question text and answer text.
- Do not include visual content inside text.
- Do not describe the diagram/table.
- Only mark has_image true/false.
- Do not generate, rewrite, infer, reorder, or return options.
- Use the provided options only as reference while cleaning the question text.
- If OCR text is messy or answers are missing, still return the question and mention uncertainty in warnings.
- For invalid items, skip them and add a warning.
- Preserve the order of the provided items.
- If this is a continuation chunk, do not restart numbering or duplicate earlier questions.
- Use this JSON shape:
{
  "questions": [
    {
      "index": 0,
      "question": "",
      "type": "mcq",
      "correct_answer": "",
      "explanation": "",
      "has_image": false
    }
  ],
  "warnings": []
}

${metadata ? `Context:\n${metadata}\n` : ''}

Question candidates:
${JSON.stringify(candidates, null, 2)}
`.trim();
}

async function callOpenAIModel(prompt: string) {
  const apiKey = getRequiredEnv('OPENAI_API_KEY');
  const model = Deno.env.get('OPENAI_MODEL') ?? 'gpt-4.1-mini';

  let response: Response;
  try {
    response = await fetchWithTimeout('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        temperature: 0.1,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: 'You convert OCR exam text into validated question JSON.' },
          { role: 'user', content: prompt },
        ],
      }),
    }, AI_TIMEOUT_MS);
  } catch (error) {
    if (isAbortError(error)) {
      throw new Error('OpenAI request timed out.');
    }

    throw error;
  }

  if (!response.ok) {
    throw new Error(`OpenAI request failed with ${response.status}.`);
  }

  const payload = await response.json() as {
    choices?: Array<{ message?: { content?: string } }>;
  };

  return payload.choices?.[0]?.message?.content ?? '{"questions":[],"warnings":["No content returned from OpenAI."]}';
}

async function callGeminiModel(prompt: string) {
  const apiKey = getRequiredEnv('GEMINI_API_KEY');
  const model = normalizeGeminiModelName(Deno.env.get('GEMINI_MODEL'));

  let response: Response;
  try {
    response = await fetchWithTimeout(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.1,
            responseMimeType: 'application/json',
          },
        }),
      },
      AI_TIMEOUT_MS,
    );
  } catch (error) {
    if (isAbortError(error)) {
      throw new Error('Gemini request timed out.');
    }

    throw error;
  }

  if (!response.ok) {
    const details = await response.text();
    throw new Error(`Gemini request failed with ${response.status}. ${details}`.trim());
  }

  const payload = await response.json() as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };

  return payload.candidates?.[0]?.content?.parts?.[0]?.text ?? '{"questions":[],"warnings":["No content returned from Gemini."]}';
}

async function callAiProvider(provider: Provider, prompt: string) {
  return provider === 'gemini' ? callGeminiModel(prompt) : callOpenAIModel(prompt);
}

function resolveProvider(requestedProvider?: Provider) {
  const preferredProvider = requestedProvider ?? ((Deno.env.get('PDF_IMPORT_PROVIDER') as Provider | undefined) ?? undefined);

  if (preferredProvider === 'gemini' && hasEnv('GEMINI_API_KEY')) {
    return 'gemini' as const;
  }

  if (preferredProvider === 'openai' && hasEnv('OPENAI_API_KEY')) {
    return 'openai' as const;
  }

  if (hasEnv('GEMINI_API_KEY')) {
    return 'gemini' as const;
  }

  if (hasEnv('OPENAI_API_KEY')) {
    return 'openai' as const;
  }

  throw new Error('No AI provider is configured. Add GEMINI_API_KEY or OPENAI_API_KEY to the pdf-to-questions function secrets.');
}

Deno.serve(async (request: Request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    await requireApprovedAdmin(request);

    const { pdfUrl } = await parseRequestBody(request);
    if (!pdfUrl) {
      return errorResponse(400, 'pdfUrl is required.');
    }

    const extractedText = await extractPdfText(pdfUrl);
    const normalizedText = normalizeText(extractedText);
    const blocks = splitQuestions(normalizedText);
    const allQuestions: AiQuestion[] = [];
    const warnings: string[] = [];
    let skippedCount = 0;

    console.log('pdf-to-questions total blocks', blocks.length);

    for (const [index, block] of blocks.entries()) {
      const parsedQuestion = parseQuestion(block);

      if (!parsedQuestion) {
        skippedCount += 1;
        warnings.push(`Skipped question block ${index + 1}: unable to extract question/options.`);
        console.warn('pdf-to-questions skipped block', JSON.stringify({
          index,
          block,
        }));
        continue;
      }

      console.log('pdf-to-questions parsed question', JSON.stringify({
        index,
        question: parsedQuestion.question,
        options: parsedQuestion.options,
      }));

      allQuestions.push(sanitizeQuestion({
        correctAnswer: '',
        explanation: '',
        has_image: parsedQuestion.has_image,
        image: null,
        options: parsedQuestion.options,
        question: parsedQuestion.question,
        type: parsedQuestion.type,
      }));
    }

    console.log('pdf-to-questions skipped count', skippedCount);

    return jsonResponse({
      questions: allQuestions,
      warnings,
      ocrTextPreview: extractedText.slice(0, 1500),
    });
  } catch (error) {
    if (error instanceof Response) {
      return error;
    }

    console.error('pdf-to-questions failed', error);
    return errorResponse(500, error instanceof Error ? error.message : 'Unexpected PDF import failure.');
  }
});
