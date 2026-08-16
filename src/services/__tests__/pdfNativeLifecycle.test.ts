import {
  createPdfNativeTest,
  updatePdfNativeTest,
  publishPdfNativeTest,
  archivePdfNativeTest,
  restorePdfNativeTestDraft,
  deletePdfNativeTest,
  validatePdfNativeTestCreation,
  validateSubjectSections,
  validateTestForPublish,
} from '../pdf-native/pdfNativeTestService';
import {
  createPdfNativeSet,
  listPdfNativeSets,
  getPdfNativeSetById,
  getPdfNativeSetQuestions,
  deletePdfNativeSet,
} from '../pdf-native/pdfNativeSetService';
import {
  PdfNativeQuestion,
  PdfNativeTest,
  PdfNativeTestSection,
} from '../pdf-native/pdfNativeTypes';
import {
  mapPdfNativeQuestionToCbtQuestion,
  mapPdfNativeTestToCbtTestItem,
  fetchReadyPdfNativeTests,
} from '../pdf-native/pdfNativeCbtAdapter';
import { scorePdfNativeAttempt } from '../pdf-native/pdfNativeScoringService';
import {
  getLocalPdfNativeTests,
  saveLocalPdfNativeTest,
  saveLocalPdfNativeQuestions,
  getLocalPdfNativeQuestions,
} from '../pdf-native/pdfNativeLocalStorage';

describe('PDF-Native Lifecycle, Question Sets, Section Configuration & CBT Integration', () => {
  // Helper to create sample questions
  function createSampleQuestions(
    subject: 'Physics' | 'Chemistry' | 'Mathematics',
    count: number,
    startNum: number = 1,
    hasInteger: boolean = false
  ): PdfNativeQuestion[] {
    const list: PdfNativeQuestion[] = [];
    for (let i = 0; i < count; i++) {
      const qNum = String(startNum + i);
      const isInt = hasInteger && i >= count - 5;
      list.push({
        id: `q_${subject.toLowerCase()}_${qNum}`,
        pdf_id: 'sample_pdf_1',
        question_number: qNum,
        page_start: 1 + Math.floor(i / 10),
        page_end: 1 + Math.floor(i / 10),
        bbox: { x: 10, y: 100 + (i % 10) * 40, width: 280, height: 35 },
        subject,
        question_type: isInt ? 'INTEGER' : 'MCQ',
        correct_answer: isInt ? '12' : 'B',
        marks: 4,
        negative_marks: 1,
        review_status: 'APPROVED',
      });
    }
    return list;
  }

  // TEST A: SINGLE PHYSICS TEST
  test('TEST A — Single Physics test validation with 30 questions', () => {
    const physicsQuestions = createSampleQuestions('Physics', 30, 1);
    const qMap = new Map(physicsQuestions.map((q) => [q.id, q]));

    const payload = {
      title: 'Physics Weekly Mock Test',
      duration_minutes: 60,
      subject: 'Physics',
      exam_type: 'single' as const,
      status: 'DRAFT' as const,
      question_ids: physicsQuestions.map((q) => q.id),
    };

    const validation = validatePdfNativeTestCreation(payload, qMap);
    expect(validation.isValid).toBe(true);
    expect(validation.errors.length).toBe(0);
  });

  // TEST B: MULTI-SUBJECT TEST WITH 3 SECTIONS
  test('TEST B — Multi-Subject test with Physics, Chemistry & Mathematics sections', () => {
    const pQuestions = createSampleQuestions('Physics', 30, 1);
    const cQuestions = createSampleQuestions('Chemistry', 30, 31);
    const mQuestions = createSampleQuestions('Mathematics', 30, 61);
    const all90 = [...pQuestions, ...cQuestions, ...mQuestions];

    const sections: PdfNativeTestSection[] = [
      {
        id: 'sec_1',
        test_id: 'test_multi_1',
        subject: 'Physics',
        section_order: 1,
        question_start: 1,
        question_end: 30,
      },
      {
        id: 'sec_2',
        test_id: 'test_multi_1',
        subject: 'Chemistry',
        section_order: 2,
        question_start: 31,
        question_end: 60,
      },
      {
        id: 'sec_3',
        test_id: 'test_multi_1',
        subject: 'Mathematics',
        section_order: 3,
        question_start: 61,
        question_end: 90,
      },
    ];

    const secVal = validateSubjectSections(sections, 90, all90);
    expect(secVal.isValid).toBe(true);
    expect(secVal.errors.length).toBe(0);
  });

  // TEST C: INTEGER QUESTION TYPES FLOW TO CBT & SCORING
  test('TEST C — INTEGER question type mapping & scoring', () => {
    const questions = createSampleQuestions('Physics', 30, 1, true);
    // Q1..25 are MCQ (correct 'B'), Q26..30 are INTEGER (correct '12')

    // 1. Adapter mapping
    const mcqCbt = mapPdfNativeQuestionToCbtQuestion(questions[0]!, 'test_1', 0);
    expect(mcqCbt.type).toBe('mcq');
    expect(mcqCbt.options.length).toBe(4);

    const intCbt = mapPdfNativeQuestionToCbtQuestion(questions[29]!, 'test_1', 29);
    expect(intCbt.type).toBe('integer');
    expect(intCbt.options.length).toBe(0);

    // 2. Scoring verification (+4, -1, 0)
    const answers: Record<string, string> = {
      [questions[0]!.id]: 'B', // Correct MCQ (+4)
      [questions[1]!.id]: 'A', // Wrong MCQ (-1)
      [questions[2]!.id]: '', // Unattempted MCQ (0 marks, UNATTEMPTED)
      [questions[29]!.id]: '12', // Correct Integer (+4)
      [questions[28]!.id]: '99', // Wrong Integer (-1)
      [questions[27]!.id]: '   ', // Empty/Whitespace Integer (0 marks, UNATTEMPTED)
    };

    const attempt = scorePdfNativeAttempt(questions, answers);
    expect(attempt.total_questions).toBe(30);
    expect(attempt.attempted_count).toBe(4);
    expect(attempt.unattempted_count).toBe(26);
    expect(attempt.correct_count).toBe(2);
    expect(attempt.wrong_count).toBe(2);
    // Score = +4 (Q1) - 1 (Q2) + 0 (Q3) + 4 (Q30) - 1 (Q29) + 0 (Q28) = 6
    expect(attempt.total_score).toBe(6);

    // Verify unattempted question item status in attempt breakdown
    const q3Breakdown = attempt.answers.find((b) => b.question_id === questions[2]!.id);
    expect(q3Breakdown?.status).toBe('UNATTEMPTED');
    expect(q3Breakdown?.awarded_marks).toBe(0);

    const q28Breakdown = attempt.answers.find((b) => b.question_id === questions[27]!.id);
    expect(q28Breakdown?.status).toBe('UNATTEMPTED');
    expect(q28Breakdown?.awarded_marks).toBe(0);
  });

  // TEST D: DRAFT LIFECYCLE & NO DUPLICATES
  test('TEST D — Draft lifecycle maintains same test ID without duplication', async () => {
    const questions = createSampleQuestions('Physics', 10, 1);
    const qIds = questions.map((q) => q.id);

    // 1. Create draft
    const createRes = await createPdfNativeTest({
      title: 'Initial Draft Title',
      duration_minutes: 60,
      subject: 'Physics',
      status: 'DRAFT',
      question_ids: qIds,
    });

    const testId = createRes.test.id;
    expect(Boolean(testId)).toBe(true);
    expect(createRes.test.status).toBe('DRAFT');

    // 2. Edit draft (Update existing record)
    const updateRes = await updatePdfNativeTest({
      id: testId,
      title: 'Updated Draft Title',
      duration_minutes: 90,
      subject: 'Physics',
      status: 'DRAFT',
      question_ids: qIds,
    });

    expect(updateRes.test.id).toBe(testId);
    expect(updateRes.test.title).toBe('Updated Draft Title');
    expect(updateRes.test.duration_minutes).toBe(90);

    // 3. Publish draft
    const publishSuccess = await publishPdfNativeTest(testId);
    expect(publishSuccess).toBe(true);

    const allLocal = await getLocalPdfNativeTests();
    const matching = allLocal.filter((t) => t.id === testId);
    expect(matching.length).toBe(1);
    expect(matching[0]!.status).toBe('READY');
  });

  // TEST E: STUDENT VISIBILITY FILTERING
  test('TEST E — DRAFT tests are hidden from students; READY tests are visible', () => {
    const draftTest: PdfNativeTest = {
      id: 'test_draft_only',
      title: 'Secret Draft Exam',
      duration_minutes: 60,
      subject: 'Physics',
      total_questions: 10,
      status: 'DRAFT',
    };

    const readyTest: PdfNativeTest = {
      id: 'test_ready_live',
      title: 'Live Published Exam',
      duration_minutes: 60,
      subject: 'Physics',
      total_questions: 10,
      status: 'READY',
    };

    const cbtDraft = mapPdfNativeTestToCbtTestItem(draftTest);
    expect(cbtDraft.isPublished).toBe(false);

    const cbtReady = mapPdfNativeTestToCbtTestItem(readyTest);
    expect(cbtReady.isPublished).toBe(true);
  });

  // TEST F: QUESTION SET CREATION & SAFE DELETION
  test('TEST F — Question Set creation, retrieval, and safe delete integrity', async () => {
    const questions = createSampleQuestions('Physics', 15, 101);
    await saveLocalPdfNativeQuestions(questions);

    // 1. Create a Question Set
    const setRes = await createPdfNativeSet({
      set_name: 'Physics — Rotational Motion — Set 01',
      source_pdf_id: 'sample_pdf_1',
      pdf_url: '/REF/sample.pdf',
      subject: 'Physics',
      description: 'Faculty reviewed PYQs',
      status: 'READY',
      question_ids: questions.map((q) => q.id),
    });

    expect(setRes.success).toBe(true);
    expect(setRes.set.set_name).toBe('Physics — Rotational Motion — Set 01');
    expect(setRes.set.total_questions).toBe(15);

    // 2. Retrieve Set Questions
    const setQuestions = await getPdfNativeSetQuestions(setRes.set.id);
    expect(setQuestions.length).toBe(15);
    expect(setQuestions[0]!.question_number).toBe('101');

    // 3. Create a Test directly from the Set
    const testRes = await createPdfNativeTest({
      title: 'Rotational Motion Chapter Test',
      duration_minutes: 45,
      subject: 'Physics',
      status: 'READY',
      question_ids: setQuestions.map((q) => q.id),
    });

    expect(testRes.test.total_questions).toBe(15);

    // 4. Safe Delete Test: Deleting test does NOT delete the Set or questions
    await deletePdfNativeTest(testRes.test.id);
    const setStillExists = await getPdfNativeSetById(setRes.set.id);
    expect(Boolean(setStillExists)).toBe(true);
    const questionsStillExist = await getLocalPdfNativeQuestions();
    expect(questionsStillExist.some((q) => q.id === questions[0]!.id)).toBe(true);

    // 5. Safe Delete Set: Deleting Set does NOT delete questions from Question Bank
    await deletePdfNativeSet(setRes.set.id);
    const setAfterDelete = await getPdfNativeSetById(setRes.set.id);
    expect(setAfterDelete === null).toBe(true);
    const questionsAfterSetDelete = await getLocalPdfNativeQuestions();
    expect(questionsAfterSetDelete.some((q) => q.id === questions[0]!.id)).toBe(true);
  });

  // TEST G: NUMERIC STRING NORMALIZATION FOR INTEGER SCORING
  test('TEST G — INTEGER scoring normalizes whitespace and values accurately', () => {
    const intQuestions: PdfNativeQuestion[] = [
      {
        id: 'q_int_1',
        pdf_id: 'pdf_1',
        question_number: '1',
        page_start: 1,
        page_end: 1,
        bbox: { x: 0, y: 0, width: 100, height: 100 },
        subject: 'Physics',
        question_type: 'INTEGER',
        correct_answer: '42',
        marks: 4,
        negative_marks: 1,
        review_status: 'APPROVED',
      },
      {
        id: 'q_int_2',
        pdf_id: 'pdf_1',
        question_number: '2',
        page_start: 1,
        page_end: 1,
        bbox: { x: 0, y: 0, width: 100, height: 100 },
        subject: 'Physics',
        question_type: 'INTEGER',
        correct_answer: '-5',
        marks: 4,
        negative_marks: 1,
        review_status: 'APPROVED',
      },
    ];

    // Case 1: Trimmed whitespace string matches correctly
    const answers1: Record<string, string> = {
      q_int_1: '  42  ',
      q_int_2: ' -5 ',
    };
    const result1 = scorePdfNativeAttempt(intQuestions, answers1);
    expect(result1.total_score).toBe(8);
    expect(result1.correct_count).toBe(2);

    // Case 2: Unattempted is 0 marks and status is UNATTEMPTED
    const answers2: Record<string, string> = {
      q_int_1: '',
    };
    const result2 = scorePdfNativeAttempt(intQuestions, answers2);
    expect(result2.total_score).toBe(0);
    expect(result2.unattempted_count).toBe(2);
    expect(result2.correct_count).toBe(0);
    expect(result2.wrong_count).toBe(0);
  });
});
