import {
  createPdfNativeSet,
  deletePdfNativeSet,
  getPdfNativeSetById,
  getPdfNativeSetQuestions,
  listPdfNativeSets,
} from '../pdf-native/pdfNativeSetService';
import {
  createPdfNativeTest,
  deletePdfNativeTest,
  getPdfNativeTestById,
  listPdfNativeTests,
  publishPdfNativeTest,
  validateSubjectSections,
  validateTestForPublish,
} from '../pdf-native/pdfNativeTestService';
import {
  scorePdfNativeAttempt,
  submitPdfNativeAttempt,
} from '../pdf-native/pdfNativeScoringService';
import {
  savePdfNativeQuestionBankBatch,
} from '../pdf-native/pdfNativeBankService';
import {
  PdfNativeQuestion,
  PdfNativeSet,
  PdfNativeTest,
  PdfNativeTestSection,
} from '../pdf-native/pdfNativeTypes';
import { fetchTests } from '../api/tests';
import { fetchResults } from '../api/admin';
import { fetchPdfNativeCbtQuestions } from '../pdf-native/pdfNativeCbtAdapter';
import { useAuthStore } from '../../store/authStore';

declare const describe: any;
declare const it: any;
declare const expect: any;
declare const beforeAll: any;
declare const afterAll: any;
declare const jest: any;

describe('Complete PDF-Native Set -> Multi-Set Test -> Student -> Result Pipeline Audit', () => {
  // Test Data Fixtures
  const physicsQuestions: PdfNativeQuestion[] = Array.from({ length: 30 }, (_, i) => ({
    id: `q_phy_${i + 1}`,
    pdf_id: 'pdf_physics_11th',
    question_number: String(i + 1),
    page_start: 1,
    page_end: 1,
    bbox: { x: 20, y: 50 + i * 20, width: 250, height: 18 },
    subject: 'Physics',
    question_type: 'MCQ',
    correct_answer: ['A', 'B', 'C', 'D'][i % 4] ?? 'A',
    marks: 4,
    negative_marks: 1,
    review_status: 'APPROVED',
  }));

  const chemistryQuestions: PdfNativeQuestion[] = Array.from({ length: 30 }, (_, i) => ({
    id: `q_chem_${i + 1}`,
    pdf_id: 'pdf_chemistry_11th',
    question_number: String(i + 1),
    page_start: 1,
    page_end: 1,
    bbox: { x: 20, y: 50 + i * 20, width: 250, height: 18 },
    subject: 'Chemistry',
    question_type: 'MCQ',
    correct_answer: ['A', 'B', 'C', 'D'][(i + 1) % 4] ?? 'B',
    marks: 4,
    negative_marks: 1,
    review_status: 'APPROVED',
  }));

  const mathQuestions: PdfNativeQuestion[] = Array.from({ length: 30 }, (_, i) => ({
    id: `q_math_${i + 1}`,
    pdf_id: 'pdf_math_11th',
    question_number: String(i + 1),
    page_start: 1,
    page_end: 1,
    bbox: { x: 20, y: 50 + i * 20, width: 250, height: 18 },
    subject: 'Mathematics',
    question_type: i >= 20 ? 'INTEGER' : 'MCQ',
    correct_answer: i >= 20 ? String((i * 3) % 100) : (['A', 'B', 'C', 'D'][(i + 2) % 4] ?? 'C'),
    marks: 4,
    negative_marks: 1,
    review_status: 'APPROVED',
  }));

  let physicsSetId = '';
  let chemistrySetId = '';
  let mathSetId = '';

  let multiSetTestId = '';
  let openForAllTestId = '';
  let batchRestrictedMidgTestId = '';
  let draftTestId = '';

  beforeAll(async () => {
    // Seed question bank with physics, chemistry, and math questions
    await savePdfNativeQuestionBankBatch('pdf_physics_11th', '', physicsQuestions);
    await savePdfNativeQuestionBankBatch('pdf_chemistry_11th', '', chemistryQuestions);
    await savePdfNativeQuestionBankBatch('pdf_math_11th', '', mathQuestions);
  });

  afterAll(async () => {
    // Clean up created tests and sets
    if (multiSetTestId) await deletePdfNativeTest(multiSetTestId).catch(() => undefined);
    if (openForAllTestId) await deletePdfNativeTest(openForAllTestId).catch(() => undefined);
    if (batchRestrictedMidgTestId) await deletePdfNativeTest(batchRestrictedMidgTestId).catch(() => undefined);
    if (draftTestId) await deletePdfNativeTest(draftTestId).catch(() => undefined);

    if (physicsSetId) await deletePdfNativeSet(physicsSetId).catch(() => undefined);
    if (chemistrySetId) await deletePdfNativeSet(chemistrySetId).catch(() => undefined);
    if (mathSetId) await deletePdfNativeSet(mathSetId).catch(() => undefined);
  });

  // ==========================================
  // PART 1 & 2: SET PERSISTENCE & MANAGEMENT
  // ==========================================
  describe('Part 1 & 2: Question Sets System (SET_01 -> SET_08)', () => {
    it('SET_01: Creates Physics Set 01 with 30 Questions', async () => {
      const res = await createPdfNativeSet({
        set_name: 'Physics Set 01',
        source_pdf_id: 'pdf_physics_11th',
        subject: 'Physics',
        question_ids: physicsQuestions.map((q) => q.id),
      });

      expect(res.success).toBe(true);
      expect(res.set.id).toBeTruthy();
      expect(res.set.total_questions).toBe(30);
      expect(res.set.subject).toBe('Physics');
      physicsSetId = res.set.id;
    });

    it('SET_02: Creates Chemistry Set 01 with 30 Questions', async () => {
      const res = await createPdfNativeSet({
        set_name: 'Chemistry Set 01',
        source_pdf_id: 'pdf_chemistry_11th',
        subject: 'Chemistry',
        question_ids: chemistryQuestions.map((q) => q.id),
      });

      expect(res.success).toBe(true);
      expect(res.set.total_questions).toBe(30);
      expect(res.set.subject).toBe('Chemistry');
      chemistrySetId = res.set.id;
    });

    it('SET_03: Creates Mathematics Set 01 with 30 Questions', async () => {
      const res = await createPdfNativeSet({
        set_name: 'Mathematics Set 01',
        source_pdf_id: 'pdf_math_11th',
        subject: 'Mathematics',
        question_ids: mathQuestions.map((q) => q.id),
      });

      expect(res.success).toBe(true);
      expect(res.set.total_questions).toBe(30);
      expect(res.set.subject).toBe('Mathematics');
      mathSetId = res.set.id;
    });

    it('SET_04: Verifies all 3 Sets exist and list returns all 3 simultaneously', async () => {
      const allSets = await listPdfNativeSets();
      const setIds = allSets.map((s) => s.id);

      expect(setIds).toContain(physicsSetId);
      expect(setIds).toContain(chemistrySetId);
      expect(setIds).toContain(mathSetId);
      expect(allSets.length).toBeGreaterThanOrEqual(3);
    });

    it('SET_05: Fetches each Set by ID and verifies accurate question association', async () => {
      const phySet = await getPdfNativeSetById(physicsSetId);
      const phyQs = await getPdfNativeSetQuestions(physicsSetId);
      expect(phySet).not.toBeNull();
      expect(phySet?.set_name).toBe('Physics Set 01');
      expect(phyQs.length).toBe(30);

      const mathSet = await getPdfNativeSetById(mathSetId);
      const mathQs = await getPdfNativeSetQuestions(mathSetId);
      expect(mathSet).not.toBeNull();
      expect(mathSet?.set_name).toBe('Mathematics Set 01');
      expect(mathQs.length).toBe(30);
    });
  });

  // ==========================================
  // PART 3 & 4 & 5: MULTI-SET SELECTION & SECTIONS
  // ==========================================
  describe('Part 3, 4 & 5: Multi-Set Selection & Multi-Subject Sections', () => {
    it('MSET_01: Selects Physics + Chemistry + Math Sets and loads 90 questions deterministically', async () => {
      const phyQs = await getPdfNativeSetQuestions(physicsSetId);
      const chemQs = await getPdfNativeSetQuestions(chemistrySetId);
      const mathQs = await getPdfNativeSetQuestions(mathSetId);

      const combinedQuestions = [...phyQs, ...chemQs, ...mathQs];
      expect(combinedQuestions.length).toBe(90);

      // Verify no duplicate question IDs
      const uniqueIds = new Set(combinedQuestions.map((q) => q.id));
      expect(uniqueIds.size).toBe(90);
    });

    it('MSET_02: Configures 3 explicit Subject Sections (Physics Q1-30, Chemistry Q31-60, Math Q61-90)', () => {
      const sections: PdfNativeTestSection[] = [
        {
          id: 'sec_1',
          test_id: '',
          set_id: physicsSetId,
          subject: 'Physics',
          question_type: 'MCQ',
          section_order: 1,
          question_start: 1,
          question_end: 30,
          correct_marks: 4,
          negative_marks: 1,
        },
        {
          id: 'sec_2',
          test_id: '',
          set_id: chemistrySetId,
          subject: 'Chemistry',
          question_type: 'MCQ',
          section_order: 2,
          question_start: 31,
          question_end: 60,
          correct_marks: 4,
          negative_marks: 1,
        },
        {
          id: 'sec_3',
          test_id: '',
          set_id: mathSetId,
          subject: 'Mathematics',
          question_type: 'MCQ',
          section_order: 3,
          question_start: 61,
          question_end: 90,
          correct_marks: 4,
          negative_marks: 1,
        },
      ];

      const validation = validateSubjectSections(sections, 90);
      expect(validation.isValid).toBe(true);
      expect(validation.errors.length).toBe(0);
    });

    it('MSET_03: Creates and publishes a Multi-Set Test with 3 linked sets', async () => {
      const phyQs = await getPdfNativeSetQuestions(physicsSetId);
      const chemQs = await getPdfNativeSetQuestions(chemistrySetId);
      const mathQs = await getPdfNativeSetQuestions(mathSetId);
      const all90Ids = [...phyQs, ...chemQs, ...mathQs].map((q) => q.id);

      const sections: PdfNativeTestSection[] = [
        {
          id: 'sec_1',
          test_id: '',
          set_id: physicsSetId,
          subject: 'Physics',
          question_type: 'MCQ',
          section_order: 1,
          question_start: 1,
          question_end: 30,
          correct_marks: 4,
          negative_marks: 1,
        },
        {
          id: 'sec_2',
          test_id: '',
          set_id: chemistrySetId,
          subject: 'Chemistry',
          question_type: 'MCQ',
          section_order: 2,
          question_start: 31,
          question_end: 60,
          correct_marks: 4,
          negative_marks: 1,
        },
        {
          id: 'sec_3',
          test_id: '',
          set_id: mathSetId,
          subject: 'Mathematics',
          question_type: 'MCQ',
          section_order: 3,
          question_start: 61,
          question_end: 90,
          correct_marks: 4,
          negative_marks: 1,
        },
      ];

      const res = await createPdfNativeTest({
        title: 'JEE Main 3-Subject Full Mock Test 01',
        description: 'Comprehensive test covering Physics, Chemistry, and Mathematics',
        duration_minutes: 180,
        subject: 'Multi-Subject',
        exam_type: 'multi',
        status: 'READY',
        visibility: 'OPEN_FOR_ALL',
        set_ids: [physicsSetId, chemistrySetId, mathSetId],
        question_ids: all90Ids,
        sections,
      });

      expect(res.success).toBe(true);
      expect(res.test.total_questions).toBe(90);
      expect(res.test.set_ids).toContain(physicsSetId);
      expect(res.test.set_ids).toContain(chemistrySetId);
      expect(res.test.set_ids).toContain(mathSetId);
      multiSetTestId = res.test.id;

      const loaded = await getPdfNativeTestById(multiSetTestId);
      expect(loaded).not.toBeNull();
      expect(loaded?.set_ids?.length).toBe(3);
      expect(loaded?.sections?.length).toBe(3);
    });

    it('MSET_04: Verifies student test questions load in exact sequential order without shuffling', async () => {
      const cbtQuestions = await fetchPdfNativeCbtQuestions(multiSetTestId);
      expect(cbtQuestions.length).toBe(90);

      // Verify Physics questions Q1-Q30
      for (let i = 0; i < 30; i++) {
        expect(cbtQuestions[i]?.subjectLabel).toBe('Physics');
        expect(cbtQuestions[i]?.prompt).toBe(`Question ${i + 1}`);
        expect(cbtQuestions[i]?.id).toBe(`q_phy_${i + 1}`);
      }

      // Verify Chemistry questions Q31-Q60
      for (let i = 30; i < 60; i++) {
        expect(cbtQuestions[i]?.subjectLabel).toBe('Chemistry');
        expect(cbtQuestions[i]?.prompt).toBe(`Question ${i + 1}`);
        expect(cbtQuestions[i]?.id).toBe(`q_chem_${i - 30 + 1}`);
      }

      // Verify Mathematics questions Q61-Q90
      for (let i = 60; i < 90; i++) {
        expect(cbtQuestions[i]?.subjectLabel).toBe('Mathematics');
        expect(cbtQuestions[i]?.prompt).toBe(`Question ${i + 1}`);
        expect(cbtQuestions[i]?.id).toBe(`q_math_${i - 60 + 1}`);
      }
    });

    it('SET_DEL_SAFE: Deleting a Set linked to an active Test throws a protective error', async () => {
      await expect(deletePdfNativeSet(physicsSetId)).rejects.toThrow(
        /Cannot delete Question Set because it is referenced by an existing Test/
      );
    });
  });

  // ==========================================
  // PART 6, 7 & 8: INTEGER SCORING & AUTHORITATIVE ANSWER KEYS
  // ==========================================
  describe('Part 6, 7 & 8: Question Types, Scoring & Answer Key Enforcement', () => {
    it('KEY_01: Question missing answer key strictly blocks test publishing', () => {
      const questionsWithMissingKey: PdfNativeQuestion[] = [
        ...physicsQuestions.slice(0, 5),
        {
          id: 'q_phy_nokey',
          pdf_id: 'pdf_physics_11th',
          question_number: '6',
          page_start: 1,
          page_end: 1,
          bbox: { x: 20, y: 50, width: 250, height: 18 },
          subject: 'Physics',
          question_type: 'MCQ',
          correct_answer: '', // MISSING ANSWER KEY
          marks: 4,
          negative_marks: 1,
          review_status: 'APPROVED',
        },
      ];

      const draftTest: PdfNativeTest = {
        id: 'draft_test',
        title: 'Draft Physics Test',
        duration_minutes: 60,
        subject: 'Physics',
        total_questions: 6,
        status: 'READY',
        visibility: 'OPEN_FOR_ALL',
      };

      const validation = validateTestForPublish(draftTest, questionsWithMissingKey);
      expect(validation.isValid).toBe(false);
      expect(validation.errors.some((e) => e.includes('missing a valid authoritative answer key'))).toBe(true);
    });

    it('SCOR_01: MCQ scoring is strictly +4 (correct), -1 (wrong), 0 (unattempted)', () => {
      const targetQuestions = physicsQuestions.slice(0, 5);
      const attempt = scorePdfNativeAttempt(targetQuestions, {
        q_phy_1: targetQuestions[0]?.correct_answer || 'A', // +4
        q_phy_2: targetQuestions[1]?.correct_answer || 'B', // +4
        q_phy_3: 'WRONG_OPT',                               // -1
        // q_phy_4 unattempted -> 0
        // q_phy_5 unattempted -> 0
      });

      expect(attempt.correct_count).toBe(2);
      expect(attempt.wrong_count).toBe(1);
      expect(attempt.unattempted_count).toBe(2);
      expect(attempt.total_score).toBe(4 + 4 - 1); // 7 marks
    });

    it('SCOR_02: INTEGER scoring is strictly +4 (correct numeric match), -1 (wrong numeric), 0 (unattempted)', () => {
      const intQuestions: PdfNativeQuestion[] = [
        {
          id: 'q_int_1',
          pdf_id: 'pdf_math_11th',
          question_number: '21',
          page_start: 1,
          page_end: 1,
          bbox: { x: 20, y: 50, width: 250, height: 18 },
          subject: 'Mathematics',
          question_type: 'INTEGER',
          correct_answer: '42',
          marks: 4,
          negative_marks: 1,
          review_status: 'APPROVED',
        },
        {
          id: 'q_int_2',
          pdf_id: 'pdf_math_11th',
          question_number: '22',
          page_start: 1,
          page_end: 1,
          bbox: { x: 20, y: 50, width: 250, height: 18 },
          subject: 'Mathematics',
          question_type: 'INTEGER',
          correct_answer: '100',
          marks: 4,
          negative_marks: 1,
          review_status: 'APPROVED',
        },
        {
          id: 'q_int_3',
          pdf_id: 'pdf_math_11th',
          question_number: '23',
          page_start: 1,
          page_end: 1,
          bbox: { x: 20, y: 50, width: 250, height: 18 },
          subject: 'Mathematics',
          question_type: 'INTEGER',
          correct_answer: '7',
          marks: 4,
          negative_marks: 1,
          review_status: 'APPROVED',
        },
      ];

      const attempt = scorePdfNativeAttempt(intQuestions, {
        q_int_1: '42', // Exact numeric match -> +4
        q_int_2: '99', // Wrong integer -> -1
        // q_int_3 unattempted -> 0
      });

      expect(attempt.correct_count).toBe(1);
      expect(attempt.wrong_count).toBe(1);
      expect(attempt.unattempted_count).toBe(1);
      expect(attempt.total_score).toBe(4 - 1); // 3 marks
    });
  });

  // ==========================================
  // PART 9 -> 17: ACCESS CONTROL & SCHEDULING
  // ==========================================
  describe('Part 9 -> 17: Access Control (OPEN_FOR_ALL vs MIDG Batch) & Scheduling', () => {
    it('ACC_01: Creates OPEN_FOR_ALL test and BATCH_RESTRICTED (MIDG) test', async () => {
      const openRes = await createPdfNativeTest({
        title: 'Open Public Test 01',
        duration_minutes: 60,
        subject: 'Physics',
        status: 'READY',
        visibility: 'OPEN_FOR_ALL',
        starts_at: new Date(Date.now() - 1000 * 60 * 60).toISOString(), // started 1 hour ago
        question_ids: physicsQuestions.slice(0, 10).map((q) => q.id),
      });
      openForAllTestId = openRes.test.id;

      const midgRes = await createPdfNativeTest({
        title: 'MIDG Exclusive Batch Test 01',
        duration_minutes: 60,
        subject: 'Physics',
        status: 'READY',
        visibility: 'BATCH_ONLY',
        allowed_batches: ['MIDG'],
        starts_at: new Date(Date.now() - 1000 * 60 * 60).toISOString(),
        question_ids: physicsQuestions.slice(10, 20).map((q) => q.id),
      });
      batchRestrictedMidgTestId = midgRes.test.id;

      const draftRes = await createPdfNativeTest({
        title: 'Unpublished Faculty Draft Test',
        duration_minutes: 60,
        subject: 'Physics',
        status: 'DRAFT',
        visibility: 'OPEN_FOR_ALL',
        question_ids: physicsQuestions.slice(20, 25).map((q) => q.id),
      });
      draftTestId = draftRes.test.id;
    });

    it('STU_01: Student with NO batch sees OPEN_FOR_ALL tests but NOT BATCH_ONLY or DRAFT', async () => {
      useAuthStore.setState({
        user: {
          id: 'stu_regular',
          email: 'student@example.com',
          fullName: 'Regular Student',
          role: 'student',
          approvalStatus: 'approved',
          batchId: undefined,
          targetExam: 'JEE',
          classLabel: '11th',
          rank: 1,
          averageScore: 80,
          streakDays: 5,
          avatarSeed: 'regular',
        },
      });

      const tests = await fetchTests();
      const ids = tests.map((t) => t.id);

      expect(ids).toContain(openForAllTestId);
      expect(ids).not.toContain(batchRestrictedMidgTestId);
      expect(ids).not.toContain(draftTestId);
    });

    it('STU_02: Student in MIDG batch sees BOTH OPEN_FOR_ALL and MIDG Exclusive tests', async () => {
      useAuthStore.setState({
        user: {
          id: 'stu_midg_member',
          email: 'midg@example.com',
          fullName: 'MIDG Student',
          role: 'student',
          approvalStatus: 'approved',
          batchId: 'MIDG',
          targetExam: 'JEE',
          classLabel: '11th',
          rank: 1,
          averageScore: 95,
          streakDays: 12,
          avatarSeed: 'midg',
        },
      });

      const tests = await fetchTests();
      const ids = tests.map((t) => t.id);

      expect(ids).toContain(openForAllTestId);
      expect(ids).toContain(batchRestrictedMidgTestId);
      expect(ids).not.toContain(draftTestId);
    });

    it('STU_03: Student in OTHER batch does NOT see MIDG Exclusive test', async () => {
      useAuthStore.setState({
        user: {
          id: 'stu_other_batch',
          email: 'other@example.com',
          fullName: 'Other Batch Student',
          role: 'student',
          approvalStatus: 'approved',
          batchId: 'BATCH_OTHER',
          targetExam: 'JEE',
          classLabel: '11th',
          rank: 2,
          averageScore: 70,
          streakDays: 3,
          avatarSeed: 'other',
        },
      });

      const tests = await fetchTests();
      const ids = tests.map((t) => t.id);

      expect(ids).toContain(openForAllTestId);
      expect(ids).not.toContain(batchRestrictedMidgTestId);
      expect(ids).not.toContain(draftTestId);
    });
  });

  // ==========================================
  // PART 21 -> 24: SUBMISSION, RESULT & HISTORY
  // ==========================================
  describe('Part 21 -> 24: Submission, Result & Attempt History', () => {
    it('RES_01: Submits student attempt and verifies persistent history linking', async () => {
      const studentId = 'stu_verified_candidate';
      const studentName = 'Tanmay Sinha';

      const res = await submitPdfNativeAttempt({
        testId: openForAllTestId,
        studentName,
        userId: studentId,
        answers: {
          q_phy_1: physicsQuestions[0]?.correct_answer || 'A',
          q_phy_2: physicsQuestions[1]?.correct_answer || 'B',
          q_phy_3: physicsQuestions[2]?.correct_answer || 'C',
          q_phy_4: 'WRONG_ANSWER',
        },
      });

      expect(res.result.id).toBeDefined();

      // Verify attempt history contains this attempt
      const history = await fetchResults(studentId);
      const candidateResult = history.find((r) => r.id === res.result.id || r.testId === openForAllTestId);

      expect(candidateResult).toBeDefined();
      expect(candidateResult?.score).toBe(3 * 4 - 1); // 11
      expect(candidateResult?.correctAnswers).toBe(3);
      expect(candidateResult?.wrongAnswers).toBe(1);
    });
  });

  // ==========================================
  // PART 25 & 26: EXACT TEST DELETION
  // ==========================================
  describe('Part 25 & 26: Exact Test Deletion', () => {
    it('DEL_01: Deleting a test removes only the exact test ID', async () => {
      await deletePdfNativeTest(openForAllTestId);

      const remaining = await listPdfNativeTests();
      const ids = remaining.map((t) => t.id);

      expect(ids).not.toContain(openForAllTestId);
      expect(ids).toContain(multiSetTestId);
      expect(ids).toContain(batchRestrictedMidgTestId);
    });
  });
});
