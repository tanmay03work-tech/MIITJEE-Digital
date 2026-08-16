import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  PdfNativeAttempt,
  PdfNativeQuestion,
  PdfNativeSet,
  PdfNativeSetQuestion,
  PdfNativeTest,
  PdfNativeTestQuestion,
  PdfNativeTestSection,
  PdfNativeTestStatus,
} from './pdfNativeTypes';

const STORAGE_KEYS = {
  QUESTIONS: '@miitjee:pdf_native_questions',
  SETS: '@miitjee:pdf_native_sets',
  SET_QUESTIONS: '@miitjee:pdf_native_set_questions',
  TESTS: '@miitjee:pdf_native_tests',
  TEST_QUESTIONS: '@miitjee:pdf_native_test_questions',
  SECTIONS: '@miitjee:pdf_native_test_sections',
  TEST_SETS: '@miitjee:pdf_native_test_sets',
  ATTEMPTS: '@miitjee:pdf_native_attempts',
};

// In-memory fallback caches
let memoryQuestions: PdfNativeQuestion[] = [];
let memorySets: PdfNativeSet[] = [];
let memorySetQuestions: PdfNativeSetQuestion[] = [];
let memoryTests: PdfNativeTest[] = [];
let memoryTestQuestions: PdfNativeTestQuestion[] = [];
let memoryTestSets: { id: string; test_id: string; set_id: string; order_index: number }[] = [];
let memorySections: PdfNativeTestSection[] = [];
let memoryAttempts: PdfNativeAttempt[] = [];

/**
 * Save / Upsert questions to local persistent storage.
 */
export async function saveLocalPdfNativeQuestions(
  questions: PdfNativeQuestion[]
): Promise<PdfNativeQuestion[]> {
  const existing = await getLocalPdfNativeQuestions();
  const map = new Map<string, PdfNativeQuestion>();

  for (const q of existing) {
    map.set(q.id || `${q.pdf_id}_${q.question_number}`, q);
  }

  for (const q of questions) {
    map.set(q.id || `${q.pdf_id}_${q.question_number}`, q);
  }

  const merged = Array.from(map.values());
  memoryQuestions = merged;
  try {
    await AsyncStorage.setItem(STORAGE_KEYS.QUESTIONS, JSON.stringify(merged));
  } catch (err) {
    // Memory cache maintained
  }
  return merged;
}

export const DEFAULT_SAMPLE_QUESTIONS: PdfNativeQuestion[] = [];

/**
 * Get saved questions from local persistent storage.
 */
export async function getLocalPdfNativeQuestions(pdfId?: string): Promise<PdfNativeQuestion[]> {
  let list: PdfNativeQuestion[] = memoryQuestions;
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEYS.QUESTIONS);
    if (raw) {
      list = JSON.parse(raw);
      memoryQuestions = list;
    }
  } catch (err) {
    // Use memory cache
  }

  if (pdfId) {
    list = list.filter((q) => q.pdf_id === pdfId);
  }
  return list;
}

/**
 * Save / Create PDF-Native test locally.
 */
export async function saveLocalPdfNativeTest(
  test: PdfNativeTest,
  questionIds: string[],
  sections?: PdfNativeTestSection[],
  allowedBatches?: string[],
  setIds?: string[]
): Promise<{ test: PdfNativeTest; total_relations: number }> {
  const existingTests = await getLocalPdfNativeTests();
  const filteredTests = existingTests.filter((t) => t.id !== test.id);
  const updatedTest: PdfNativeTest = {
    ...test,
    visibility: test.visibility || 'OPEN_FOR_ALL',
    allowed_batches: allowedBatches || test.allowed_batches || [],
    set_ids: setIds || test.set_ids || [],
    starts_at: test.starts_at || new Date().toISOString(),
    ends_at: test.ends_at ?? null,
    sections: sections || test.sections || [],
  };
  const updatedTests = [updatedTest, ...filteredTests];
  memoryTests = updatedTests;

  const nowIso = new Date().toISOString();
  const relations: PdfNativeTestQuestion[] = questionIds.map((qId, idx) => ({
    id: `tq_${test.id}_${idx + 1}`,
    test_id: test.id,
    question_id: qId,
    order_index: idx + 1,
    created_at: nowIso,
  }));

  const filteredTq = memoryTestQuestions.filter((tq) => tq.test_id !== test.id);
  memoryTestQuestions = [...filteredTq, ...relations];

  if (setIds && setIds.length > 0) {
    const testSetRelations = setIds.map((sId, idx) => ({
      id: `ts_${test.id}_${sId}`,
      test_id: test.id,
      set_id: sId,
      order_index: idx + 1,
      created_at: nowIso,
    }));
    const filteredTs = memoryTestSets.filter((ts) => ts.test_id !== test.id);
    memoryTestSets = [...filteredTs, ...testSetRelations];
  }

  try {
    await AsyncStorage.setItem(STORAGE_KEYS.TESTS, JSON.stringify(updatedTests));
    await AsyncStorage.setItem(STORAGE_KEYS.TEST_QUESTIONS, JSON.stringify(memoryTestQuestions));
    await AsyncStorage.setItem(STORAGE_KEYS.TEST_SETS, JSON.stringify(memoryTestSets));
  } catch (err) {
    // Memory cache maintained
  }

  if (sections && sections.length > 0) {
    await saveLocalPdfNativeSections(test.id, sections);
  }

  return { test: updatedTest, total_relations: relations.length };
}

/**
 * Update an existing PDF-Native test locally.
 */
export async function updateLocalPdfNativeTest(
  test: PdfNativeTest,
  questionIds?: string[],
  sections?: PdfNativeTestSection[],
  allowedBatches?: string[],
  setIds?: string[]
): Promise<PdfNativeTest> {
  const existingTests = await getLocalPdfNativeTests();
  const testIndex = existingTests.findIndex((t) => t.id === test.id);
  const updatedTest: PdfNativeTest = {
    ...test,
    visibility: test.visibility || 'OPEN_FOR_ALL',
    allowed_batches: allowedBatches || test.allowed_batches || [],
    set_ids: setIds || test.set_ids || [],
    starts_at: test.starts_at || new Date().toISOString(),
    ends_at: test.ends_at ?? null,
    sections: sections || test.sections || [],
    updated_at: new Date().toISOString(),
  };

  let updatedTests: PdfNativeTest[];
  if (testIndex >= 0) {
    updatedTests = [...existingTests];
    updatedTests[testIndex] = updatedTest;
  } else {
    updatedTests = [updatedTest, ...existingTests];
  }

  memoryTests = updatedTests;

  if (questionIds) {
    const nowIso = new Date().toISOString();
    const relations: PdfNativeTestQuestion[] = questionIds.map((qId, idx) => ({
      id: `tq_${test.id}_${idx + 1}`,
      test_id: test.id,
      question_id: qId,
      order_index: idx + 1,
      created_at: nowIso,
    }));

    const filteredTq = memoryTestQuestions.filter((tq) => tq.test_id !== test.id);
    memoryTestQuestions = [...filteredTq, ...relations];
  }

  if (setIds) {
    const nowIso = new Date().toISOString();
    const testSetRelations = setIds.map((sId, idx) => ({
      id: `ts_${test.id}_${sId}`,
      test_id: test.id,
      set_id: sId,
      order_index: idx + 1,
      created_at: nowIso,
    }));
    const filteredTs = memoryTestSets.filter((ts) => ts.test_id !== test.id);
    memoryTestSets = [...filteredTs, ...testSetRelations];
  }

  try {
    await AsyncStorage.setItem(STORAGE_KEYS.TESTS, JSON.stringify(updatedTests));
    await AsyncStorage.setItem(STORAGE_KEYS.TEST_QUESTIONS, JSON.stringify(memoryTestQuestions));
    await AsyncStorage.setItem(STORAGE_KEYS.TEST_SETS, JSON.stringify(memoryTestSets));
  } catch (err) {
    // Memory cache maintained
  }

  if (sections) {
    await saveLocalPdfNativeSections(test.id, sections);
  }

  return updatedTest;
}

/**
 * Get test-set relations locally.
 */
export async function getLocalPdfNativeTestSets(
  testId?: string
): Promise<{ id: string; test_id: string; set_id: string; order_index: number }[]> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEYS.TEST_SETS);
    if (raw) {
      memoryTestSets = JSON.parse(raw);
    }
  } catch {
    // Use memory cache
  }
  if (testId) {
    return memoryTestSets.filter((ts) => ts.test_id === testId).sort((a, b) => a.order_index - b.order_index);
  }
  return memoryTestSets;
}

/**
 * Update test status.
 */
export async function updateLocalPdfNativeTestStatus(
  testId: string,
  status: PdfNativeTestStatus
): Promise<boolean> {
  const existingTests = await getLocalPdfNativeTests();
  const test = existingTests.find((t) => t.id === testId);
  if (!test) return false;

  test.status = status;
  test.updated_at = new Date().toISOString();
  memoryTests = existingTests;

  try {
    await AsyncStorage.setItem(STORAGE_KEYS.TESTS, JSON.stringify(existingTests));
  } catch (err) {
    // Memory cache maintained
  }
  return true;
}

/**
 * Save sections for a test.
 */
export async function saveLocalPdfNativeSections(
  testId: string,
  sections: PdfNativeTestSection[]
): Promise<PdfNativeTestSection[]> {
  const filtered = memorySections.filter((s) => s.test_id !== testId);
  const updated = [...filtered, ...sections];
  memorySections = updated;

  try {
    await AsyncStorage.setItem(STORAGE_KEYS.SECTIONS, JSON.stringify(updated));
  } catch (err) {
    // Memory cache maintained
  }
  return sections;
}

/**
 * Get sections for a test.
 */
export async function getLocalPdfNativeSections(testId: string): Promise<PdfNativeTestSection[]> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEYS.SECTIONS);
    if (raw) {
      memorySections = JSON.parse(raw);
    }
  } catch (err) {
    // Use memory cache
  }
  return memorySections.filter((s) => s.test_id === testId).sort((a, b) => a.section_order - b.section_order);
}

/**
 * Delete a PDF-Native test locally.
 */
export async function deleteLocalPdfNativeTest(testId: string): Promise<void> {
  const existingTests = await getLocalPdfNativeTests();
  const updatedTests = existingTests.filter((t) => t.id !== testId);
  memoryTests = updatedTests;

  const filteredTq = memoryTestQuestions.filter((tq) => tq.test_id !== testId);
  memoryTestQuestions = filteredTq;

  const filteredTs = memoryTestSets.filter((ts) => ts.test_id !== testId);
  memoryTestSets = filteredTs;

  const filteredSec = memorySections.filter((s) => s.test_id !== testId);
  memorySections = filteredSec;

  try {
    await AsyncStorage.setItem(STORAGE_KEYS.TESTS, JSON.stringify(updatedTests));
    await AsyncStorage.setItem(STORAGE_KEYS.TEST_QUESTIONS, JSON.stringify(memoryTestQuestions));
    await AsyncStorage.setItem(STORAGE_KEYS.TEST_SETS, JSON.stringify(memoryTestSets));
    await AsyncStorage.setItem(STORAGE_KEYS.SECTIONS, JSON.stringify(memorySections));
  } catch (err) {
    // Memory cache maintained
  }
}

/**
 * Get all saved PDF-Native tests from local persistent storage.
 */
export async function getLocalPdfNativeTests(): Promise<PdfNativeTest[]> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEYS.TESTS);
    if (raw) {
      const parsed = JSON.parse(raw) as PdfNativeTest[];
      memoryTests = Array.isArray(parsed) ? parsed.filter((t) => t.id !== 'test_pdf_native_live_demo') : [];
    }
  } catch (err) {
    // Use memory cache
  }
  memoryTests = memoryTests.filter((t) => t.id !== 'test_pdf_native_live_demo');
  return memoryTests;
}

/**
 * Get test by ID locally.
 */
export async function getLocalPdfNativeTest(testId: string): Promise<PdfNativeTest | null> {
  const tests = await getLocalPdfNativeTests();
  const test = tests.find((t) => t.id === testId);
  if (!test) return null;

  const sections = await getLocalPdfNativeSections(testId);
  const testSets = await getLocalPdfNativeTestSets(testId);
  return {
    ...test,
    set_ids: testSets.length > 0 ? testSets.map((ts) => ts.set_id) : test.set_ids || [],
    sections: sections && sections.length > 0 ? sections : test.sections || [],
  };
}

/**
 * Get relations for a specific test.
 */
export async function getLocalPdfNativeTestQuestions(
  testId?: string
): Promise<PdfNativeTestQuestion[]> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEYS.TEST_QUESTIONS);
    if (raw) {
      memoryTestQuestions = JSON.parse(raw);
    }
  } catch (err) {
    // Use memory cache
  }
  if (testId) {
    return memoryTestQuestions.filter((tq) => tq.test_id === testId).sort((a, b) => a.order_index - b.order_index);
  }
  return memoryTestQuestions;
}

/**
 * Save attempt locally.
 */
export async function saveLocalPdfNativeAttempt(attempt: PdfNativeAttempt): Promise<void> {
  const updated = [attempt, ...memoryAttempts.filter((a) => a.id !== attempt.id)];
  memoryAttempts = updated;
  try {
    await AsyncStorage.setItem(STORAGE_KEYS.ATTEMPTS, JSON.stringify(updated));
  } catch (err) {
    // Memory cache maintained
  }
}

/**
 * Get attempt by ID locally.
 */
export async function getLocalPdfNativeAttempt(attemptId: string): Promise<PdfNativeAttempt | null> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEYS.ATTEMPTS);
    if (raw) {
      memoryAttempts = JSON.parse(raw);
    }
  } catch (err) {
    // Use memory cache
  }
  return memoryAttempts.find((a) => a.id === attemptId) || null;
}

/**
 * Get all attempts.
 */
export async function getLocalPdfNativeAttempts(): Promise<PdfNativeAttempt[]> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEYS.ATTEMPTS);
    if (raw) {
      memoryAttempts = JSON.parse(raw);
    }
  } catch {
    // Use memory cache
  }
  return memoryAttempts;
}

/**
 * Get all attempts for a test.
 */
export async function getLocalPdfNativeAttemptsForTest(testId: string): Promise<PdfNativeAttempt[]> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEYS.ATTEMPTS);
    if (raw) {
      memoryAttempts = JSON.parse(raw);
    }
  } catch (err) {
    // Use memory cache
  }
  return memoryAttempts.filter((a) => a.test_id === testId);
}

/**
 * Remove local attempt for a test and user if deleted on Supabase.
 */
export async function deleteLocalPdfNativeAttemptForTestUser(testId: string, userId?: string): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEYS.ATTEMPTS);
    if (raw) {
      memoryAttempts = JSON.parse(raw);
    }
    const filtered = memoryAttempts.filter((a) => !(a.test_id === testId && (userId ? a.user_id === userId : true)));
    memoryAttempts = filtered;
    await AsyncStorage.setItem(STORAGE_KEYS.ATTEMPTS, JSON.stringify(filtered));
  } catch {
    // Ignore error
  }
}

/**
 * Get all local PDF-Native Sets.
 */
export async function getLocalPdfNativeSets(): Promise<PdfNativeSet[]> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEYS.SETS);
    if (raw) {
      memorySets = JSON.parse(raw);
    }
  } catch {
    // Use memory cache
  }
  return memorySets;
}

/**
 * Get single local PDF-Native Set by ID.
 */
export async function getLocalPdfNativeSet(setId: string): Promise<PdfNativeSet | null> {
  const sets = await getLocalPdfNativeSets();
  return sets.find((s) => s.id === setId) || null;
}

/**
 * Get questions inside a local PDF-Native Set.
 */
export async function getLocalPdfNativeSetQuestions(setId: string): Promise<PdfNativeSetQuestion[]> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEYS.SET_QUESTIONS);
    if (raw) {
      memorySetQuestions = JSON.parse(raw);
    }
  } catch {
    // Use memory cache
  }
  return memorySetQuestions
    .filter((sq) => sq.set_id === setId)
    .sort((a, b) => a.order_index - b.order_index);
}

/**
 * Save / Create a new PDF-Native Set locally.
 */
export async function saveLocalPdfNativeSet(
  set: PdfNativeSet,
  questionIds: string[]
): Promise<PdfNativeSet> {
  const existingSets = await getLocalPdfNativeSets();
  const filteredSets = existingSets.filter((s) => s.id !== set.id);
  const updatedSets = [set, ...filteredSets];
  memorySets = updatedSets;

  const nowIso = new Date().toISOString();
  const relations: PdfNativeSetQuestion[] = questionIds.map((qId, idx) => ({
    id: `sq_${set.id}_${idx + 1}`,
    set_id: set.id,
    question_id: qId,
    order_index: idx + 1,
    created_at: nowIso,
  }));

  const filteredSq = memorySetQuestions.filter((sq) => sq.set_id !== set.id);
  memorySetQuestions = [...filteredSq, ...relations];

  try {
    await AsyncStorage.setItem(STORAGE_KEYS.SETS, JSON.stringify(updatedSets));
    await AsyncStorage.setItem(STORAGE_KEYS.SET_QUESTIONS, JSON.stringify(memorySetQuestions));
  } catch {
    // Memory cache maintained
  }

  return set;
}

/**
 * Update an existing PDF-Native Set locally.
 */
export async function updateLocalPdfNativeSet(
  set: PdfNativeSet,
  questionIds?: string[]
): Promise<PdfNativeSet> {
  const existingSets = await getLocalPdfNativeSets();
  const setIndex = existingSets.findIndex((s) => s.id === set.id);
  const updatedSet: PdfNativeSet = {
    ...set,
    updated_at: new Date().toISOString(),
  };

  let updatedSets: PdfNativeSet[];
  if (setIndex >= 0) {
    updatedSets = [...existingSets];
    updatedSets[setIndex] = updatedSet;
  } else {
    updatedSets = [updatedSet, ...existingSets];
  }
  memorySets = updatedSets;

  if (questionIds) {
    const nowIso = new Date().toISOString();
    const relations: PdfNativeSetQuestion[] = questionIds.map((qId, idx) => ({
      id: `sq_${set.id}_${idx + 1}`,
      set_id: set.id,
      question_id: qId,
      order_index: idx + 1,
      created_at: nowIso,
    }));
    const filteredSq = memorySetQuestions.filter((sq) => sq.set_id !== set.id);
    memorySetQuestions = [...filteredSq, ...relations];
  }

  try {
    await AsyncStorage.setItem(STORAGE_KEYS.SETS, JSON.stringify(updatedSets));
    if (questionIds) {
      await AsyncStorage.setItem(STORAGE_KEYS.SET_QUESTIONS, JSON.stringify(memorySetQuestions));
    }
  } catch {
    // Memory cache maintained
  }

  return updatedSet;
}

/**
 * Delete a PDF-Native Set locally. Does NOT delete underlying questions.
 */
export async function deleteLocalPdfNativeSet(setId: string): Promise<void> {
  const existingSets = await getLocalPdfNativeSets();
  const updatedSets = existingSets.filter((s) => s.id !== setId);
  memorySets = updatedSets;

  memorySetQuestions = memorySetQuestions.filter((sq) => sq.set_id !== setId);

  try {
    await AsyncStorage.setItem(STORAGE_KEYS.SETS, JSON.stringify(updatedSets));
    await AsyncStorage.setItem(STORAGE_KEYS.SET_QUESTIONS, JSON.stringify(memorySetQuestions));
  } catch {
    // Memory cache maintained
  }
}

/**
 * Delete a question from local persistent storage.
 */
export async function deleteLocalPdfNativeQuestion(questionId: string): Promise<void> {
  const existing = await getLocalPdfNativeQuestions();
  const filtered = existing.filter((q) => q.id !== questionId);
  memoryQuestions = filtered;
  try {
    await AsyncStorage.setItem(STORAGE_KEYS.QUESTIONS, JSON.stringify(filtered));
  } catch {
    // In-memory cache maintained
  }

  // Also remove from local set questions junction
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEYS.SET_QUESTIONS);
    if (raw) {
      memorySetQuestions = JSON.parse(raw);
    }
  } catch {
    // Cache
  }
  memorySetQuestions = memorySetQuestions.filter((sq) => sq.question_id !== questionId);
  try {
    await AsyncStorage.setItem(STORAGE_KEYS.SET_QUESTIONS, JSON.stringify(memorySetQuestions));
  } catch {
    // Cache
  }

  // Also remove from local test questions junction
  try {
    const rawTq = await AsyncStorage.getItem(STORAGE_KEYS.TEST_QUESTIONS);
    if (rawTq) {
      memoryTestQuestions = JSON.parse(rawTq);
    }
  } catch {
    // Cache
  }
  memoryTestQuestions = memoryTestQuestions.filter((tq) => tq.question_id !== questionId);
  try {
    await AsyncStorage.setItem(STORAGE_KEYS.TEST_QUESTIONS, JSON.stringify(memoryTestQuestions));
  } catch {
    // Cache
  }
}

