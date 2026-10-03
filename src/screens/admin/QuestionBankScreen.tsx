import React, { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import DocumentPicker, { isCancel, pickSingle, types } from 'react-native-document-picker';
import {
  BookOpen,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Edit3,
  FileCode,
  FilePlus2,
  FileSpreadsheet,
  FileText,
  FolderOpen,
  HelpCircle,
  ImageIcon,
  Layers,
  PlusCircle,
  Save,
  Search,
  ShieldAlert,
  Sparkles,
  Trash2,
  UploadCloud,
  X,
  XCircle,
} from 'lucide-react-native';

import { AppHeader } from '../../components/common/AppHeader';
import { AnimatedPressable } from '../../components/common/AnimatedPressable';
import { Badge } from '../../components/common/Badge';
import { Card } from '../../components/common/Card';
import { EmptyState } from '../../components/common/EmptyState';
import { Screen } from '../../components/common/Screen';
import { RootStackScreenProps } from '../../navigation/types';
import { useAppStore } from '../../store/appStore';
import { useAuthStore } from '../../store/authStore';
import { colors, radius, spacing } from '../../theme';
import { CreateTestQuestionPayload, QuestionBankQuestion, QuestionBankSet, QuestionType } from '../../types';
import { DocxParseResult, ParsedDocxQuestion, parseDocxQuestionPaper } from '../../services/word/docxQuestionParser';
import { uploadExamAsset } from '../../services/api/storage';
import { formatExamTextForDisplay } from '../../utils/examText';

const SUBJECT_OPTIONS = ['Physics', 'Chemistry', 'Mathematics', 'Biology'];
const SECTION_OPTIONS = ['Section A (MCQ)', 'Section B (Numeric)'];

export function QuestionBankScreen({ navigation, route }: RootStackScreenProps<'QuestionBank'>) {
  const mode = route.params?.mode ?? 'manage';
  const user = useAuthStore((state) => state.user);
  const isAdmin = user?.role === 'admin' && user.approvalStatus === 'approved';

  const questionBankSets = useAppStore((state) => state.questionBankSets);
  const questionBankSelection = useAppStore((state) => state.questionBankSelection);
  const createQuestionSet = useAppStore((state) => state.createQuestionSet);
  const deleteQuestionSet = useAppStore((state) => state.deleteQuestionSet);
  const loadQuestionBankSets = useAppStore((state) => state.loadQuestionBankSets);
  const loadQuestionSetQuestions = useAppStore((state) => state.loadQuestionSetQuestions);
  const queueDraftQuestions = useAppStore((state) => state.queueDraftQuestions);
  const queueSelectedQuestionBankQuestions = useAppStore((state) => state.queueSelectedQuestionBankQuestions);
  const clearQuestionBankSelection = useAppStore((state) => state.clearQuestionBankSelection);

  const [isLoading, setIsLoading] = useState(false);
  const [isParsingDocx, setIsParsingDocx] = useState(false);
  const [isSavingSet, setIsSavingSet] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // Docx Parse result state
  const [parsedDocx, setParsedDocx] = useState<DocxParseResult | null>(null);
  const [selectedSubjectTab, setSelectedSubjectTab] = useState<string>('ALL');
  const [displayLimit, setDisplayLimit] = useState<number>(20);

  // Edit question modal state
  const [editingQuestionIndex, setEditingQuestionIndex] = useState<number | null>(null);
  const [editPrompt, setEditPrompt] = useState('');
  const [editSubject, setEditSubject] = useState('Physics');
  const [editSection, setEditSection] = useState('Section A (MCQ)');
  const [editType, setEditType] = useState<QuestionType>('mcq');
  const [editOptions, setEditOptions] = useState<string[]>(['', '', '', '']);
  const [editCorrectAnswer, setEditCorrectAnswer] = useState('');
  const [editExplanation, setEditExplanation] = useState('');
  const [editImageUrl, setEditImageUrl] = useState<string | null>(null);
  const [isUploadingImage, setIsUploadingImage] = useState(false);

  const loadSets = useCallback(
    async (force = false) => {
      setIsLoading(true);
      try {
        await loadQuestionBankSets(force);
      } catch (error) {
        Alert.alert('Unable to load question bank', error instanceof Error ? error.message : 'Please try again.');
      } finally {
        setIsLoading(false);
      }
    },
    [loadQuestionBankSets],
  );

  useFocusEffect(
    React.useCallback(() => {
      if (!isAdmin) {
        return undefined;
      }

      void loadSets();
      return undefined;
    }, [isAdmin, loadSets]),
  );

  const handleProcessDocxFile = async (fileData: ArrayBuffer | Blob, fileName: string) => {
    setIsParsingDocx(true);
    try {
      const result = await parseDocxQuestionPaper(fileData, fileName);
      if (result.questions.length === 0) {
        Alert.alert('No Questions Found', 'Could not detect any questions in this Word document. Please ensure questions follow Q1, 1., or Section headers.');
        return;
      }
      setParsedDocx(result);
      setSelectedSubjectTab('ALL');
      setDisplayLimit(20);
      Alert.alert(
        'Word Document Parsed Successfully!',
        `Extracted ${result.totalQuestions} questions with diagrams, formulas & options across ${Object.keys(result.subjectCounts).length} subjects.`,
      );
    } catch (error) {
      console.error('[DocxParse] Error:', error);
      Alert.alert('Word File Parsing Error', error instanceof Error ? error.message : 'Failed to parse .docx file.');
    } finally {
      setIsParsingDocx(false);
    }
  };

  const handlePickDocxFile = async () => {
    try {
      if (Platform.OS === 'web' && typeof document !== 'undefined') {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document';
        input.onchange = async (event: any) => {
          const file = event.target?.files?.[0];
          if (!file) return;
          await handleProcessDocxFile(file, file.name);
        };
        input.click();
        return;
      }

      const file = await pickSingle({
        type: [types.allFiles],
        copyTo: 'cachesDirectory',
      });

      const uri = file.fileCopyUri ?? file.uri;
      const res = await fetch(uri);
      const blob = await res.blob();
      await handleProcessDocxFile(blob, file.name ?? 'Question_Paper.docx');
    } catch (error) {
      if (DocumentPicker.isCancel?.(error) || isCancel(error)) {
        return;
      }
      Alert.alert('File Selection Failed', error instanceof Error ? error.message : 'Unable to select Word document.');
    }
  };

  const handleClearParsedDocx = () => {
    setParsedDocx(null);
  };

  const handleSaveParsedSet = async () => {
    if (!parsedDocx || parsedDocx.questions.length === 0) return;

    setIsSavingSet(true);
    try {
      const formattedQuestions = parsedDocx.questions.map((q) => ({
        question: q.prompt,
        options: q.type === 'mcq' ? q.options : [],
        correct_answer: q.correctAnswer,
        type: q.type,
        explanation: q.explanation || '',
        image_url: q.imageUrl ?? null,
      }));

      const created = await createQuestionSet({
        pdfName: parsedDocx.fileName,
        questions: formattedQuestions,
      });

      await loadSets(true);
      Alert.alert('Question Set Saved!', `Saved as Set #${created.set_id} with ${created.question_count} questions.`);
    } catch (error) {
      console.error('[SaveQuestionSet] Error:', error);
      Alert.alert('Save Failed', error instanceof Error ? error.message : 'Unable to save question set.');
    } finally {
      setIsSavingSet(false);
    }
  };

  const handleCreateExamFromDocx = () => {
    if (!parsedDocx || parsedDocx.questions.length === 0) return;

    const draftQuestions: CreateTestQuestionPayload[] = parsedDocx.questions.map((q) => {
      let prompt = (q.prompt || '').trim();
      if (!prompt && q.imageUrl) {
        prompt = 'Refer to the question diagram below.';
      }

      let correctIdx = 0;
      let opts = (q.options || []).map((opt) => opt.trim());
      if (q.type === 'mcq') {
        const upper = (q.correctAnswer || '').toUpperCase().trim();
        if (upper === 'A' || upper === '1') correctIdx = 0;
        else if (upper === 'B' || upper === '2') correctIdx = 1;
        else if (upper === 'C' || upper === '3') correctIdx = 2;
        else if (upper === 'D' || upper === '4') correctIdx = 3;
        else {
          const matchIdx = opts.findIndex((opt) => opt.toLowerCase() === (q.correctAnswer || '').toLowerCase());
          if (matchIdx !== -1) correctIdx = matchIdx;
        }

        if (opts.length === 0 || opts.every((opt) => !opt)) {
          opts = ['(A)', '(B)', '(C)', '(D)'];
        } else {
          opts = opts.map((opt, optIndex) => opt || `(${String.fromCharCode(65 + optIndex)})`);
          while (opts.length < 4) {
            opts.push(`(${String.fromCharCode(65 + opts.length)})`);
          }
        }
      } else {
        opts = ['', '', '', ''];
      }

      let intAns: number | undefined = undefined;
      if (q.type === 'integer') {
        const parsed = typeof q.integerAnswer === 'number' && !Number.isNaN(q.integerAnswer)
          ? q.integerAnswer
          : parseFloat(String(q.correctAnswer || '0'));
        intAns = Number.isNaN(parsed) ? 0 : parsed;
      }

      return {
        type: q.type,
        prompt,
        options: opts,
        correctOptionIndex: correctIdx,
        integerAnswer: intAns,
        explanation: q.explanation || '',
        imageUrl: q.imageUrl || null,
        subjectLabel: q.subjectLabel || 'Physics',
      };
    });

    queueDraftQuestions(draftQuestions);
    navigation.navigate('CreateTest');
  };

  const handleCreateExamFromSavedSet = async (item: QuestionBankSet) => {
    setIsLoading(true);
    try {
      const rows = await loadQuestionSetQuestions(item.setId);
      if (rows.length === 0) {
        Alert.alert('Empty Set', 'No questions found in this set.');
        return;
      }

      const sortedRows = [...(rows || [])].sort((a, b) => Number(a.id) - Number(b.id));
      const draftQuestions: CreateTestQuestionPayload[] = sortedRows.map((q) => {
        let prompt = (q.question || '').trim();
        if (!prompt && q.imageUrl) {
          prompt = 'Refer to the question diagram below.';
        }

        let correctIdx = 0;
        let opts = (q.options || []).map((opt) => opt.trim());
        if (q.type === 'mcq') {
          const upper = (q.correctAnswer || '').toUpperCase().trim();
          if (upper === 'A' || upper === '1') correctIdx = 0;
          else if (upper === 'B' || upper === '2') correctIdx = 1;
          else if (upper === 'C' || upper === '3') correctIdx = 2;
          else if (upper === 'D' || upper === '4') correctIdx = 3;
          else {
            const matchIdx = opts.findIndex((opt) => opt.toLowerCase() === (q.correctAnswer || '').toLowerCase());
            if (matchIdx !== -1) correctIdx = matchIdx;
          }

          if (opts.length === 0 || opts.every((opt) => !opt)) {
            opts = ['(A)', '(B)', '(C)', '(D)'];
          } else {
            opts = opts.map((opt, optIndex) => opt || `(${String.fromCharCode(65 + optIndex)})`);
            while (opts.length < 4) {
              opts.push(`(${String.fromCharCode(65 + opts.length)})`);
            }
          }
        } else {
          opts = ['', '', '', ''];
        }

        let intAns: number | undefined = undefined;
        if (q.type === 'integer') {
          const parsed = parseFloat(q.correctAnswer || '0');
          intAns = Number.isNaN(parsed) ? 0 : parsed;
        }

        return {
          type: q.type,
          prompt,
          options: opts,
          correctOptionIndex: correctIdx,
          integerAnswer: intAns,
          explanation: '',
          imageUrl: q.imageUrl || null,
          subjectLabel: 'Physics',
        };
      });

      queueDraftQuestions(draftQuestions);
      navigation.navigate('CreateTest');
    } catch (error) {
      Alert.alert('Unable to load set questions', error instanceof Error ? error.message : 'Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteSet = (setId: number, setName: string) => {
    Alert.alert(
      'Delete Question Set',
      `Are you sure you want to delete set #${setId} (${setName})? This action cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete Set',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteQuestionSet(setId);
              await loadSets(true);
              Alert.alert('Set deleted', `Question Set #${setId} has been deleted.`);
            } catch (error) {
              Alert.alert('Delete failed', error instanceof Error ? error.message : 'Unable to delete set.');
            }
          },
        },
      ],
    );
  };

  const handleUseSelection = () => {
    const queued = queueSelectedQuestionBankQuestions();
    if (queued.length === 0) {
      Alert.alert('No questions selected', 'Select at least one question from the bank first.');
      return;
    }
    navigation.goBack();
  };

  // Open Modal to Add an Extra Question
  const handleOpenAddQuestion = () => {
    setEditingQuestionIndex(-1);
    setEditPrompt('');
    setEditSubject(selectedSubjectTab !== 'ALL' ? selectedSubjectTab : 'Physics');
    setEditSection('Section A (MCQ)');
    setEditType('mcq');
    setEditOptions(['', '', '', '']);
    setEditCorrectAnswer('A');
    setEditExplanation('');
    setEditImageUrl(null);
  };

  // Open Edit Modal for a Parsed Question
  const handleOpenEditQuestion = (question: ParsedDocxQuestion, index: number) => {
    setEditingQuestionIndex(index);
    setEditPrompt(question.prompt);
    setEditSubject(question.subjectLabel || 'Physics');
    setEditSection(question.sectionLabel || 'Section A (MCQ)');
    setEditType(question.type || 'mcq');
    setEditOptions(
      question.options.length >= 4
        ? [...question.options]
        : [...question.options, ...Array(Math.max(0, 4 - question.options.length)).fill('')],
    );
    setEditCorrectAnswer(question.correctAnswer || (question.type === 'integer' ? String(question.integerAnswer ?? '') : 'A'));
    setEditExplanation(question.explanation || '');
    setEditImageUrl(question.imageUrl ?? null);
  };

  const handlePickQuestionImage = async () => {
    try {
      setIsUploadingImage(true);
      if (Platform.OS === 'web' && typeof document !== 'undefined') {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/*';
        input.onchange = async (event: any) => {
          const file = event.target?.files?.[0];
          if (!file) {
            setIsUploadingImage(false);
            return;
          }
          try {
            const uploaded = await uploadExamAsset({
              uri: URL.createObjectURL(file),
              name: file.name,
              mimeType: file.type,
              folder: 'images',
              file,
            });
            setEditImageUrl(uploaded.publicUrl);
          } catch {
            const reader = new FileReader();
            reader.onload = () => {
              if (typeof reader.result === 'string') {
                setEditImageUrl(reader.result);
              }
            };
            reader.readAsDataURL(file);
          } finally {
            setIsUploadingImage(false);
          }
        };
        input.click();
        return;
      }

      const file = await pickSingle({
        type: [types.images],
        copyTo: 'cachesDirectory',
      });

      const uploaded = await uploadExamAsset({
        uri: file.fileCopyUri ?? file.uri,
        name: file.name,
        mimeType: file.type,
        folder: 'images',
        file: (file as { file?: File }).file,
      });

      setEditImageUrl(uploaded.publicUrl);
    } catch (error) {
      if (DocumentPicker.isCancel?.(error) || isCancel(error)) {
        return;
      }
      Alert.alert('Upload failed', error instanceof Error ? error.message : 'Unable to upload image.');
    } finally {
      setIsUploadingImage(false);
    }
  };

  const handleSaveQuestionEdit = () => {
    if (editingQuestionIndex === null || !parsedDocx) return;

    if (!editPrompt.trim()) {
      Alert.alert('Prompt required', 'Please enter a question prompt.');
      return;
    }

    const updatedQuestions = [...parsedDocx.questions];
    let parsedInt: number | null = null;
    if (editType === 'integer') {
      const num = parseFloat(editCorrectAnswer);
      if (!isNaN(num)) parsedInt = num;
    }

    if (editingQuestionIndex === -1) {
      const nextQNum = (parsedDocx.questions[parsedDocx.questions.length - 1]?.questionNumber ?? 0) + 1;
      const newQuestion: ParsedDocxQuestion = {
        questionNumber: nextQNum,
        prompt: editPrompt.trim(),
        subjectLabel: editSubject,
        sectionLabel: editSection,
        type: editType,
        options: editType === 'mcq' ? editOptions.map((o) => o.trim()) : [],
        correctAnswer: editCorrectAnswer.trim().toUpperCase(),
        integerAnswer: parsedInt,
        explanation: editExplanation.trim(),
        imageUrl: editImageUrl,
      };
      updatedQuestions.push(newQuestion);
    } else {
      const targetQ = updatedQuestions[editingQuestionIndex];
      if (!targetQ) return;

      updatedQuestions[editingQuestionIndex] = {
        ...targetQ,
        prompt: editPrompt.trim(),
        subjectLabel: editSubject,
        sectionLabel: editSection,
        type: editType,
        options: editType === 'mcq' ? editOptions.map((o) => o.trim()) : [],
        correctAnswer: editCorrectAnswer.trim().toUpperCase(),
        integerAnswer: parsedInt,
        explanation: editExplanation.trim(),
        imageUrl: editImageUrl,
      };
    }

    // Recompute subject counts
    const subjectCounts: Record<string, number> = {};
    for (const q of updatedQuestions) {
      subjectCounts[q.subjectLabel] = (subjectCounts[q.subjectLabel] || 0) + 1;
    }

    setParsedDocx({
      ...parsedDocx,
      totalQuestions: updatedQuestions.length,
      questions: updatedQuestions,
      subjectCounts,
    });

    const isAdded = editingQuestionIndex === -1;
    setEditingQuestionIndex(null);
    Alert.alert(isAdded ? 'Question Added' : 'Question Updated', isAdded ? 'Extra question added to set successfully!' : 'Changes saved!');
  };

  const filteredSets = useMemo(() => {
    if (!searchQuery.trim()) return questionBankSets;
    const q = searchQuery.toLowerCase().trim();
    return questionBankSets.filter((s) => s.pdfName.toLowerCase().includes(q) || String(s.setId).includes(q));
  }, [questionBankSets, searchQuery]);

  const visibleParsedQuestions = useMemo(() => {
    if (!parsedDocx) return [];
    if (selectedSubjectTab === 'ALL') return parsedDocx.questions;
    return parsedDocx.questions.filter((q) => q.subjectLabel.toUpperCase() === selectedSubjectTab.toUpperCase());
  }, [parsedDocx, selectedSubjectTab]);

  const availableSubjects = useMemo(() => {
    if (!parsedDocx) return [];
    return Object.keys(parsedDocx.subjectCounts);
  }, [parsedDocx]);

  if (!isAdmin) {
    return (
      <Screen>
        <AppHeader title="Question Bank" subtitle="Restricted to approved MIITJEE admins" showLogo={false} />
        <View style={styles.accessWrap}>
          <EmptyState
            icon={ShieldAlert}
            title="Admin access required"
            description="Only approved admins can manage or reuse question-bank sets."
          />
        </View>
      </Screen>
    );
  }

  return (
    <Screen useScrollView={false}>
      <FlatList
        data={filteredSets}
        keyExtractor={(item) => String(item.setId)}
        contentContainerStyle={styles.content}
        ListHeaderComponent={
          <>
            <AppHeader
              title="Question Bank"
              subtitle={
                mode === 'picker'
                  ? 'Pick questions from saved sets to build a custom paper'
                  : 'Upload Word (.docx) papers with formulas, diagrams, subjects & 1-click test creation'
              }
              showLogo={false}
            />

            {mode === 'manage' ? (
              <View style={styles.headerSection}>
                {/* 1. Word Document Upload & Auto-Parser Card */}
                <Card style={styles.uploadCard}>
                  <View style={styles.uploadHeaderRow}>
                    <View style={styles.iconBadge}>
                      <FileCode size={22} color={colors.primary} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.cardTitle}>Word (.docx) Question Parser</Text>
                      <Text style={styles.cardHint}>
                        Auto-extracts formulas, math symbols, embedded diagram images, subjects (Physics, Chemistry, Maths, Bio) & Section A/B.
                      </Text>
                    </View>
                  </View>

                  <AnimatedPressable
                    style={[styles.docxUploadButton, isParsingDocx ? styles.buttonDisabled : null]}
                    onPress={() => void handlePickDocxFile()}
                    disabled={isParsingDocx}>
                    {isParsingDocx ? (
                      <>
                        <ActivityIndicator color={colors.white} size="small" />
                        <Text style={styles.docxUploadButtonText}>Extracting Questions, Formulas & Diagrams...</Text>
                      </>
                    ) : (
                      <>
                        <UploadCloud size={20} color={colors.white} />
                        <Text style={styles.docxUploadButtonText}>Choose & Parse Word (.docx) File</Text>
                      </>
                    )}
                  </AnimatedPressable>
                </Card>

                {/* 2. Interactive Parsed Question Set Preview Card */}
                {parsedDocx ? (
                  <Card style={styles.previewContainerCard}>
                    <View style={styles.previewHeaderRow}>
                      <View style={{ flex: 1 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}>
                          <CheckCircle2 size={18} color={colors.success} />
                          <Text style={styles.previewTitle} numberOfLines={1}>
                            {parsedDocx.fileName}
                          </Text>
                        </View>
                        <Text style={styles.previewMeta}>
                          {parsedDocx.totalQuestions} questions extracted successfully
                        </Text>
                      </View>
                      <AnimatedPressable style={styles.closePreviewButton} onPress={handleClearParsedDocx}>
                        <X size={16} color={colors.textMuted} />
                      </AnimatedPressable>
                    </View>

                    {/* Subject Counts Badges */}
                    <View style={styles.subjectBadgesRow}>
                      {Object.entries(parsedDocx.subjectCounts).map(([sub, count]) => (
                        <View key={sub} style={styles.subjectBadge}>
                          <Text style={styles.subjectBadgeLabel}>{sub}:</Text>
                          <Text style={styles.subjectBadgeCount}>{count} Qs</Text>
                        </View>
                      ))}
                    </View>

                    {/* Action Buttons: 1-Click Save & 1-Click Create Exam */}
                    <View style={styles.actionButtonsRow}>
                      <AnimatedPressable style={styles.addQuestionDirectButton} onPress={handleOpenAddQuestion}>
                        <PlusCircle size={16} color={colors.primary} />
                        <Text style={styles.addQuestionDirectButtonText}>Add Question</Text>
                      </AnimatedPressable>

                      <AnimatedPressable
                        style={[styles.saveSetButton, isSavingSet ? styles.buttonDisabled : null]}
                        onPress={() => void handleSaveParsedSet()}
                        disabled={isSavingSet}>
                        {isSavingSet ? (
                          <ActivityIndicator color={colors.primary} size="small" />
                        ) : (
                          <FolderOpen size={16} color={colors.primary} />
                        )}
                        <Text style={styles.saveSetButtonText}>Save to Bank</Text>
                      </AnimatedPressable>

                      <AnimatedPressable style={styles.createExamDirectButton} onPress={handleCreateExamFromDocx}>
                        <Sparkles size={16} color={colors.white} />
                        <Text style={styles.createExamDirectButtonText}>Create Exam from this Set</Text>
                      </AnimatedPressable>
                    </View>

                    {/* Subject Filter Tabs */}
                    <View style={styles.subjectTabsRow}>
                      <AnimatedPressable
                        style={[styles.subjectTab, selectedSubjectTab === 'ALL' ? styles.subjectTabActive : null]}
                        onPress={() => {
                          setSelectedSubjectTab('ALL');
                          setDisplayLimit(20);
                        }}>
                        <Text style={[styles.subjectTabText, selectedSubjectTab === 'ALL' ? styles.subjectTabTextActive : null]}>
                          All ({parsedDocx.totalQuestions})
                        </Text>
                      </AnimatedPressable>
                      {availableSubjects.map((sub) => (
                        <AnimatedPressable
                          key={sub}
                          style={[styles.subjectTab, selectedSubjectTab.toUpperCase() === sub.toUpperCase() ? styles.subjectTabActive : null]}
                          onPress={() => {
                            setSelectedSubjectTab(sub.toUpperCase());
                            setDisplayLimit(20);
                          }}>
                          <Text
                            style={[
                              styles.subjectTabText,
                              selectedSubjectTab.toUpperCase() === sub.toUpperCase() ? styles.subjectTabTextActive : null,
                            ]}>
                            {sub} ({parsedDocx.subjectCounts[sub]})
                          </Text>
                        </AnimatedPressable>
                      ))}
                    </View>

                    {/* Extracted Questions Preview List */}
                    <View style={styles.previewQuestionsList}>
                      {visibleParsedQuestions.slice(0, displayLimit).map((q, idx) => {
                        const originalIndex = parsedDocx.questions.findIndex((item) => item.questionNumber === q.questionNumber);
                        return (
                          <View key={`${q.questionNumber}_${idx}`} style={styles.parsedQuestionCard}>
                            <View style={styles.parsedQuestionHeader}>
                              <View style={styles.questionNumBadge}>
                                <Text style={styles.questionNumText}>Q{q.questionNumber}</Text>
                              </View>
                              <Badge label={q.subjectLabel} tone="primary" />
                              <Badge label={q.sectionLabel} tone="neutral" />
                              <Text style={styles.parsedQuestionType}>{q.type.toUpperCase()}</Text>

                              {/* Edit Button */}
                              <AnimatedPressable
                                style={styles.editQuestionPill}
                                onPress={() => handleOpenEditQuestion(q, originalIndex !== -1 ? originalIndex : idx)}>
                                <Edit3 size={12} color={colors.primary} />
                                <Text style={styles.editQuestionPillText}>Edit</Text>
                              </AnimatedPressable>
                            </View>

                            <Text style={styles.parsedQuestionPrompt}>{formatExamTextForDisplay(q.prompt)}</Text>

                            {q.imageUrl ? (
                              <Image
                                source={{ uri: q.imageUrl }}
                                style={styles.parsedQuestionDiagram}
                                resizeMode="contain"
                              />
                            ) : null}

                            {q.type === 'mcq' && q.options.length > 0 ? (
                              <View style={styles.parsedOptionsGrid}>
                                {q.options.map((opt, optIdx) => {
                                  const optLetter = String.fromCharCode(65 + optIdx);
                                  const isCorrect =
                                    q.correctAnswer.toUpperCase() === optLetter ||
                                    q.correctAnswer.toUpperCase() === String(optIdx + 1) ||
                                    opt.trim().toLowerCase() === q.correctAnswer.toLowerCase();
                                  return (
                                    <View
                                      key={`${q.questionNumber}_opt_${optIdx}`}
                                      style={[styles.parsedOptionItem, isCorrect ? styles.parsedOptionItemCorrect : null]}>
                                      <Text style={[styles.parsedOptionLetter, isCorrect ? styles.parsedOptionLetterCorrect : null]}>
                                        ({optLetter})
                                      </Text>
                                      <Text style={[styles.parsedOptionText, isCorrect ? styles.parsedOptionTextCorrect : null]}>
                                        {formatExamTextForDisplay(opt)}
                                      </Text>
                                    </View>
                                  );
                                })}
                              </View>
                            ) : (
                              <View style={styles.parsedNumericAnswerBox}>
                                <Text style={styles.parsedNumericAnswerLabel}>Correct Numeric Answer: </Text>
                                <Text style={styles.parsedNumericAnswerValue}>{q.correctAnswer || q.integerAnswer}</Text>
                              </View>
                            )}

                            {q.explanation ? (
                              <View style={styles.parsedExplanationBox}>
                                <Text style={styles.parsedExplanationLabel}>Solution / Hint:</Text>
                                <Text style={styles.parsedExplanationText}>{q.explanation}</Text>
                              </View>
                            ) : null}
                          </View>
                        );
                      })}

                      {/* Interactive View More / Expand All Controls */}
                      {visibleParsedQuestions.length > displayLimit ? (
                        <View style={styles.viewMoreContainer}>
                          <AnimatedPressable
                            style={styles.viewMoreButton}
                            onPress={() => setDisplayLimit((prev) => prev + 20)}>
                            <ChevronDown size={16} color={colors.primary} />
                            <Text style={styles.viewMoreButtonText}>
                              Load Next 20 Questions (Showing {displayLimit} of {visibleParsedQuestions.length})
                            </Text>
                          </AnimatedPressable>

                          <AnimatedPressable
                            style={styles.showAllButton}
                            onPress={() => setDisplayLimit(visibleParsedQuestions.length)}>
                            <Sparkles size={14} color={colors.white} />
                            <Text style={styles.showAllButtonText}>
                              Show All ({visibleParsedQuestions.length} Questions)
                            </Text>
                          </AnimatedPressable>
                        </View>
                      ) : null}
                    </View>
                  </Card>
                ) : null}
              </View>
            ) : (
              <Card style={styles.selectionCard}>
                <Text style={styles.cardTitle}>Paper Builder Selection</Text>
                <Text style={styles.cardHint}>
                  {questionBankSelection.length > 0
                    ? `${questionBankSelection.length} questions selected across sets.`
                    : 'Open any set and select questions. The order number tracks your custom paper flow.'}
                </Text>
                <View style={styles.selectionRow}>
                  <AnimatedPressable style={styles.secondaryInlineButton} onPress={clearQuestionBankSelection}>
                    <Text style={styles.secondaryInlineButtonText}>Clear Selection</Text>
                  </AnimatedPressable>
                  <AnimatedPressable style={styles.primaryInlineButton} onPress={handleUseSelection}>
                    <Text style={styles.primaryInlineButtonText}>
                      {questionBankSelection.length > 0 ? `Use ${questionBankSelection.length} Questions` : 'Use Selection'}
                    </Text>
                  </AnimatedPressable>
                </View>
              </Card>
            )}

            {/* Search & Saved Sets Header */}
            <View style={styles.savedSetsHeaderRow}>
              <Text style={styles.sectionTitle}>Saved Question Sets ({filteredSets.length})</Text>
            </View>

            <View style={styles.searchBar}>
              <Search size={16} color={colors.textMuted} />
              <TextInput
                style={styles.searchInput}
                placeholder="Search question sets by name or ID..."
                placeholderTextColor={colors.textMuted}
                value={searchQuery}
                onChangeText={setSearchQuery}
              />
              {searchQuery ? (
                <AnimatedPressable onPress={() => setSearchQuery('')}>
                  <X size={16} color={colors.textMuted} />
                </AnimatedPressable>
              ) : null}
            </View>
          </>
        }
        renderItem={({ item }) => (
          <View style={styles.setCardRow}>
            <AnimatedPressable
              style={styles.setCard}
              onPress={() =>
                navigation.navigate('QuestionSetQuestions', {
                  setId: item.setId,
                  setName: item.pdfName,
                  mode,
                })
              }>
              <View style={styles.setHeader}>
                <View style={styles.setFolderIcon}>
                  <FolderOpen size={18} color={colors.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.setTitle} numberOfLines={1}>
                    {item.pdfName}
                  </Text>
                  <Text style={styles.setMeta}>
                    Set #{item.setId} • {item.questionCount} questions
                  </Text>
                </View>
                <ChevronRight size={18} color={colors.textMuted} />
              </View>

              {mode === 'manage' ? (
                <View style={styles.setCardActions}>
                  <AnimatedPressable
                    style={styles.buildExamPill}
                    onPress={() => void handleCreateExamFromSavedSet(item)}>
                    <Sparkles size={13} color={colors.primary} />
                    <Text style={styles.buildExamPillText}>Build Exam</Text>
                  </AnimatedPressable>

                  <AnimatedPressable
                    style={styles.deleteSetIconButton}
                    onPress={() => handleDeleteSet(item.setId, item.pdfName)}>
                    <Trash2 size={15} color={colors.danger} />
                  </AnimatedPressable>
                </View>
              ) : null}
            </AnimatedPressable>
          </View>
        )}
        ListEmptyComponent={
          isLoading ? (
            <Card style={styles.emptyCard}>
              <ActivityIndicator size="small" color={colors.primary} />
              <Text style={styles.cardHint}>Loading saved sets...</Text>
            </Card>
          ) : (
            <EmptyState
              icon={FolderOpen}
              title="No question sets found"
              description="Upload a Word (.docx) paper above to extract questions and build reusable sets."
            />
          )
        }
        showsVerticalScrollIndicator={false}
      />

      {/* Edit Question Modal */}
      <Modal
        visible={editingQuestionIndex !== null}
        animationType="slide"
        transparent
        onRequestClose={() => setEditingQuestionIndex(null)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContainer}>
            <View style={styles.modalHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}>
                {editingQuestionIndex === -1 ? (
                  <PlusCircle size={18} color={colors.primary} />
                ) : (
                  <Edit3 size={18} color={colors.primary} />
                )}
                <Text style={styles.modalTitle}>
                  {editingQuestionIndex === -1
                    ? 'Add Extra Question'
                    : `Edit Question Q${editingQuestionIndex !== null && parsedDocx?.questions[editingQuestionIndex] ? parsedDocx.questions[editingQuestionIndex]?.questionNumber : ''}`}
                </Text>
              </View>
              <AnimatedPressable style={styles.modalCloseButton} onPress={() => setEditingQuestionIndex(null)}>
                <X size={18} color={colors.textMuted} />
              </AnimatedPressable>
            </View>

            <ScrollView contentContainerStyle={styles.modalScrollContent} showsVerticalScrollIndicator={false}>
              {/* Subject Selector */}
              <Text style={styles.inputSectionLabel}>Subject</Text>
              <View style={styles.choiceChipsRow}>
                {SUBJECT_OPTIONS.map((sub) => (
                  <AnimatedPressable
                    key={sub}
                    style={[styles.choiceChip, editSubject === sub ? styles.choiceChipActive : null]}
                    onPress={() => setEditSubject(sub)}>
                    <Text style={[styles.choiceChipText, editSubject === sub ? styles.choiceChipTextActive : null]}>
                      {sub}
                    </Text>
                  </AnimatedPressable>
                ))}
              </View>

              {/* Section Selector */}
              <Text style={styles.inputSectionLabel}>Section & Format</Text>
              <View style={styles.choiceChipsRow}>
                {SECTION_OPTIONS.map((sec) => (
                  <AnimatedPressable
                    key={sec}
                    style={[styles.choiceChip, editSection === sec ? styles.choiceChipActive : null]}
                    onPress={() => {
                      setEditSection(sec);
                      setEditType(sec.includes('Numeric') ? 'integer' : 'mcq');
                    }}>
                    <Text style={[styles.choiceChipText, editSection === sec ? styles.choiceChipTextActive : null]}>
                      {sec}
                    </Text>
                  </AnimatedPressable>
                ))}
              </View>

              {/* Prompt Input */}
              <Text style={styles.inputSectionLabel}>Question Prompt</Text>
              <TextInput
                style={styles.modalTextInputMultiline}
                multiline
                numberOfLines={4}
                value={editPrompt}
                onChangeText={setEditPrompt}
                placeholder="Enter full question text with formulas..."
                placeholderTextColor={colors.textMuted}
              />

              {/* Diagram / Image */}
              <Text style={styles.inputSectionLabel}>Question Diagram / Image (Optional)</Text>
              {editImageUrl ? (
                <View style={styles.modalImagePreviewBox}>
                  <Image source={{ uri: editImageUrl }} style={styles.modalImagePreview} resizeMode="contain" />
                  <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.xs }}>
                    <AnimatedPressable
                      style={styles.changeImagePill}
                      onPress={() => void handlePickQuestionImage()}
                      disabled={isUploadingImage}>
                      <UploadCloud size={13} color={colors.primary} />
                      <Text style={styles.changeImagePillText}>
                        {isUploadingImage ? 'Uploading...' : 'Change Diagram'}
                      </Text>
                    </AnimatedPressable>
                    <AnimatedPressable style={styles.removeImagePill} onPress={() => setEditImageUrl(null)}>
                      <Trash2 size={13} color={colors.danger} />
                      <Text style={styles.removeImagePillText}>Remove Diagram</Text>
                    </AnimatedPressable>
                  </View>
                </View>
              ) : (
                <View style={styles.uploadImageContainer}>
                  <AnimatedPressable
                    style={[styles.uploadImageButton, isUploadingImage ? styles.buttonDisabled : null]}
                    onPress={() => void handlePickQuestionImage()}
                    disabled={isUploadingImage}>
                    {isUploadingImage ? (
                      <>
                        <ActivityIndicator size="small" color={colors.primary} />
                        <Text style={styles.uploadImageButtonText}>Uploading Diagram...</Text>
                      </>
                    ) : (
                      <>
                        <ImageIcon size={18} color={colors.primary} />
                        <Text style={styles.uploadImageButtonText}>Attach / Upload Diagram Image</Text>
                      </>
                    )}
                  </AnimatedPressable>
                </View>
              )}

              {/* MCQ Options */}
              {editType === 'mcq' ? (
                <View style={styles.modalOptionsSection}>
                  <Text style={styles.inputSectionLabel}>Options & Correct Answer</Text>
                  {['A', 'B', 'C', 'D'].map((letter, optIdx) => (
                    <View key={letter} style={styles.modalOptionInputRow}>
                      <AnimatedPressable
                        style={[styles.optionLetterBadge, editCorrectAnswer === letter ? styles.optionLetterBadgeCorrect : null]}
                        onPress={() => setEditCorrectAnswer(letter)}>
                        <Text style={[styles.optionLetterBadgeText, editCorrectAnswer === letter ? styles.optionLetterBadgeTextCorrect : null]}>
                          {letter}
                        </Text>
                      </AnimatedPressable>
                      <TextInput
                        style={[styles.modalOptionTextInput, editCorrectAnswer === letter ? styles.modalOptionTextInputCorrect : null]}
                        value={editOptions[optIdx] ?? ''}
                        onChangeText={(val) => {
                          const updated = [...editOptions];
                          updated[optIdx] = val;
                          setEditOptions(updated);
                        }}
                        placeholder={`Option (${letter}) text...`}
                        placeholderTextColor={colors.textMuted}
                      />
                    </View>
                  ))}
                  <Text style={styles.correctSelectHint}>* Tap option letter (A, B, C, D) to mark it as the correct answer.</Text>
                </View>
              ) : (
                <View style={styles.modalNumericSection}>
                  <Text style={styles.inputSectionLabel}>Correct Numerical Value</Text>
                  <TextInput
                    style={styles.modalTextInputSingle}
                    value={editCorrectAnswer}
                    onChangeText={setEditCorrectAnswer}
                    placeholder="e.g. 42 or 3.14"
                    placeholderTextColor={colors.textMuted}
                    keyboardType="numeric"
                  />
                </View>
              )}

              {/* Solution / Explanation */}
              <Text style={styles.inputSectionLabel}>Solution / Explanation (Optional)</Text>
              <TextInput
                style={styles.modalTextInputMultiline}
                multiline
                numberOfLines={3}
                value={editExplanation}
                onChangeText={setEditExplanation}
                placeholder="Add step-by-step solution or formula explanation..."
                placeholderTextColor={colors.textMuted}
              />
            </ScrollView>

            <View style={styles.modalFooter}>
              <AnimatedPressable style={styles.modalCancelButton} onPress={() => setEditingQuestionIndex(null)}>
                <Text style={styles.modalCancelButtonText}>Cancel</Text>
              </AnimatedPressable>
              <AnimatedPressable style={styles.modalSaveButton} onPress={handleSaveQuestionEdit}>
                {editingQuestionIndex === -1 ? (
                  <PlusCircle size={16} color={colors.white} />
                ) : (
                  <Check size={16} color={colors.white} />
                )}
                <Text style={styles.modalSaveButtonText}>
                  {editingQuestionIndex === -1 ? 'Add Question' : 'Save Changes'}
                </Text>
              </AnimatedPressable>
            </View>
          </View>
        </View>
      </Modal>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingBottom: spacing.xxxl,
  },
  accessWrap: {
    paddingHorizontal: spacing.xl,
  },
  headerSection: {
    gap: spacing.md,
    marginBottom: spacing.md,
  },
  uploadCard: {
    marginHorizontal: spacing.xl,
    gap: spacing.md,
    backgroundColor: colors.surface,
  },
  uploadHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  iconBadge: {
    width: 44,
    height: 44,
    borderRadius: radius.lg,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardTitle: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '800',
  },
  cardHint: {
    color: colors.textMuted,
    fontSize: 12,
    lineHeight: 18,
    marginTop: 2,
  },
  docxUploadButton: {
    minHeight: 46,
    borderRadius: radius.lg,
    backgroundColor: colors.primary,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  docxUploadButtonText: {
    color: colors.white,
    fontSize: 13,
    fontWeight: '800',
  },
  buttonDisabled: {
    opacity: 0.65,
  },
  previewContainerCard: {
    marginHorizontal: spacing.xl,
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderColor: colors.primary,
    borderWidth: 1.5,
  },
  previewHeaderRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  previewTitle: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '800',
  },
  previewMeta: {
    color: colors.textMuted,
    fontSize: 12,
    marginTop: 2,
  },
  closePreviewButton: {
    padding: spacing.xs,
    borderRadius: radius.pill,
    backgroundColor: colors.background,
  },
  subjectBadgesRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  subjectBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.primarySoft,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radius.sm,
  },
  subjectBadgeLabel: {
    color: colors.primary,
    fontSize: 11,
    fontWeight: '700',
  },
  subjectBadgeCount: {
    color: colors.text,
    fontSize: 11,
    fontWeight: '800',
  },
  actionButtonsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    flexWrap: 'wrap',
  },
  addQuestionDirectButton: {
    minHeight: 42,
    borderRadius: radius.lg,
    borderWidth: 1.5,
    borderColor: colors.primary,
    backgroundColor: colors.white,
    paddingHorizontal: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
  },
  addQuestionDirectButtonText: {
    color: colors.primary,
    fontSize: 12,
    fontWeight: '800',
  },
  saveSetButton: {
    flex: 1,
    minHeight: 42,
    borderRadius: radius.lg,
    borderWidth: 1.5,
    borderColor: colors.primary,
    backgroundColor: colors.white,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
  },
  saveSetButtonText: {
    color: colors.primary,
    fontSize: 12,
    fontWeight: '800',
  },
  createExamDirectButton: {
    flex: 1.5,
    minHeight: 42,
    borderRadius: radius.lg,
    backgroundColor: colors.primary,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
  },
  createExamDirectButtonText: {
    color: colors.white,
    fontSize: 12,
    fontWeight: '800',
  },
  subjectTabsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: spacing.sm,
  },
  subjectTab: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    borderRadius: radius.sm,
    backgroundColor: colors.background,
  },
  subjectTabActive: {
    backgroundColor: colors.primary,
  },
  subjectTabText: {
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: '700',
  },
  subjectTabTextActive: {
    color: colors.white,
  },
  previewQuestionsList: {
    gap: spacing.md,
  },
  parsedQuestionCard: {
    backgroundColor: colors.background,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.xs,
  },
  parsedQuestionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    flexWrap: 'wrap',
  },
  questionNumBadge: {
    backgroundColor: colors.primary,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: radius.sm,
  },
  questionNumText: {
    color: colors.white,
    fontSize: 11,
    fontWeight: '800',
  },
  parsedQuestionType: {
    color: colors.textMuted,
    fontSize: 10,
    fontWeight: '700',
  },
  editQuestionPill: {
    marginLeft: 'auto',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.primarySoft,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radius.pill,
  },
  editQuestionPillText: {
    color: colors.primary,
    fontSize: 11,
    fontWeight: '700',
  },
  parsedQuestionPrompt: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '600',
    lineHeight: 18,
    marginTop: 4,
  },
  parsedQuestionDiagram: {
    width: '100%',
    height: 180,
    borderRadius: radius.sm,
    marginVertical: spacing.xs,
    backgroundColor: colors.white,
  },
  parsedOptionsGrid: {
    gap: 4,
    marginTop: 4,
  },
  parsedOptionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radius.sm,
    backgroundColor: colors.white,
  },
  parsedOptionItemCorrect: {
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: colors.success,
  },
  parsedOptionLetter: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '700',
  },
  parsedOptionLetterCorrect: {
    color: colors.success,
  },
  parsedOptionText: {
    color: colors.text,
    fontSize: 12,
    fontWeight: '500',
  },
  parsedOptionTextCorrect: {
    color: colors.success,
    fontWeight: '700',
  },
  parsedNumericAnswerBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ECFDF5',
    padding: spacing.sm,
    borderRadius: radius.sm,
    marginTop: 4,
  },
  parsedNumericAnswerLabel: {
    color: colors.success,
    fontSize: 12,
    fontWeight: '700',
  },
  parsedNumericAnswerValue: {
    color: colors.success,
    fontSize: 13,
    fontWeight: '800',
  },
  parsedExplanationBox: {
    backgroundColor: colors.white,
    padding: spacing.sm,
    borderRadius: radius.sm,
    marginTop: 4,
  },
  parsedExplanationLabel: {
    color: colors.textMuted,
    fontSize: 10,
    fontWeight: '700',
  },
  parsedExplanationText: {
    color: colors.text,
    fontSize: 11,
    lineHeight: 16,
  },
  viewMoreContainer: {
    gap: spacing.sm,
    paddingTop: spacing.xs,
  },
  viewMoreButton: {
    minHeight: 40,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.primary,
    backgroundColor: colors.primarySoft,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
  },
  viewMoreButtonText: {
    color: colors.primary,
    fontSize: 12,
    fontWeight: '700',
  },
  showAllButton: {
    minHeight: 40,
    borderRadius: radius.md,
    backgroundColor: colors.primary,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
  },
  showAllButtonText: {
    color: colors.white,
    fontSize: 12,
    fontWeight: '800',
  },
  selectionCard: {
    marginHorizontal: spacing.xl,
    marginBottom: spacing.lg,
    gap: spacing.md,
    backgroundColor: colors.primarySoft,
  },
  selectionRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  secondaryInlineButton: {
    flex: 1,
    minHeight: 40,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.white,
  },
  secondaryInlineButtonText: {
    color: colors.text,
    fontSize: 12,
    fontWeight: '700',
  },
  primaryInlineButton: {
    flex: 2,
    minHeight: 40,
    borderRadius: radius.lg,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryInlineButtonText: {
    color: colors.white,
    fontSize: 12,
    fontWeight: '800',
  },
  savedSetsHeaderRow: {
    marginHorizontal: spacing.xl,
    marginTop: spacing.md,
    marginBottom: spacing.xs,
  },
  sectionTitle: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '800',
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: spacing.xl,
    marginBottom: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.sm,
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
    color: colors.text,
    paddingVertical: spacing.xs,
  },
  setCardRow: {
    marginHorizontal: spacing.xl,
    marginBottom: spacing.sm,
  },
  setCard: {
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    padding: spacing.md,
    gap: spacing.sm,
  },
  setHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  setFolderIcon: {
    width: 36,
    height: 36,
    borderRadius: radius.md,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  setTitle: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '700',
  },
  setMeta: {
    color: colors.textMuted,
    fontSize: 12,
    marginTop: 2,
  },
  setCardActions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: spacing.xs,
  },
  buildExamPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.primarySoft,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: radius.pill,
  },
  buildExamPillText: {
    color: colors.primary,
    fontSize: 12,
    fontWeight: '700',
  },
  deleteSetIconButton: {
    padding: 6,
    borderRadius: radius.pill,
    backgroundColor: '#FEE2E2',
  },
  emptyCard: {
    marginHorizontal: spacing.xl,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.xl,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.md,
  },
  modalContainer: {
    width: '100%',
    maxWidth: 620,
    maxHeight: '90%',
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    padding: spacing.lg,
    gap: spacing.md,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingBottom: spacing.sm,
  },
  modalTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '800',
  },
  modalCloseButton: {
    padding: 4,
    borderRadius: radius.pill,
    backgroundColor: colors.background,
  },
  modalScrollContent: {
    gap: spacing.sm,
    paddingBottom: spacing.md,
  },
  inputSectionLabel: {
    color: colors.text,
    fontSize: 12,
    fontWeight: '700',
    marginTop: spacing.xs,
  },
  choiceChipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  choiceChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: radius.pill,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
  },
  choiceChipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  choiceChipText: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '700',
  },
  choiceChipTextActive: {
    color: colors.white,
  },
  modalTextInputMultiline: {
    backgroundColor: colors.background,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    color: colors.text,
    fontSize: 13,
    textAlignVertical: 'top',
    minHeight: 80,
  },
  modalTextInputSingle: {
    backgroundColor: colors.background,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    color: colors.text,
    fontSize: 13,
  },
  modalImagePreviewBox: {
    backgroundColor: colors.background,
    borderRadius: radius.md,
    padding: spacing.sm,
    alignItems: 'center',
    gap: spacing.xs,
  },
  modalImagePreview: {
    width: '100%',
    height: 160,
    borderRadius: radius.sm,
  },
  removeImagePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#FEE2E2',
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radius.pill,
  },
  removeImagePillText: {
    color: colors.danger,
    fontSize: 11,
    fontWeight: '700',
  },
  changeImagePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.primarySoft,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radius.pill,
  },
  changeImagePillText: {
    color: colors.primary,
    fontSize: 11,
    fontWeight: '700',
  },
  uploadImageContainer: {
    marginTop: spacing.xs,
  },
  uploadImageButton: {
    minHeight: 44,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.primary,
    borderStyle: 'dashed',
    backgroundColor: colors.primarySoft,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
  },
  uploadImageButtonText: {
    color: colors.primary,
    fontSize: 12,
    fontWeight: '700',
  },
  modalOptionsSection: {
    gap: spacing.xs,
  },
  modalOptionInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  optionLetterBadge: {
    width: 32,
    height: 32,
    borderRadius: radius.md,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  optionLetterBadgeCorrect: {
    backgroundColor: colors.success,
    borderColor: colors.success,
  },
  optionLetterBadgeText: {
    color: colors.text,
    fontSize: 12,
    fontWeight: '800',
  },
  optionLetterBadgeTextCorrect: {
    color: colors.white,
  },
  modalOptionTextInput: {
    flex: 1,
    backgroundColor: colors.background,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    color: colors.text,
    fontSize: 13,
  },
  modalOptionTextInputCorrect: {
    borderColor: colors.success,
    backgroundColor: '#ECFDF5',
  },
  correctSelectHint: {
    color: colors.textMuted,
    fontSize: 11,
    fontStyle: 'italic',
    marginTop: 2,
  },
  modalNumericSection: {
    gap: spacing.xs,
  },
  modalFooter: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: spacing.sm,
  },
  modalCancelButton: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalCancelButtonText: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '700',
  },
  modalSaveButton: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: colors.primary,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
  },
  modalSaveButtonText: {
    color: colors.white,
    fontSize: 12,
    fontWeight: '800',
  },
});
