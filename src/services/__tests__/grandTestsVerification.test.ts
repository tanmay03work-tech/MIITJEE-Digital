import { describe, it, expect, beforeEach } from '@jest/globals';
import {
  BOOSTER_BATCH_TEST_ID,
  BOOSTER_BATCH_TEST_ITEM,
  getBoosterBatchQuestions,
  getGrandTestQuestions,
  getNavigatorBatchQuestions,
  isBoosterBatchTest,
  isGrandTest,
  isNavigatorBatchTest,
  NAVIGATOR_BATCH_TEST_ID,
  NAVIGATOR_BATCH_TEST_ITEM,
} from '../api/publishedGrandTests';
import { fetchQuestions, fetchTests, resolveExamLink, submitAttempt } from '../api/tests';
import { useAuthStore } from '../../store/authStore';
import { getEligibility } from '../../utils/accessControl';
import { calculateFullLeaderboardAndRanks, generateFullResultsCsv } from '../../utils/excelExporter';

describe('Navigator and Booster Batch Grand Tests Comprehensive Verification', () => {
  beforeEach(() => {
    useAuthStore.setState({
      user: {
        id: 'student_tester',
        email: 'student@example.com',
        fullName: 'Test Candidate',
        role: 'student',
        approvalStatus: 'approved',
        targetExam: 'JEE',
        classLabel: '12th',
        rank: 1,
        averageScore: 100,
        streakDays: 1,
        avatarSeed: 'seed1',
      },
    });
  });

  describe('1. Question Paper Structure and Extraction Accuracy', () => {
    it('Navigator Batch Question Paper has exactly 75 questions: 25 Physics, 25 Chemistry, 25 Mathematics', () => {
      const questions = getNavigatorBatchQuestions();
      expect(questions.length).toBe(75);

      const physics = questions.filter((q) => q.subjectLabel === 'Physics');
      const chemistry = questions.filter((q) => q.subjectLabel === 'Chemistry');
      const maths = questions.filter((q) => q.subjectLabel === 'Mathematics');

      expect(physics.length).toBe(25);
      expect(chemistry.length).toBe(25);
      expect(maths.length).toBe(25);

      // Verify Diagrams extracted
      const withDiagrams = questions.filter((q) => Boolean(q.imageUrl));
      expect(withDiagrams.length).toBeGreaterThanOrEqual(8);
      expect(withDiagrams[0]!.imageUrl).toMatch(/^data:image\/png;base64,/);
    });

    it('Booster Batch Question Paper has exactly 180 questions: 45 Physics, 45 Chemistry, 90 Biology', () => {
      const questions = getBoosterBatchQuestions();
      expect(questions.length).toBe(180);

      const physics = questions.filter((q) => q.subjectLabel === 'Physics');
      const chemistry = questions.filter((q) => q.subjectLabel === 'Chemistry');
      const biology = questions.filter((q) => q.subjectLabel === 'Biology');

      expect(physics.length).toBe(45);
      expect(chemistry.length).toBe(45);
      expect(biology.length).toBe(90);

      // Verify Diagrams extracted
      const withDiagrams = questions.filter((q) => Boolean(q.imageUrl));
      expect(withDiagrams.length).toBeGreaterThanOrEqual(15);
      expect(withDiagrams[0]!.imageUrl).toMatch(/^data:image\/png;base64,/);
    });
  });

  describe('2. Open For All Access Control & Identification', () => {
    it('Identifies Navigator and Booster tests as Grand Tests with Open For All permissions', () => {
      expect(isGrandTest(NAVIGATOR_BATCH_TEST_ID)).toBe(true);
      expect(isGrandTest(BOOSTER_BATCH_TEST_ID)).toBe(true);
      expect(isNavigatorBatchTest(NAVIGATOR_BATCH_TEST_ID)).toBe(true);
      expect(isBoosterBatchTest(BOOSTER_BATCH_TEST_ID)).toBe(true);

      const user = useAuthStore.getState().user;
      const navEligibility = getEligibility(user, NAVIGATOR_BATCH_TEST_ITEM);
      const boosterEligibility = getEligibility(user, BOOSTER_BATCH_TEST_ITEM);

      expect(navEligibility.allowed).toBe(true);
      expect(navEligibility.label).toBe('Open For All');
      expect(boosterEligibility.allowed).toBe(true);
      expect(boosterEligibility.label).toBe('Open For All');
    });

    it('Resolves share codes NAVIGTR1 and BOOSTER1 directly', async () => {
      const navRes = await resolveExamLink('NAVIGTR1');
      expect(navRes.status).toBe('VALID');
      expect(navRes.test?.id).toBe(NAVIGATOR_BATCH_TEST_ID);

      const boosterRes = await resolveExamLink('BOOSTER1');
      expect(boosterRes.status).toBe('VALID');
      expect(boosterRes.test?.id).toBe(BOOSTER_BATCH_TEST_ID);
    });
  });

  describe('3. Fetching and Test Delivery', () => {
    it('fetchTests returns cleanly without forced hardcoded grand tests', async () => {
      const allTests = await fetchTests();
      const ids = allTests.map((t) => t.id);

      expect(ids).not.toContain(NAVIGATOR_BATCH_TEST_ID);
      expect(ids).not.toContain(BOOSTER_BATCH_TEST_ID);
    });

    it('fetchQuestions loads complete 75 questions for Navigator and 180 questions for Booster', async () => {
      const navQuestions = await fetchQuestions(NAVIGATOR_BATCH_TEST_ID);
      expect(navQuestions.length).toBe(75);

      const boosterQuestions = await fetchQuestions(BOOSTER_BATCH_TEST_ID);
      expect(boosterQuestions.length).toBe(180);
    });
  });

  describe('4. Submission, Scoring, Subject Breakdown and Admin CSV Export', () => {
    it('Submits Navigator Batch exam and computes correct subject scorecard and marks (+4 / -1)', async () => {
      const questions = getNavigatorBatchQuestions();
      const answers: Record<string, string> = {};

      // Attempt first 5 Physics correct, 1 wrong, rest unattempted
      answers[questions[0]!.id] = questions[0]!.correctAnswer;
      answers[questions[1]!.id] = questions[1]!.correctAnswer;
      answers[questions[2]!.id] = questions[2]!.correctAnswer;
      answers[questions[3]!.id] = questions[3]!.correctAnswer;
      answers[questions[4]!.id] = questions[4]!.correctAnswer;
      answers[questions[5]!.id] = 'WRONG_ANSWER';

      const response = await submitAttempt({
        testId: NAVIGATOR_BATCH_TEST_ID,
        userId: 'student_tester',
        studentName: 'Test Candidate',
        answers,
      });

      expect(response.result.correctAnswers).toBe(5);
      expect(response.result.wrongAnswers).toBe(1);
      expect(response.result.unattempted).toBe(69);
      expect(response.result.totalQuestions).toBe(75);
      // 5 * 4 - 1 * 1 = 19
      expect(response.result.score).toBe(19);
    });

    it('Submits Booster Batch exam and generates complete CSV export with per-subject columns', async () => {
      const questions = getBoosterBatchQuestions();
      const answers: Record<string, string> = {};

      // Attempt 10 correct answers
      for (let i = 0; i < 10; i++) {
        answers[questions[i]!.id] = questions[i]!.correctAnswer;
      }

      const response = await submitAttempt({
        testId: BOOSTER_BATCH_TEST_ID,
        userId: 'student_tester',
        studentName: 'Candidate NEET',
        answers,
      });

      expect(response.result.correctAnswers).toBe(10);
      expect(response.result.wrongAnswers).toBe(0);
      expect(response.result.unattempted).toBe(170);
      expect(response.result.score).toBe(40);

      // Verify Admin CSV export columns
      const rawRow = {
        studentId: 'student_tester',
        studentName: 'Candidate NEET',
        examTitle: BOOSTER_BATCH_TEST_ITEM.title,
        attemptStatus: 'Completed',
        physics: { correct: 10, wrong: 0, unattempted: 35, score: 40 },
        chemistry: { correct: 0, wrong: 0, unattempted: 45, score: 0 },
        mathsBio: { correct: 0, wrong: 0, unattempted: 90, score: 0 },
        submittedAt: new Date().toISOString(),
      };

      const ranked = calculateFullLeaderboardAndRanks([rawRow]);
      const csv = generateFullResultsCsv(ranked);

      expect(csv).toContain('Physics Correct,Physics Wrong,Physics Unattempted,Physics Score');
      expect(csv).toContain('Chemistry Correct,Chemistry Wrong,Chemistry Unattempted,Chemistry Score');
      expect(csv).toContain('Maths/Bio Correct,Maths/Bio Wrong,Maths/Bio Unattempted,Maths/Bio Score');
      expect(csv).toContain('Total Correct,Total Wrong,Total Unattempted,Total Score,Percentile,Submitted At');
      expect(csv).toContain('Candidate NEET');
      expect(csv).toContain('40');
    });
  });
});
