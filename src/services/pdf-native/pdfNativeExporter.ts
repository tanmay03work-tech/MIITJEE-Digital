import { PdfNativeResultPayload } from './pdfNativeTypes';

/**
 * Generate Excel CSV string from authoritative backend result payload.
 * Supports subject-aware dynamic columns (single-subject vs multi-subject).
 */
export function generatePdfNativeExcelCsv(payload: PdfNativeResultPayload): string {
  const studentName = payload.student_name || 'Student';
  const testTitle = payload.test_title || 'PDF-Native Test';
  const testSubject = payload.test_subject || 'Physics';
  const percentileStr = payload.percentile !== null && payload.percentile !== undefined
    ? `${payload.percentile}%`
    : 'N/A';

  if (payload.is_single_subject && payload.subjects.length <= 1) {
    // Single-Subject Excel Export (DO NOT include empty Chemistry/Mathematics columns)
    const headers = [
      'Name',
      'Test Name',
      'Subject',
      'Total Questions',
      'Correct',
      'Wrong',
      'Unattempted',
      'Attempted',
      'Score',
      'Maximum Marks',
      'Percentage (%)',
      'Percentile',
    ];

    const sub = payload.subjects[0] || payload.total;
    const row = [
      `"${studentName.replace(/"/g, '""')}"`,
      `"${testTitle.replace(/"/g, '""')}"`,
      `"${testSubject.replace(/"/g, '""')}"`,
      sub.total_questions,
      sub.correct_count,
      sub.wrong_count,
      sub.unattempted_count,
      sub.attempted_count,
      sub.score,
      sub.max_marks,
      `${sub.percentage}%`,
      `"${percentileStr}"`,
    ];

    return `${headers.join(',')}\n${row.join(',')}`;
  } else {
    // Multi-Subject Excel Export (Include columns ONLY for subjects present in the test)
    const activeSubjects = payload.subjects.map((s) => s.subject);

    const headers = ['Name', 'Test Name'];
    for (const subName of activeSubjects) {
      headers.push(
        `${subName} Correct`,
        `${subName} Wrong`,
        `${subName} Unattempted`,
        `${subName} Score`
      );
    }
    headers.push(
      'Total Questions',
      'Total Score',
      'Maximum Marks',
      'Percentage (%)',
      'Percentile'
    );

    const row = [
      `"${studentName.replace(/"/g, '""')}"`,
      `"${testTitle.replace(/"/g, '""')}"`,
    ];

    for (const sub of payload.subjects) {
      row.push(
        String(sub.correct_count),
        String(sub.wrong_count),
        String(sub.unattempted_count),
        String(sub.score)
      );
    }

    row.push(
      String(payload.total.total_questions),
      String(payload.total.score),
      String(payload.total.max_marks),
      `${payload.total.percentage}%`,
      `"${percentileStr}"`
    );

    return `${headers.join(',')}\n${row.join(',')}`;
  }
}

/**
 * Trigger Excel CSV file download in browser environment.
 */
export function downloadPdfNativeExcel(payload: PdfNativeResultPayload): void {
  const csvString = generatePdfNativeExcelCsv(payload);
  const sanitizeName = (payload.test_title || 'Result').replace(/[^a-zA-Z0-9]/g, '_');
  const filename = `PDF_Native_Result_${sanitizeName}_${Date.now()}.csv`;

  if (typeof document !== 'undefined') {
    const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }
}
