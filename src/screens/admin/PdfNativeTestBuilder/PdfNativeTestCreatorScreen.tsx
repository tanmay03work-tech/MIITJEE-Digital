import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  CheckSquare,
  ChevronRight,
  Eye,
  FileCheck,
  FileEdit,
  FilePlus,
  FileText,
  FolderOpen,
  Hash,
  HelpCircle,
  Layers,
  ListOrdered,
  Plus,
  RotateCcw,
  Save,
  Sliders,
  Square,
  Trash2,
  Users,
  X,
  XCircle,
} from 'lucide-react-native';
import * as pdfjsLib from 'pdfjs-dist';

import { AppHeader } from '../../../components/common/AppHeader';
import { Badge } from '../../../components/common/Badge';
import { Card } from '../../../components/common/Card';
import { InputField } from '../../../components/common/InputField';
import { Screen } from '../../../components/common/Screen';
import { colors, radius, spacing } from '../../../theme';
import { RootStackScreenProps } from '../../../navigation/types';
import { useAppStore } from '../../../store/appStore';
import { Batch } from '../../../types';
import { fetchBatches } from '../../../services/api/content';
import {
  PdfNativeQuestion,
  PdfNativeSet,
  PdfNativeTest,
  PdfNativeTestSection,
  PdfNativeTestStatus,
  QuestionSubject,
  QuestionType,
  TestVisibility,
} from '../../../services/pdf-native/pdfNativeTypes';
import {
  createPdfNativeTest,
  getPdfNativeTestById,
  publishPdfNativeTest,
  updatePdfNativeTest,
  validatePdfNativeTestCreation,
  validateSubjectSections,
  validateTestForPublish,
} from '../../../services/pdf-native/pdfNativeTestService';
import {
  getPdfNativeSetById,
  getPdfNativeSetQuestions,
  listPdfNativeSets,
} from '../../../services/pdf-native/pdfNativeSetService';
import { getPdfDocument } from '../../../services/pdf-native/pdfDocumentCache';
import { PdfNativeTestPreviewModal } from './PdfNativeTestPreviewModal';
import { PdfNativePreview } from './PdfNativePreview';

const SUBJECT_LIST: QuestionSubject[] = ['Physics', 'Chemistry', 'Mathematics', 'Biology', 'Other'];

const STEPS = [
  { id: 1, label: 'Select Set', icon: FolderOpen },
  { id: 2, label: 'Test Details', icon: FileText },
  { id: 3, label: 'Subject Sections', icon: Layers },
  { id: 4, label: 'Select Questions', icon: ListOrdered },
  { id: 5, label: 'Marking', icon: Sliders },
  { id: 6, label: 'Preview', icon: Eye },
  { id: 7, label: 'Publish', icon: FileCheck },
];

export function PdfNativeTestCreatorScreen({
  route,
  navigation,
}: RootStackScreenProps<'PdfNativeTestCreator'>) {
  const testIdParam = route.params?.testId;
  const setIdParam = route.params?.setId;

  const [currentStep, setCurrentStep] = useState<number>(setIdParam ? 2 : 1);
  const [pdfDoc, setPdfDoc] = useState<pdfjsLib.PDFDocumentProxy | null>(null);
  const [availableSets, setAvailableSets] = useState<PdfNativeSet[]>([]);
  const [selectedSetIds, setSelectedSetIds] = useState<string[]>(setIdParam ? [setIdParam] : []);

  const [allQuestions, setAllQuestions] = useState<PdfNativeQuestion[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Test Details State
  const [testId, setTestId] = useState<string | null>(testIdParam || null);
  const [title, setTitle] = useState<string>('');
  const [description, setDescription] = useState<string>('');
  const [duration, setDuration] = useState<string>('180');
  const [examType, setExamType] = useState<'single' | 'multi'>('single');
  const [subject, setSubject] = useState<QuestionSubject>('Physics');
  const [testStatus, setTestStatus] = useState<PdfNativeTestStatus>('DRAFT');
  const [visibility, setVisibility] = useState<TestVisibility>('OPEN_FOR_ALL');
  const [allowedBatches, setAllowedBatches] = useState<string[]>([]);
  const [availableBatches, setAvailableBatches] = useState<Batch[]>([]);

  // Dynamic Schedule State
  const [startDate, setStartDate] = useState<string>(() => new Date().toISOString().split('T')[0] ?? '2026-08-16');
  const [startTime, setStartTime] = useState<string>('10:00');
  const [hasEndDate, setHasEndDate] = useState<boolean>(false);
  const [endDate, setEndDate] = useState<string>('');
  const [endTime, setEndTime] = useState<string>('23:59');

  // Multi-Subject Sections State
  const [sections, setSections] = useState<PdfNativeTestSection[]>([
    {
      id: 'sec_1',
      test_id: '',
      subject: 'Physics',
      question_type: 'MCQ',
      section_order: 1,
      question_start: 1,
      question_end: 30,
      correct_marks: 4,
      negative_marks: 1,
    },
  ]);

  // Loading & Saving States
  const [isLoadingInitial, setIsLoadingInitial] = useState<boolean>(true);
  const [isSavingDraft, setIsSavingDraft] = useState<boolean>(false);
  const [isPublishing, setIsPublishing] = useState<boolean>(false);

  // Preview Modal
  const [previewModalVisible, setPreviewModalVisible] = useState<boolean>(false);

  const loadAvailableSets = useCallback(async () => {
    try {
      const sets = await listPdfNativeSets();
      setAvailableSets(sets);
    } catch (err) {
      console.error('Error refreshing sets:', err);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadAvailableSets();
    }, [loadAvailableSets])
  );

  // Helper to re-aggregate questions and sections from a set of Set IDs in exact selection order
  const syncQuestionsAndSectionsForSets = useCallback(
    async (setIdsList: string[], allSetsList: PdfNativeSet[]) => {
      const activeSets = setIdsList
        .map((id) => allSetsList.find((s) => s.id === id))
        .filter((s): s is PdfNativeSet => Boolean(s));

      if (activeSets.length === 0) {
        setAllQuestions([]);
        setSelectedIds(new Set());
        setSections([]);
        return;
      }

      let combinedQuestions: PdfNativeQuestion[] = [];
      let currentStart = 1;
      const newSections: PdfNativeTestSection[] = [];

      for (let i = 0; i < activeSets.length; i++) {
        const s = activeSets[i];
        if (!s) continue;
        const sQuestions = await getPdfNativeSetQuestions(s.id);
        const qCount = sQuestions.length > 0 ? sQuestions.length : s.total_questions || 30;

        newSections.push({
          id: `sec_${i + 1}`,
          test_id: testId || '',
          set_id: s.id,
          subject: s.subject,
          question_type: 'MCQ',
          section_order: i + 1,
          question_start: currentStart,
          question_end: currentStart + qCount - 1,
          mcq_count: qCount,
          integer_count: 0,
          correct_marks: 4,
          negative_marks: 1,
        });

        currentStart += qCount;
        combinedQuestions = [...combinedQuestions, ...sQuestions];
      }

      setAllQuestions(combinedQuestions);
      setSelectedIds(new Set(combinedQuestions.map((q) => q.id)));
      setSections(newSections);

      const firstActiveSet = activeSets[0];
      if (activeSets.length === 1 && firstActiveSet) {
        setExamType('single');
        setSubject(firstActiveSet.subject);
        setTitle((prev) => (!prev || prev === 'Untitled Test' ? `${firstActiveSet.set_name} Test` : prev));
      } else {
        setExamType('multi');
        setSubject('Other');
        setTitle((prev) => (!prev || prev === 'Untitled Test' ? `${activeSets.map((s) => s.subject).join(' + ')} Mock Test` : prev));
      }
    },
    [testId]
  );

  // Load Data
  useEffect(() => {
    let isMounted = true;

    async function initialize() {
      setIsLoadingInitial(true);
      try {
        const [setsList, batchesList] = await Promise.all([
          listPdfNativeSets(),
          fetchBatches().catch(() => [] as Batch[]),
        ]);

        if (!isMounted) return;
        setAvailableSets(setsList);
        if (batchesList) {
          setAvailableBatches(batchesList);
        }

        // If editing existing test draft:
        if (testIdParam) {
          const existing = await getPdfNativeTestById(testIdParam);
          if (existing) {
            setTestId(existing.id);
            setTitle(existing.title);
            setDescription(existing.description || '');
            setDuration(String(existing.duration_minutes || 60));
            setSubject((existing.subject as QuestionSubject) || 'Physics');
            setExamType(existing.exam_type || (existing.subject === 'Multi-Subject' ? 'multi' : 'single'));
            setTestStatus(existing.status);
            setVisibility(existing.visibility || 'OPEN_FOR_ALL');
            setAllowedBatches(existing.allowed_batches || []);

            if (existing.starts_at) {
              const d = new Date(existing.starts_at);
              setStartDate(d.toISOString().split('T')[0] ?? '');
              setStartTime(`${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`);
            }

            if (existing.ends_at) {
              const d = new Date(existing.ends_at);
              setHasEndDate(true);
              setEndDate(d.toISOString().split('T')[0] ?? '');
              setEndTime(`${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`);
            }

            if (existing.sections && existing.sections.length > 0) {
              setSections(existing.sections);
            }

            if (existing.set_ids && existing.set_ids.length > 0) {
              setSelectedSetIds(existing.set_ids);
              await syncQuestionsAndSectionsForSets(existing.set_ids, setsList);
            }
          }
        } else if (setIdParam) {
          const matchingSet = setsList.find((s) => s.id === setIdParam) || (await getPdfNativeSetById(setIdParam));
          if (matchingSet) {
            setSelectedSetIds([matchingSet.id]);
            await syncQuestionsAndSectionsForSets([matchingSet.id], setsList);
          }
        } else if (setsList.length > 0) {
          // Default to first set so questions are ready
          const firstSet = setsList[0];
          if (firstSet) {
            setSelectedSetIds([firstSet.id]);
            await syncQuestionsAndSectionsForSets([firstSet.id], setsList);
          }
        } else {
          setAllQuestions([]);
          setSelectedIds(new Set());
        }
      } catch (err) {
        console.warn('[PdfNativeTestCreator] Initialization error:', err);
      } finally {
        if (isMounted) setIsLoadingInitial(false);
      }
    }

    void initialize();

    return () => {
      isMounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setIdParam, testIdParam]);

  // Handle Multi-Set Selection Change preserving exact selection order
  const handleToggleSelectSet = useCallback(
    async (setObj: PdfNativeSet) => {
      const next = selectedSetIds.includes(setObj.id)
        ? selectedSetIds.filter((id) => id !== setObj.id)
        : [...selectedSetIds, setObj.id];
      setSelectedSetIds(next);
      await syncQuestionsAndSectionsForSets(next, availableSets.length > 0 ? availableSets : [setObj]);
    },
    [selectedSetIds, availableSets, syncQuestionsAndSectionsForSets]
  );

  // Selected questions in strict, un-shuffled sequential order as selected/configured
  const orderedSelectedQuestions = useMemo(() => {
    return allQuestions.filter((q) => selectedIds.has(q.id));
  }, [allQuestions, selectedIds]);

  const totalQuestions = orderedSelectedQuestions.length;

  // Toggle question selection
  const handleToggleSelectQuestion = (q: PdfNativeQuestion) => {
    if (q.review_status !== 'APPROVED') {
      Alert.alert(
        'Cannot Select Question',
        `Question Q${q.question_number} is in '${q.review_status}' status. Only APPROVED questions can be included in a test.`
      );
      return;
    }

    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(q.id)) next.delete(q.id);
      else next.add(q.id);
      return next;
    });
  };

  const handleSelectAllApproved = () => {
    const approvedIds = new Set(
      allQuestions.filter((q) => q.review_status === 'APPROVED').map((q) => q.id)
    );
    setSelectedIds(approvedIds);
  };

  const handleClearSelection = () => {
    setSelectedIds(new Set());
  };

  // Section Management
  const handleAddSection = () => {
    const nextOrder = sections.length + 1;
    const lastSec = sections[sections.length - 1];
    const newStart = lastSec ? lastSec.question_end + 1 : 1;
    const newEnd = Math.min(totalQuestions || 30, newStart + 29);

    const defaultSubs: QuestionSubject[] = ['Physics', 'Chemistry', 'Mathematics', 'Biology'];
    const sub = defaultSubs[(nextOrder - 1) % defaultSubs.length] || 'Physics';

    setSections((prev) => [
      ...prev,
      {
        id: `sec_${Date.now()}_${nextOrder}`,
        test_id: testId || '',
        subject: sub,
        section_order: nextOrder,
        question_start: newStart,
        question_end: newEnd,
        correct_marks: 4,
        negative_marks: 1,
      },
    ]);
  };

  const handleRemoveSection = (index: number) => {
    if (sections.length <= 1) {
      Alert.alert('Cannot Remove', 'Multi-subject test must have at least one section.');
      return;
    }
    setSections((prev) => prev.filter((_, idx) => idx !== index));
  };

  const handleUpdateSection = (
    index: number,
    field: keyof PdfNativeTestSection,
    value: any
  ) => {
    setSections((prev) => {
      const current = prev[index];
      if (!current) return prev;
      const updated = [...prev];
      updated[index] = { ...current, [field]: value };
      return updated;
    });
  };

  // Update question metadata
  const handleUpdateQuestion = (
    questionId: string,
    updates: Partial<PdfNativeQuestion>
  ) => {
    setAllQuestions((prev) =>
      prev.map((q) => (q.id === questionId ? { ...q, ...updates } : q))
    );
  };

  // Validation
  const sectionValidation = useMemo(() => {
    if (examType === 'single') return { isValid: true, errors: [] };
    return validateSubjectSections(sections, totalQuestions, orderedSelectedQuestions);
  }, [examType, sections, totalQuestions, orderedSelectedQuestions]);

  const computedStartsAt = useMemo(() => {
    try {
      const d = new Date(`${startDate}T${startTime || '00:00'}:00`);
      return isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
    } catch {
      return new Date().toISOString();
    }
  }, [startDate, startTime]);

  const computedEndsAt = useMemo(() => {
    if (!hasEndDate || !endDate) return null;
    try {
      const d = new Date(`${endDate}T${endTime || '23:59'}:00`);
      return isNaN(d.getTime()) ? null : d.toISOString();
    } catch {
      return null;
    }
  }, [hasEndDate, endDate, endTime]);

  const fullPublishValidation = useMemo(() => {
    const draftTest: PdfNativeTest = {
      id: testId || 'draft',
      title,
      description,
      duration_minutes: parseInt(duration, 10) || 60,
      subject: examType === 'multi' ? 'Multi-Subject' : subject,
      exam_type: examType,
      total_questions: totalQuestions,
      status: 'READY',
      visibility,
      allowed_batches: allowedBatches,
      set_ids: Array.from(selectedSetIds),
      starts_at: computedStartsAt,
      ends_at: computedEndsAt,
      sections,
    };
    return validateTestForPublish(draftTest, orderedSelectedQuestions, sections);
  }, [testId, title, description, duration, examType, subject, totalQuestions, visibility, allowedBatches, selectedSetIds, computedStartsAt, computedEndsAt, sections, orderedSelectedQuestions]);

  // Save Draft Handler
  const handleSaveDraft = async () => {
    if (!title.trim()) {
      Alert.alert('Validation Error', 'Please enter a test title before saving draft.');
      return;
    }

    if (totalQuestions === 0) {
      Alert.alert('Validation Error', 'Please select at least one question for this test draft.');
      return;
    }

    if (visibility === 'BATCH_ONLY' && allowedBatches.length === 0) {
      Alert.alert('Validation Error', 'Please select at least one batch for Batch-Only test visibility.');
      return;
    }

    setIsSavingDraft(true);
    try {
      const durationNum = parseInt(duration, 10) || 60;
      const qIds = orderedSelectedQuestions.map((q) => q.id);
      const setIdsArr = selectedSetIds;

      if (testId) {
        // Update existing draft
        await updatePdfNativeTest({
          id: testId,
          title: title.trim(),
          description: description.trim() || undefined,
          duration_minutes: durationNum,
          subject: examType === 'multi' ? 'Multi-Subject' : subject,
          exam_type: examType,
          status: 'DRAFT',
          visibility,
          allowed_batches: allowedBatches,
          set_ids: setIdsArr,
          starts_at: computedStartsAt,
          ends_at: computedEndsAt,
          question_ids: qIds,
          sections: examType === 'multi' ? sections : [],
        });
        setTestStatus('DRAFT');
        Alert.alert('Draft Saved', `Draft test "${title}" has been updated.`);
      } else {
        // Create new draft
        const res = await createPdfNativeTest({
          title: title.trim(),
          description: description.trim() || undefined,
          duration_minutes: durationNum,
          subject: examType === 'multi' ? 'Multi-Subject' : subject,
          exam_type: examType,
          status: 'DRAFT',
          visibility,
          allowed_batches: allowedBatches,
          set_ids: setIdsArr,
          starts_at: computedStartsAt,
          ends_at: computedEndsAt,
          question_ids: qIds,
          sections: examType === 'multi' ? sections : [],
        });
        setTestId(res.test.id);
        setTestStatus('DRAFT');
        Alert.alert('Draft Saved', `New draft test "${res.test.title}" created.`);
      }
      void useAppStore.getState().bootstrap();
    } catch (err) {
      Alert.alert('Save Error', err instanceof Error ? err.message : 'Unable to save draft test.');
    } finally {
      setIsSavingDraft(false);
    }
  };

  // Publish / Make Live Handler
  const handlePublishTest = async () => {
    if (visibility === 'BATCH_ONLY' && allowedBatches.length === 0) {
      Alert.alert('Cannot Publish Test', 'Please select at least one batch for Batch-Only test access.');
      return;
    }

    if (!fullPublishValidation.isValid) {
      Alert.alert(
        'Cannot Publish Test',
        `Please resolve the following issues:\n\n${fullPublishValidation.errors.map((e) => `• ${e}`).join('\n')}`
      );
      return;
    }

    setIsPublishing(true);
    try {
      const durationNum = parseInt(duration, 10) || 60;
      const qIds = orderedSelectedQuestions.map((q) => q.id);
      const setIdsArr = selectedSetIds;

      let savedTestId = testId;

      if (savedTestId) {
        await updatePdfNativeTest({
          id: savedTestId,
          title: title.trim(),
          description: description.trim() || undefined,
          duration_minutes: durationNum,
          subject: examType === 'multi' ? 'Multi-Subject' : subject,
          exam_type: examType,
          status: 'READY',
          visibility,
          allowed_batches: allowedBatches,
          set_ids: setIdsArr,
          starts_at: computedStartsAt,
          ends_at: computedEndsAt,
          question_ids: qIds,
          sections: examType === 'multi' ? sections : [],
        });
      } else {
        const res = await createPdfNativeTest({
          title: title.trim(),
          description: description.trim() || undefined,
          duration_minutes: durationNum,
          subject: examType === 'multi' ? 'Multi-Subject' : subject,
          exam_type: examType,
          status: 'READY',
          visibility,
          allowed_batches: allowedBatches,
          set_ids: setIdsArr,
          starts_at: computedStartsAt,
          ends_at: computedEndsAt,
          question_ids: qIds,
          sections: examType === 'multi' ? sections : [],
        });
        savedTestId = res.test.id;
        setTestId(res.test.id);
      }

      await publishPdfNativeTest(savedTestId);
      setTestStatus('READY');
      void useAppStore.getState().bootstrap();

      Alert.alert(
        'Test Published Live! 🎉',
        `"${title}" is now LIVE in CBT test lists with ${totalQuestions} verified PDF-Native questions.`,
        [
          {
            text: 'View in Test Management',
            onPress: () => navigation.navigate('PdfNativeTestManagement'),
          },
        ]
      );
    } catch (err) {
      Alert.alert('Publish Error', err instanceof Error ? err.message : 'Failed to publish test.');
    } finally {
      setIsPublishing(false);
    }
  };

  if (isLoadingInitial) {
    return (
      <Screen>
        <AppHeader
          title="Test Configuration"
          subtitle="Loading Question Bank and Test Builder..."
          showBack={true}
          onBack={() => navigation.navigate('PdfNativeTestManagement')}
        />
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.loadingText}>Loading question assets...</Text>
        </View>
      </Screen>
    );
  }

  return (
    <Screen useScrollView={false}>
      <AppHeader
        title={testId ? 'Edit Test Configuration' : 'PDF-Native Test Creator'}
        subtitle={`Step ${currentStep} of ${STEPS.length} • ${STEPS[currentStep - 1]?.label}`}
        showBack={true}
        onBack={() => navigation.navigate('PdfNativeTestManagement')}
        rightSlot={
          <View style={styles.headerActions}>
            <TouchableOpacity
              style={styles.saveDraftHeaderBtn}
              onPress={handleSaveDraft}
              disabled={isSavingDraft}
              activeOpacity={0.7}
            >
              {isSavingDraft ? (
                <ActivityIndicator size="small" color={colors.primary} />
              ) : (
                <Save size={14} color={colors.primary} />
              )}
              <Text style={styles.saveDraftHeaderText}>Save Draft</Text>
            </TouchableOpacity>
          </View>
        }
      />

      {/* Stepper Navigation Bar */}
      <View style={styles.stepperBar}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.stepperContent}>
          {STEPS.map((step) => {
            const isActive = currentStep === step.id;
            const isCompleted = currentStep > step.id;

            return (
              <TouchableOpacity
                key={step.id}
                style={[
                  styles.stepItem,
                  isActive && styles.stepItemActive,
                  isCompleted && styles.stepItemCompleted,
                ]}
                onPress={() => setCurrentStep(step.id)}
                activeOpacity={0.7}
              >
                <View
                  style={[
                    styles.stepBadge,
                    isActive && styles.stepBadgeActive,
                    isCompleted && styles.stepBadgeCompleted,
                  ]}
                >
                  <Text
                    style={[
                      styles.stepBadgeText,
                      (isActive || isCompleted) && styles.stepBadgeTextActive,
                    ]}
                  >
                    {step.id}
                  </Text>
                </View>
                <Text
                  style={[
                    styles.stepLabel,
                    isActive && styles.stepLabelActive,
                    isCompleted && styles.stepLabelCompleted,
                  ]}
                >
                  {step.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {/* Step Content */}
      <View style={styles.mainContainer}>
        {/* ================= STEP 1: SELECT SET ================= */}
        {currentStep === 1 && (
          <ScrollView style={styles.stepScroll} contentContainerStyle={styles.stepContentWrap}>
            <Card style={styles.card}>
              <View style={styles.cardHeaderRow}>
                <View>
                  <Text style={styles.cardHeading}>Select Question Sets</Text>
                  <Text style={styles.cardSubheading}>
                    Select one or more Question Sets (e.g. Physics + Chemistry + Mathematics). Questions will aggregate systematically.
                  </Text>
                </View>
                <TouchableOpacity
                  style={styles.newSetBtn}
                  onPress={() => navigation.navigate('PdfNativeSetManagement')}
                  activeOpacity={0.7}
                >
                  <FolderOpen size={14} color={colors.primary} />
                  <Text style={styles.newSetBtnText}>Manage Sets</Text>
                </TouchableOpacity>
              </View>

              {availableSets.length > 0 ? (
                <View style={styles.setsListWrap}>
                  {availableSets.map((s) => {
                    const isSelected = selectedSetIds.includes(s.id);
                    return (
                      <TouchableOpacity
                        key={s.id}
                        style={[styles.setSelectionCard, isSelected && styles.setSelectionCardActive]}
                        onPress={() => handleToggleSelectSet(s)}
                        activeOpacity={0.7}
                      >
                        <View style={styles.setSelectionHeader}>
                          <View style={styles.setRadioRow}>
                            <View style={{ marginRight: 6 }}>
                              {isSelected ? (
                                <CheckSquare size={20} color={colors.primary} />
                              ) : (
                                <Square size={20} color={colors.textMuted} />
                              )}
                            </View>
                            <Text style={styles.setSelectionTitle}>{s.set_name}</Text>
                          </View>
                          <View style={styles.setBadgeRow}>
                            <Badge label={s.subject} tone="primary" />
                            <Badge label={`${s.total_questions} Questions`} tone="primary" />
                            <Badge
                              label={s.status}
                              tone={s.status === 'READY' ? 'success' : 'warning'}
                            />
                          </View>
                        </View>
                        {s.description ? (
                          <Text style={styles.setSelectionDesc} numberOfLines={2}>
                            {s.description}
                          </Text>
                        ) : null}
                      </TouchableOpacity>
                    );
                  })}
                </View>
              ) : (
                <View style={styles.noSetsBox}>
                  <Text style={styles.noSetsText}>
                    No saved Question Sets found. You can upload a PDF and create a Set in PDF-Native Builder.
                  </Text>
                </View>
              )}

              {selectedSetIds.length > 0 ? (
                <View style={styles.selectedSetBanner}>
                  <CheckCircle2 size={18} color="#15803D" />
                  <Text style={styles.selectedSetBannerText}>
                    {selectedSetIds.length} Set(s) Selected • Total <Text style={{ fontWeight: '800' }}>{allQuestions.length} Questions</Text> loaded from selected sets.
                  </Text>
                </View>
              ) : null}
            </Card>
          </ScrollView>
        )}

        {/* ================= STEP 2: TEST DETAILS ================= */}
        {currentStep === 2 && (
          <ScrollView style={styles.stepScroll} contentContainerStyle={styles.stepContentWrap}>
            <Card style={styles.card}>
              <View style={styles.cardHeaderRow}>
                <Text style={styles.cardHeading}>Basic Test Details</Text>
                <Badge
                  label={testStatus === 'READY' ? 'READY / LIVE' : 'DRAFT'}
                  tone={testStatus === 'READY' ? 'success' : 'warning'}
                />
              </View>

              <InputField
                label="Test Title *"
                value={title}
                onChangeText={setTitle}
                placeholder="e.g. JEE Main Full Syllabus Mock Test 01"
              />

              <InputField
                label="Test Description (Optional)"
                value={description}
                onChangeText={setDescription}
                placeholder="e.g. Comprehensive test covering Physics, Chemistry, and Mathematics"
              />

              <View style={styles.rowTwo}>
                <View style={styles.flexItem}>
                  <InputField
                    label="Duration (Minutes) *"
                    value={duration}
                    onChangeText={setDuration}
                    keyboardType="numeric"
                    placeholder="180"
                  />
                </View>

                <View style={styles.flexItem}>
                  <Text style={styles.fieldLabel}>Exam Type</Text>
                  <View style={styles.chipRow}>
                    <TouchableOpacity
                      style={[styles.chip, examType === 'single' && styles.chipActive]}
                      onPress={() => setExamType('single')}
                      activeOpacity={0.7}
                    >
                      <Text style={[styles.chipText, examType === 'single' && styles.chipTextActive]}>
                        Single Subject
                      </Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={[styles.chip, examType === 'multi' && styles.chipActive]}
                      onPress={() => setExamType('multi')}
                      activeOpacity={0.7}
                    >
                      <Text style={[styles.chipText, examType === 'multi' && styles.chipTextActive]}>
                        Multi Subject
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </View>

              {examType === 'single' && (
                <View style={styles.fieldWrap}>
                  <Text style={styles.fieldLabel}>Subject Category</Text>
                  <View style={styles.chipRow}>
                    {SUBJECT_LIST.map((sub) => (
                      <TouchableOpacity
                        key={sub}
                        style={[styles.chip, subject === sub && styles.chipActive]}
                        onPress={() => setSubject(sub)}
                        activeOpacity={0.7}
                      >
                        <Text style={[styles.chipText, subject === sub && styles.chipTextActive]}>
                          {sub}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
              )}

              {/* TEST SCHEDULE & AVAILABILITY */}
              <View style={styles.accessControlSection}>
                <View style={styles.accessSectionHeader}>
                  <FileText size={16} color={colors.primary} />
                  <Text style={styles.accessSectionTitle}>Schedule & Availability</Text>
                </View>
                <Text style={styles.accessSectionSubtitle}>
                  Configure the start time and optional closing deadline for student attempts.
                </Text>

                <View style={styles.rowTwo}>
                  <View style={styles.flexItem}>
                    <InputField
                      label="Start Date (YYYY-MM-DD) *"
                      value={startDate}
                      onChangeText={setStartDate}
                      placeholder="2026-08-16"
                    />
                  </View>
                  <View style={styles.flexItem}>
                    <InputField
                      label="Start Time (HH:MM) *"
                      value={startTime}
                      onChangeText={setStartTime}
                      placeholder="10:00"
                    />
                  </View>
                </View>

                <TouchableOpacity
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 }}
                  onPress={() => setHasEndDate(!hasEndDate)}
                  activeOpacity={0.7}
                >
                  <View style={{ marginRight: 4 }}>
                    {hasEndDate ? (
                      <CheckSquare size={18} color={colors.primary} />
                    ) : (
                      <Square size={18} color={colors.textMuted} />
                    )}
                  </View>
                  <Text style={{ fontSize: 13, fontWeight: '600', color: colors.text }}>
                    Set Closing / End Deadline (Optional)
                  </Text>
                </TouchableOpacity>

                {hasEndDate && (
                  <View style={[styles.rowTwo, { marginTop: 8 }]}>
                    <View style={styles.flexItem}>
                      <InputField
                        label="End Date (YYYY-MM-DD)"
                        value={endDate}
                        onChangeText={setEndDate}
                        placeholder="2026-08-17"
                      />
                    </View>
                    <View style={styles.flexItem}>
                      <InputField
                        label="End Time (HH:MM)"
                        value={endTime}
                        onChangeText={setEndTime}
                        placeholder="23:59"
                      />
                    </View>
                  </View>
                )}
              </View>

              {/* TEST VISIBILITY & ACCESS CONTROL */}
              <View style={styles.accessControlSection}>
                <View style={styles.accessSectionHeader}>
                  <Users size={16} color={colors.primary} />
                  <Text style={styles.accessSectionTitle}>Test Visibility & Access Control</Text>
                </View>
                <Text style={styles.accessSectionSubtitle}>
                  Choose who can discover and attempt this exam once it is published.
                </Text>

                <View style={styles.accessRadioGroup}>
                  <TouchableOpacity
                    style={[styles.accessRadioCard, visibility === 'OPEN_FOR_ALL' && styles.accessRadioCardActive]}
                    onPress={() => setVisibility('OPEN_FOR_ALL')}
                    activeOpacity={0.7}
                  >
                    <View style={[styles.radioCircle, visibility === 'OPEN_FOR_ALL' && styles.radioCircleActive]}>
                      {visibility === 'OPEN_FOR_ALL' ? <View style={styles.radioDot} /> : null}
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.accessOptionTitle}>Open for All Students</Text>
                      <Text style={styles.accessOptionSub}>
                        ✓ All registered student accounts can view and attempt this test without batch restrictions.
                      </Text>
                    </View>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.accessRadioCard, visibility === 'BATCH_ONLY' && styles.accessRadioCardActive]}
                    onPress={() => setVisibility('BATCH_ONLY')}
                    activeOpacity={0.7}
                  >
                    <View style={[styles.radioCircle, visibility === 'BATCH_ONLY' && styles.radioCircleActive]}>
                      {visibility === 'BATCH_ONLY' ? <View style={styles.radioDot} /> : null}
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.accessOptionTitle}>Specific Batches Only</Text>
                      <Text style={styles.accessOptionSub}>
                        Restrict exam access exclusively to students enrolled in the selected batches.
                      </Text>
                    </View>
                  </TouchableOpacity>
                </View>

                {visibility === 'BATCH_ONLY' ? (
                  <View style={styles.batchSelectorContainer}>
                    <Text style={styles.batchSelectLabel}>Select Target Batches (Minimum 1 required):</Text>
                    {availableBatches.length > 0 ? (
                      <View style={styles.batchChipsWrap}>
                        {availableBatches.map((b) => {
                          const isSelected = allowedBatches.includes(b.id);
                          return (
                            <TouchableOpacity
                              key={b.id}
                              style={[styles.batchChip, isSelected && styles.batchChipActive]}
                              onPress={() => {
                                setAllowedBatches((prev) =>
                                  isSelected ? prev.filter((id) => id !== b.id) : [...prev, b.id]
                                );
                              }}
                              activeOpacity={0.7}
                            >
                              <Text style={[styles.batchChipText, isSelected && styles.batchChipTextActive]}>
                                {isSelected ? '✓ ' : ''}{b.label} ({b.classLabel || b.targetExam || 'Batch'})
                              </Text>
                            </TouchableOpacity>
                          );
                        })}
                      </View>
                    ) : (
                      <Text style={styles.batchEmptyWarning}>No active batches found in database.</Text>
                    )}

                    {allowedBatches.length === 0 ? (
                      <Text style={styles.batchWarningText}>
                        ⚠️ Please select at least one batch before saving or publishing this test.
                      </Text>
                    ) : (
                      <Text style={styles.batchSuccessText}>
                        ✓ {allowedBatches.length} batch(es) selected for exclusive access.
                      </Text>
                    )}
                  </View>
                ) : null}
              </View>
            </Card>
          </ScrollView>
        )}

        {/* ================= STEP 3: SUBJECT SECTIONS ================= */}
        {currentStep === 3 && (
          <ScrollView style={styles.stepScroll} contentContainerStyle={styles.stepContentWrap}>
            {examType === 'single' ? (
              <Card style={styles.card}>
                <Text style={styles.cardHeading}>Single Subject Validation</Text>
                <Text style={styles.cardSubheading}>
                  All selected questions belong to the "{subject}" paper.
                </Text>

                <View style={styles.singleSubjectSummary}>
                  <CheckCircle2 size={24} color="#15803D" />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.singleSubjectTitle}>{subject} Test</Text>
                    <Text style={styles.singleSubjectText}>
                      Questions: Q1 → Q{totalQuestions} ({totalQuestions} Total Questions)
                    </Text>
                  </View>
                </View>

                {orderedSelectedQuestions.some(
                  (q) => q.subject && q.subject !== subject && q.subject !== 'Other'
                ) && (
                  <View style={styles.contaminationBox}>
                    <AlertTriangle size={18} color={colors.danger} />
                    <Text style={styles.contaminationText}>
                      Contamination Warning: Some questions belong to another subject.
                    </Text>
                  </View>
                )}
              </Card>
            ) : (
              <>
                <Card style={styles.card}>
                  <View style={styles.cardHeaderRow}>
                    <View>
                      <Text style={styles.cardHeading}>Multi-Subject Sections Configuration</Text>
                      <Text style={styles.cardSubheading}>
                        Explicit section boundaries (e.g. Physics Q1–30, Chemistry Q31–60, Mathematics Q61–90)
                      </Text>
                    </View>

                    <TouchableOpacity
                      style={styles.addSectionBtn}
                      onPress={handleAddSection}
                      activeOpacity={0.7}
                    >
                      <Plus size={14} color={colors.white} />
                      <Text style={styles.addSectionBtnText}>+ Add Section</Text>
                    </TouchableOpacity>
                  </View>

                  {sectionValidation.isValid ? (
                    <View style={styles.validationSuccessBanner}>
                      <CheckCircle2 size={16} color="#15803D" />
                      <Text style={styles.validationSuccessBannerText}>
                        {sections
                          .map((s) => `✓ ${s.subject} (Q${s.question_start}–Q${s.question_end})`)
                          .join('   ')}
                      </Text>
                    </View>
                  ) : (
                    <View style={styles.validationErrorBanner}>
                      <AlertTriangle size={16} color={colors.danger} />
                      <View style={{ flex: 1 }}>
                        <Text style={styles.validationErrorBannerTitle}>
                          Section Issues:
                        </Text>
                        {sectionValidation.errors.map((err, i) => (
                          <Text key={i} style={styles.validationErrorBannerItem}>
                            • {err}
                          </Text>
                        ))}
                      </View>
                    </View>
                  )}
                </Card>

                {sections.map((sec, sIdx) => {
                  const secCount = Math.max(0, sec.question_end - sec.question_start + 1);
                  return (
                    <Card key={sec.id || sIdx} style={styles.sectionCard}>
                      <View style={styles.sectionHeader}>
                        <View style={styles.sectionTitleRow}>
                          <Text style={styles.sectionTitle}>SECTION {sIdx + 1}</Text>
                          <Badge label={sec.subject} tone="primary" />
                          <Badge label={`${secCount} Questions`} tone="primary" />
                        </View>

                        {sections.length > 1 && (
                          <TouchableOpacity
                            style={styles.removeSecBtn}
                            onPress={() => handleRemoveSection(sIdx)}
                            activeOpacity={0.7}
                          >
                            <Trash2 size={14} color={colors.danger} />
                            <Text style={styles.removeSecText}>Remove</Text>
                          </TouchableOpacity>
                        )}
                      </View>

                      <View style={styles.fieldWrap}>
                        <Text style={styles.fieldLabel}>Subject</Text>
                        <View style={styles.chipRow}>
                          {SUBJECT_LIST.map((sub) => (
                            <TouchableOpacity
                              key={sub}
                              style={[
                                styles.chip,
                                sec.subject === sub && styles.chipActive,
                              ]}
                              onPress={() => handleUpdateSection(sIdx, 'subject', sub)}
                              activeOpacity={0.7}
                            >
                              <Text
                                style={[
                                  styles.chipText,
                                  sec.subject === sub && styles.chipTextActive,
                                ]}
                              >
                                {sub}
                              </Text>
                            </TouchableOpacity>
                          ))}
                        </View>
                      </View>

                      <View style={styles.rowTwo}>
                        <View style={styles.flexItem}>
                          <Text style={styles.fieldLabel}>Question Type</Text>
                          <View style={styles.chipRow}>
                            <TouchableOpacity
                              style={[styles.chip, (sec.question_type || 'MCQ') === 'MCQ' && styles.chipActive]}
                              onPress={() => handleUpdateSection(sIdx, 'question_type', 'MCQ')}
                              activeOpacity={0.7}
                            >
                              <Text style={[styles.chipText, (sec.question_type || 'MCQ') === 'MCQ' && styles.chipTextActive]}>
                                MCQ (+4 / -1)
                              </Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                              style={[styles.chip, sec.question_type === 'INTEGER' && styles.chipActive]}
                              onPress={() => handleUpdateSection(sIdx, 'question_type', 'INTEGER')}
                              activeOpacity={0.7}
                            >
                              <Text style={[styles.chipText, sec.question_type === 'INTEGER' && styles.chipTextActive]}>
                                INTEGER (+4 / -1)
                              </Text>
                            </TouchableOpacity>
                          </View>
                        </View>
                      </View>

                      <View style={styles.rowTwo}>
                        <View style={styles.flexItem}>
                          <InputField
                            label="From Question #"
                            value={String(sec.question_start)}
                            onChangeText={(val) =>
                              handleUpdateSection(sIdx, 'question_start', parseInt(val, 10) || 1)
                            }
                            keyboardType="numeric"
                          />
                        </View>

                        <View style={styles.flexItem}>
                          <InputField
                            label="To Question #"
                            value={String(sec.question_end)}
                            onChangeText={(val) =>
                              handleUpdateSection(sIdx, 'question_end', parseInt(val, 10) || 1)
                            }
                            keyboardType="numeric"
                          />
                        </View>
                      </View>
                    </Card>
                  );
                })}
              </>
            )}
          </ScrollView>
        )}

        {/* ================= STEP 4: SELECT QUESTIONS ================= */}
        {currentStep === 4 && (
          <ScrollView style={styles.stepScroll} contentContainerStyle={styles.stepContentWrap}>
            <Card style={styles.card}>
              <View style={styles.cardHeaderRow}>
                <View>
                  <Text style={styles.cardHeading}>Select Questions</Text>
                  <Text style={styles.cardSubheading}>
                    {totalQuestions} of {allQuestions.length} selected • {allQuestions.filter((q) => q.review_status === 'APPROVED').length} Approved
                  </Text>
                </View>

                <View style={styles.selectionQuickActions}>
                  <TouchableOpacity style={styles.quickActionBtn} onPress={handleSelectAllApproved}>
                    <Text style={styles.quickActionText}>Select All Approved</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.quickActionBtn} onPress={handleClearSelection}>
                    <Text style={styles.quickActionText}>Clear</Text>
                  </TouchableOpacity>
                </View>
              </View>

              {allQuestions.length === 0 ? (
                <View style={styles.noSetsBox}>
                  <Text style={styles.noSetsText}>
                    No questions loaded. Please go back to Step 1 and select one or more Question Sets.
                  </Text>
                </View>
              ) : (
                allQuestions.map((q, idx) => {
                  const isSelected = selectedIds.has(q.id);
                  const isApproved = q.review_status === 'APPROVED';

                  return (
                    <TouchableOpacity
                      key={q.id}
                      style={[
                        styles.questionSelectItem,
                        isSelected && styles.questionSelectItemActive,
                        !isApproved && styles.questionSelectItemDisabled,
                      ]}
                      onPress={() => handleToggleSelectQuestion(q)}
                      activeOpacity={0.7}
                    >
                      {isSelected ? (
                        <CheckSquare size={18} color={colors.primary} />
                      ) : (
                        <Square size={18} color={isApproved ? colors.textMuted : '#CBD5E1'} />
                      )}

                      <View style={styles.questionItemInfo}>
                        <View style={styles.questionItemTop}>
                          <Text style={styles.qNumberText}>Question {idx + 1} (Q{q.question_number})</Text>
                          <Badge label={q.subject || 'Physics'} tone="primary" />
                          <Badge
                            label={isApproved ? 'APPROVED' : q.review_status}
                            tone={isApproved ? 'success' : 'warning'}
                          />
                          <Badge label={q.question_type || 'MCQ'} tone="neutral" />
                        </View>
                        <Text style={styles.qMetaText}>
                          Page {q.page_start} • Answer: {q.correct_answer || 'Missing'} • Marks: +{q.marks}/-{q.negative_marks}
                        </Text>
                      </View>
                    </TouchableOpacity>
                  );
                })
              )}
            </Card>
          </ScrollView>
        )}

        {/* ================= STEP 5: MARKING CONFIGURATION ================= */}
        {currentStep === 5 && (
          <ScrollView style={styles.stepScroll} contentContainerStyle={styles.stepContentWrap}>
            <Card style={styles.card}>
              <Text style={styles.cardHeading}>Marking Configuration</Text>
              <Text style={styles.cardSubheading}>
                Deterministic scoring rule: Correct = +4, Wrong = -1, Unattempted = 0.
              </Text>

              <View style={styles.markingGrid}>
                <View style={styles.markingCard}>
                  <Text style={styles.markingTypeTitle}>MCQ Questions</Text>
                  <View style={styles.markingRow}>
                    <Text style={styles.markingLabel}>Correct Answer:</Text>
                    <Text style={[styles.markingVal, { color: '#15803D' }]}>+4 Marks</Text>
                  </View>
                  <View style={styles.markingRow}>
                    <Text style={styles.markingLabel}>Wrong Answer:</Text>
                    <Text style={[styles.markingVal, { color: '#B91C1C' }]}>-1 Mark</Text>
                  </View>
                  <View style={styles.markingRow}>
                    <Text style={styles.markingLabel}>Unattempted:</Text>
                    <Text style={styles.markingVal}>0 Marks</Text>
                  </View>
                </View>

                <View style={styles.markingCard}>
                  <Text style={styles.markingTypeTitle}>INTEGER Questions</Text>
                  <View style={styles.markingRow}>
                    <Text style={styles.markingLabel}>Correct Answer:</Text>
                    <Text style={[styles.markingVal, { color: '#15803D' }]}>+4 Marks</Text>
                  </View>
                  <View style={styles.markingRow}>
                    <Text style={styles.markingLabel}>Wrong Answer:</Text>
                    <Text style={[styles.markingVal, { color: '#B91C1C' }]}>-1 Mark</Text>
                  </View>
                  <View style={styles.markingRow}>
                    <Text style={styles.markingLabel}>Unattempted:</Text>
                    <Text style={styles.markingVal}>0 Marks</Text>
                  </View>
                </View>
              </View>
            </Card>
          </ScrollView>
        )}

        {/* ================= STEP 6: PREVIEW ================= */}
        {currentStep === 6 && (
          <ScrollView style={styles.stepScroll} contentContainerStyle={styles.stepContentWrap}>
            <Card style={styles.card}>
              <View style={styles.cardHeaderRow}>
                <View>
                  <Text style={styles.cardHeading}>Test Preview ({totalQuestions} Questions)</Text>
                  <Text style={styles.cardSubheading}>
                    Original PDF-Native region crop previews without admin debug tags.
                  </Text>
                </View>
              </View>

              {orderedSelectedQuestions.map((q, idx) => (
                <View key={q.id} style={styles.previewQuestionCard}>
                  <View style={styles.previewCardHeader}>
                    <Text style={styles.previewQNum}>Question {idx + 1} (Q{q.question_number})</Text>
                    <View style={styles.previewBadges}>
                      <Badge label={q.subject} tone="primary" />
                      <Badge label={q.question_type} tone="neutral" />
                      <Text style={styles.previewKeyText}>Key: {q.correct_answer}</Text>
                    </View>
                  </View>

                  <View style={styles.previewCropWrap}>
                    <PdfNativePreview pdfDoc={pdfDoc} question={q} showAdminDebug={false} />
                  </View>
                </View>
              ))}
            </Card>
          </ScrollView>
        )}

        {/* ================= STEP 7: VALIDATION & PUBLISH ================= */}
        {currentStep === 7 && (
          <ScrollView style={styles.stepScroll} contentContainerStyle={styles.stepContentWrap}>
            <Card style={styles.card}>
              <Text style={styles.cardHeading}>Pre-Publish Checklist</Text>
              <Text style={styles.cardSubheading}>
                Verify test readiness before publishing live to student CBT dashboards.
              </Text>

              {fullPublishValidation.isValid ? (
                <View style={styles.publishReadyBanner}>
                  <CheckCircle2 size={24} color="#15803D" />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.publishReadyTitle}>Test is 100% Ready to Publish!</Text>
                    <Text style={styles.publishReadyDesc}>
                      All {totalQuestions} questions have verified answer keys, zero subject contamination, and valid section boundaries.
                    </Text>
                  </View>
                </View>
              ) : (
                <View style={styles.publishIssuesBanner}>
                  <AlertTriangle size={24} color={colors.danger} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.publishIssuesTitle}>Publish Blocked by Validation Errors:</Text>
                    {fullPublishValidation.errors.map((err, i) => (
                      <Text key={i} style={styles.publishIssueItem}>
                        • {err}
                      </Text>
                    ))}
                  </View>
                </View>
              )}

              <View style={styles.publishActionRow}>
                <TouchableOpacity
                  style={styles.saveDraftActionBtn}
                  onPress={handleSaveDraft}
                  disabled={isSavingDraft}
                  activeOpacity={0.7}
                >
                  <Save size={16} color={colors.primary} />
                  <Text style={styles.saveDraftActionText}>
                    {isSavingDraft ? 'Saving Draft...' : 'Save as Draft'}
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[
                    styles.publishLiveActionBtn,
                    !fullPublishValidation.isValid && styles.publishLiveActionBtnDisabled,
                  ]}
                  onPress={handlePublishTest}
                  disabled={!fullPublishValidation.isValid || isPublishing}
                  activeOpacity={0.7}
                >
                  {isPublishing ? (
                    <ActivityIndicator size="small" color={colors.white} />
                  ) : (
                    <FileCheck size={16} color={colors.white} />
                  )}
                  <Text style={styles.publishLiveActionText}>
                    {isPublishing ? 'Publishing...' : 'Publish Test Live 🚀'}
                  </Text>
                </TouchableOpacity>
              </View>
            </Card>
          </ScrollView>
        )}
      </View>

      {/* Stepper Footer Bottom Bar */}
      <View style={styles.footerBar}>
        <TouchableOpacity
          style={[styles.navBtn, currentStep === 1 && styles.navBtnDisabled]}
          onPress={() => setCurrentStep((prev) => Math.max(1, prev - 1))}
          disabled={currentStep === 1}
          activeOpacity={0.7}
        >
          <ArrowLeft size={16} color={currentStep === 1 ? colors.textMuted : colors.text} />
          <Text style={[styles.navBtnText, currentStep === 1 && styles.navBtnTextDisabled]}>
            Previous
          </Text>
        </TouchableOpacity>

        <Text style={styles.footerStepIndicator}>
          Step {currentStep} of {STEPS.length}
        </Text>

        <TouchableOpacity
          style={[styles.navBtn, currentStep === STEPS.length && styles.navBtnDisabled]}
          onPress={() => setCurrentStep((prev) => Math.min(STEPS.length, prev + 1))}
          disabled={currentStep === STEPS.length}
          activeOpacity={0.7}
        >
          <Text style={[styles.navBtnText, currentStep === STEPS.length && styles.navBtnTextDisabled]}>
            Next
          </Text>
          <ArrowRight size={16} color={currentStep === STEPS.length ? colors.textMuted : colors.text} />
        </TouchableOpacity>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  loadingWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
  },
  loadingText: {
    fontSize: 14,
    color: colors.textMuted,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  saveDraftHeaderBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radius.sm,
    backgroundColor: colors.surfaceRaised,
    borderWidth: 1,
    borderColor: colors.border,
  },
  saveDraftHeaderText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.primary,
  },
  stepperBar: {
    backgroundColor: colors.surfaceRaised,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  stepperContent: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    gap: spacing.xs,
  },
  stepItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radius.md,
  },
  stepItemActive: {
    backgroundColor: colors.primarySoft,
  },
  stepItemCompleted: {
    backgroundColor: '#DCFCE7',
  },
  stepBadge: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: colors.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepBadgeActive: {
    backgroundColor: colors.primary,
  },
  stepBadgeCompleted: {
    backgroundColor: '#15803D',
  },
  stepBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.textMuted,
  },
  stepBadgeTextActive: {
    color: colors.white,
  },
  stepLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textMuted,
  },
  stepLabelActive: {
    color: colors.primary,
    fontWeight: '800',
  },
  stepLabelCompleted: {
    color: '#15803D',
  },
  mainContainer: {
    flex: 1,
  },
  stepScroll: {
    flex: 1,
  },
  stepContentWrap: {
    padding: spacing.md,
    gap: spacing.md,
    paddingBottom: 80,
  },
  card: {
    padding: spacing.lg,
    gap: spacing.md,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  cardHeading: {
    fontSize: 16,
    fontWeight: '800',
    color: colors.text,
  },
  cardSubheading: {
    fontSize: 12,
    color: colors.textMuted,
    marginTop: 2,
  },
  newSetBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.sm,
    backgroundColor: colors.primarySoft,
    borderWidth: 1,
    borderColor: colors.primary,
  },
  newSetBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.primary,
  },
  setsListWrap: {
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  setSelectionCard: {
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceRaised,
    gap: spacing.xs,
  },
  setSelectionCardActive: {
    borderColor: colors.primary,
    backgroundColor: colors.primarySoft,
  },
  setSelectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  setRadioRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  radioCircle: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 2,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioCircleActive: {
    borderColor: colors.primary,
  },
  radioDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.primary,
  },
  setSelectionTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: colors.text,
  },
  setBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  setSelectionDesc: {
    fontSize: 12,
    color: colors.textMuted,
    marginLeft: 26,
  },
  noSetsBox: {
    padding: spacing.md,
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.md,
  },
  noSetsText: {
    fontSize: 13,
    color: colors.textMuted,
    lineHeight: 18,
  },
  selectedSetBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: spacing.sm,
    borderRadius: radius.sm,
    backgroundColor: '#DCFCE7',
    marginTop: spacing.xs,
  },
  selectedSetBannerText: {
    fontSize: 13,
    color: '#15803D',
  },
  rowTwo: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  flexItem: {
    flex: 1,
  },
  fieldWrap: {
    gap: spacing.xs,
  },
  fieldLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.text,
    textTransform: 'uppercase',
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceMuted,
  },
  chipActive: {
    backgroundColor: colors.primary,
  },
  chipText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textMuted,
  },
  chipTextActive: {
    color: colors.white,
  },
  singleSubjectSummary: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: '#DCFCE7',
    padding: spacing.md,
    borderRadius: radius.md,
  },
  singleSubjectTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#15803D',
  },
  singleSubjectText: {
    fontSize: 13,
    color: '#15803D',
  },
  contaminationBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.dangerSoft,
    padding: spacing.md,
    borderRadius: radius.md,
  },
  contaminationText: {
    color: colors.danger,
    fontSize: 12,
    fontWeight: '700',
    flex: 1,
  },
  addSectionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
  },
  addSectionBtnText: {
    color: colors.white,
    fontSize: 12,
    fontWeight: '800',
  },
  validationSuccessBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: '#DCFCE7',
    padding: spacing.md,
    borderRadius: radius.md,
  },
  validationSuccessBannerText: {
    color: '#15803D',
    fontSize: 12,
    fontWeight: '700',
  },
  validationErrorBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    backgroundColor: '#FEE2E2',
    padding: spacing.md,
    borderRadius: radius.md,
  },
  validationErrorBannerTitle: {
    color: '#991B1B',
    fontSize: 13,
    fontWeight: '800',
    marginBottom: 4,
  },
  validationErrorBannerItem: {
    color: '#B91C1C',
    fontSize: 12,
    lineHeight: 16,
  },
  sectionCard: {
    padding: spacing.md,
    gap: spacing.sm,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: colors.text,
  },
  removeSecBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  removeSecText: {
    fontSize: 12,
    color: colors.danger,
    fontWeight: '700',
  },
  selectionQuickActions: {
    flexDirection: 'row',
    gap: spacing.xs,
  },
  quickActionBtn: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radius.sm,
    backgroundColor: colors.surfaceMuted,
  },
  quickActionText: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.primary,
  },
  questionSelectItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceRaised,
    marginTop: spacing.xs,
  },
  questionSelectItemActive: {
    borderColor: colors.primary,
    backgroundColor: colors.primarySoft,
  },
  questionSelectItemDisabled: {
    opacity: 0.5,
  },
  questionItemInfo: {
    flex: 1,
    gap: 4,
  },
  questionItemTop: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  qNumberText: {
    fontSize: 14,
    fontWeight: '800',
    color: colors.text,
  },
  qMetaText: {
    fontSize: 11,
    color: colors.textMuted,
  },
  markingGrid: {
    flexDirection: 'row',
    gap: spacing.md,
    flexWrap: 'wrap',
  },
  markingCard: {
    flex: 1,
    minWidth: 260,
    backgroundColor: colors.surfaceMuted,
    padding: spacing.md,
    borderRadius: radius.md,
    gap: spacing.sm,
  },
  markingTypeTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: colors.text,
  },
  markingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  markingLabel: {
    fontSize: 12,
    color: colors.textMuted,
  },
  markingVal: {
    fontSize: 13,
    fontWeight: '800',
  },
  previewQuestionCard: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    overflow: 'hidden',
    marginBottom: spacing.md,
  },
  previewCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.surfaceMuted,
    padding: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  previewQNum: {
    fontSize: 14,
    fontWeight: '800',
    color: colors.text,
  },
  previewBadges: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  previewKeyText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#15803D',
  },
  previewCropWrap: {
    padding: spacing.sm,
    backgroundColor: colors.white,
  },
  publishReadyBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: '#DCFCE7',
    padding: spacing.lg,
    borderRadius: radius.md,
  },
  publishReadyTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#15803D',
  },
  publishReadyDesc: {
    fontSize: 13,
    color: '#15803D',
    marginTop: 2,
    lineHeight: 18,
  },
  publishIssuesBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
    backgroundColor: '#FEE2E2',
    padding: spacing.lg,
    borderRadius: radius.md,
  },
  publishIssuesTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#991B1B',
    marginBottom: 4,
  },
  publishIssueItem: {
    fontSize: 12,
    color: '#B91C1C',
    lineHeight: 16,
  },
  publishActionRow: {
    flexDirection: 'row',
    gap: spacing.md,
    marginTop: spacing.md,
  },
  saveDraftActionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1,
    borderColor: colors.border,
  },
  saveDraftActionText: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.primary,
  },
  publishLiveActionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    borderRadius: radius.md,
    backgroundColor: '#15803D',
  },
  publishLiveActionBtnDisabled: {
    backgroundColor: colors.textMuted,
    opacity: 0.6,
  },
  publishLiveActionText: {
    fontSize: 14,
    fontWeight: '800',
    color: colors.white,
  },
  footerBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 56,
    backgroundColor: colors.surfaceRaised,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
  },
  navBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceMuted,
  },
  navBtnDisabled: {
    opacity: 0.4,
  },
  navBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.text,
  },
  navBtnTextDisabled: {
    color: colors.textMuted,
  },
  footerStepIndicator: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textMuted,
  },
  accessControlSection: {
    marginTop: spacing.lg,
    paddingTop: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  accessSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  accessSectionTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.text,
  },
  accessSectionSubtitle: {
    fontSize: 12,
    color: colors.textMuted,
    marginBottom: spacing.md,
  },
  accessRadioGroup: {
    gap: spacing.sm,
  },
  accessRadioCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceMuted,
  },
  accessRadioCardActive: {
    borderColor: colors.primary,
    backgroundColor: colors.surfaceRaised,
  },
  accessOptionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.text,
  },
  accessOptionSub: {
    fontSize: 12,
    color: colors.textMuted,
    marginTop: 2,
    lineHeight: 16,
  },
  batchSelectorContainer: {
    marginTop: spacing.md,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceRaised,
    borderWidth: 1,
    borderColor: colors.border,
  },
  batchSelectLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.text,
    marginBottom: spacing.sm,
  },
  batchChipsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    marginBottom: spacing.sm,
  },
  batchChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceMuted,
  },
  batchChipActive: {
    borderColor: colors.primary,
    backgroundColor: '#EFF6FF',
  },
  batchChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textMuted,
  },
  batchChipTextActive: {
    color: colors.primary,
    fontWeight: '700',
  },
  batchEmptyWarning: {
    fontSize: 12,
    color: colors.textMuted,
    fontStyle: 'italic',
    marginVertical: 4,
  },
  batchWarningText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.danger,
    marginTop: 4,
  },
  batchSuccessText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#15803D',
    marginTop: 4,
  },
});
