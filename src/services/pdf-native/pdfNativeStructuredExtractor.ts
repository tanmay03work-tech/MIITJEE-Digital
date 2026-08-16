import {
  NativeDiagramItem,
  NativeOptionItem,
  NativeQuestionBlock,
  NativeQuestionStructure,
  NativeRenderingStatus,
} from './nativeQuestionTypes';
import {
  PdfNativeBBox,
  PdfNativeQuestion,
  PdfPageMetadata,
  PdfTextItem,
} from './pdfNativeTypes';

/**
 * Common Unicode Math & Symbol normalizer for JEE/NEET/CBT exams.
 * Preserves actual Unicode characters for symbols, Greek letters, superscripts, and subscripts.
 */
export function normalizeUnicodeSymbols(text: string): string {
  if (!text) return '';

  let res = text;

  // Normalize common math notations into clean Unicode
  res = res
    // Superscripts
    .replace(/\^0/g, '⁰')
    .replace(/\^1/g, '¹')
    .replace(/\^2/g, '²')
    .replace(/\^3/g, '³')
    .replace(/\^4/g, '⁴')
    .replace(/\^5/g, '⁵')
    .replace(/\^6/g, '⁶')
    .replace(/\^7/g, '⁷')
    .replace(/\^8/g, '⁸')
    .replace(/\^9/g, '⁹')
    .replace(/\^n/g, 'ⁿ')
    .replace(/\^\+/g, '⁺')
    .replace(/\^\-/g, '⁻')
    // Subscripts
    .replace(/_0/g, '₀')
    .replace(/_1/g, '₁')
    .replace(/_2/g, '₂')
    .replace(/_3/g, '₃')
    .replace(/_4/g, '₄')
    .replace(/_5/g, '₅')
    .replace(/_6/g, '₆')
    .replace(/_7/g, '₇')
    .replace(/_8/g, '₈')
    .replace(/_9/g, '₉')
    // Common Greek and Math Replacements
    .replace(/\\alpha/g, 'α')
    .replace(/\\beta/g, 'β')
    .replace(/\\gamma/g, 'γ')
    .replace(/\\theta/g, 'θ')
    .replace(/\\pi/g, 'π')
    .replace(/\\lambda/g, 'λ')
    .replace(/\\mu/g, 'μ')
    .replace(/\\omega/g, 'ω')
    .replace(/\\Delta/g, 'Δ')
    .replace(/\\infty/g, '∞')
    .replace(/\\pm/g, '±')
    .replace(/\\leq/g, '≤')
    .replace(/\\geq/g, '≥')
    .replace(/\\neq/g, '≠')
    .replace(/\\to/g, '→')
    .replace(/\\leftarrow/g, '←')
    .replace(/\\times/g, '×')
    .replace(/\\div/g, '÷')
    .replace(/\\degree/g, '°')
    .replace(/\\sum/g, '∑')
    .replace(/\\int/g, '∫')
    .replace(/\\partial/g, '∂')
    .replace(/\\sqrt/g, '√');

  return res;
}

/**
 * Filter text items that lie strictly within the given bounding box on a specific page.
 */
export function extractTextItemsInBBox(
  page: PdfPageMetadata,
  bbox: PdfNativeBBox,
  columnIndex?: number
): PdfTextItem[] {
  const yStart = bbox.y;
  const yEnd = bbox.y + bbox.height;
  const midX = page.width / 2;

  let xStart = bbox.x;
  let xEnd = bbox.x + bbox.width;

  if (columnIndex === 0) {
    xEnd = Math.min(xEnd, midX - 4);
  } else if (columnIndex === 1) {
    xStart = Math.max(xStart, midX + 4);
  }

  return page.items.filter((it) => {
    const itY = it.y;
    const itH = it.height || 10;
    const itX = it.x;
    const itW = it.width || 10;

    const intersectsY = itY + itH >= yStart - 2 && itY <= yEnd + 2;
    const intersectsX = itX + itW >= xStart - 4 && itX <= xEnd + 4;

    if (columnIndex === 0 && itX > midX - 6) return false;
    if (columnIndex === 1 && itX < midX + 6) return false;

    return intersectsY && intersectsX;
  });
}

/**
 * Option marker regexes supporting:
 * (A), (B), (C), (D)
 * (1), (2), (3), (4)
 * (a), (b), (c), (d)
 * A., B., C., D.
 * 1., 2., 3., 4.
 */
const OPTION_MARKER_REGEX = /(?:^|\s)(?:\(([A-Da-d1-4])\)|([A-Da-d1-4])\.)\s*/;

export interface ExtractedOptionRaw {
  label: 'A' | 'B' | 'C' | 'D';
  text: string;
  bbox?: PdfNativeBBox;
}

/**
 * Parse lines into Question Prompt and Options (A, B, C, D).
 */
export function separatePromptAndOptions(
  items: PdfTextItem[],
  questionNumber: string
): {
  promptText: string;
  options: ExtractedOptionRaw[];
  isOptionDecomposed: boolean;
} {
  // Sort items top-to-bottom, left-to-right
  const sorted = [...items].sort((a, b) => {
    if (Math.abs(a.y - b.y) > 4) {
      return a.y - b.y;
    }
    return a.x - b.x;
  });

  // Group items into lines
  const lines: { y: number; text: string; items: PdfTextItem[] }[] = [];
  for (const item of sorted) {
    const existingLine = lines.find((l) => Math.abs(l.y - item.y) < 4);
    if (existingLine) {
      existingLine.text += (existingLine.text.endsWith(' ') || item.str.startsWith(' ') ? '' : ' ') + item.str;
      existingLine.items.push(item);
    } else {
      lines.push({ y: item.y, text: item.str, items: [item] });
    }
  }

  // Identify option positions
  const rawFullText = lines.map((l) => l.text.trim()).join('\n');
  const labelMapping: Record<string, 'A' | 'B' | 'C' | 'D'> = {
    '1': 'A',
    '2': 'B',
    '3': 'C',
    '4': 'D',
    a: 'A',
    b: 'B',
    c: 'C',
    d: 'D',
    A: 'A',
    B: 'B',
    C: 'C',
    D: 'D',
  };

  const optionMatches: {
    index: number;
    rawLabel: string;
    normalizedLabel: 'A' | 'B' | 'C' | 'D';
    matchLength: number;
  }[] = [];

  // Match option markers: (A)-(D), (1)-(4), [A]-[D], [1]-[4], A.-D., A)-D), 1)-4)
  const globalOptRegex = /(?:^|\n|\s+)(?:\(([A-Da-d1-4])\)|\[([A-Da-d1-4])\]|([A-Da-d])[\.\)]|([1-4])\))\s*/g;
  let match: RegExpExecArray | null;

  while ((match = globalOptRegex.exec(rawFullText)) !== null) {
    const rawLbl = match[1] || match[2] || match[3] || match[4];
    if (rawLbl && labelMapping[rawLbl]) {
      optionMatches.push({
        index: match.index,
        rawLabel: rawLbl,
        normalizedLabel: labelMapping[rawLbl]!,
        matchLength: match[0].length,
      });
    }
  }

  // If we found at least 2 distinct sequentially mapped option markers
  if (optionMatches.length >= 2) {
    // Filter to ensure sequence A -> B -> C -> D or 1 -> 2 -> 3 -> 4
    const validSequence = optionMatches.filter(
      (opt, idx, arr) => idx === 0 || opt.normalizedLabel !== arr[idx - 1]?.normalizedLabel
    );

    const firstOptIndex = validSequence[0]!.index;
    let promptRaw = rawFullText.substring(0, firstOptIndex).trim();

    // Strip leading question number (e.g., "(91)", "91.", "Q.91", "Q91")
    promptRaw = promptRaw
      .replace(new RegExp(`^(?:\\(?Q(?:uestion)?\\s*[\\.\\:\\#]?\\s*|Qn\\s*[\\.\\:]?\\s*)?\\(?${questionNumber}\\)?\\s*[\\.\\)\\:\\-]?\\s*`, 'i'), '')
      .replace(/MIITJEE\s*Classes/gi, '')
      .trim();

    const options: ExtractedOptionRaw[] = [];

    for (let i = 0; i < validSequence.length; i++) {
      const cur = validSequence[i]!;
      const next = validSequence[i + 1];
      const startTextPos = cur.index + cur.matchLength;
      const endTextPos = next ? next.index : rawFullText.length;
      let optText = rawFullText.substring(startTextPos, endTextPos).trim();

      optText = optText
        .replace(/MIITJEE\s*Classes/gi, '')
        .replace(/\s*\(\d+\)\s*$/g, '')
        .replace(/\bp\s+2\b/g, 'p²')
        .replace(/\bq\s+2\b/g, 'q²')
        .replace(/\ba\s+2\b/g, 'a²')
        .replace(/\bb\s+2\b/g, 'b²')
        .replace(/\bx\s+2\b/g, 'x²')
        .trim();

      options.push({
        label: cur.normalizedLabel,
        text: normalizeUnicodeSymbols(optText),
      });
    }

    // Ensure we have A, B, C, D
    const labelSet = new Set(options.map((o) => o.label));
    for (const l of ['A', 'B', 'C', 'D'] as const) {
      if (!labelSet.has(l)) {
        options.push({ label: l, text: `Option ${l}` });
      }
    }

    options.sort((a, b) => a.label.localeCompare(b.label));

    return {
      promptText: normalizeUnicodeSymbols(promptRaw),
      options,
      isOptionDecomposed: true,
    };
  }

  // Fallback: No explicit (A)-(D) text markers detected (could be numerical or graphical options)
  let cleanPrompt = rawFullText
    .replace(new RegExp(`^(?:Q(?:uestion)?\\s*[\\.\\:\\#]?\\s*|Qn\\s*[\\.\\:]?\\s*)?${questionNumber}\\s*[\\.\\)\\:]?\\s*`, 'i'), '')
    .trim();

  return {
    promptText: normalizeUnicodeSymbols(cleanPrompt || `Question ${questionNumber}`),
    options: [
      { label: 'A', text: 'Option A' },
      { label: 'B', text: 'Option B' },
      { label: 'C', text: 'Option C' },
      { label: 'D', text: 'Option D' },
    ],
    isOptionDecomposed: false,
  };
}

/**
 * Main Structured Extraction Pipeline:
 * Converts a PdfNativeQuestion into a NativeQuestionStructure with blocks, math, diagrams, and clickable options.
 */
export function extractStructuredNativeQuestion(
  question: PdfNativeQuestion,
  pagesMetadata: PdfPageMetadata[] = []
): NativeQuestionStructure {
  const pageMeta = pagesMetadata.find((p) => p.pageNumber === question.page_start);
  const reviewReasons: string[] = [];
  let status: NativeRenderingStatus = 'NATIVE_READY';

  // 1. Extract text items within the question boundary
  let itemsInBox: PdfTextItem[] = [];
  if (pageMeta) {
    itemsInBox = extractTextItemsInBBox(pageMeta, question.bbox, question.column_index);
  } else if (question.raw_detected_text && question.raw_detected_text.length > 5) {
    itemsInBox = [
      {
        str: question.raw_detected_text,
        x: question.bbox.x,
        y: question.bbox.y,
        width: question.bbox.width,
        height: 12,
        pageNumber: question.page_start,
      },
    ];
  } else {
    status = 'NEEDS_REVIEW';
    reviewReasons.push('Page metadata and raw text unavailable for native structured extraction');
  }

  // 2. Separate question prompt and options
  const { promptText, options: rawOptions, isOptionDecomposed } = separatePromptAndOptions(
    itemsInBox,
    question.question_number
  );

  // 3. Assemble Question Blocks (Text, Formula, Diagrams)
  const blocks: NativeQuestionBlock[] = [];
  let blockIndex = 0;

  if (promptText) {
    blocks.push({
      type: 'TEXT',
      content: promptText,
      orderIndex: blockIndex++,
    });
  }

  // 4. Diagram Isolation
  const diagrams: NativeDiagramItem[] = [];

  // Check if question has a diagram:
  // Detect if there's a significant vertical gap between text items (> 70pt) or explicit large height (> 180pt)
  const sortedY = [...itemsInBox].sort((a, b) => a.y - b.y);
  let hasDiagramGap = false;
  let gapYStart = question.bbox.y;
  let gapYEnd = question.bbox.y + question.bbox.height;

  for (let i = 0; i < sortedY.length - 1; i++) {
    const cur = sortedY[i]!;
    const next = sortedY[i + 1]!;
    const gap = next.y - (cur.y + (cur.height || 10));
    if (gap > 65) {
      hasDiagramGap = true;
      gapYStart = cur.y + (cur.height || 10);
      gapYEnd = next.y;
      break;
    }
  }

  if (hasDiagramGap || question.bbox.height > 200) {
    const diagramBBox: PdfNativeBBox = {
      x: question.bbox.x,
      y: Math.round(hasDiagramGap ? gapYStart : question.bbox.y + 40),
      width: question.bbox.width,
      height: Math.round(hasDiagramGap ? Math.max(40, gapYEnd - gapYStart) : Math.min(180, question.bbox.height * 0.45)),
    };

    const diagramItem: NativeDiagramItem = {
      id: `${question.id}_diag_0`,
      bbox: diagramBBox,
      caption: `Figure for Question ${question.question_number}`,
    };

    diagrams.push(diagramItem);
    blocks.push({
      type: 'IMAGE',
      id: diagramItem.id,
      bbox: diagramBBox,
      caption: diagramItem.caption,
      orderIndex: blockIndex++,
    });
  }

  // 5. Option items
  const isNumerical =
    question.question_type === 'Numerical' ||
    question.question_type === 'INTEGER' ||
    (question.question_type as string) === 'integer';

  const finalOptions: NativeOptionItem[] = isNumerical
    ? []
    : rawOptions.map((opt) => ({
        id: `${question.id}_opt_${opt.label}`,
        label: opt.label,
        text: opt.text,
        isCorrect: question.correct_answer === opt.label,
      }));

  // 6. Quality and Ambiguity Validation
  if (itemsInBox.length === 0) {
    status = 'NEEDS_REVIEW';
    reviewReasons.push('No text detected in question bounding box');
  }

  if (!isNumerical && (!isOptionDecomposed || finalOptions.length < 4)) {
    // If not all 4 options cleanly separated in text, mark for faculty review
    if (question.review_status === 'NEEDS_REVIEW') {
      status = 'NEEDS_REVIEW';
      reviewReasons.push('Option decomposition requires review');
    }
  }

  if (question.bbox.height < 30) {
    status = 'NEEDS_REVIEW';
    reviewReasons.push('Question bounding box height too small');
  }

  return {
    id: question.id,
    pdfId: question.pdf_id,
    questionNumber: question.question_number,
    subject: question.subject,
    questionType: question.question_type,
    pageNumber: question.page_start,
    bbox: question.bbox,
    promptText: promptText || `Question ${question.question_number}`,
    blocks,
    options: finalOptions,
    diagrams,
    correctAnswer: question.correct_answer,
    marks: question.marks || 4,
    negativeMarks: question.negative_marks || 1,
    status,
    reviewReason: reviewReasons.length > 0 ? reviewReasons.join('; ') : undefined,
    rawText: itemsInBox.map((i) => i.str).join(' '),
  };
}
