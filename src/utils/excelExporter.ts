export interface SubjectScoreBreakdown {
  correct: number;
  wrong: number;
  unattempted: number;
  score: number;
}

export interface FullStudentResultExportRow {
  studentId: string;
  studentName: string;
  examTitle: string;
  attemptStatus: string;
  physics: SubjectScoreBreakdown;
  chemistry: SubjectScoreBreakdown;
  mathsBio: SubjectScoreBreakdown;
  totalCorrect: number;
  totalWrong: number;
  totalUnattempted: number;
  totalScore: number;
  percentile: number;
  rank: number;
  submittedAt: string;
}

export interface LegacyExportRecord {
  rank: number;
  studentId: string;
  studentName: string;
  batchName: string;
  score: number;
  maxScore: number;
  correctAnswers: number;
  wrongAnswers: number;
  unattemptedAnswers: number;
  accuracy: number;
  percentile: number;
  submittedAt: string;
}

export function escapeCsvValue(val: string | number | undefined | null): string {
  if (val === undefined || val === null) return '""';
  const str = String(val);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/**
 * Computes exact N-based percentile:
 * Percentile = (Count of candidates with score <= candidate_score / total_candidates) * 100.0
 * 
 * Computes rank with tie-breaking rules:
 * 1. Total Score DESC
 * 2. Wrong Count ASC (fewer negative marks)
 * 3. Subject scores (Physics DESC, Chemistry DESC, Maths/Bio DESC)
 * 4. SubmittedAt ASC (earlier submission)
 */
export function calculateFullLeaderboardAndRanks(
  rawResults: Array<{
    studentId: string;
    studentName: string;
    examTitle: string;
    attemptStatus: string;
    physics: SubjectScoreBreakdown;
    chemistry: SubjectScoreBreakdown;
    mathsBio: SubjectScoreBreakdown;
    submittedAt: string;
  }>
): FullStudentResultExportRow[] {
  const candidateCount = rawResults.length;
  if (candidateCount === 0) return [];

  // Compute total scores & wrong counts
  const processed = rawResults.map((r) => {
    const totalCorrect = r.physics.correct + r.chemistry.correct + r.mathsBio.correct;
    const totalWrong = r.physics.wrong + r.chemistry.wrong + r.mathsBio.wrong;
    const totalUnattempted = r.physics.unattempted + r.chemistry.unattempted + r.mathsBio.unattempted;
    const totalScore = r.physics.score + r.chemistry.score + r.mathsBio.score;

    return {
      ...r,
      totalCorrect,
      totalWrong,
      totalUnattempted,
      totalScore,
    };
  });

  // Sort candidates strictly by tie-breaker rules
  const sorted = [...processed].sort((a, b) => {
    // 1. Total score DESC
    if (b.totalScore !== a.totalScore) return b.totalScore - a.totalScore;
    // 2. Wrong count ASC (fewer wrong is better)
    if (a.totalWrong !== b.totalWrong) return a.totalWrong - b.totalWrong;
    // 3. Physics score DESC
    if (b.physics.score !== a.physics.score) return b.physics.score - a.physics.score;
    // 4. Chemistry score DESC
    if (b.chemistry.score !== a.chemistry.score) return b.chemistry.score - a.chemistry.score;
    // 5. Maths/Bio score DESC
    if (b.mathsBio.score !== a.mathsBio.score) return b.mathsBio.score - a.mathsBio.score;
    // 6. SubmittedAt ASC (earlier submission)
    return new Date(a.submittedAt).getTime() - new Date(b.submittedAt).getTime();
  });

  // Calculate N-based percentile and rank
  return sorted.map((candidate, idx) => {
    const rank = idx + 1;

    // Count candidates with score <= candidate.totalScore
    const countLessThanOrEqual = processed.filter((other) => other.totalScore <= candidate.totalScore).length;
    const rawPercentile = (countLessThanOrEqual / candidateCount) * 100.0;
    const percentile = Math.round(rawPercentile * 100) / 100;

    return {
      ...candidate,
      rank,
      percentile,
    };
  });
}

export function generateFullResultsCsv(rows: FullStudentResultExportRow[]): string {
  const headers = [
    'Rank',
    'Student ID',
    'Student Full Name',
    'Exam Title',
    'Attempt Status',
    'Physics Correct',
    'Physics Wrong',
    'Physics Unattempted',
    'Physics Score',
    'Chemistry Correct',
    'Chemistry Wrong',
    'Chemistry Unattempted',
    'Chemistry Score',
    'Maths/Bio Correct',
    'Maths/Bio Wrong',
    'Maths/Bio Unattempted',
    'Maths/Bio Score',
    'Total Correct',
    'Total Wrong',
    'Total Unattempted',
    'Total Score',
    'Percentile',
    'Submitted At',
  ];

  const lines = [headers.map(escapeCsvValue).join(',')];

  rows.forEach((r) => {
    const rowValues = [
      r.rank,
      r.studentId,
      r.studentName,
      r.examTitle,
      r.attemptStatus,
      r.physics.correct,
      r.physics.wrong,
      r.physics.unattempted,
      r.physics.score,
      r.chemistry.correct,
      r.chemistry.wrong,
      r.chemistry.unattempted,
      r.chemistry.score,
      r.mathsBio.correct,
      r.mathsBio.wrong,
      r.mathsBio.unattempted,
      r.mathsBio.score,
      r.totalCorrect,
      r.totalWrong,
      r.totalUnattempted,
      r.totalScore,
      r.percentile,
      r.submittedAt,
    ];
    lines.push(rowValues.map(escapeCsvValue).join(','));
  });

  return lines.join('\n');
}

export function generateResultsCsv(records: LegacyExportRecord[]): string {
  const headers = [
    'Rank',
    'Student ID',
    'Student Full Name',
    'Batch Name',
    'Total Score',
    'Max Score',
    'Correct Answers',
    'Wrong Answers',
    'Unattempted Answers',
    'Accuracy (%)',
    'Percentile',
    'Submitted At',
  ];

  const lines = [headers.map(escapeCsvValue).join(',')];

  records.forEach((record) => {
    const row = [
      record.rank,
      record.studentId,
      record.studentName,
      record.batchName,
      record.score,
      record.maxScore,
      record.correctAnswers,
      record.wrongAnswers,
      record.unattemptedAnswers,
      record.accuracy,
      record.percentile,
      record.submittedAt,
    ];
    lines.push(row.map(escapeCsvValue).join(','));
  });

  return lines.join('\n');
}

export interface SubjectAwareExportRow {
  studentId: string;
  studentName: string;
  examTitle: string;
  attemptStatus: string;
  subjectScores: Record<string, SubjectScoreBreakdown>;
  totalCorrect: number;
  totalWrong: number;
  totalUnattempted: number;
  totalScore: number;
  percentile: number;
  rank: number;
  submittedAt: string;
}

export function calculateSubjectAwareRanks(
  rawResults: Array<{
    studentId: string;
    studentName: string;
    examTitle: string;
    attemptStatus: string;
    subjectScores: Record<string, SubjectScoreBreakdown>;
    submittedAt: string;
  }>
): SubjectAwareExportRow[] {
  const candidateCount = rawResults.length;
  if (candidateCount === 0) return [];

  const processed = rawResults.map((r) => {
    let totalCorrect = 0;
    let totalWrong = 0;
    let totalUnattempted = 0;
    let totalScore = 0;

    Object.values(r.subjectScores).forEach((sub) => {
      totalCorrect += sub.correct;
      totalWrong += sub.wrong;
      totalUnattempted += sub.unattempted;
      totalScore += sub.score;
    });

    return {
      ...r,
      totalCorrect,
      totalWrong,
      totalUnattempted,
      totalScore,
    };
  });

  const sorted = [...processed].sort((a, b) => {
    if (b.totalScore !== a.totalScore) return b.totalScore - a.totalScore;
    if (a.totalWrong !== b.totalWrong) return a.totalWrong - b.totalWrong;
    return new Date(a.submittedAt).getTime() - new Date(b.submittedAt).getTime();
  });

  return sorted.map((candidate, idx) => {
    const rank = idx + 1;
    const countLessThanOrEqual = processed.filter((other) => other.totalScore <= candidate.totalScore).length;
    const rawPercentile = (countLessThanOrEqual / candidateCount) * 100.0;
    const percentile = Math.round(rawPercentile * 100) / 100;

    return {
      ...candidate,
      rank,
      percentile,
    };
  });
}

export function generateSubjectAwareCsv(
  rows: SubjectAwareExportRow[],
  activeSubjects: string[]
): string {
  const headers = [
    'S.No',
    'Student ID',
    'Student Full Name',
    'Exam Title',
    'Attempt Status',
  ];

  activeSubjects.forEach((subject) => {
    headers.push(`${subject} Correct`);
    headers.push(`${subject} Wrong`);
    headers.push(`${subject} Unattempted`);
    headers.push(`${subject} Score`);
  });

  headers.push('Total Correct');
  headers.push('Total Wrong');
  headers.push('Total Unattempted');
  headers.push('Total Score');
  headers.push('Percentile');
  headers.push('Submitted At');

  const lines = [headers.map(escapeCsvValue).join(',')];

  rows.forEach((r, index) => {
    const rowValues: (string | number)[] = [
      index + 1,
      r.studentId,
      r.studentName,
      r.examTitle,
      r.attemptStatus,
    ];

    activeSubjects.forEach((subject) => {
      const sub = r.subjectScores[subject] || { correct: 0, wrong: 0, unattempted: 0, score: 0 };
      rowValues.push(sub.correct);
      rowValues.push(sub.wrong);
      rowValues.push(sub.unattempted);
      rowValues.push(sub.score);
    });

    rowValues.push(r.totalCorrect);
    rowValues.push(r.totalWrong);
    rowValues.push(r.totalUnattempted);
    rowValues.push(r.totalScore);
    rowValues.push(r.percentile);
    rowValues.push(r.submittedAt);

    lines.push(rowValues.map(escapeCsvValue).join(','));
  });

  return lines.join('\n');
}
