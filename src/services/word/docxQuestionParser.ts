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

interface ExtractedParagraph {
  text: string;
  images: string[];
}

/**
 * Parses a Word document (.docx) ArrayBuffer or Blob/File into structured CBT questions with images.
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
    const parser = new DOMParser();
    const relsDoc = parser.parseFromString(relsXmlText, 'application/xml');
    const relationships = relsDoc.getElementsByTagName('Relationship');
    for (let i = 0; i < relationships.length; i++) {
      const rel = relationships[i];
      if (!rel) continue;
      const id = rel.getAttribute('Id');
      const target = rel.getAttribute('Target');
      if (id && target) {
        // e.g. target = "media/image1.png" -> image1.png
        const cleanTarget = target.replace(/^.*[\\/]/, '');
        relsMap[id] = cleanTarget;
      }
    }
  }

  // 2. Extract image binaries from word/media/ and convert to Data URLs
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

  // 3. Parse XML paragraphs and drawings
  const parser = new DOMParser();
  const xmlDoc = parser.parseFromString(docXmlText, 'application/xml');
  const paragraphs = xmlDoc.getElementsByTagName('w:p');

  const extractedParas: ExtractedParagraph[] = [];

  for (let pIdx = 0; pIdx < paragraphs.length; pIdx++) {
    const p = paragraphs[pIdx];
    if (!p) continue;
    let paraText = '';
    const paraImages: string[] = [];

    // Traverse child nodes
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

      // Check text formatting: superscript / subscript
      const rPr = run.getElementsByTagName('w:rPr')[0];
      const vertAlign = rPr?.getElementsByTagName('w:vertAlign')[0]?.getAttribute('w:val');

      // Extract text
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

      // Check tabs and breaks
      if (run.getElementsByTagName('w:tab').length > 0) {
        paraText += '    ';
      }
      if (run.getElementsByTagName('w:br').length > 0) {
        paraText += '\n';
      }

      // Extract math text <m:t>
      const mathTNodes = run.getElementsByTagName('m:t');
      for (let mTIdx = 0; mTIdx < mathTNodes.length; mTIdx++) {
        const mathTNode = mathTNodes[mTIdx];
        if (!mathTNode) continue;
        paraText += mathTNode.textContent || '';
      }
    }

    const trimmedText = paraText.trim();
    if (trimmedText || paraImages.length > 0) {
      extractedParas.push({
        text: trimmedText,
        images: paraImages,
      });
    }
  }

  // 4. Parse extracted paragraphs into structured questions
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
  } | null = null;

  const questions: ParsedDocxQuestion[] = [];

  const finalizeQuestion = () => {
    if (!currentQ) return;

    const optKeys = Object.keys(currentQ.options).sort();
    const isMcq = optKeys.length > 0;
    const qType: QuestionType = isMcq ? 'mcq' : 'integer';

    let optionsList: string[] = [];
    let optionImagesList: string[] = [];

    if (isMcq) {
      optionsList = ['A', 'B', 'C', 'D'].map((k) => currentQ!.options[k] || '');
      optionImagesList = ['A', 'B', 'C', 'D'].map((k) => currentQ!.optionImages[k] || '');
      // If we only have some options, trim trailing empty strings
      while (optionsList.length > 0 && !optionsList[optionsList.length - 1] && !optionImagesList[optionsList.length - 1]) {
        optionsList.pop();
        optionImagesList.pop();
      }
    }

    let parsedIntegerAnswer: number | null = null;
    if (qType === 'integer') {
      const numVal = parseFloat(currentQ.correctAnswer);
      if (!isNaN(numVal)) {
        parsedIntegerAnswer = numVal;
      }
    }

    questions.push({
      questionNumber: currentQ.num || questions.length + 1,
      subjectLabel: currentQ.subject,
      sectionLabel: currentQ.section,
      type: qType,
      prompt: currentQ.prompt.trim(),
      options: optionsList,
      correctAnswer: currentQ.correctAnswer.trim(),
      integerAnswer: parsedIntegerAnswer,
      explanation: currentQ.explanation.trim(),
      imageUrl: currentQ.images[0] || null,
      images: currentQ.images,
      optionImageUrls: optionImagesList.some(Boolean) ? optionImagesList : undefined,
    });

    currentQ = null;
  };

  for (let i = 0; i < extractedParas.length; i++) {
    const para = extractedParas[i];
    if (!para) continue;
    const { text: t, images: imgs } = para;

    // Detect Subject Header
    const upperText = t.toUpperCase();
    if (
      (upperText.includes('PHYSICS') || upperText === 'PHYSICS') &&
      !t.startsWith('Q') &&
      !t.startsWith('(') &&
      t.length < 60
    ) {
      currentSubject = 'Physics';
      continue;
    } else if (
      (upperText.includes('CHEMISTRY') || upperText === 'CHEMISTRY') &&
      !t.startsWith('Q') &&
      !t.startsWith('(') &&
      t.length < 60
    ) {
      currentSubject = 'Chemistry';
      continue;
    } else if (
      (upperText.includes('MATHEMATICS') || upperText.includes('MATHS') || upperText === 'MATHEMATICS' || upperText === 'MATHS') &&
      !t.startsWith('Q') &&
      !t.startsWith('(') &&
      t.length < 60
    ) {
      currentSubject = 'Mathematics';
      continue;
    } else if (
      (upperText.includes('BIOLOGY') || upperText.includes('BOTANY') || upperText.includes('ZOOLOGY') || upperText === 'BIOLOGY') &&
      !t.startsWith('Q') &&
      !t.startsWith('(') &&
      t.length < 60
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

    // Check for Question start: "Q1.", "Q 1.", "Q.1", "1. ", "Question 1:", etc.
    const qMatch = t.match(/^(?:Q\.?|Question\s*)?(\d+)[\.:\)]\s*(.*)/i);
    const parsedNum = qMatch && qMatch[1] ? parseInt(qMatch[1], 10) : NaN;
    const isNewQuestionNumber =
      !isNaN(parsedNum) &&
      (!currentQ ||
        parsedNum === currentQ.num + 1 ||
        (Boolean(currentQ.correctAnswer) && parsedNum !== currentQ.num) ||
        parsedNum in { 1: 1, 26: 1, 46: 1, 51: 1, 91: 1 });

    if (qMatch && !isNaN(parsedNum) && isNewQuestionNumber && !t.startsWith('(') && !t.startsWith('[')) {
      finalizeQuestion();

      const qNum: number = Number(parsedNum);
      const restPrompt: string = qMatch[2] || '';

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
      };
      continue;
    }

    if (currentQ) {
      // Attach images to current question
      if (imgs.length > 0) {
        for (const img of imgs) {
          if (!currentQ.images.includes(img)) {
            currentQ.images.push(img);
          }
        }
      }

      // Check for inline multiple options e.g. "(A) 10 m/s   (B) 20 m/s   (C) 30 m/s   (D) 40 m/s"
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

      // Check single option e.g. "(A) 25 kg" or "(a) 25 kg" or "A. 25 kg"
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

      // Check Correct Answer: "Correct Answer: (A)" or "Ans: 42" or "Answer: B"
      const ansMatch = t.match(/^(?:Correct\s*Answer|Ans(?:wer)?|Key|Correct\s*Option)\s*[:\-=]\s*\(?([A-Da-d0-9\.\-]+)\)?/i);
      if (ansMatch && ansMatch[1]) {
        currentQ.correctAnswer = ansMatch[1].trim().toUpperCase();
        continue;
      } else if (t.toLowerCase().startsWith('correct answer:') || t.toLowerCase().startsWith('answer:')) {
        const val = t.replace(/^(?:correct answer|answer):/i, '').trim().replace(/[()]/g, '');
        currentQ.correctAnswer = val.toUpperCase();
        continue;
      }

      // Check Explanation: "Explanation: ..." or "Solution: ..."
      if (t.toLowerCase().startsWith('explanation:') || t.toLowerCase().startsWith('solution:') || t.toLowerCase().startsWith('hint:')) {
        currentQ.explanation = t.replace(/^(?:explanation|solution|hint):/i, '').trim();
        continue;
      }

      // Append extra lines to prompt or explanation
      if (Object.keys(currentQ.options).length === 0 && !currentQ.correctAnswer) {
        currentQ.prompt = (currentQ.prompt ? `${currentQ.prompt}\n${t}` : t).trim();
      } else if (currentQ.correctAnswer) {
        currentQ.explanation = (currentQ.explanation ? `${currentQ.explanation}\n${t}` : t).trim();
      }
    }
  }

  // Finalize last question
  finalizeQuestion();

  // Validate and build summary
  const subjectCounts: Record<string, number> = {};
  for (const q of questions) {
    subjectCounts[q.subjectLabel] = (subjectCounts[q.subjectLabel] || 0) + 1;
    if (!q.correctAnswer) {
      warnings.push(`Question ${q.questionNumber} (${q.subjectLabel}) is missing a correct answer.`);
    }
    if (q.type === 'mcq' && q.options.length < 4) {
      warnings.push(`Question ${q.questionNumber} (${q.subjectLabel}) has ${q.options.length} options (expected 4).`);
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
