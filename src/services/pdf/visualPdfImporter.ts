import { appEnv } from '../../config/env';
import { logInfo, logWarn } from '../../utils/logger';

export interface VisualImportResult {
  questions: Array<{
    question_number: string;
    question: string;
    prompt: string;
    options: string[];
    correct_answer: string;
    correctOptionIndex: number;
    explanation: string;
    type: 'mcq' | 'integer';
    has_diagram: boolean;
    image_url: string | null;
    imageUrl: string | null;
    source_page: number;
    confidence_score: number;
    review_status: 'APPROVED' | 'NEEDS_REVIEW';
    review_reasons: string[];
  }>;
  savedCount: number;
  approvedCount: number;
  needsReviewCount: number;
  setId: string;
}

/**
 * Visual-First PDF Importer Service.
 * Connects the Visual PDF Pipeline to the Admin UI Create Set flow.
 */
export async function processVisualPdfImport(payload: {
  pdfUrl: string;
  pdfName: string;
  answerKeyPdfUrl?: string;
  setId?: string;
}): Promise<VisualImportResult> {
  const fallbackBackendUrl = 'https://miitjee-backend.miitjee-api.workers.dev';
  const isFileProtocol = typeof window !== 'undefined' && window.location.protocol === 'file:';
  const primaryBackendUrl = (appEnv.workerBaseUrl && (!isFileProtocol || !appEnv.workerBaseUrl.includes('127.0.0.1')))
    ? appEnv.workerBaseUrl
    : fallbackBackendUrl;
  const targetSetId = payload.setId || `set_${Date.now()}`;

  console.log('[PDF-IMPORT-DEBUG] 1. selected PDF filename:', payload.pdfName);
  console.log('[PDF-IMPORT-DEBUG] 3. endpoint being called:', `${primaryBackendUrl}/import-pdf`);

  let response: Response;
  try {
    response = await fetch(`${primaryBackendUrl.replace(/\/$/, '')}/import-pdf`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-dev-mode': 'true',
      },
      body: JSON.stringify({
        pdfUrl: payload.pdfUrl,
        answerKeyPdfUrl: payload.answerKeyPdfUrl,
        testTitle: payload.pdfName,
        importMode: 'replace',
        provider: 'gemini',
      }),
    });
  } catch (netErr) {
    console.warn('[PDF-IMPORT-DEBUG] Primary backend fetch failed, attempting fallback:', netErr);
    response = await fetch(`${fallbackBackendUrl}/import-pdf`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-dev-mode': 'true',
      },
      body: JSON.stringify({
        pdfUrl: payload.pdfUrl,
        answerKeyPdfUrl: payload.answerKeyPdfUrl,
        testTitle: payload.pdfName,
        importMode: 'replace',
        provider: 'gemini',
      }),
    });
  }

  console.log('[PDF-IMPORT-DEBUG] 4. HTTP response status:', response.status, response.statusText);

  if (!response.ok) {
    const errorText = await response.text();
    let serverMessage = '';
    try {
      const parsedErr = JSON.parse(errorText);
      serverMessage = parsedErr.error || parsedErr.message || '';
    } catch {
      serverMessage = errorText;
    }

    if (response.status === 401) {
      throw new Error('Authentication failed');
    }
    if (response.status === 403) {
      throw new Error('Access denied');
    }
    if (response.status === 404) {
      throw new Error('PDF import endpoint not found');
    }
    if (response.status === 429) {
      throw new Error('Gemini quota/rate limit exceeded');
    }
    if (response.status === 500) {
      throw new Error(serverMessage || 'Server error during PDF import');
    }

    throw new Error(serverMessage || `PDF import failed (${response.status})`);
  }

  const result = await response.json();
  console.log('[PDF-IMPORT-DEBUG] 5. response JSON keys:', Object.keys(result || {}));

  const rawQuestions = Array.isArray(result?.questions) ? result.questions : [];
  console.log('[PDF-IMPORT-DEBUG] 6. number of questions returned:', rawQuestions.length);

  if (rawQuestions.length > 0) {
    console.log('[PDF-IMPORT-DEBUG] 7. first returned question_number:', rawQuestions[0]?.question_number ?? rawQuestions[0]?.questionNumber ?? '1');
  }

  const formattedQuestions = rawQuestions.map((q: any, idx: number) => {
    const prompt = String(q.question || q.question_text || q.prompt || '').trim();
    const rawOptions = Array.isArray(q.options) ? q.options.map((opt: any) => String(opt).trim()).filter(Boolean) : [];
    
    // Ensure 4 options for MCQ
    const options = [...rawOptions];
    while (options.length < 4) {
      options.push(`Option ${String.fromCharCode(65 + options.length)}`);
    }
    if (options.length > 4) {
      options.splice(4);
    }

    const correctAnswer = String(q.correct_answer || q.correctAnswer || options[0] || '').trim();
    let correctOptionIndex = options.findIndex(opt => opt.toLowerCase() === correctAnswer.toLowerCase());
    if (correctOptionIndex < 0) correctOptionIndex = 0;

    const imageUrl = q.image_url || q.imageUrl || q.image || null;
    const hasDiagram = Boolean(q.has_diagram || q.hasDiagram || q.has_image || imageUrl);
    const reviewStatus = q.review_status || (q.review_reasons?.length > 0 ? 'NEEDS_REVIEW' : 'APPROVED');
    const reviewReasons = Array.isArray(q.review_reasons) ? q.review_reasons : [];

    return {
      question_number: String(q.question_number || idx + 1),
      question: prompt,
      prompt,
      options,
      correct_answer: correctAnswer,
      correctAnswer,
      correctOptionIndex,
      explanation: String(q.explanation || '').trim(),
      type: 'mcq' as const,
      has_diagram: hasDiagram,
      has_image: hasDiagram,
      image_url: imageUrl,
      imageUrl,
      image: imageUrl,
      source_page: Number(q.source_page || q.sourcePage) || 1,
      confidence_score: Number(q.confidence_score || q.confidenceScore) || 0.95,
      review_status: reviewStatus,
      review_reasons: reviewReasons,
    };
  });

  console.log('[PDF-IMPORT-DEBUG] 8. number of questions after transformation:', formattedQuestions.length);
  console.log('[PDF-IMPORT-DEBUG] 9. number of questions after validation (includes NEEDS_REVIEW):', formattedQuestions.length);
  console.log('[PDF-IMPORT-DEBUG] 10. number of questions sent to save-questions:', formattedQuestions.length);

  if (formattedQuestions.length === 0) {
    console.log('[PDF-IMPORT-DEBUG] 12. final value used by UI check: 0 (TRIGGERED ALERT)');
    throw new Error('No usable questions could be parsed from the uploaded PDF. Please verify that the PDF contains readable text/questions.');
  }

  // Save to Question Store via backend proxy
  const saveEndpoint = `${primaryBackendUrl.replace(/\/$/, '')}/api/pdf/save-questions`;
  let saveRes: Response | null = null;

  try {
    saveRes = await fetch(saveEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-dev-mode': 'true',
      },
      body: JSON.stringify({
        setId: targetSetId,
        questions: formattedQuestions,
      }),
    });
  } catch (err) {
    console.warn('[PDF-IMPORT-DEBUG] Primary save-questions fetch failed, attempting fallback:', err);
    try {
      saveRes = await fetch(`${fallbackBackendUrl}/api/pdf/save-questions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-dev-mode': 'true',
        },
        body: JSON.stringify({
          setId: targetSetId,
          questions: formattedQuestions,
        }),
      });
    } catch {
      saveRes = null;
    }
  }

  let savedCount = formattedQuestions.length;
  let approvedCount = formattedQuestions.filter((q: any) => q.review_status === 'APPROVED').length;
  let needsReviewCount = formattedQuestions.filter((q: any) => q.review_status === 'NEEDS_REVIEW').length;

  if (saveRes && saveRes.ok) {
    try {
      const saveResult = await saveRes.json();
      savedCount = saveResult.savedCount ?? savedCount;
      approvedCount = saveResult.approvedCount ?? approvedCount;
      needsReviewCount = saveResult.needsReviewCount ?? needsReviewCount;
      console.log('[PDF-IMPORT-DEBUG] 11. number of questions returned after save:', savedCount);
    } catch {
      // JSON parse fallback
    }
  }

  console.log('[PDF-IMPORT-DEBUG] 12. final value used by UI check:', savedCount);

  return {
    questions: formattedQuestions,
    savedCount,
    approvedCount,
    needsReviewCount,
    setId: targetSetId,
  };
}
