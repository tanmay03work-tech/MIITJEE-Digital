import fs from 'fs';
import path from 'path';
import JSZip from 'jszip';
import { parseDocxQuestionPaper } from '../word/docxQuestionParser';

describe('Word Document (.docx) Parser - Phase 1 Hardening & Regression Suite', () => {
  // Helper to create in-memory minimal docx buffer from document.xml and optional numbering.xml
  async function createMockDocx(documentXml: string, numberingXml?: string): Promise<Buffer> {
    const zip = new JSZip();
    zip.file(
      '[Content_Types].xml',
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
      <Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
        <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
        <Default Extension="xml" ContentType="application/xml"/>
        <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
      </Types>`
    );
    zip.file(
      '_rels/.rels',
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
      <Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
        <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
      </Relationships>`
    );
    zip.file('word/document.xml', documentXml);
    zip.file(
      'word/_rels/document.xml.rels',
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
      <Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
        <Relationship Id="rIdImg1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/diagram.png"/>
      </Relationships>`
    );
    zip.file('word/media/diagram.png', Buffer.from('mock-png-data'));

    if (numberingXml) {
      zip.file('word/numbering.xml', numberingXml);
    }

    return zip.generateAsync({ type: 'nodebuffer' });
  }

  it('1. Parses normal paragraph MCQs with distinct options and answers', async () => {
    const docXml = `<?xml version="1.0" encoding="UTF-8"?>
    <w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
      <w:body>
        <w:p><w:r><w:t>PHYSICS</w:t></w:r></w:p>
        <w:p><w:r><w:t>Q1. What is the SI unit of electric flux?</w:t></w:r></w:p>
        <w:p><w:r><w:t>(A) V·m</w:t></w:r></w:p>
        <w:p><w:r><w:t>(B) N/C</w:t></w:r></w:p>
        <w:p><w:r><w:t>(C) J·s</w:t></w:r></w:p>
        <w:p><w:r><w:t>(D) T·m²</w:t></w:r></w:p>
        <w:p><w:r><w:t>Correct Answer: A</w:t></w:r></w:p>
        <w:p><w:r><w:t>Explanation: Electric flux unit is volt-meter.</w:t></w:r></w:p>
      </w:body>
    </w:document>`;

    const docxBuf = await createMockDocx(docXml);
    const result = await parseDocxQuestionPaper(docxBuf, 'physics_q1.docx');

    expect(result.totalQuestions).toBe(1);
    const q1 = result.questions[0]!;
    expect(q1.questionNumber).toBe(1);
    expect(q1.subjectLabel).toBe('Physics');
    expect(q1.prompt).toBe('What is the SI unit of electric flux?');
    expect(q1.options).toEqual(['V·m', 'N/C', 'J·s', 'T·m²']);
    expect(q1.correctAnswer).toBe('A');
    expect(q1.explanation).toBe('Electric flux unit is volt-meter.');
    expect(q1.type).toBe('mcq');
  });

  it('2. Parses Match-the-Following tables and keeps tables inside question prompt', async () => {
    const docXml = `<?xml version="1.0" encoding="UTF-8"?>
    <w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
      <w:body>
        <w:p><w:r><w:t>CHEMISTRY</w:t></w:r></w:p>
        <w:p><w:r><w:t>Q37. Match List-I with List-II.</w:t></w:r></w:p>
        <w:tbl>
          <w:tr>
            <w:tc><w:p><w:r><w:t>List-I</w:t></w:r></w:p></w:tc>
            <w:tc><w:p><w:r><w:t>List-II</w:t></w:r></w:p></w:tc>
          </w:tr>
          <w:tr>
            <w:tc><w:p><w:r><w:t>A. ICl</w:t></w:r></w:p></w:tc>
            <w:tc><w:p><w:r><w:t>i. Linear</w:t></w:r></w:p></w:tc>
          </w:tr>
          <w:tr>
            <w:tc><w:p><w:r><w:t>B. ICl3</w:t></w:r></w:p></w:tc>
            <w:tc><w:p><w:r><w:t>ii. T-Shape</w:t></w:r></w:p></w:tc>
          </w:tr>
          <w:tr>
            <w:tc><w:p><w:r><w:t>C. ClF5</w:t></w:r></w:p></w:tc>
            <w:tc><w:p><w:r><w:t>iii. Square pyramidal</w:t></w:r></w:p></w:tc>
          </w:tr>
          <w:tr>
            <w:tc><w:p><w:r><w:t>D. IF7</w:t></w:r></w:p></w:tc>
            <w:tc><w:p><w:r><w:t>iv. Pentagonal bipyramidal</w:t></w:r></w:p></w:tc>
          </w:tr>
        </w:tbl>
        <w:p><w:r><w:t>Choose the correct answer from the options given below:</w:t></w:r></w:p>
        <w:p><w:r><w:t>(A) A−i, B−ii, C−iii, D−iv</w:t></w:r></w:p>
        <w:p><w:r><w:t>(B) A−i, B−ii, C−iv, D−iii</w:t></w:r></w:p>
        <w:p><w:r><w:t>(C) A−iv, B−ii, C−iii, D−i</w:t></w:r></w:p>
        <w:p><w:r><w:t>(D) A−iv, B−iii, C−ii, D−i</w:t></w:r></w:p>
        <w:p><w:r><w:t>Correct Answer: A</w:t></w:r></w:p>
      </w:body>
    </w:document>`;

    const docxBuf = await createMockDocx(docXml);
    const result = await parseDocxQuestionPaper(docxBuf, 'matching_q37.docx');

    expect(result.totalQuestions).toBe(1);
    const q = result.questions[0]!;
    expect(q.questionNumber).toBe(37);
    expect(q.subjectLabel).toBe('Chemistry');
    // Prompt must include the table rows and headers!
    expect(q.prompt).toContain('List-I');
    expect(q.prompt).toContain('List-II');
    expect(q.prompt).toContain('A. ICl');
    expect(q.prompt).toContain('i. Linear');
    expect(q.prompt).toContain('D. IF7');
    expect(q.prompt).toContain('iv. Pentagonal bipyramidal');
    // Options must be the 4 MCQ combinations, NOT the individual table cells!
    expect(q.options[0]).toBe('A−i, B−ii, C−iii, D−iv');
    expect(q.options[1]).toBe('A−i, B−ii, C−iv, D−iii');
    expect(q.options[2]).toBe('A−iv, B−ii, C−iii, D−i');
    expect(q.options[3]).toBe('A−iv, B−iii, C−ii, D−i');
    expect(q.correctAnswer).toBe('A');
  });

  it('3. Parses Word List Numbering (w:numPr metadata) even without literal number text', async () => {
    const numberingXml = `<?xml version="1.0" encoding="UTF-8"?>
    <w:numbering xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
      <w:abstractNum w:abstractNumId="0">
        <w:lvl w:ilvl="0">
          <w:start w:val="1"/>
          <w:numFmt w:val="decimal"/>
          <w:lvlText w:val="Q%1. "/>
        </w:lvl>
      </w:abstractNum>
      <w:num w:numId="10">
        <w:abstractNumId w:val="0"/>
      </w:num>
    </w:numbering>`;

    const docXml = `<?xml version="1.0" encoding="UTF-8"?>
    <w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
      <w:body>
        <w:p>
          <w:pPr>
            <w:numPr>
              <w:ilvl w:val="0"/>
              <w:numId w:val="10"/>
            </w:numPr>
          </w:pPr>
          <w:r><w:t>What is the speed of light in vacuum?</w:t></w:r>
        </w:p>
        <w:p><w:r><w:t>(A) 3 x 10^8 m/s</w:t></w:r></w:p>
        <w:p><w:r><w:t>(B) 2 x 10^8 m/s</w:t></w:r></w:p>
        <w:p><w:r><w:t>(C) 1.5 x 10^8 m/s</w:t></w:r></w:p>
        <w:p><w:r><w:t>(D) 3 x 10^6 m/s</w:t></w:r></w:p>
        <w:p><w:r><w:t>Correct Answer: A</w:t></w:r></w:p>
      </w:body>
    </w:document>`;

    const docxBuf = await createMockDocx(docXml, numberingXml);
    const result = await parseDocxQuestionPaper(docxBuf, 'numbered_list.docx');

    expect(result.totalQuestions).toBe(1);
    const q = result.questions[0]!;
    expect(q.questionNumber).toBe(1);
    expect(q.prompt).toContain('What is the speed of light in vacuum?');
    expect(q.options.length).toBe(4);
    expect(q.correctAnswer).toBe('A');
  });

  it('4. NEVER defaults unresolved/invalid answers to Option A and marks Needs Review', async () => {
    const docXml = `<?xml version="1.0" encoding="UTF-8"?>
    <w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
      <w:body>
        <w:p><w:r><w:t>Q1. An ambiguous question with unmapped answer</w:t></w:r></w:p>
        <w:p><w:r><w:t>(A) Alpha</w:t></w:r></w:p>
        <w:p><w:r><w:t>(B) Beta</w:t></w:r></w:p>
        <w:p><w:r><w:t>(C) Gamma</w:t></w:r></w:p>
        <w:p><w:r><w:t>(D) Delta</w:t></w:r></w:p>
        <w:p><w:r><w:t>Correct Answer: UNKNOWN_VALUE</w:t></w:r></w:p>
      </w:body>
    </w:document>`;

    const docxBuf = await createMockDocx(docXml);
    const result = await parseDocxQuestionPaper(docxBuf, 'unresolved_answer.docx');

    expect(result.totalQuestions).toBe(1);
    const q = result.questions[0]!;
    // CRITICAL: MUST NOT default to 'A'!
    expect(q.correctAnswer).not.toBe('A');
    expect(q.correctAnswer).toBe('UNKNOWN_VALUE');
    expect(q.needsReview).toBe(true);
    expect(result.warnings.some((w) => w.includes('Could not deterministically map correct answer'))).toBe(true);
  });

  it('5. Parses Section B Numerical / Integer questions accurately', async () => {
    const docXml = `<?xml version="1.0" encoding="UTF-8"?>
    <w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
      <w:body>
        <w:p><w:r><w:t>SECTION B (NUMERIC)</w:t></w:r></w:p>
        <w:p><w:r><w:t>Q21. The effective resistance of a parallel connection is...</w:t></w:r></w:p>
        <w:p><w:r><w:t>Correct Answer: 4</w:t></w:r></w:p>
      </w:body>
    </w:document>`;

    const docxBuf = await createMockDocx(docXml);
    const result = await parseDocxQuestionPaper(docxBuf, 'numeric_q21.docx');

    expect(result.totalQuestions).toBe(1);
    const q = result.questions[0]!;
    expect(q.type).toBe('integer');
    expect(q.integerAnswer).toBe(4);
    expect(q.correctAnswer).toBe('4');
  });

  it('6. Regression Test on Real Repository File: Navigator_Batch_MIITJEE_QuestionPaper.docx', async () => {
    const realFilePath = path.join(process.cwd(), 'question paper', 'Navigator_Batch_MIITJEE_QuestionPaper.docx');
    if (!fs.existsSync(realFilePath)) {
      console.warn('Real fixture Navigator_Batch_MIITJEE_QuestionPaper.docx not found, skipping real file test.');
      return;
    }

    const fileBuf = fs.readFileSync(realFilePath);
    const result = await parseDocxQuestionPaper(fileBuf, 'Navigator_Batch_MIITJEE_QuestionPaper.docx');

    // 1. Total questions must be 75
    expect(result.totalQuestions).toBe(75);

    // 2. Subject breakdown must cover Physics (1-25), Chemistry (26-50), Mathematics (51-75)
    expect(result.subjectCounts['Physics']).toBe(25);
    expect(result.subjectCounts['Chemistry']).toBe(25);
    expect(result.subjectCounts['Mathematics']).toBe(25);

    // 3. Q37 (Match-the-Following) Verification
    const q37 = result.questions.find((q) => q.questionNumber === 37);
    expect(q37).toBeDefined();
    expect(q37!.subjectLabel).toBe('Chemistry');
    expect(q37!.type).toBe('mcq');
    // Must contain table content in prompt
    expect(q37!.prompt).toContain('List-I');
    expect(q37!.prompt).toContain('List-II');
    expect(q37!.prompt).toContain('ICl');
    expect(q37!.prompt).toContain('Linear');
    expect(q37!.prompt).toContain('T-Shape');
    // Must have 4 options
    expect(q37!.options.length).toBe(4);
    expect(q37!.options[0]).toContain('A−i');
    expect(q37!.correctAnswer).toBe('A');

    // 4. Q45 (Match-the-Following according to shape) Verification
    const q45 = result.questions.find((q) => q.questionNumber === 45);
    expect(q45).toBeDefined();
    expect(q45!.subjectLabel).toBe('Chemistry');
    expect(q45!.type).toBe('mcq');
    expect(q45!.prompt).toContain('List-I');
    expect(q45!.prompt).toContain('List-II');
    expect(q45!.prompt).toContain('XeO3');
    expect(q45!.prompt).toContain('XeF2');
    expect(q45!.options.length).toBe(4);
    expect(q45!.options[0]).toContain('A−II');
    expect(q45!.correctAnswer).toBe('A');

    // 5. Numerical section verification: Q21 should have answer '4'
    const q21 = result.questions.find((q) => q.questionNumber === 21);
    expect(q21).toBeDefined();
    expect(q21!.type).toBe('integer');
    expect(q21!.integerAnswer).toBe(4);
  });
});
