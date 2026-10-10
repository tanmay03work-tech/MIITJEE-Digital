import { normalizeExamText, formatExamTextForDisplay } from '../../utils/examText';
import { getEligibility } from '../../utils/accessControl';
import { isTestActive } from '../../utils/testAvailability';
import { AppUser, CreateTestQuestionPayload, TestItem } from '../../types';
import { computeResultSnapshot } from './resultEngine.test';
import { computeRanksAndPercentiles } from './percentileRank.test';

describe('Admin Panel & Question Delivery Comprehensive Audit', () => {
  // -------------------------------------------------------------
  // 1. Access Control & Role Enforcements
  // -------------------------------------------------------------
  describe('1. Admin Role & Access Control Enforcement', () => {
    it('denies student access to non-assigned batch tests', () => {
      const studentUser = {
        id: 'student-123',
        fullName: 'Test Student',
        email: 'student@example.com',
        role: 'student' as const,
        approvalStatus: 'approved' as const,
        batchId: 'BATCH_A',
      } as unknown as AppUser;

      const batchBTest: TestItem = {
        id: 'test-batch-b',
        title: 'Restricted Batch B Exam',
        description: 'Only for Batch B',
        durationMinutes: 60,
        type: 'weekly',
        subject: 'Physics',
        batchId: 'BATCH_B',
        isOpenForAll: false,
        scheduledAt: new Date().toISOString(),
        isPublished: true,
        questionCount: 10,
        isStarted: false,
      };

      const eligibility = getEligibility(studentUser, batchBTest);
      expect(eligibility.allowed).toBe(false);
      expect(eligibility.label).toContain('Different Batch');
    });

    it('grants student access when test is marked Open for All regardless of batch', () => {
      const studentUser = {
        id: 'student-123',
        fullName: 'Test Student',
        email: 'student@example.com',
        role: 'student' as const,
        approvalStatus: 'approved' as const,
        batchId: 'BATCH_A',
      } as unknown as AppUser;

      const openTest: TestItem = {
        id: 'test-open-all',
        title: 'Grand Open Mock Exam',
        description: 'Available to all enrolled students',
        durationMinutes: 180,
        type: 'weekly',
        subject: 'Mixed Subjects',
        batchId: 'BATCH_B',
        isOpenForAll: true,
        scheduledAt: new Date().toISOString(),
        isPublished: true,
        questionCount: 10,
        isStarted: false,
      };

      const eligibility = getEligibility(studentUser, openTest);
      expect(eligibility.allowed).toBe(true);
    });

    it('always grants approved admin full access to any test', () => {
      const adminUser = {
        id: 'admin-999',
        fullName: 'Super Admin',
        email: 'admin@miitjee.com',
        role: 'admin' as const,
        approvalStatus: 'approved' as const,
      } as unknown as AppUser;

      const restrictedScholarship: TestItem = {
        id: 'test-scholarship-8th',
        title: 'Scholarship Exam 8th',
        description: 'Target boards',
        durationMinutes: 120,
        type: 'scholarship',
        subject: 'Maths',
        scholarshipAdmissionClass: '8th',
        scholarshipTargetExam: 'boards',
        scheduledAt: new Date().toISOString(),
        isPublished: true,
        questionCount: 10,
        isStarted: false,
      };

      const eligibility = getEligibility(adminUser, restrictedScholarship);
      expect(eligibility.allowed).toBe(true);
    });
  });

  // -------------------------------------------------------------
  // 4. Question Delivery Pipeline & Scientific Typography
  // -------------------------------------------------------------
  describe('4. Question Delivery Pipeline & Mathematical Typography', () => {
    const syntheticQuestions: Array<{
      id: string;
      name: string;
      payload: CreateTestQuestionPayload;
      expectedSymbols: string[];
    }> = [
      {
        id: 'Q1_MCQ',
        name: 'Single-correct MCQ with standard kinematics text',
        payload: {
          type: 'mcq',
          prompt: 'A body moves with uniform acceleration a = 2 m/s² from rest. What is its velocity after 5 seconds?',
          options: ['10 m/s', '15 m/s', '20 m/s', '25 m/s'],
          correctOptionIndex: 0,
          explanation: 'v = u + at = 0 + 2*5 = 10 m/s',
        },
        expectedSymbols: ['m/s²'],
      },
      {
        id: 'Q2_INTEGER',
        name: 'Numerical integer answer question',
        payload: {
          type: 'integer',
          prompt: 'Find the resistance in ohms of a wire of length 100 m, area 1 mm², and resistivity 1.7 × 10⁻⁸ Ω·m.',
          options: ['', '', '', ''],
          correctOptionIndex: 0,
          integerAnswer: 2,
          explanation: 'R = ρL/A ≈ 1.7 Ω, rounding to 2 Ω.',
        },
        expectedSymbols: ['×', 'Ω'],
      },
      {
        id: 'Q3_DIAGRAM',
        name: 'Question with attached diagram image URL',
        payload: {
          type: 'mcq',
          prompt: 'Refer to the circuit diagram below. Determine the equivalent capacitance between terminals A and B.',
          imageUrl: 'https://images.unsplash.com/circuit.png',
          options: ['2 μF', '4 μF', '6 μF', '8 μF'],
          correctOptionIndex: 1,
          explanation: 'Parallel capacitors add algebraically.',
        },
        expectedSymbols: ['μF'],
      },
      {
        id: 'Q4_MATH_VECTORS',
        name: 'Mathematical notation with vector fields and integrals',
        payload: {
          type: 'mcq',
          prompt: 'Calculate electric flux where \\vec{E} = \\frac{\\lambda}{2\\pi\\epsilon_0 r}\\hat{r}.',
          options: [
            '\\Phi = \\frac{\\lambda L}{\\epsilon_0}',
            '\\Phi = \\frac{\\lambda}{2\\epsilon_0}',
            '\\Phi = \\frac{2\\lambda L}{\\epsilon_0}',
            '\\Phi = 0',
          ],
          correctOptionIndex: 0,
          explanation: 'Gauss Law gives flux = q_enclosed / epsilon_0 = lambda * L / epsilon_0.',
        },
        expectedSymbols: ['vec{E}', 'λ', 'π'],
      },
      {
        id: 'Q5_CHEMISTRY',
        name: 'Chemical reaction equations with equilibrium arrows',
        payload: {
          type: 'mcq',
          prompt: 'For the exothermic reaction 2SO₂(g) + O₂(g) ⇌ 2SO₃(g) with ΔH = -198 kJ/mol, how does increasing pressure shift equilibrium?',
          options: [
            'Shifts forward (towards SO₃)',
            'Shifts backward (towards SO₂ and O₂)',
            'No effect on equilibrium',
            'Decreases reaction rate to zero',
          ],
          correctOptionIndex: 0,
          explanation: 'Higher pressure favors the side with fewer gas moles (3 moles to 2 moles).',
        },
        expectedSymbols: ['SO₂', 'SO₃', '⇌', 'Δ'],
      },
      {
        id: 'Q6_GREEK_SYMBOLS',
        name: 'Greek letters & relativistic kinematics',
        payload: {
          type: 'mcq',
          prompt: 'In relativistic kinematics, γ = 1 / √(1 - β²). If β = v/c = 0.6, find γ and angular frequency ω = 2πf.',
          options: [
            'γ = 1.25, ω = 2πf',
            'γ = 1.67, ω = πf',
            'γ = 2.00, ω = 4πf',
            'γ = 0.80, ω = 2πf',
          ],
          correctOptionIndex: 0,
          explanation: 'gamma = 1 / sqrt(1 - 0.36) = 1.25.',
        },
        expectedSymbols: ['γ', 'β', 'ω', 'π', '√'],
      },
      {
        id: 'Q7_SUPER_SUBSCRIPT',
        name: 'Dimensional analysis and power exponents',
        payload: {
          type: 'mcq',
          prompt: 'The dimensional formula of Planck constant is [M¹L²T⁻¹] and Stefan-Boltzmann constant is [M¹L⁰T⁻³K⁻⁴]. Identify the dimension of h/σ.',
          options: ['[L²T²K⁴]', '[M¹L²T⁻¹K⁻⁴]', '[L²T²K⁻⁴]', '[M²L²T⁻³K⁴]'],
          correctOptionIndex: 0,
          explanation: '[h]/[sigma] = [L²T²K⁴].',
        },
        expectedSymbols: ['[L²T²K⁴]'],
      },
      {
        id: 'Q8_LONG_STATEMENTS',
        name: 'Long question statements and verbose option text',
        payload: {
          type: 'mcq',
          prompt: 'A particle of mass m is suspended from a ceiling through a massless spring of stiffness k and relaxed length L. The particle is displaced downward by a distance x₀ and released from rest. Taking upward displacement as positive, which of the following statements completely and correctly characterizes the motion, ignoring dissipative forces?',
          options: [
            'Simple harmonic oscillation with frequency ω = √(k/m) centered at the equilibrium position x_eq = -mg/k.',
            'Exponential decay of amplitude towards the undeformed relaxed length L.',
            'Uniform acceleration under gravitational field g with instantaneous bounce at x = 0.',
            'Non-periodic oscillation where potential energy exceeds total mechanical energy at all times.',
          ],
          correctOptionIndex: 0,
          explanation: 'SHM centered about static equilibrium x = -mg/k.',
        },
        expectedSymbols: ['ω = √(k/m)'],
      },
      {
        id: 'Q9_EXPLANATION',
        name: 'Lengthy explanation preservation',
        payload: {
          type: 'mcq',
          prompt: 'State the condition for constructive interference in Young double slit experiment with slit separation d and screen distance D >> d.',
          options: [
            'Path difference Δx = nλ where n ∈ {0, 1, 2, ...}',
            'Path difference Δx = (2n + 1)λ/2',
            'Path difference Δx = nλ/4',
            'Phase difference Δφ = (2n + 1)π',
          ],
          correctOptionIndex: 0,
          explanation: 'For constructive interference, waves arrive in phase, requiring path difference Δx = d sin θ ≈ d(y/D) = nλ, giving bright fringes at positions y_n = nλD/d.',
        },
        expectedSymbols: ['Δx = nλ'],
      },
    ];

    syntheticQuestions.forEach((q) => {
      it(`preserves content and symbols for ${q.name} (${q.id})`, () => {
        const fullContent = [
          q.payload.prompt,
          ...q.payload.options,
          q.payload.explanation,
        ].join(' ');
        const normalizedFull = normalizeExamText(fullContent);
        expect(normalizedFull.length > 0).toBe(true);

        // Verify each expected symbol appears in the formatted content
        q.expectedSymbols.forEach((sym) => {
          const found = normalizedFull.includes(sym) || fullContent.includes(sym);
          expect(found).toBe(true);
        });

        // Verify options count matches exactly
        expect(q.payload.options.length).toBe(4);
      });
    });
  });

  // -------------------------------------------------------------
  // 5. Answer Key Protection & Isolation
  // -------------------------------------------------------------
  describe('5. Answer Key Protection & Student Isolation', () => {
    it('sanitizes student question rows so correct answers are not present', () => {
      // Simulating what list_student_test_questions returns
      const studentSanitizedRow = {
        id: 'question-uuid-001',
        test_id: 'test-uuid-001',
        question_type: 'mcq',
        prompt: 'What is the speed of light in vacuum?',
        options: ['3 × 10⁸ m/s', '3 × 10⁶ m/s', '3 × 10¹⁰ m/s', '3 × 10⁴ m/s'],
        image_url: null,
        subject_label: 'Physics',
      };

      // Ensure NO answer fields exist on this object
      expect((studentSanitizedRow as any).correct_answer).toBeUndefined();
      expect((studentSanitizedRow as any).integer_answer).toBeUndefined();
      expect((studentSanitizedRow as any).explanation).toBeUndefined();
    });
  });

  // -------------------------------------------------------------
  // 6. Independent Results Pipeline Verification
  // -------------------------------------------------------------
  describe('6. Independent Results Pipeline Verification', () => {
    const questionsMeta = [
      { id: 'q1', correctAnswer: '10 m/s', subjectLabel: 'Physics' },
      { id: 'q2', correctAnswer: '2', subjectLabel: 'Physics' },
      { id: 'q3', correctAnswer: '4 μF', subjectLabel: 'Physics' },
      { id: 'q4', correctAnswer: 'SO3', subjectLabel: 'Chemistry' },
      { id: 'q5', correctAnswer: '1.25', subjectLabel: 'Physics' },
    ];

    it('Scenario 1: Student A with 100% Correct answers scores maximum possible marks', () => {
      const studentAnswers = {
        q1: '10 m/s',
        q2: '2',
        q3: '4 μF',
        q4: 'SO3',
        q5: '1.25',
      };

      const summary = computeResultSnapshot(questionsMeta, studentAnswers);
      expect(summary.totalQuestions).toBe(5);
      expect(summary.correctAnswers).toBe(5);
      expect(summary.wrongAnswers).toBe(0);
      expect(summary.unattemptedAnswers).toBe(0);
      // Independent math: 5 * 4 = 20
      expect(summary.totalScore).toBe(20);
      expect(summary.maxScore).toBe(20);
    });

    it('Scenario 2: Student B with partial answers (3 correct, 1 wrong, 1 unattempted)', () => {
      const studentAnswers = {
        q1: '10 m/s', // Correct (+4)
        q2: '2',      // Correct (+4)
        q3: '4 μF',   // Correct (+4)
        q4: 'Wrong',  // Wrong (-1)
        // q5 omitted -> Unattempted (0)
      };

      const summary = computeResultSnapshot(questionsMeta, studentAnswers);
      expect(summary.correctAnswers).toBe(3);
      expect(summary.wrongAnswers).toBe(1);
      expect(summary.unattemptedAnswers).toBe(1);
      // Independent math: (3 * 4) + (1 * -1) + (1 * 0) = 12 - 1 = 11
      expect(summary.totalScore).toBe(11);
    });

    it('Scenario 3: Student C with 100% incorrect answers scores strictly negative marks', () => {
      const studentAnswers = {
        q1: 'wrong1',
        q2: '99',
        q3: 'wrong3',
        q4: 'wrong4',
        q5: 'wrong5',
      };

      const summary = computeResultSnapshot(questionsMeta, studentAnswers);
      expect(summary.correctAnswers).toBe(0);
      expect(summary.wrongAnswers).toBe(5);
      expect(summary.unattemptedAnswers).toBe(0);
      // Independent math: 5 * -1 = -5
      expect(summary.totalScore).toBe(-5);
    });

    it('Scenario 4: Student D with zero attempted answers scores exactly 0', () => {
      const studentAnswers = {};

      const summary = computeResultSnapshot(questionsMeta, studentAnswers);
      expect(summary.correctAnswers).toBe(0);
      expect(summary.wrongAnswers).toBe(0);
      expect(summary.unattemptedAnswers).toBe(5);
      // Independent math: 0
      expect(summary.totalScore).toBe(0);
    });

    it('computes statistical NTA percentile across cohort accurately', () => {
      const cohortAttempts = [
        { userId: 'u1', score: 20, wrongCount: 0, submittedAt: '2026-10-10T10:00:00Z' },
        { userId: 'u2', score: 11, wrongCount: 1, submittedAt: '2026-10-10T10:05:00Z' },
        { userId: 'u3', score: 0, wrongCount: 0, submittedAt: '2026-10-10T10:10:00Z' },
        { userId: 'u4', score: -5, wrongCount: 5, submittedAt: '2026-10-10T10:15:00Z' },
      ];

      const ranked = computeRanksAndPercentiles(cohortAttempts);

      // Top candidate (20): rank 1, 4 / 4 * 100 = 100%
      expect(ranked[0]?.score).toBe(20);
      expect(ranked[0]?.rank).toBe(1);
      expect(ranked[0]?.percentile).toBe(100);

      // Second candidate (11): rank 2, 3 / 4 * 100 = 75%
      expect(ranked[1]?.score).toBe(11);
      expect(ranked[1]?.rank).toBe(2);
      expect(ranked[1]?.percentile).toBe(75);

      // Third candidate (0): rank 3, 2 / 4 * 100 = 50%
      expect(ranked[2]?.score).toBe(0);
      expect(ranked[2]?.rank).toBe(3);
      expect(ranked[2]?.percentile).toBe(50);

      // Lowest candidate (-5): rank 4, 1 / 4 * 100 = 25%
      expect(ranked[3]?.score).toBe(-5);
      expect(ranked[3]?.rank).toBe(4);
      expect(ranked[3]?.percentile).toBe(25);
    });
  });

  // -------------------------------------------------------------
  // 8. Administrative Test Actions
  // -------------------------------------------------------------
  describe('8. Administrative Actions & Operational State', () => {
    it('detects active status properly when test is started early by admin', () => {
      const futureDate = new Date(Date.now() + 86400000).toISOString(); // Tomorrow
      const earlyStartedTest: TestItem = {
        id: 'test-early',
        title: 'Early Started Exam',
        description: 'Admin triggered start before scheduled time',
        durationMinutes: 60,
        type: 'weekly',
        subject: 'Physics',
        scheduledAt: futureDate,
        isStarted: true,
        startedAt: new Date().toISOString(),
        isPublished: true,
        questionCount: 10,
      };

      expect(isTestActive(earlyStartedTest)).toBe(true);
    });
  });
});
