import { PdfNativeBBox, PdfNativeQuestion, PdfNativeRegion, PdfPageMetadata, PdfTextItem, QuestionReviewStatus } from './pdfNativeTypes';
import { extractTextItemsInBBox } from './pdfNativeStructuredExtractor';

interface DetectedToken {
  questionNumber: string;
  numberVal: number;
  item: PdfTextItem;
  pageNumber: number;
  columnIndex: number;
  rawText: string;
}

/**
 * Regex patterns to detect question starting headers in JEE/CBT PDF documents.
 */
const QUESTION_PATTERNS = [
  /^(?:Q(?:uestion)?\s*[\.\:\#]?\s*(\d{1,4}))/i,           // Q1, Q.1, Q 1, Question 1, Q:1
  /^(\d{1,4})\s*[\.\)\:]\s*/,                              // 1., 1), 1:
  /^\(\s*(\d{1,4})\s*\)\s*/,                               // (1)
  /^(?:Qn|Qno|Q\.No)\s*[\.\:]?\s*(\d{1,4})/i,              // QNo. 1, Qn 1
];

/**
 * Test if a text string contains a question start header and extract question number.
 */
export function matchQuestionHeader(str: string): string | null {
  const trimmed = str.trim();
  if (!trimmed) return null;

  for (const pattern of QUESTION_PATTERNS) {
    const match = pattern.exec(trimmed);
    if (match) {
      for (let i = 1; i < match.length; i++) {
        if (match[i]) {
          return match[i] ?? null;
        }
      }
    }
  }

  return null;
}

/**
 * Test if a text string contains an option marker like (1), (2), (a), (b), (A), (B), 1), etc.
 */
export function matchOptionMarker(str: string): boolean {
  const trimmed = str.trim();
  if (!trimmed) return false;
  return /^\(?\s*(?:[1-4]|[A-Da-d])\s*[\)\.\:]/.test(trimmed) || /^(?:Option|Opt)\s*\(?[A-D1-4]\)?/i.test(trimmed);
}

/**
 * Detect multi-column layout for a page and assign column indices to text items.
 */
function classifyColumns(page: PdfPageMetadata): { isMultiColumn: boolean; items: PdfTextItem[] } {
  const midX = page.width / 2;
  let leftCount = 0;
  let rightCount = 0;

  for (const item of page.items) {
    if (item.x < midX - 20) {
      leftCount++;
    } else if (item.x > midX + 20) {
      rightCount++;
    }
  }

  const isMultiColumn = leftCount > 5 && rightCount > 5;

  const classifiedItems = page.items.map((item) => ({
    ...item,
    columnIndex: isMultiColumn ? (item.x >= midX - 10 ? 1 : 0) : 0,
  }));

  classifiedItems.sort((a, b) => {
    if (a.columnIndex !== b.columnIndex) {
      return (a.columnIndex ?? 0) - (b.columnIndex ?? 0);
    }
    if (Math.abs(a.y - b.y) > 4) {
      return a.y - b.y;
    }
    return a.x - b.x;
  });

  return { isMultiColumn, items: classifiedItems };
}

/**
 * Run deterministic question detection on extracted PDF page metadata.
 */
export function detectQuestionsFromPdf(
  pdfId: string,
  pagesMetadata: PdfPageMetadata[]
): PdfNativeQuestion[] {
  const rawTokens: DetectedToken[] = [];
  const classifiedPages = new Map<number, { isMultiColumn: boolean; items: PdfTextItem[] }>();

  // Step 1: Process each page and locate candidate question start tokens
  for (const page of pagesMetadata) {
    const classified = classifyColumns(page);
    classifiedPages.set(page.pageNumber, classified);

    for (const item of classified.items) {
      const qNum = matchQuestionHeader(item.str);
      if (qNum) {
        const numVal = parseInt(qNum, 10);
        if (!isNaN(numVal) && numVal > 0 && numVal < 1000) {
          rawTokens.push({
            questionNumber: qNum,
            numberVal: numVal,
            item,
            pageNumber: page.pageNumber,
            columnIndex: item.columnIndex ?? 0,
            rawText: item.str,
          });
        }
      }
    }
  }

  if (rawTokens.length === 0) {
    return [];
  }

  // Filter out option clusters (e.g. (1), (2), (3), (4) appearing inside a question as options)
  const validTokens: DetectedToken[] = [];
  let expectedSeq: number | null = null;

  for (let i = 0; i < rawTokens.length; i++) {
    const token = rawTokens[i];
    if (!token) continue;

    // Check if token looks like an option marker (1, 2, 3, 4) out of sequence
    if (expectedSeq !== null && token.numberVal <= 4 && token.numberVal !== expectedSeq) {
      const isPrecededByOption =
        i > 0 &&
        rawTokens
          .slice(Math.max(0, i - 3), i)
          .some((t) => t.pageNumber === token.pageNumber && t.numberVal === token.numberVal - 1);

      const isFollowedByOption = rawTokens
        .slice(i + 1, i + 4)
        .some((t) => t.pageNumber === token.pageNumber && t.numberVal === token.numberVal + 1);

      const isOptionMarkerPattern = matchOptionMarker(token.rawText);

      if (isPrecededByOption || isFollowedByOption || isOptionMarkerPattern) {
        continue; // Skip option item
      }
    }

    // Deduplicate tokens on exact same line/page/column
    const prev = validTokens[validTokens.length - 1];
    if (
      prev &&
      prev.numberVal === token.numberVal &&
      prev.pageNumber === token.pageNumber &&
      prev.columnIndex === token.columnIndex &&
      Math.abs(prev.item.y - token.item.y) < 15
    ) {
      continue;
    }

    validTokens.push(token);
    expectedSeq = token.numberVal + 1;
  }

  // Step 2: Build question bounding boxes and determine review status
  const questions: PdfNativeQuestion[] = [];

  for (let i = 0; i < validTokens.length; i++) {
    const token = validTokens[i];
    if (!token) continue;

    const pageMeta = pagesMetadata.find((p) => p.pageNumber === token.pageNumber);
    const classified = classifiedPages.get(token.pageNumber);
    const pageWidth = pageMeta?.width ?? 595;
    const pageHeight = pageMeta?.height ?? 842;
    const isMultiCol = classified?.isMultiColumn ?? false;
    const pageItems = classified?.items ?? pageMeta?.items ?? [];

    // Column X boundaries
    let xMin = 10;
    let xMax = pageWidth - 10;
    if (isMultiCol) {
      if (token.columnIndex === 0) {
        xMax = pageWidth / 2 + 5;
      } else {
        xMin = pageWidth / 2 - 5;
      }
    }

    const yStart = Math.max(0, token.item.y - 6);

    // Find next question token in same page & column
    const nextTokenInCol = validTokens
      .slice(i + 1)
      .find((t) => t && t.pageNumber === token.pageNumber && t.columnIndex === token.columnIndex);

    let yEnd: number;
    if (nextTokenInCol) {
      yEnd = Math.max(yStart + 30, nextTokenInCol.item.y - 6);
    } else {
      const colItems = pageItems.filter((it) =>
        isMultiCol ? (it.x >= xMin - 15 && it.x <= xMax + 15) : true
      );
      const maxY = colItems.reduce((max, it) => Math.max(max, it.y + it.height), yStart + 80);
      yEnd = Math.min(pageHeight - 5, maxY + 15);
    }

    const bbox: PdfNativeBBox = {
      x: Math.round(xMin),
      y: Math.round(yStart),
      width: Math.round(xMax - xMin),
      height: Math.round(Math.max(40, yEnd - yStart)),
    };

    let reviewStatus: QuestionReviewStatus = 'APPROVED';
    const notes: string[] = [];

    // Check sequence
    if (i > 0 && validTokens[i - 1]) {
      const prevToken = validTokens[i - 1]!;
      if (token.numberVal !== prevToken.numberVal + 1) {
        reviewStatus = 'NEEDS_REVIEW';
        notes.push(`Sequence jump: Q${prevToken.questionNumber} -> Q${token.questionNumber}`);
      }
    }

    if (bbox.height < 30) {
      reviewStatus = 'NEEDS_REVIEW';
      notes.push('Very small region height');
    } else if (bbox.height > pageHeight * 0.85) {
      reviewStatus = 'NEEDS_REVIEW';
      notes.push('Large region spanning almost full page');
    }

    if (!nextTokenInCol && bbox.y + bbox.height > pageHeight - 30) {
      reviewStatus = 'NEEDS_REVIEW';
      notes.push('Question extends near page bottom boundary');
    }

    // Step 3: Detect Multi-Region Disconnected Questions (e.g. Q32 cross-column / cross-page)
    let multiRegions: PdfNativeRegion[] | undefined = undefined;

    // Condition A: Cross-Column split (Stem at bottom of Column 0 -> Options in Column 1 before next question)
    if (isMultiCol && token.columnIndex === 0 && !nextTokenInCol) {
      const nextTokenInNextCol = validTokens
        .slice(i + 1)
        .find((t) => t && t.pageNumber === token.pageNumber && t.columnIndex === 1);

      if (nextTokenInNextCol) {
        // Find all text items in Column 1 that appear strictly before nextTokenInNextCol
        const col1ItemsBeforeNext = pageItems.filter(
          (it) => it.columnIndex === 1 && it.y < nextTokenInNextCol.item.y - 4
        );

        if (col1ItemsBeforeNext.length > 0) {
          const hasOptionMarkers = col1ItemsBeforeNext.some((it) => matchOptionMarker(it.str));
          const textContent = col1ItemsBeforeNext.map((it) => it.str).join(' ').trim();

          if (hasOptionMarkers || textContent.length > 15) {
            const r2YMin = Math.max(0, Math.min(...col1ItemsBeforeNext.map((it) => it.y)) - 6);
            const r2YMax = Math.max(r2YMin + 25, nextTokenInNextCol.item.y - 6);
            const r2XMin = pageWidth / 2 - 5;
            const r2XMax = pageWidth - 10;

            const region1: PdfNativeRegion = {
              id: `${pdfId}_q${token.questionNumber}_reg1`,
              pageNumber: token.pageNumber,
              bbox: bbox,
              role: 'stem',
              orderIndex: 0,
              label: 'Stem (Column 1)',
            };

            const region2: PdfNativeRegion = {
              id: `${pdfId}_q${token.questionNumber}_reg2`,
              pageNumber: token.pageNumber,
              bbox: {
                x: Math.round(r2XMin),
                y: Math.round(r2YMin),
                width: Math.round(r2XMax - r2XMin),
                height: Math.round(r2YMax - r2YMin),
              },
              role: 'options',
              orderIndex: 1,
              label: 'Options (Column 2)',
            };

            multiRegions = [region1, region2];
            reviewStatus = 'NEEDS_REVIEW';
            notes.push(`Multi-region split: Stem in Column 1 -> Options in Column 2 (strictly excluding Q${nextTokenInNextCol.questionNumber}+). Faculty review required.`);
          }
        }
      }
    }

    // Condition B: Cross-Page split (Stem at bottom of Page P -> Options at top of Page P+1 before next question)
    if (!multiRegions && !nextTokenInCol && i + 1 < validTokens.length) {
      const nextToken = validTokens[i + 1];
      if (nextToken && nextToken.pageNumber === token.pageNumber + 1) {
        const nextPageMeta = pagesMetadata.find((p) => p.pageNumber === token.pageNumber + 1);
        const nextClassified = classifiedPages.get(token.pageNumber + 1);
        const nextPageItems = nextClassified?.items ?? nextPageMeta?.items ?? [];

        if (nextPageMeta) {
          const nextColIndex = nextToken.columnIndex ?? 0;
          const colItemsOnNextPage = nextPageItems.filter(
            (it) => (it.columnIndex ?? 0) === nextColIndex && it.y < nextToken.item.y - 4
          );

          if (colItemsOnNextPage.length > 0 && colItemsOnNextPage.some((it) => matchOptionMarker(it.str))) {
            const npWidth = nextPageMeta.width;
            const isNextMultiCol = nextClassified?.isMultiColumn ?? false;
            let npXMin = 10;
            let npXMax = npWidth - 10;
            if (isNextMultiCol) {
              npXMax = nextColIndex === 0 ? npWidth / 2 + 5 : npWidth - 10;
              npXMin = nextColIndex === 0 ? 10 : npWidth / 2 - 5;
            }

            const r2YMin = Math.max(0, Math.min(...colItemsOnNextPage.map((it) => it.y)) - 6);
            const r2YMax = Math.max(r2YMin + 25, nextToken.item.y - 6);

            const region1: PdfNativeRegion = {
              id: `${pdfId}_q${token.questionNumber}_reg1`,
              pageNumber: token.pageNumber,
              bbox: bbox,
              role: 'stem',
              orderIndex: 0,
              label: `Stem (Page ${token.pageNumber})`,
            };

            const region2: PdfNativeRegion = {
              id: `${pdfId}_q${token.questionNumber}_reg2`,
              pageNumber: token.pageNumber + 1,
              bbox: {
                x: Math.round(npXMin),
                y: Math.round(r2YMin),
                width: Math.round(npXMax - npXMin),
                height: Math.round(r2YMax - r2YMin),
              },
              role: 'options',
              orderIndex: 1,
              label: `Options (Page ${token.pageNumber + 1})`,
            };

            multiRegions = [region1, region2];
            reviewStatus = 'NEEDS_REVIEW';
            notes.push(`Multi-region split: Page ${token.pageNumber} -> Page ${token.pageNumber + 1}. Faculty review required.`);
          }
        }
      }
    }

    // In Phase 2: If correct_answer is null, initial review_status should be NEEDS_REVIEW until faculty sets answer key
    if (reviewStatus === 'APPROVED') {
      reviewStatus = 'NEEDS_REVIEW';
      notes.push('Answer key required before final approval');
    }

    const qItems = pageMeta ? extractTextItemsInBBox(pageMeta, bbox, token.columnIndex) : [];
    let fullText = qItems.length > 0 ? qItems.map((it) => it.str).join(' ') : token.rawText;

    if (multiRegions && multiRegions.length > 1) {
      for (let rIdx = 1; rIdx < multiRegions.length; rIdx++) {
        const r = multiRegions[rIdx];
        if (r) {
          const rPageMeta = pagesMetadata.find((p) => p.pageNumber === r.pageNumber);
          if (rPageMeta) {
            const rItems = extractTextItemsInBBox(rPageMeta, r.bbox, r.bbox.x < rPageMeta.width / 2 ? 0 : 1);
            if (rItems.length > 0) {
              fullText += ' ' + rItems.map((it) => it.str).join(' ');
            }
          }
        }
      }
    }

    const pageEnd = multiRegions && multiRegions.length > 0
      ? multiRegions[multiRegions.length - 1]!.pageNumber
      : token.pageNumber;

    questions.push({
      id: `${pdfId}_q${token.questionNumber}_${i}`,
      pdf_id: pdfId,
      question_number: token.questionNumber,
      page_start: token.pageNumber,
      page_end: pageEnd,
      bbox,
      regions: multiRegions,
      subject: 'Physics',
      chapter: null,
      topic: null,
      question_type: 'MCQ',
      correct_answer: null,
      marks: 4,
      negative_marks: 1,
      review_status: reviewStatus,
      column_index: token.columnIndex,
      raw_detected_text: fullText,
      notes: notes.length > 0 ? notes.join('; ') : undefined,
    });
  }

  return questions;
}
