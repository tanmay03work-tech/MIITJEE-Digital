import JSZip from 'jszip';
import { QuestionType } from '../../types';

export interface ParsedDocxQuestion {
  questionNumber: number;
  subjectLabel: string;
  sectionLabel: string;
  type: QuestionType;
  prompt: string;
  options: string[];
  correctAnswer: string;
  integerAnswer?: number | null;
  explanation: string;
  imageUrl?: string | null;
  optionImageUrls?: string[];
  images?: string[];
  needsReview?: boolean;
  warnings?: string[];
}

export interface DocxParseResult {
  fileName: string;
  totalQuestions: number;
  subjectCounts: Record<string, number>;
  questions: ParsedDocxQuestion[];
  warnings: string[];
}

const SUPERSCRIPT_MAP: Record<string, string> = {
  '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴',
  '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹',
  '+': '⁺', '-': '⁻', '=': '⁼', '(': '⁽', ')': '⁾',
  'n': 'ⁿ', 'i': 'ⁱ', 'x': 'ˣ', 'y': 'ʸ',
};

const SUBSCRIPT_MAP: Record<string, string> = {
  '0': '₀', '1': '₁', '2': '₂', '3': '₃', '4': '₄',
  '5': '₅', '6': '₆', '7': '₇', '8': '₈', '9': '₉',
  '+': '₊', '-': '₋', '=': '₌', '(': '₍', ')': '₎',
  'a': 'ₐ', 'e': 'ₑ', 'h': 'ₕ', 'k': 'ₖ', 'l': 'ₗ',
  'm': 'ₘ', 'n': 'ₙ', 'o': 'ₒ', 'p': 'ₚ', 's': 'ₛ',
  't': 'ₜ', 'x': 'ₓ',
};

function toSuperscript(text: string): string {
  return text.split('').map((char) => SUPERSCRIPT_MAP[char] || char).join('');
}

function toSubscript(text: string): string {
  return text.split('').map((char) => SUBSCRIPT_MAP[char] || char).join('');
}

function getDOMParserInstance(): any {
  if (typeof globalThis.DOMParser !== 'undefined') {
    return new globalThis.DOMParser();
  }
  try {
    const { DOMParser } = require('@xmldom/xmldom');
    return new DOMParser();
  } catch {
    throw new Error('DOMParser is not available in the current environment.');
  }
}

// Numbering definition types for word/numbering.xml
interface AbstractNumLevel {
  numFmt: string;
  lvlText: string;
  start: number;
}

interface NumberingDefinitions {
  numToAbstract: Record<string, string>;
  abstractLevels: Record<string, Record<string, AbstractNumLevel>>;
}

function parseNumberingXml(xmlText: string): NumberingDefinitions {
  const defs: NumberingDefinitions = {
    numToAbstract: {},
    abstractLevels: {},
  };

  try {
    const parser = getDOMParserInstance();
    const doc = parser.parseFromString(xmlText, 'application/xml');

    const abstractNums = doc.getElementsByTagName('w:abstractNum');
    for (let i = 0; i < abstractNums.length; i++) {
      const aNum = abstractNums[i];
      if (!aNum) continue;
      const aId = aNum.getAttribute('w:abstractNumId');
      if (!aId) continue;

      defs.abstractLevels[aId] = {};
      const levels = aNum.getElementsByTagName('w:lvl');
      for (let j = 0; j < levels.length; j++) {
        const lvl = levels[j];
        if (!lvl) continue;
        const ilvl = lvl.getAttribute('w:ilvl') || '0';
        const numFmt = lvl.getElementsByTagName('w:numFmt')[0]?.getAttribute('w:val') || 'decimal';
        const lvlText = lvl.getElementsByTagName('w:lvlText')[0]?.getAttribute('w:val') || '%1.';
        const startStr = lvl.getElementsByTagName('w:start')[0]?.getAttribute('w:val') || '1';
        defs.abstractLevels[aId][ilvl] = {
          numFmt,
          lvlText,
          start: parseInt(startStr, 10) || 1,
        };
      }
    }

    const nums = doc.getElementsByTagName('w:num');
    for (let i = 0; i < nums.length; i++) {
      const num = nums[i];
      if (!num) continue;
      const numId = num.getAttribute('w:numId');
      const abstractRef = num.getElementsByTagName('w:abstractNumId')[0]?.getAttribute('w:val');
      if (numId && abstractRef) {
        defs.numToAbstract[numId] = abstractRef;
      }
    }
  } catch (err) {
    console.warn('[DocxParser] Failed to parse numbering.xml:', err);
  }

  return defs;
}

function formatListNumber(val: number, numFmt: string, lvlText: string): string {
  let formatted = String(val);
  if (numFmt === 'upperLetter') {
    formatted = String.fromCharCode(64 + Math.min(26, Math.max(1, val)));
  } else if (numFmt === 'lowerLetter') {
    formatted = String.fromCharCode(96 + Math.min(26, Math.max(1, val)));
  } else if (numFmt === 'upperRoman') {
    const roman = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'];
    formatted = roman[val] || String(val);
  } else if (numFmt === 'lowerRoman') {
    const roman = ['', 'i', 'ii', 'iii', 'iv', 'v', 'vi', 'vii', 'viii', 'ix', 'x'];
    formatted = roman[val] || String(val);
  } else if (numFmt === 'bullet') {
    return '• ';
  }

  return lvlText.replace(/%\d+/g, formatted) + ' ';
}

interface ExtractedItem {
  type: 'paragraph' | 'table';
  text: string;
  images: string[];
  tableHeaders?: string[];
  tableRows?: string[][];
  isMatchingTable?: boolean;
}

function extractTextAndImagesFromParagraph(
  p: Element,
  relsMap: Record<string, string>,
  imageMap: Record<string, string>,
  numberingDefs?: NumberingDefinitions,
  numberingCounters?: Record<string, number>,
): { text: string; images: string[] } {
  let paraText = '';
  const paraImages: string[] = [];

  // Check Word List Numbering (w:numPr)
  if (numberingDefs && numberingCounters) {
    const numPr = p.getElementsByTagName('w:numPr')[0];
    if (numPr) {
      const numId = numPr.getElementsByTagName('w:numId')[0]?.getAttribute('w:val');
      const ilvl = numPr.getElementsByTagName('w:ilvl')[0]?.getAttribute('w:val') || '0';
      if (numId && numberingDefs.numToAbstract[numId]) {
        const abstractId = numberingDefs.numToAbstract[numId]!;
        const lvlDef = numberingDefs.abstractLevels[abstractId]?.[ilvl];
        if (lvlDef) {
          const counterKey = `${numId}_${ilvl}`;
          if (numberingCounters[counterKey] === undefined) {
            numberingCounters[counterKey] = lvlDef.start;
          } else {
            numberingCounters[counterKey] += 1;
          }
          const currentCount = numberingCounters[counterKey]!;
          const prefix = formatListNumber(currentCount, lvlDef.numFmt, lvlDef.lvlText);
          paraText += prefix;
        }
      }
    }
  }

  const runs = p.childNodes;
  for (let rIdx = 0; rIdx < runs.length; rIdx++) {
    const run = runs[rIdx] as Element;
    if (!run || !run.tagName) continue;

    // Check for drawings
    const blips = run.getElementsByTagName('a:blip');
    for (let bIdx = 0; bIdx < blips.length; bIdx++) {
      const blip = blips[bIdx];
      if (!blip) continue;
      const embedId = blip.getAttribute('r:embed') || blip.getAttribute('embed');
      if (embedId && relsMap[embedId]) {
        const imgName = relsMap[embedId];
        const dataUrl = imageMap[imgName];
        if (dataUrl && !paraImages.includes(dataUrl)) {
          paraImages.push(dataUrl);
        }
      }
    }

    const vImages = run.getElementsByTagName('v:imagedata');
    for (let vIdx = 0; vIdx < vImages.length; vIdx++) {
      const vImg = vImages[vIdx];
      if (!vImg) continue;
      const embedId = vImg.getAttribute('r:id') || vImg.getAttribute('id');
      if (embedId && relsMap[embedId]) {
        const imgName = relsMap[embedId];
        const dataUrl = imageMap[imgName];
        if (dataUrl && !paraImages.includes(dataUrl)) {
          paraImages.push(dataUrl);
        }
      }
    }

    // Text formatting
    const rPr = run.getElementsByTagName('w:rPr')[0];
    const vertAlign = rPr?.getElementsByTagName('w:vertAlign')[0]?.getAttribute('w:val');

    const tNodes = run.getElementsByTagName('w:t');
    for (let tIdx = 0; tIdx < tNodes.length; tIdx++) {
      const tNode = tNodes[tIdx];
      if (!tNode) continue;
      let textContent = tNode.textContent || '';
      if (vertAlign === 'superscript') {
        textContent = toSuperscript(textContent);
      } else if (vertAlign === 'subscript') {
        textContent = toSubscript(textContent);
      }
      paraText += textContent;
    }

    if (run.getElementsByTagName('w:tab').length > 0) {
      paraText += '    ';
    }
    if (run.getElementsByTagName('w:br').length > 0) {
      paraText += '\n';
    }

    const mathTNodes = run.getElementsByTagName('m:t');
    for (let mTIdx = 0; mTIdx < mathTNodes.length; mTIdx++) {
      const mathTNode = mathTNodes[mTIdx];
      if (!mathTNode) continue;
      paraText += mathTNode.textContent || '';
    }
  }

  return { text: paraText.trim(), images: paraImages };
}

function extractTable(
  tbl: Element,
  relsMap: Record<string, string>,
  imageMap: Record<string, string>,
  numberingDefs?: NumberingDefinitions,
  numberingCounters?: Record<string, number>,
): ExtractedItem {
  const rows: string[][] = [];
  const tableImages: string[] = [];

  const trNodes = tbl.getElementsByTagName('w:tr');
  for (let rIdx = 0; rIdx < trNodes.length; rIdx++) {
    const tr = trNodes[rIdx];
    if (!tr) continue;

    const rowCells: string[] = [];
    // Only direct w:tc children of this row
    const tcNodes = tr.childNodes;
    for (let cIdx = 0; cIdx < tcNodes.length; cIdx++) {
      const tc = tcNodes[cIdx] as Element;
      if (!tc || tc.nodeName !== 'w:tc') continue;

      let cellText = '';
      const pNodes = tc.getElementsByTagName('w:p');
      for (let pIdx = 0; pIdx < pNodes.length; pIdx++) {
        const p = pNodes[pIdx];
        if (!p) continue;
        const { text, images } = extractTextAndImagesFromParagraph(
          p,
          relsMap,
          imageMap,
          numberingDefs,
          numberingCounters,
        );
        if (text) {
          cellText += (cellText ? ' ' : '') + text;
        }
        for (const img of images) {
          if (!tableImages.includes(img)) {
            tableImages.push(img);
          }
        }
      }
      rowCells.push(cellText.trim());
    }

    if (rowCells.some((c) => Boolean(c))) {
      rows.push(rowCells);
    }
  }

  if (rows.length === 0) {
    return { type: 'table', text: '', images: tableImages, tableRows: [] };
  }

  // Detect header row and Match-the-Following properties
  const headerRow = rows[0] || [];
  const headerUpper = headerRow.map((c) => c.toUpperCase());
  const isMatchingTable =
    headerUpper.some((c) => c.includes('LIST-I') || c.includes('LIST 1') || c.includes('LIST I') || c.includes('COLUMN-I') || c.includes('COLUMN 1')) ||
    (rows.length >= 2 && rows[0]?.length === 2 && (rows[1]?.[0]?.startsWith('A.') || rows[1]?.[0]?.startsWith('(A)')));

  // Render clean Markdown Table
  let markdown = '\n';
  const colCount = Math.max(...rows.map((r) => r.length), 2);
  const normalizedRows = rows.map((r) => {
    const padded = [...r];
    while (padded.length < colCount) padded.push('');
    return padded;
  });

  const headers = normalizedRows[0] || ['Column 1', 'Column 2'];
  markdown += '| ' + headers.map((h) => h || ' ').join(' | ') + ' |\n';
  markdown += '| ' + headers.map(() => '---').join(' | ') + ' |\n';

  for (let rIdx = 1; rIdx < normalizedRows.length; rIdx++) {
    const row = normalizedRows[rIdx]!;
    markdown += '| ' + row.map((cell) => cell.replace(/\|/g, '\\|') || ' ').join(' | ') + ' |\n';
  }
  markdown += '\n';

  return {
    type: 'table',
    text: markdown,
    images: tableImages,
    tableHeaders: headers,
    tableRows: normalizedRows,
    isMatchingTable,
  };
}

/**
 * Parses a Word document (.docx) ArrayBuffer, Blob, or Uint8Array into structured CBT questions with images,
 * robust table preservation, list numbering, and Match-the-Following support.
 */
export async function parseDocxQuestionPaper(
  fileData: ArrayBuffer | Blob | Uint8Array,
  fileName = 'Question_Paper.docx',
): Promise<DocxParseResult> {
  const warnings: string[] = [];
  const zip = new JSZip();
  const loadedZip = await zip.loadAsync(fileData);

  // 1. Read document.xml and document.xml.rels
  const docXmlFile = loadedZip.file('word/document.xml');
  if (!docXmlFile) {
    throw new Error('Invalid Word document: missing word/document.xml');
  }
  const docXmlText = await docXmlFile.async('text');

  const relsMap: Record<string, string> = {};
  const relsXmlFile = loadedZip.file('word/_rels/document.xml.rels');
  if (relsXmlFile) {
    const relsXmlText = await relsXmlFile.async('text');
    const parser = getDOMParserInstance();
    const relsDoc = parser.parseFromString(relsXmlText, 'application/xml');
    const relationships = relsDoc.getElementsByTagName('Relationship');
    for (let i = 0; i < relationships.length; i++) {
      const rel = relationships[i];
      if (!rel) continue;
      const id = rel.getAttribute('Id');
      const target = rel.getAttribute('Target');
      if (id && target) {
        const cleanTarget = target.replace(/^.*[\\/]/, '');
        relsMap[id] = cleanTarget;
      }
    }
  }

  // 2. Extract image binaries from word/media/
  const imageMap: Record<string, string> = {};
  const mediaFiles = loadedZip.filter((relativePath) =>
    relativePath.startsWith('word/media/') && /\.(png|jpe?g|gif|webp|svg|emf|wmf)$/i.test(relativePath),
  );

  for (const mediaFile of mediaFiles) {
    const baseName = mediaFile.name.replace(/^.*[\\/]/, '');
    const ext = baseName.split('.').pop()?.toLowerCase() || 'png';
    const mime = ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : ext === 'svg' ? 'image/svg+xml' : 'image/png';
    const base64 = await mediaFile.async('base64');
    imageMap[baseName] = `data:${mime};base64,${base64}`;
  }

  // 3. Parse numbering definitions if present
  let numberingDefs: NumberingDefinitions | undefined;
  const numberingCounters: Record<string, number> = {};
  const numberingFile = loadedZip.file('word/numbering.xml');
  if (numberingFile) {
    const numberingXmlText = await numberingFile.async('text');
    numberingDefs = parseNumberingXml(numberingXmlText);
  }

  // 4. Hierarchical traversal of w:body children (paragraphs and tables)
  const parser = getDOMParserInstance();
  const xmlDoc = parser.parseFromString(docXmlText, 'application/xml');
  const body = xmlDoc.getElementsByTagName('w:body')[0];
  if (!body) {
    throw new Error('Invalid Word document: missing w:body element.');
  }

  const extractedItems: ExtractedItem[] = [];
  const bodyNodes = body.childNodes;

  for (let idx = 0; idx < bodyNodes.length; idx++) {
    const node = bodyNodes[idx] as Element;
    if (!node || !node.nodeName) continue;

    if (node.nodeName === 'w:p') {
      const { text, images } = extractTextAndImagesFromParagraph(
        node,
        relsMap,
        imageMap,
        numberingDefs,
        numberingCounters,
      );
      if (text || images.length > 0) {
        extractedItems.push({ type: 'paragraph', text, images });
      }
    } else if (node.nodeName === 'w:tbl') {
      const tableItem = extractTable(node, relsMap, imageMap, numberingDefs, numberingCounters);
      if (tableItem.text.trim() || tableItem.images.length > 0) {
        extractedItems.push(tableItem);
      }
    } else if (node.nodeName === 'w:sdt') {
      // Unwrap Structured Document Tag children
      const innerPs = node.getElementsByTagName('w:p');
      for (let pIdx = 0; pIdx < innerPs.length; pIdx++) {
        const p = innerPs[pIdx];
        if (!p) continue;
        const { text, images } = extractTextAndImagesFromParagraph(
          p,
          relsMap,
          imageMap,
          numberingDefs,
          numberingCounters,
        );
        if (text || images.length > 0) {
          extractedItems.push({ type: 'paragraph', text, images });
        }
      }
      const innerTbls = node.getElementsByTagName('w:tbl');
      for (let tIdx = 0; tIdx < innerTbls.length; tIdx++) {
        const tbl = innerTbls[tIdx];
        if (!tbl) continue;
        const tableItem = extractTable(tbl, relsMap, imageMap, numberingDefs, numberingCounters);
        if (tableItem.text.trim() || tableItem.images.length > 0) {
          extractedItems.push(tableItem);
        }
      }
    }
  }

  // 5. Build structured questions from hierarchical sequence
  let currentSubject = 'Physics';
  let currentSection = 'Section A (MCQ)';
  let currentQ: {
    num: number;
    subject: string;
    section: string;
    prompt: string;
    images: string[];
    options: Record<string, string>;
    optionImages: Record<string, string>;
    correctAnswer: string;
    explanation: string;
    type: QuestionType;
    warnings: string[];
    needsReview: boolean;
  } | null = null;

  const questions: ParsedDocxQuestion[] = [];

  const finalizeQuestion = () => {
    if (!currentQ) return;

    const optKeys = Object.keys(currentQ.options).sort();
    const isMcq = optKeys.length > 0;
    const qType: QuestionType = currentQ.section.includes('Numeric') ? 'integer' : (isMcq ? 'mcq' : 'integer');

    let optionsList: string[] = [];
    let optionImagesList: string[] = [];

    if (qType === 'mcq') {
      optionsList = ['A', 'B', 'C', 'D'].map((k) => currentQ!.options[k] || '');
      optionImagesList = ['A', 'B', 'C', 'D'].map((k) => currentQ!.optionImages[k] || '');
      while (optionsList.length > 0 && !optionsList[optionsList.length - 1] && !optionImagesList[optionImagesList.length - 1]) {
        optionsList.pop();
        optionImagesList.pop();
      }
    }

    let parsedIntegerAnswer: number | null = null;
    let normalizedCorrect = currentQ.correctAnswer.trim();

    if (qType === 'integer') {
      const numVal = parseFloat(normalizedCorrect);
      if (!isNaN(numVal)) {
        parsedIntegerAnswer = numVal;
      } else if (normalizedCorrect) {
        currentQ.warnings.push(`Integer answer "${normalizedCorrect}" could not be parsed as a number.`);
        currentQ.needsReview = true;
      }
    } else {
      // MCQ Canonical Answer Normalization:
      // STRICT SAFETY RULE: NEVER default to Option A if answer is unresolved!
      const upper = normalizedCorrect.toUpperCase();
      if (['A', 'B', 'C', 'D'].includes(upper)) {
        normalizedCorrect = upper;
      } else if (['1', '2', '3', '4'].includes(upper)) {
        normalizedCorrect = String.fromCharCode(64 + parseInt(upper, 10));
      } else if (normalizedCorrect && optionsList.length > 0) {
        // Try exact match with option text
        const foundIdx = optionsList.findIndex((opt) => opt.toLowerCase().trim() === normalizedCorrect.toLowerCase());
        if (foundIdx !== -1) {
          normalizedCorrect = String.fromCharCode(65 + foundIdx);
        } else {
          // Unresolved answer! Do NOT default to A. Mark Needs Review!
          currentQ.warnings.push(`Could not deterministically map correct answer "${normalizedCorrect}" to options.`);
          currentQ.needsReview = true;
        }
      } else if (!normalizedCorrect) {
        currentQ.warnings.push('Question is missing a correct answer.');
        currentQ.needsReview = true;
      }
    }

    if (qType === 'mcq' && optionsList.length < 4) {
      currentQ.warnings.push(`Question has ${optionsList.length} options (expected 4).`);
    }

    questions.push({
      questionNumber: currentQ.num || questions.length + 1,
      subjectLabel: currentQ.subject,
      sectionLabel: currentQ.section,
      type: qType,
      prompt: currentQ.prompt.trim(),
      options: optionsList,
      correctAnswer: normalizedCorrect,
      integerAnswer: parsedIntegerAnswer,
      explanation: currentQ.explanation.trim(),
      imageUrl: currentQ.images[0] || null,
      images: currentQ.images,
      optionImageUrls: optionImagesList.some(Boolean) ? optionImagesList : undefined,
      needsReview: currentQ.needsReview || undefined,
      warnings: currentQ.warnings.length > 0 ? currentQ.warnings : undefined,
    });

    currentQ = null;
  };

  for (let i = 0; i < extractedItems.length; i++) {
    const item = extractedItems[i];
    if (!item) continue;

    // Handle Table Items
    if (item.type === 'table') {
      if (currentQ) {
        // Append table directly to current question prompt (preserving layout, lists, images)
        currentQ.prompt += (currentQ.prompt ? '\n\n' : '') + item.text;
        for (const img of item.images) {
          if (!currentQ.images.includes(img)) {
            currentQ.images.push(img);
          }
        }
      }
      // Table cells are NOT evaluated against option regex to prevent corruption!
      continue;
    }

    // Paragraph Processing
    const { text: t, images: imgs } = item;

    // Detect Subject Header
    const upperText = t.toUpperCase();
    if (
      (upperText.includes('PHYSICS') || upperText === 'PHYSICS') &&
      !t.startsWith('Q') && !t.startsWith('(') && t.length < 60
    ) {
      currentSubject = 'Physics';
      continue;
    } else if (
      (upperText.includes('CHEMISTRY') || upperText === 'CHEMISTRY') &&
      !t.startsWith('Q') && !t.startsWith('(') && t.length < 60
    ) {
      currentSubject = 'Chemistry';
      continue;
    } else if (
      (upperText.includes('MATHEMATICS') || upperText.includes('MATHS') || upperText === 'MATHEMATICS' || upperText === 'MATHS') &&
      !t.startsWith('Q') && !t.startsWith('(') && t.length < 60
    ) {
      currentSubject = 'Mathematics';
      continue;
    } else if (
      (upperText.includes('BIOLOGY') || upperText.includes('BOTANY') || upperText.includes('ZOOLOGY') || upperText === 'BIOLOGY') &&
      !t.startsWith('Q') && !t.startsWith('(') && t.length < 60
    ) {
      currentSubject = 'Biology';
      continue;
    }

    // Detect Section Header
    if (upperText.includes('SECTION A') || upperText.includes('SECTION-A') || upperText.includes('PART A')) {
      currentSection = 'Section A (MCQ)';
    } else if (upperText.includes('SECTION B') || upperText.includes('SECTION-B') || upperText.includes('PART B')) {
      currentSection = 'Section B (Numeric)';
    }

    // Filter out common header watermarks
    if (
      t.includes('MIITJEE Classes') ||
      t.includes('Standard:') ||
      t.includes('Total Questions:') ||
      t.includes('(with Answer Key)')
    ) {
      continue;
    }

    // Question Start Regex
    const qMatch = t.match(/^(?:Q\.?|Question\s*)?(\d+)[\.:\)]\s*(.*)/i);
    const parsedNum = qMatch && qMatch[1] ? parseInt(qMatch[1], 10) : NaN;
    const isNewQuestionNumber =
      !isNaN(parsedNum) &&
      (!currentQ ||
        parsedNum === currentQ.num + 1 ||
        (Boolean(currentQ.correctAnswer) && parsedNum !== currentQ.num) ||
        parsedNum in { 1: 1, 26: 1, 46: 1, 51: 1, 76: 1, 91: 1, 101: 1 });

    if (qMatch && !isNaN(parsedNum) && isNewQuestionNumber && !t.startsWith('(') && !t.startsWith('[')) {
      finalizeQuestion();

      const qNum: number = parsedNum;
      const restPrompt = qMatch[2] || '';

      currentQ = {
        num: qNum,
        subject: currentSubject,
        section: currentSection,
        prompt: restPrompt,
        images: [...imgs],
        options: {},
        optionImages: {},
        correctAnswer: '',
        explanation: '',
        type: currentSection.includes('Numeric') ? 'integer' : 'mcq',
        warnings: [],
        needsReview: false,
      };
      continue;
    }

    if (currentQ) {
      // Attach images to current question
      for (const img of imgs) {
        if (!currentQ.images.includes(img)) {
          currentQ.images.push(img);
        }
      }

      // Check inline multiple options: "(A) 10 m/s   (B) 20 m/s   (C) 30 m/s   (D) 40 m/s"
      const multiOptMatches = Array.from(t.matchAll(/\(([A-Da-d])\)\s*([^(\n\r]+)/g)) as unknown as RegExpMatchArray[];
      if (multiOptMatches.length >= 2) {
        for (const m of multiOptMatches) {
          const key = (m[1] || '').toUpperCase();
          const val = (m[2] || '').trim();
          if (key) {
            currentQ.options[key] = val;
          }
        }
        continue;
      }

      // Check single option: "(A) 25 kg" or "(a) 25 kg" or "A. 25 kg"
      const singleOptMatch = t.match(/^\(?([A-Da-d])\)?[\.\:\)]\s*(.*)/);
      if (singleOptMatch && singleOptMatch[1] && !t.toLowerCase().startsWith('ans') && !t.toLowerCase().startsWith('correct')) {
        const optKey = singleOptMatch[1].toUpperCase();
        const optVal = (singleOptMatch[2] || '').trim();
        currentQ.options[optKey] = optVal;
        if (imgs.length > 0 && imgs[0]) {
          currentQ.optionImages[optKey] = imgs[0];
        }
        continue;
      }

      // Check Correct Answer
      const ansMatch = t.match(/^(?:Correct\s*Answer|Ans(?:wer)?|Key|Correct\s*Option)\s*[:\-=]\s*\(?([A-Da-d0-9\.\-]+)\)?/i);
      if (ansMatch && ansMatch[1]) {
        currentQ.correctAnswer = ansMatch[1].trim().toUpperCase();
        continue;
      } else if (t.toLowerCase().startsWith('correct answer:') || t.toLowerCase().startsWith('answer:')) {
        const val = t.replace(/^(?:correct answer|answer):/i, '').trim().replace(/[()]/g, '');
        currentQ.correctAnswer = val.toUpperCase();
        continue;
      }

      // Check Explanation
      if (t.toLowerCase().startsWith('explanation:') || t.toLowerCase().startsWith('solution:') || t.toLowerCase().startsWith('hint:')) {
        currentQ.explanation = t.replace(/^(?:explanation|solution|hint):/i, '').trim();
        continue;
      }

      // Content text accumulator
      if (Object.keys(currentQ.options).length === 0 && !currentQ.correctAnswer) {
        currentQ.prompt = (currentQ.prompt ? `${currentQ.prompt}\n${t}` : t).trim();
      } else if (currentQ.correctAnswer) {
        currentQ.explanation = (currentQ.explanation ? `${currentQ.explanation}\n${t}` : t).trim();
      }
    }
  }

  // Finalize last question
  finalizeQuestion();

  // Aggregate subject counts and collect warnings
  const subjectCounts: Record<string, number> = {};
  for (const q of questions) {
    subjectCounts[q.subjectLabel] = (subjectCounts[q.subjectLabel] || 0) + 1;
    if (q.warnings) {
      warnings.push(...q.warnings.map((w) => `Q${q.questionNumber}: ${w}`));
    }
  }

  return {
    fileName,
    totalQuestions: questions.length,
    subjectCounts,
    questions,
    warnings,
  };
}
