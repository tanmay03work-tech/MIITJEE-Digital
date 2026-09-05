declare const __dirname: string;

describe('Navigator Batch MIITJEE Question Paper & Option Selection Disambiguation Tests', () => {
  // Helper for option selection matching
  function evaluateIsOptionSelected(
    option: string,
    optionIndex: number,
    selectedAnswer: string | null | undefined
  ): boolean {
    const badgeLetter = String.fromCharCode(65 + optionIndex);
    const normSelected = (selectedAnswer || '').trim().replace(/^Option\s+/i, '');
    const isSingleLetter = /^[A-D]$/i.test(normSelected);

    return isSingleLetter
      ? normSelected.toUpperCase() === badgeLetter
      : Boolean(normSelected) &&
          (normSelected.toLowerCase() === (option || '').trim().toLowerCase() ||
            normSelected.toUpperCase() === badgeLetter);
  }

  describe('1. Option Selection Disambiguation Logic', () => {
    test('Selecting badge A does not select Option B whose text is "A"', () => {
      const options = ['Option text 1', 'A', 'Option text 3', 'Option text 4'];
      const selectedAnswer = 'A'; // User clicked Option A

      const isASelected = evaluateIsOptionSelected(options[0] ?? '', 0, selectedAnswer);
      const isBSelected = evaluateIsOptionSelected(options[1] ?? '', 1, selectedAnswer);
      const isCSelected = evaluateIsOptionSelected(options[2] ?? '', 2, selectedAnswer);
      const isDSelected = evaluateIsOptionSelected(options[3] ?? '', 3, selectedAnswer);

      expect(isASelected).toBe(true);
      expect(isBSelected).toBe(false); // Option B has text "A", but should NOT be selected!
      expect(isCSelected).toBe(false);
      expect(isDSelected).toBe(false);
    });

    test('Selecting badge B does not select other options with same numeric text', () => {
      // e.g. (A) 1/3, (B) 1, (C) 1.5, (D) 2
      const options = ['1/3', '1', '1.5', '2'];
      const selectedAnswer = 'B'; // User clicked Option B

      const isASelected = evaluateIsOptionSelected(options[0] ?? '', 0, selectedAnswer);
      const isBSelected = evaluateIsOptionSelected(options[1] ?? '', 1, selectedAnswer);
      const isCSelected = evaluateIsOptionSelected(options[2] ?? '', 2, selectedAnswer);
      const isDSelected = evaluateIsOptionSelected(options[3] ?? '', 3, selectedAnswer);

      expect(isASelected).toBe(false);
      expect(isBSelected).toBe(true);
      expect(isCSelected).toBe(false);
      expect(isDSelected).toBe(false);
    });

    test('Selecting "Option C" correctly highlights only Option C', () => {
      const options = ['Alpha', 'Beta', 'Gamma', 'Delta'];
      const selectedAnswer = 'Option C';

      const isASelected = evaluateIsOptionSelected(options[0] ?? '', 0, selectedAnswer);
      const isBSelected = evaluateIsOptionSelected(options[1] ?? '', 1, selectedAnswer);
      const isCSelected = evaluateIsOptionSelected(options[2] ?? '', 2, selectedAnswer);
      const isDSelected = evaluateIsOptionSelected(options[3] ?? '', 3, selectedAnswer);

      expect(isASelected).toBe(false);
      expect(isBSelected).toBe(false);
      expect(isCSelected).toBe(true);
      expect(isDSelected).toBe(false);
    });

    test('Clear response (null or empty string) selects no options', () => {
      const options = ['10', '20', '30', '40'];
      const selectedAnswer = null;

      expect(evaluateIsOptionSelected(options[0] ?? '', 0, selectedAnswer)).toBe(false);
      expect(evaluateIsOptionSelected(options[1] ?? '', 1, selectedAnswer)).toBe(false);
      expect(evaluateIsOptionSelected(options[2] ?? '', 2, selectedAnswer)).toBe(false);
      expect(evaluateIsOptionSelected(options[3] ?? '', 3, selectedAnswer)).toBe(false);
    });
  });

  describe('2. Navigator Batch MIITJEE Question Paper Completeness & Accuracy', () => {
    let questions: any[] = [];

    beforeAll(() => {
      const fs = require('fs');
      const path = require('path');
      const questionsJsonPath = path.resolve(__dirname, '../../../question paper/extracted/questions.json');
      expect(fs.existsSync(questionsJsonPath)).toBe(true);
      const raw = fs.readFileSync(questionsJsonPath, 'utf-8');
      questions = JSON.parse(raw);
    });

    test('Total questions count is exactly 75', () => {
      expect(questions.length).toBe(75);
    });

    test('Physics questions (Q1–Q25) are structured correctly', () => {
      const physics = questions.filter((q) => q.subject === 'Physics');
      expect(physics.length).toBe(25);

      // Section A: Q1-Q20 (MCQ)
      const secA = physics.filter((q) => q.section.includes('Section A'));
      expect(secA.length).toBe(20);
      secA.forEach((q) => {
        expect(q.type).toBe('MCQ');
        expect(Object.keys(q.options).length).toBe(4);
        expect(['A', 'B', 'C', 'D']).toContain(q.correct_answer);
      });

      // Section B: Q21-Q25 (Numeric)
      const secB = physics.filter((q) => q.section.includes('Section B'));
      expect(secB.length).toBe(5);
      secB.forEach((q) => {
        expect(q.type).toBe('NUMERICAL');
        expect(q.correct_answer).toBeTruthy();
        expect(Number.isNaN(Number(q.correct_answer))).toBe(false);
      });
    });

    test('Chemistry questions (Q26–Q50) are structured correctly', () => {
      const chemistry = questions.filter((q) => q.subject === 'Chemistry');
      expect(chemistry.length).toBe(25);

      // Section A: Q26-Q45 (MCQ)
      const secA = chemistry.filter((q) => q.section.includes('Section A'));
      expect(secA.length).toBe(20);
      secA.forEach((q) => {
        expect(q.type).toBe('MCQ');
        expect(Object.keys(q.options).length).toBe(4);
        expect(['A', 'B', 'C', 'D']).toContain(q.correct_answer);
      });

      // Section B: Q46-Q50 (Numeric)
      const secB = chemistry.filter((q) => q.section.includes('Section B'));
      expect(secB.length).toBe(5);
      secB.forEach((q) => {
        expect(q.type).toBe('NUMERICAL');
        expect(q.correct_answer).toBeTruthy();
      });
    });

    test('Mathematics questions (Q51–Q75) are structured correctly', () => {
      const math = questions.filter((q) => q.subject === 'Mathematics');
      expect(math.length).toBe(25);
      math.forEach((q) => {
        expect(q.type).toBe('MCQ');
        expect(Object.keys(q.options).length).toBe(4);
        expect(['A', 'B', 'C', 'D']).toContain(q.correct_answer);
      });
    });

    test('All 8 diagram questions have associated image assets', () => {
      const diagramQuestions = [1, 12, 16, 17, 18, 20, 22, 23];
      diagramQuestions.forEach((qNum) => {
        const q = questions.find((item) => item.q_num === qNum);
        expect(q).toBeDefined();
        expect(q.images.length).toBeGreaterThan(0);
      });
    });
  });

  describe('3. Open-for-All Weekly Test Submission Validation', () => {
    function canStudentSubmitWeeklyTest(
      test: { type: string; is_open_for_all?: boolean; batch_id?: string | null },
      userProfile: { role: string; batch_id?: string | null }
    ): boolean {
      if (userProfile.role === 'admin') return true;

      if (test.type === 'weekly') {
        const isOpenForAll =
          test.is_open_for_all === true ||
          !test.batch_id ||
          test.batch_id === 'ALL' ||
          test.batch_id.toLowerCase() === 'all batches';

        if (isOpenForAll) {
          return true; // Open for all students regardless of batch
        }

        return Boolean(userProfile.batch_id && userProfile.batch_id === test.batch_id);
      }

      return true;
    }

    test('Allows any student without a batch to submit an Open-for-All weekly test', () => {
      const test = { type: 'weekly', is_open_for_all: true, batch_id: null };
      const student = { role: 'student', batch_id: null };

      expect(canStudentSubmitWeeklyTest(test, student)).toBe(true);
    });

    test('Allows a student in Batch B to submit an Open-for-All weekly test created without batch', () => {
      const test = { type: 'weekly', is_open_for_all: true, batch_id: null };
      const student = { role: 'student', batch_id: 'batch_alpha_2026' };

      expect(canStudentSubmitWeeklyTest(test, student)).toBe(true);
    });

    test('Still restricts a batch-locked weekly test to its assigned batch', () => {
      const test = { type: 'weekly', is_open_for_all: false, batch_id: 'batch_jee_elite' };
      const nonBatchStudent = { role: 'student', batch_id: 'batch_neet_pro' };
      const matchingBatchStudent = { role: 'student', batch_id: 'batch_jee_elite' };

      expect(canStudentSubmitWeeklyTest(test, nonBatchStudent)).toBe(false);
      expect(canStudentSubmitWeeklyTest(test, matchingBatchStudent)).toBe(true);
    });
  });
});
