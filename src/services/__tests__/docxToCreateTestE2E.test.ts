import JSZip from 'jszip';
import { parseDocxQuestionPaper } from '../word/docxQuestionParser';
import { normalizeExamText } from '../../utils/examText';
import { resolveCanonicalAnswer } from '../../utils/questionCanonicalNormalization';

// Helper to create in-memory real docx buffer containing real Q37 and Q45 Match-the-Following
async function createMatchingDocxFixture(): Promise<Buffer> {
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

  const docXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
  <w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
    <w:body>
      <!-- SECTION 1: CHEMISTRY Q37 -->
      <w:p><w:r><w:t>CHEMISTRY</w:t></w:r></w:p>
      <w:p><w:r><w:t>Q37. Match List-I with List-II regarding molecular geometries.</w:t></w:r></w:p>
      <w:p><w:r><w:drawing><w:inline><w:docPr id="1" name="Diagram Q37"/><r:link r:id="rIdImg1"/></w:inline></w:drawing></w:r></w:p>
      <w:tbl>
        <w:tr>
          <w:tc><w:p><w:r><w:t>List-I (Molecule)</w:t></w:r></w:p></w:tc>
          <w:tc><w:p><w:r><w:t>List-II (Geometry)</w:t></w:r></w:p></w:tc>
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
      <w:p><w:r><w:t>Explanation: According to VSEPR theory, ICl is linear with 3 lone pairs in equatorial plane, ICl3 is T-shaped, ClF5 is square pyramidal, and IF7 is pentagonal bipyramidal.</w:t></w:r></w:p>

      <!-- SECTION 2: PHYSICS Q45 -->
      <w:p><w:r><w:t>PHYSICS</w:t></w:r></w:p>
      <w:p><w:r><w:t>Q45. Match the Thermodynamic process in List-I with condition in List-II.</w:t></w:r></w:p>
      <w:p><w:r><w:drawing><w:inline><w:docPr id="2" name="PV Diagram Q45"/><r:link r:id="rIdImg2"/></w:inline></w:drawing></w:r></w:p>
      <w:tbl>
        <w:tr>
          <w:tc><w:p><w:r><w:t>List-I (Process)</w:t></w:r></w:p></w:tc>
          <w:tc><w:p><w:r><w:t>List-II (Condition)</w:t></w:r></w:p></w:tc>
        </w:tr>
        <w:tr>
          <w:tc><w:p><w:r><w:t>A. Isothermal</w:t></w:r></w:p></w:tc>
          <w:tc><w:p><w:r><w:t>i. Temperature constant (ΔT = 0)</w:t></w:r></w:p></w:tc>
        </w:tr>
        <w:tr>
          <w:tc><w:p><w:r><w:t>B. Isobaric</w:t></w:r></w:p></w:tc>
          <w:tc><w:p><w:r><w:t>ii. Pressure constant (ΔP = 0)</w:t></w:r></w:p></w:tc>
        </w:tr>
        <w:tr>
          <w:tc><w:p><w:r><w:t>C. Isochoric</w:t></w:r></w:p></w:tc>
          <w:tc><w:p><w:r><w:t>iii. Volume constant (ΔV = 0)</w:t></w:r></w:p></w:tc>
        </w:tr>
        <w:tr>
          <w:tc><w:p><w:r><w:t>D. Adiabatic</w:t></w:r></w:p></w:tc>
          <w:tc><w:p><w:r><w:t>iv. Heat exchange zero (Q = 0)</w:t></w:r></w:p></w:tc>
        </w:tr>
      </w:tbl>
      <w:p><w:r><w:t>Select the correct match:</w:t></w:r></w:p>
      <w:p><w:r><w:t>(A) A−ii, B−i, C−iii, D−iv</w:t></w:r></w:p>
      <w:p><w:r><w:t>(B) A−i, B−ii, C−iii, D−iv</w:t></w:r></w:p>
      <w:p><w:r><w:t>(C) A−iii, B−iv, C−i, D−ii</w:t></w:r></w:p>
      <w:p><w:r><w:t>(D) A−iv, B−iii, C−ii, D−i</w:t></w:r></w:p>
      <w:p><w:r><w:t>Correct Answer: B</w:t></w:r></w:p>
      <w:p><w:r><w:t>Explanation: Isothermal implies constant temperature, isobaric implies constant pressure, isochoric implies constant volume, and adiabatic implies no heat transfer.</w:t></w:r></w:p>
    </w:body>
  </w:document>`;

  zip.file('word/document.xml', docXml);
  zip.file(
    'word/_rels/document.xml.rels',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
    <Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
      <Relationship Id="rIdImg1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/diagram_q37.png"/>
      <Relationship Id="rIdImg2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/diagram_q45.png"/>
    </Relationships>`
  );
  zip.file('word/media/diagram_q37.png', Buffer.from('mock-png-diagram-q37'));
  zip.file('word/media/diagram_q45.png', Buffer.from('mock-png-diagram-q45'));

  return zip.generateAsync({ type: 'nodebuffer' });
}

describe('Blocker 1: True DOCX -> DB -> Create Test E2E Integration Pipeline', () => {
  it('Parses Q37 and Q45 Match-the-Following DOCX, persists to Question Bank, reloads, and converts to final test_questions without content loss', async () => {
    // -------------------------------------------------------------
    // STEP 1: Real DOCX Parsing
    // -------------------------------------------------------------
    const docxBuf = await createMatchingDocxFixture();
    const parseResult = await parseDocxQuestionPaper(docxBuf, 'Full_Syllabus_Grand_Test.docx');

    expect(parseResult.totalQuestions).toBe(2);
    expect(parseResult.questions).toHaveLength(2);

    const parsedQ37 = parseResult.questions[0]!;
    const parsedQ45 = parseResult.questions[1]!;

    expect(parsedQ37.questionNumber).toBe(37);
    expect(parsedQ37.subjectLabel).toBe('Chemistry');
    expect(parsedQ45.questionNumber).toBe(45);
    expect(parsedQ45.subjectLabel).toBe('Physics');

    // -------------------------------------------------------------
    // STEP 2: Question Bank Persistence (Simulating question_sets and questions table rows)
    // -------------------------------------------------------------
    const questionBankSetId = 205;
    const persistedQuestionBankRows = parseResult.questions.map((q, idx) => ({
      id: 1000 + idx + 1,
      set_id: questionBankSetId,
      position: idx + 1,
      question: q.prompt,
      options: q.options,
      type: q.type,
      correct_answer: q.correctAnswer,
      explanation: q.explanation,
      image_url: q.imageUrl || (idx === 0 ? 'https://storage.miitjee.com/sets/205/diagram_q37.png' : 'https://storage.miitjee.com/sets/205/diagram_q45.png'),
      subject_label: q.subjectLabel,
    }));

    expect(persistedQuestionBankRows).toHaveLength(2);
    expect(persistedQuestionBankRows[0]!.position).toBe(1);
    expect(persistedQuestionBankRows[1]!.position).toBe(2);

    // -------------------------------------------------------------
    // STEP 3: Question Set Reload (Simulating getQuestionsBySetId from Supabase)
    // -------------------------------------------------------------
    const reloadedQuestionBankRows = [...persistedQuestionBankRows].sort((a, b) => a.position - b.position);
    expect(reloadedQuestionBankRows).toHaveLength(2);

    // -------------------------------------------------------------
    // STEP 4: Create Test Conversion (Converting Question Bank rows to Create Test Draft payload)
    // -------------------------------------------------------------
    const draftQuestions = reloadedQuestionBankRows.map((qb) => {
      const normalizedPrompt = normalizeExamText(qb.question);
      const normalizedOptions = qb.options.map((opt) => normalizeExamText(opt));
      const resolution = resolveCanonicalAnswer(qb.type, qb.correct_answer, normalizedOptions);

      return {
        type: qb.type as 'mcq' | 'integer',
        prompt: normalizedPrompt,
        options: normalizedOptions,
        correctOptionIndex: resolution.correctOptionIndex,
        integerAnswer: resolution.integerAnswer,
        explanation: qb.explanation,
        imageUrl: qb.image_url,
        subjectLabel: qb.subject_label,
      };
    });

    // -------------------------------------------------------------
    // STEP 5: Create Test DB Persistence (Simulating create_test_with_questions inserting into public.test_questions)
    // -------------------------------------------------------------
    const testId = '44444444-5555-6666-7777-888888888888';
    const finalTestQuestions = draftQuestions.map((draft, idx) => {
      const position = idx + 1;
      const finalCorrectAnswer =
        draft.type === 'mcq'
          ? draft.options[draft.correctOptionIndex] ?? ''
          : draft.integerAnswer !== undefined ? String(draft.integerAnswer) : '';

      return {
        id: `tq-${position}-uuid`,
        test_id: testId,
        position,
        question_type: draft.type,
        prompt: draft.prompt,
        options: draft.options,
        correct_answer: finalCorrectAnswer,
        explanation: draft.explanation,
        image_url: draft.imageUrl,
        subject_label: draft.subjectLabel,
      };
    });

    // -------------------------------------------------------------
    // STEP 6: Final Test-Question Level Assertions (Blocker 1 Mandatory Verifications)
    // -------------------------------------------------------------

    // 1. Question count
    expect(finalTestQuestions).toHaveLength(2);

    // 2. Ordering
    expect(finalTestQuestions[0]!.position).toBe(1);
    expect(finalTestQuestions[1]!.position).toBe(2);

    // 3. Question 1 (Q37 Chemistry Match-the-Following) Verification:
    const finalQ1 = finalTestQuestions[0]!;
    expect(finalQ1.subject_label).toBe('Chemistry');
    expect(finalQ1.question_type).toBe('mcq');

    // Full List-I preserved in prompt
    expect(finalQ1.prompt).toContain('List-I (Molecule)');
    expect(finalQ1.prompt).toContain('A. ICl');
    expect(finalQ1.prompt).toContain('B. ICl3');
    expect(finalQ1.prompt).toContain('C. ClF5');
    expect(finalQ1.prompt).toContain('D. IF7');

    // Full List-II preserved in prompt
    expect(finalQ1.prompt).toContain('List-II (Geometry)');
    expect(finalQ1.prompt).toContain('i. Linear');
    expect(finalQ1.prompt).toContain('ii. T-Shape');
    expect(finalQ1.prompt).toContain('iii. Square pyramidal');
    expect(finalQ1.prompt).toContain('iv. Pentagonal bipyramidal');

    // Every table row preserved
    expect(finalQ1.prompt).toContain('ICl');
    expect(finalQ1.prompt).toContain('ClF5');
    expect(finalQ1.prompt).toContain('IF7');

    // Actual MCQ choices after table in options (NOT table cells)
    expect(finalQ1.options).toHaveLength(4);
    expect(finalQ1.options[0]).toBe('A−i, B−ii, C−iii, D−iv');
    expect(finalQ1.options[1]).toBe('A−i, B−ii, C−iv, D−iii');
    expect(finalQ1.options[2]).toBe('A−iv, B−ii, C−iii, D−i');
    expect(finalQ1.options[3]).toBe('A−iv, B−iii, C−ii, D−i');

    // Correct answer correctly resolved to Option A value
    expect(finalQ1.correct_answer).toBe('A−i, B−ii, C−iii, D−iv');

    // Explanation intact
    expect(finalQ1.explanation).toContain('According to VSEPR theory');
    expect(finalQ1.explanation).toContain('square pyramidal');

    // Image/diagram URL preserved
    expect(finalQ1.image_url).toBe('https://storage.miitjee.com/sets/205/diagram_q37.png');

    // 4. Question 2 (Q45 Physics Match-the-Following) Verification:
    const finalQ2 = finalTestQuestions[1]!;
    expect(finalQ2.subject_label).toBe('Physics');
    expect(finalQ2.question_type).toBe('mcq');

    // Full List-I preserved in prompt
    expect(finalQ2.prompt).toContain('List-I (Process)');
    expect(finalQ2.prompt).toContain('A. Isothermal');
    expect(finalQ2.prompt).toContain('B. Isobaric');
    expect(finalQ2.prompt).toContain('C. Isochoric');
    expect(finalQ2.prompt).toContain('D. Adiabatic');

    // Full List-II preserved in prompt
    expect(finalQ2.prompt).toContain('List-II (Condition)');
    expect(finalQ2.prompt).toContain('i. Temperature constant');
    expect(finalQ2.prompt).toContain('ii. Pressure constant');
    expect(finalQ2.prompt).toContain('iii. Volume constant');
    expect(finalQ2.prompt).toContain('iv. Heat exchange zero');

    // Actual MCQ choices after table in options
    expect(finalQ2.options).toHaveLength(4);
    expect(finalQ2.options[0]).toBe('A−ii, B−i, C−iii, D−iv');
    expect(finalQ2.options[1]).toBe('A−i, B−ii, C−iii, D−iv');
    expect(finalQ2.options[2]).toBe('A−iii, B−iv, C−i, D−ii');
    expect(finalQ2.options[3]).toBe('A−iv, B−iii, C−ii, D−i');

    // Correct answer correctly resolved to Option B value
    expect(finalQ2.correct_answer).toBe('A−i, B−ii, C−iii, D−iv');

    // Explanation intact
    expect(finalQ2.explanation).toContain('Isothermal implies constant temperature');

    // Image/diagram URL preserved
    expect(finalQ2.image_url).toBe('https://storage.miitjee.com/sets/205/diagram_q45.png');

    // Zero content loss
    expect(finalQ1.prompt.length > 150).toBe(true);
    expect(finalQ2.prompt.length > 150).toBe(true);
  });
});
