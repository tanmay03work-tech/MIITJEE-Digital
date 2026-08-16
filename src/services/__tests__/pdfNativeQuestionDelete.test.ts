import {
  deletePdfNativeQuestion,
  savePdfNativeQuestionBankBatch,
  listPdfNativeBankQuestions,
} from '../pdf-native/pdfNativeBankService';
import {
  createPdfNativeSet,
  getPdfNativeSetQuestions,
} from '../pdf-native/pdfNativeSetService';
import {
  createPdfNativeTest,
} from '../pdf-native/pdfNativeTestService';
import { PdfNativeQuestion } from '../pdf-native/pdfNativeTypes';

describe('PDF-Native Question Bank — Delete Question with Safety Isolation', () => {
  const testPdfId = `del_test_pdf_${Date.now()}`;
  const qDraft: PdfNativeQuestion = {
    id: `del_q_${Date.now()}_1`,
    pdf_id: testPdfId,
    pdf_url: 'https://example.com/test.pdf',
    question_number: '31',
    page_start: 1,
    page_end: 1,
    bbox: { x: 10, y: 10, width: 200, height: 100 },
    subject: 'Physics',
    question_type: 'MCQ',
    correct_answer: null,
    marks: 4,
    negative_marks: 1,
    review_status: 'REJECTED',
  };

  const qTestBound: PdfNativeQuestion = {
    id: `del_q_${Date.now()}_2`,
    pdf_id: testPdfId,
    pdf_url: 'https://example.com/test.pdf',
    question_number: '32',
    page_start: 1,
    page_end: 1,
    bbox: { x: 10, y: 120, width: 200, height: 100 },
    subject: 'Physics',
    question_type: 'MCQ',
    correct_answer: 'A',
    marks: 4,
    negative_marks: 1,
    review_status: 'APPROVED',
  };

  beforeAll(async () => {
    // Save sample questions to bank
    await savePdfNativeQuestionBankBatch(testPdfId, 'https://example.com/test.pdf', [qDraft, qTestBound]);
  });

  it('validates question ID before deletion', async () => {
    const res = await deletePdfNativeQuestion('');
    expect(res.success).toBe(false);
    expect(res.error).toMatch(/Invalid question ID/i);
  });

  it('blocks deletion if question is bound to an active test (Relationship Safety)', async () => {
    // 1. Create a set and a test referencing qTestBound
    await createPdfNativeSet({
      set_name: 'Test Set for Delete Protection',
      subject: 'Physics',
      source_pdf_id: testPdfId,
      pdf_url: 'https://example.com/test.pdf',
      question_ids: [qTestBound.id],
    });

    await createPdfNativeTest({
      title: 'Active Test referencing Q32',
      subject: 'Physics',
      duration_minutes: 60,
      question_ids: [qTestBound.id],
      status: 'READY',
      visibility: 'OPEN_FOR_ALL',
    });

    // 2. Attempt to delete qTestBound
    const delRes = await deletePdfNativeQuestion(qTestBound.id);
    expect(delRes.success).toBe(false);
    expect(delRes.error).toMatch(/currently used in one or more tests/i);

    // Verify question is still in question bank
    const bankList = await listPdfNativeBankQuestions(testPdfId);
    expect(bankList.some((q) => q.id === qTestBound.id)).toBe(true);
  });

  it('successfully deletes unreferenced REJECTED question (e.g. Q31)', async () => {
    // 1. Create a set containing Q31
    const setRes = await createPdfNativeSet({
      set_name: 'Set containing Q31',
      subject: 'Physics',
      source_pdf_id: testPdfId,
      pdf_url: 'https://example.com/test.pdf',
      question_ids: [qDraft.id],
    });

    const initialSetQuestions = await getPdfNativeSetQuestions(setRes.set.id);
    expect(initialSetQuestions.some((q) => q.id === qDraft.id)).toBe(true);

    // 2. Delete Q31
    const delRes = await deletePdfNativeQuestion(qDraft.id);
    expect(delRes.success).toBe(true);

    // 3. Verify Q31 is removed from Question Bank
    const bankQuestionsAfter = await listPdfNativeBankQuestions(testPdfId);
    expect(bankQuestionsAfter.some((q) => q.id === qDraft.id)).toBe(false);

    // 4. Verify Q31 is removed from Set
    const setQuestionsAfter = await getPdfNativeSetQuestions(setRes.set.id);
    expect(setQuestionsAfter.some((q) => q.id === qDraft.id)).toBe(false);
  });
});
