import { LegacyExportRecord, generateResultsCsv } from '../../utils/excelExporter';

describe('Phase 17 - Excel / CSV Export Tests', () => {
  const records: LegacyExportRecord[] = [
    {
      rank: 1,
      studentId: 'STU-101',
      studentName: 'Aarav Sharma',
      batchName: 'JEE Advanced 2026',
      score: 180,
      maxScore: 300,
      correctAnswers: 48,
      wrongAnswers: 12,
      unattemptedAnswers: 15,
      accuracy: 80,
      percentile: 99.5,
      submittedAt: '2026-08-08T11:00:00Z',
    },
    {
      rank: 2,
      studentId: 'STU-102',
      studentName: 'Priya, Patel "Top"',
      batchName: 'NEET Dropper 2026',
      score: 165,
      maxScore: 300,
      correctAnswers: 45,
      wrongAnswers: 15,
      unattemptedAnswers: 15,
      accuracy: 75,
      percentile: 98.0,
      submittedAt: '2026-08-08T11:05:00Z',
    },
  ];

  test('Test 1: CSV string contains correct headers and total rows', () => {
    const csv = generateResultsCsv(records);
    const lines = csv.split('\n');

    expect(lines.length).toBe(3); // 1 header + 2 data rows
    expect(Boolean(lines[0]?.includes('Rank,Student ID,Student Full Name,Batch Name'))).toBe(true);
  });

  test('Test 2: Special character escaping for names with commas and quotes', () => {
    const csv = generateResultsCsv(records);
    const lines = csv.split('\n');

    expect(Boolean(lines[2]?.includes('"Priya, Patel ""Top"""'))).toBe(true);
  });

  test('Test 3: Numeric accuracy and percentile fields preserved', () => {
    const csv = generateResultsCsv(records);
    expect(Boolean(csv.includes('99.5'))).toBe(true);
    expect(Boolean(csv.includes('98'))).toBe(true);
  });
});
