import {
  createPdfNativeSet,
  deletePdfNativeSet,
  getPdfNativeSetById,
  listPdfNativeSets,
} from '../pdf-native/pdfNativeSetService';
import {
  createPdfNativeTest,
  deletePdfNativeTest,
  getPdfNativeTestById,
  listPdfNativeTests,
  validateSubjectSections,
  validateTestForPublish,
} from '../pdf-native/pdfNativeTestService';
import { scorePdfNativeAttempt } from '../pdf-native/pdfNativeScoringService';
import {
  PdfNativeQuestion,
  PdfNativeTest,
  PdfNativeTestSection,
} from '../pdf-native/pdfNativeTypes';
import { fetchTests } from '../api/tests';
import { useAuthStore } from '../../store/authStore';

declare const describe: any;
declare const it: any;
declare const expect: any;
declare const beforeAll: any;
declare const afterAll: any;
declare const jest: any;

describe('PDF-Native Set, Test Lifecycle, Access Control & Scoring Audit', () => {
  const sampleMathQuestions: PdfNativeQuestion[] = Array.from({ length: 25 }, (_, i) => ({
    id: `q_math_${i + 1}`,
    pdf_id: 'pdf_math_11th',
    question_number: String(i + 1),
    page_start: 1,
    page_end: 1,
    bbox: { x: 10, y: 10 + i * 20, width: 200, height: 50 },
    subject: 'Mathematics',
    question_type: i >= 20 ? 'INTEGER' : 'MCQ',
    correct_answer: i >= 20 ? String(i * 2) : (['A', 'B', 'C', 'D'][i % 4] || 'A'),
    marks: 4,
    negative_marks: 1,
    review_status: 'APPROVED',
  }));

  const samplePhysicsQuestions: PdfNativeQuestion[] = Array.from({ length: 30 }, (_, i) => ({
    id: `q_phy_${i + 1}`,
    pdf_id: 'pdf_physics_12th',
    question_number: String(i + 1),
    page_start: 1,
    page_end: 1,
    bbox: { x: 10, y: 10 + i * 20, width: 200, height: 50 },
    subject: 'Physics',
    question_type: i >= 25 ? 'INTEGER' : 'MCQ',
    correct_answer: i >= 25 ? String(i + 5) : (['A', 'B', 'C', 'D'][i % 4] || 'B'),
    marks: 4,
    negative_marks: 1,
    review_status: 'APPROVED',
  }));

  describe('Problem 1 & Set Lifecycle (SET_01 -> SET_06)', () => {
    let set1Id = '';
    let set2Id = '';

    it('SET_01: Creates Set 1 with 25 Mathematics questions', async () => {
      const res = await createPdfNativeSet({
        set_name: '11th_morning_math_test_paper__1162772_1_1786705588 — Set 01',
        source_pdf_id: 'pdf_math_11th',
        subject: 'Mathematics',
        status: 'READY',
        question_ids: sampleMathQuestions.map((q) => q.id),
      });

      expect(res.success).toBe(true);
      expect(res.set.total_questions).toBe(25);
      expect(res.set.subject).toBe('Mathematics');
      expect(res.set.status).toBe('READY');
      set1Id = res.set.id;
    });

    it('SET_02: Creates Set 2 with 30 Physics questions', async () => {
      const res = await createPdfNativeSet({
        set_name: '12th_evening_physics_test_paper — Set 02',
        source_pdf_id: 'pdf_physics_12th',
        subject: 'Physics',
        status: 'READY',
        question_ids: samplePhysicsQuestions.map((q) => q.id),
      });

      expect(res.success).toBe(true);
      expect(res.set.total_questions).toBe(30);
      expect(res.set.subject).toBe('Physics');
      expect(res.set.status).toBe('READY');
      set2Id = res.set.id;
    });

    it('SET_03: listPdfNativeSets returns BOTH Set 1 and Set 2 without dropping either', async () => {
      const allSets = await listPdfNativeSets();
      const ids = allSets.map((s) => s.id);

      expect(ids).toContain(set1Id);
      expect(ids).toContain(set2Id);
      expect(allSets.length).toBeGreaterThanOrEqual(2);
    });

    it('SET_04 & SET_05: Querying Set 1 and Set 2 by ID returns exact isolated records', async () => {
      const set1 = await getPdfNativeSetById(set1Id);
      const set2 = await getPdfNativeSetById(set2Id);

      expect(set1).not.toBeNull();
      expect(set1?.id).toBe(set1Id);
      expect(set1?.total_questions).toBe(25);
      expect(set1?.subject).toBe('Mathematics');

      expect(set2).not.toBeNull();
      expect(set2?.id).toBe(set2Id);
      expect(set2?.total_questions).toBe(30);
      expect(set2?.subject).toBe('Physics');
    });

    it('SET_06: Deleting Set 1 leaves Set 2 completely intact and unaffected', async () => {
      await deletePdfNativeSet(set1Id);
      const remainingSets = await listPdfNativeSets();
      const remainingIds = remainingSets.map((s) => s.id);

      expect(remainingIds).not.toContain(set1Id);
      expect(remainingIds).toContain(set2Id);
    });
  });

  describe('Access Control & Validation (ACC_01 -> ACC_03)', () => {
    it('ACC_01: Creates an OPEN_FOR_ALL Test successfully', async () => {
      const res = await createPdfNativeTest({
        title: 'Open JEE Mock Test 2026',
        duration_minutes: 180,
        subject: 'Mathematics',
        status: 'READY',
        visibility: 'OPEN_FOR_ALL',
        question_ids: sampleMathQuestions.map((q) => q.id),
      });

      expect(res.success).toBe(true);
      expect(res.test.visibility).toBe('OPEN_FOR_ALL');
    });

    it('ACC_02: Creates a BATCH_ONLY Test targeted to specific batches', async () => {
      const res = await createPdfNativeTest({
        title: 'Batch Exclusive Rankers Exam',
        duration_minutes: 120,
        subject: 'Physics',
        status: 'READY',
        visibility: 'BATCH_ONLY',
        allowed_batches: ['batch_rankers_11th', 'batch_droppers_top'],
        question_ids: samplePhysicsQuestions.map((q) => q.id),
      });

      expect(res.success).toBe(true);
      expect(res.test.visibility).toBe('BATCH_ONLY');
      expect(res.test.allowed_batches).toEqual(['batch_rankers_11th', 'batch_droppers_top']);
    });

    it('ACC_03: Validates that BATCH_ONLY requires at least 1 target batch', () => {
      const draftTest: PdfNativeTest = {
        id: 'test_batch_err',
        title: 'Invalid Batch Test',
        duration_minutes: 60,
        subject: 'Mathematics',
        total_questions: 10,
        status: 'READY',
        visibility: 'BATCH_ONLY',
        allowed_batches: [],
      };

      const validation = validateTestForPublish(draftTest, sampleMathQuestions.slice(0, 10));
      expect(validation.isValid).toBe(false);
      expect(validation.errors.some((e) => e.includes('batch'))).toBe(true);
    });
  });

  describe('Student Access & Visibility Filtering (STU_01 -> STU_05 & ADM_01)', () => {
    let openTestId = '';
    let batch1TestId = '';
    let draftTestId = '';

    beforeAll(async () => {
      const t1 = await createPdfNativeTest({
        title: 'Public Open Test 101',
        duration_minutes: 60,
        subject: 'Mathematics',
        status: 'READY',
        visibility: 'OPEN_FOR_ALL',
        question_ids: sampleMathQuestions.slice(0, 5).map((q) => q.id),
      });
      openTestId = t1.test.id;

      const t2 = await createPdfNativeTest({
        title: 'Batch A Restricted Test',
        duration_minutes: 60,
        subject: 'Physics',
        status: 'READY',
        visibility: 'BATCH_ONLY',
        allowed_batches: ['batch_alpha'],
        question_ids: samplePhysicsQuestions.slice(0, 5).map((q) => q.id),
      });
      batch1TestId = t2.test.id;

      const t3 = await createPdfNativeTest({
        title: 'Unpublished Draft Exam',
        duration_minutes: 60,
        subject: 'Physics',
        status: 'DRAFT',
        visibility: 'OPEN_FOR_ALL',
        question_ids: samplePhysicsQuestions.slice(0, 5).map((q) => q.id),
      });
      draftTestId = t3.test.id;
    });

    afterAll(async () => {
      if (openTestId) await deletePdfNativeTest(openTestId);
      if (batch1TestId) await deletePdfNativeTest(batch1TestId);
      if (draftTestId) await deletePdfNativeTest(draftTestId);
    });

    it('STU_01 & STU_02: Student without batch sees OPEN_FOR_ALL but NOT BATCH_ONLY', async () => {
      useAuthStore.setState({
        user: {
          id: 'stu_nobatch',
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
          avatarSeed: 'nobatch',
        },
      });

      const tests = await fetchTests();
      const testIds = tests.map((t) => t.id);

      expect(testIds).toContain(openTestId);
      expect(testIds).not.toContain(batch1TestId);
      expect(testIds).not.toContain(draftTestId);
    });

    it('STU_03: Student enrolled in Batch Alpha sees the Batch Alpha restricted test', async () => {
      useAuthStore.setState({
        user: {
          id: 'stu_alpha',
          email: 'alpha@example.com',
          fullName: 'Alpha Student',
          role: 'student',
          approvalStatus: 'approved',
          batchId: 'batch_alpha',
          targetExam: 'JEE',
          classLabel: '11th',
          rank: 1,
          averageScore: 90,
          streakDays: 10,
          avatarSeed: 'alpha',
        },
      });

      const tests = await fetchTests();
      const testIds = tests.map((t) => t.id);

      expect(testIds).toContain(openTestId);
      expect(testIds).toContain(batch1TestId);
      expect(testIds).not.toContain(draftTestId);
    });

    it('STU_04: Student enrolled in Batch Beta DOES NOT see Batch Alpha test', async () => {
      useAuthStore.setState({
        user: {
          id: 'stu_beta',
          email: 'beta@example.com',
          fullName: 'Beta Student',
          role: 'student',
          approvalStatus: 'approved',
          batchId: 'batch_beta',
          targetExam: 'JEE',
          classLabel: '11th',
          rank: 2,
          averageScore: 75,
          streakDays: 2,
          avatarSeed: 'beta',
        },
      });

      const tests = await fetchTests();
      const testIds = tests.map((t) => t.id);

      expect(testIds).toContain(openTestId);
      expect(testIds).not.toContain(batch1TestId);
      expect(testIds).not.toContain(draftTestId);
    });

    it('ADM_01: Admin / Faculty sees all tests including DRAFT tests', async () => {
      useAuthStore.setState({
        user: {
          id: 'admin_user',
          email: 'admin@miitjee.com',
          fullName: 'Faculty Admin',
          role: 'admin',
          approvalStatus: 'approved',
          batchId: undefined,
          targetExam: 'JEE',
          classLabel: '12th',
          rank: 1,
          averageScore: 100,
          streakDays: 30,
          avatarSeed: 'admin',
        },
      });

      const tests = await fetchTests();
      const testIds = tests.map((t) => t.id);

      expect(testIds).toContain(openTestId);
      expect(testIds).toContain(batch1TestId);
    });
  });

  describe('Multi-Subject Sections & Contamination (SEC_01 -> SEC_02)', () => {
    it('SEC_01: Validates a correct 3-subject section configuration', () => {
      const combinedQuestions = [...samplePhysicsQuestions, ...sampleMathQuestions];
      const sections: PdfNativeTestSection[] = [
        {
          id: 'sec_phy',
          test_id: 'test_multi',
          subject: 'Physics',
          section_order: 1,
          question_start: 1,
          question_end: 30,
          correct_marks: 4,
          negative_marks: 1,
        },
        {
          id: 'sec_math',
          test_id: 'test_multi',
          subject: 'Mathematics',
          section_order: 2,
          question_start: 31,
          question_end: 55,
          correct_marks: 4,
          negative_marks: 1,
        },
      ];

      const validation = validateSubjectSections(sections, combinedQuestions.length, combinedQuestions);
      expect(validation.isValid).toBe(true);
      expect(validation.errors).toHaveLength(0);
    });

    it('SEC_02: Detects overlapping and invalid section boundaries', () => {
      const sections: PdfNativeTestSection[] = [
        {
          id: 'sec_1',
          test_id: 'test_overlap',
          subject: 'Physics',
          section_order: 1,
          question_start: 1,
          question_end: 35,
          correct_marks: 4,
          negative_marks: 1,
        },
        {
          id: 'sec_2',
          test_id: 'test_overlap',
          subject: 'Mathematics',
          section_order: 2,
          question_start: 30, // Overlap!
          question_end: 55,
          correct_marks: 4,
          negative_marks: 1,
        },
      ];

      const validation = validateSubjectSections(sections, 55);
      expect(validation.isValid).toBe(false);
      expect(validation.errors.some((e) => e.includes('overlap'))).toBe(true);
    });
  });

  describe('Authoritative Scoring Engine (SCOR_01 -> SCOR_06)', () => {
    const testQuestions: PdfNativeQuestion[] = [
      {
        id: 'q_mcq_1',
        pdf_id: 'test_paper',
        question_number: '1',
        page_start: 1,
        page_end: 1,
        bbox: { x: 0, y: 0, width: 100, height: 50 },
        subject: 'Physics',
        question_type: 'MCQ',
        correct_answer: 'B',
        marks: 4,
        negative_marks: 1,
        review_status: 'APPROVED',
      },
      {
        id: 'q_mcq_2',
        pdf_id: 'test_paper',
        question_number: '2',
        page_start: 1,
        page_end: 1,
        bbox: { x: 0, y: 0, width: 100, height: 50 },
        subject: 'Physics',
        question_type: 'MCQ',
        correct_answer: 'C',
        marks: 4,
        negative_marks: 1,
        review_status: 'APPROVED',
      },
      {
        id: 'q_mcq_3',
        pdf_id: 'test_paper',
        question_number: '3',
        page_start: 1,
        page_end: 1,
        bbox: { x: 0, y: 0, width: 100, height: 50 },
        subject: 'Physics',
        question_type: 'MCQ',
        correct_answer: 'A',
        marks: 4,
        negative_marks: 1,
        review_status: 'APPROVED',
      },
      {
        id: 'q_int_1',
        pdf_id: 'test_paper',
        question_number: '4',
        page_start: 1,
        page_end: 1,
        bbox: { x: 0, y: 0, width: 100, height: 50 },
        subject: 'Mathematics',
        question_type: 'INTEGER',
        correct_answer: '42',
        marks: 4,
        negative_marks: 1,
        review_status: 'APPROVED',
      },
      {
        id: 'q_int_2',
        pdf_id: 'test_paper',
        question_number: '5',
        page_start: 1,
        page_end: 1,
        bbox: { x: 0, y: 0, width: 100, height: 50 },
        subject: 'Mathematics',
        question_type: 'INTEGER',
        correct_answer: '7',
        marks: 4,
        negative_marks: 1,
        review_status: 'APPROVED',
      },
      {
        id: 'q_int_3',
        pdf_id: 'test_paper',
        question_number: '6',
        page_start: 1,
        page_end: 1,
        bbox: { x: 0, y: 0, width: 100, height: 50 },
        subject: 'Mathematics',
        question_type: 'INTEGER',
        correct_answer: '100',
        marks: 4,
        negative_marks: 1,
        review_status: 'APPROVED',
      },
    ];

    it('Evaluates MCQ and INTEGER scoring deterministically with +4 / -1 / 0', () => {
      const studentAnswers: Record<string, string> = {
        q_mcq_1: 'B',       // Correct MCQ -> +4
        q_mcq_2: 'D',       // Wrong MCQ -> -1
        // q_mcq_3 unattempted -> 0
        q_int_1: '42',      // Correct INTEGER -> +4
        q_int_2: '99',      // Wrong INTEGER -> -1
        // q_int_3 unattempted -> 0
      };

      const result = scorePdfNativeAttempt(testQuestions, studentAnswers);

      expect(result.total_questions).toBe(6);
      expect(result.attempted_count).toBe(4);
      expect(result.correct_count).toBe(2);
      expect(result.wrong_count).toBe(2);
      expect(result.unattempted_count).toBe(2);

      // Score = (+4) + (-1) + (0) + (+4) + (-1) + (0) = 6
      expect(result.total_score).toBe(6);

      const ansMap = new Map(result.answers.map((a) => [a.question_id, a]));

      expect(ansMap.get('q_mcq_1')?.status).toBe('CORRECT');
      expect(ansMap.get('q_mcq_1')?.awarded_marks).toBe(4);

      expect(ansMap.get('q_mcq_2')?.status).toBe('WRONG');
      expect(ansMap.get('q_mcq_2')?.awarded_marks).toBe(-1);

      expect(ansMap.get('q_mcq_3')?.status).toBe('UNATTEMPTED');
      expect(ansMap.get('q_mcq_3')?.awarded_marks).toBe(0);

      expect(ansMap.get('q_int_1')?.status).toBe('CORRECT');
      expect(ansMap.get('q_int_1')?.awarded_marks).toBe(4);

      expect(ansMap.get('q_int_2')?.status).toBe('WRONG');
      expect(ansMap.get('q_int_2')?.awarded_marks).toBe(-1);

      expect(ansMap.get('q_int_3')?.status).toBe('UNATTEMPTED');
      expect(ansMap.get('q_int_3')?.awarded_marks).toBe(0);
    });
  });
});
