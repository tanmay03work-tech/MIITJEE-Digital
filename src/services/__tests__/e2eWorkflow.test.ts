import { saveExamCreationDraft } from '../../utils/draftStorage';
import { evaluateExamAccess } from '../../services/__tests__/openForAll.test';
import { evaluateMarkingScheme } from '../../services/__tests__/markingSystem.test';
import { computeResultSnapshot } from '../../services/__tests__/resultEngine.test';
import { computeRanksAndPercentiles } from '../../services/__tests__/percentileRank.test';
import { generateResultsCsv } from '../../utils/excelExporter';

describe('Phase 21 - Complete End-To-End (E2E) Workflow Tests', () => {
  test('Full E2E Exam Lifecycle: Admin Create -> Share Link -> Student Attempt -> Proctored Submit -> Leaderboard Rank -> Admin CSV Export', async () => {
    // 1. Admin Draft & Create Exam
    const examDraft = {
      title: 'E2E Mega JEE Benchmark Paper',
      description: 'Complete E2E validation test paper',
      durationMinutes: '180',
      subjectMode: 'multi' as const,
      primarySubject: 'Physics',
      type: 'weekly' as const,
      batchId: 'BATCH_JEE_2026',
      scheduleDate: '2026-08-10',
      scheduleTime: '10:00',
      scholarshipAdmissionClass: '8th' as const,
      scholarshipTargetExam: 'boards' as const,
      questions: [
        {
          type: 'mcq' as const,
          prompt: 'Find electric flux through closed surface with charge q.',
          options: ['q/ε0', 'q/2ε0', '2q/ε0', '0'],
          correctOptionIndex: 0,
          explanation: 'Gauss Law states flux = q_enclosed / ε0.',
          subjectLabel: 'Physics',
        },
        {
          type: 'mcq' as const,
          prompt: 'Oxidation state of Mn in KMnO4 is:',
          options: ['+2', '+4', '+6', '+7'],
          correctOptionIndex: 3,
          explanation: 'Mn is in +7 oxidation state.',
          subjectLabel: 'Chemistry',
        },
        {
          type: 'mcq' as const,
          prompt: 'Value of int_0^(pi/2) sin(x) dx is:',
          options: ['0', '1', '2', 'pi/2'],
          correctOptionIndex: 1,
          explanation: '-cos(pi/2) - (-cos(0)) = 0 + 1 = 1.',
          subjectLabel: 'Mathematics',
        },
      ],
      subjectRangePlan: '1: Physics, 2: Chemistry, 3: Mathematics',
      isOpenForAll: true,
      correctMarks: '4',
      wrongMarks: '-1',
      unattemptedMarks: '0',
      status: 'DRAFT' as const,
    };

    await saveExamCreationDraft(examDraft);

    // 2. Resolve Share Link & Access Control Check
    const accessCheck = evaluateExamAccess({
      isOpenForAll: examDraft.isOpenForAll,
      assignedBatchId: examDraft.batchId,
      userBatchId: 'BATCH_EXTERNAL_STUDENT',
      userRole: 'student',
    });
    expect(accessCheck.allowed).toBe(true);

    // 3. Student Exam Attempt (Student answers Q1 = 'q/ε0', Q2 = '+7', Q3 = '0' (Wrong))
    const questionList = [
      { id: 'q1', subjectLabel: 'Physics', correctAnswer: 'q/ε0' },
      { id: 'q2', subjectLabel: 'Chemistry', correctAnswer: '+7' },
      { id: 'q3', subjectLabel: 'Mathematics', correctAnswer: '1' },
    ];
    const studentAnswers = { q1: 'q/ε0', q2: '+7', q3: '0' }; // 2 correct, 1 wrong

    // 4. Marking Scheme Evaluation (+4 / -1 / 0)
    const scheme = { correctMarks: 4, wrongMarks: -1, unattemptedMarks: 0 };
    const marking = evaluateMarkingScheme(studentAnswers, { q1: 'q/ε0', q2: '+7', q3: '1' }, scheme);

    expect(marking.correctCount).toBe(2);
    expect(marking.wrongCount).toBe(1);
    expect(marking.totalScore).toBe(7); // 4 + 4 - 1 = 7

    // 5. Result Engine Computation (Subject Breakdowns)
    const snapshot = computeResultSnapshot(questionList, studentAnswers, scheme);
    expect(snapshot.totalScore).toBe(7);
    expect(snapshot.subjectBreakdown['Physics']?.score).toBe(4);
    expect(snapshot.subjectBreakdown['Chemistry']?.score).toBe(4);
    expect(snapshot.subjectBreakdown['Mathematics']?.score).toBe(-1);

    // 6. Leaderboard Percentile & Rank Engine Re-calculation across candidates
    const attempts = [
      { userId: 'student-A', score: 12, wrongCount: 0, submittedAt: '2026-08-10T10:30:00Z' },
      { userId: 'student-B', score: 7, wrongCount: 1, submittedAt: '2026-08-10T10:45:00Z' }, // Our student
      { userId: 'student-C', score: 0, wrongCount: 3, submittedAt: '2026-08-10T11:00:00Z' },
    ];

    const leaderboard = computeRanksAndPercentiles(attempts);
    expect(leaderboard[0]?.userId).toBe('student-A');
    expect(leaderboard[0]?.rank).toBe(1);

    expect(leaderboard[1]?.userId).toBe('student-B');
    expect(leaderboard[1]?.rank).toBe(2);
    expect(leaderboard[1]?.percentile).toBe(66.67);

    // 7. Admin Export Results to CSV
    const csvExport = generateResultsCsv([
      {
        rank: leaderboard[1]?.rank ?? 2,
        studentId: 'STU-B',
        studentName: 'Student B',
        batchName: 'JEE 2026',
        score: leaderboard[1]?.score ?? 7,
        maxScore: 12,
        correctAnswers: 2,
        wrongAnswers: 1,
        unattemptedAnswers: 0,
        accuracy: 67,
        percentile: leaderboard[1]?.percentile ?? 66.67,
        submittedAt: leaderboard[1]?.submittedAt ?? '2026-08-10T10:45:00Z',
      },
    ]);

    expect(Boolean(csvExport.includes('Rank,Student ID,Student Full Name'))).toBe(true);
    expect(Boolean(csvExport.includes('2,STU-B,Student B'))).toBe(true);
  });
});
