import React, { startTransition, useCallback, useMemo, useState } from 'react';
import { Alert, FlatList, Modal, Platform, StyleSheet, Text, TextInput, View } from 'react-native';
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import DocumentPicker, { isCancel, pickSingle, types } from 'react-native-document-picker';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppHeader } from '../../components/common/AppHeader';
import { AnimatedPressable } from '../../components/common/AnimatedPressable';
import { Button } from '../../components/common/Button';
import { EmptyState } from '../../components/common/EmptyState';
import { InputField } from '../../components/common/InputField';
import { Screen } from '../../components/common/Screen';
import { uploadExamAsset } from '../../services/api/storage';
import { fetchBatches } from '../../services/api/content';
import { useAppStore } from '../../store/appStore';
import { useAuthStore } from '../../store/authStore';
import { colors, radius, spacing } from '../../theme';
import { CreateTestQuestionPayload, ScholarshipAdmissionClass, ScholarshipTargetExam, TestType } from '../../types';
import { RootStackScreenProps } from '../../navigation/types';
import {
  ArrowUpDown,
  ChevronDown,
  ChevronUp,
  FileImage,
  FolderOpen,
  Save,
  ShieldAlert,
  Shuffle,
  Trash2,
  X,
} from 'lucide-react-native';
import { clearExamCreationDraft, loadExamCreationDraft, saveExamCreationDraft } from '../../utils/draftStorage';
import {
  coerceDurationMinutes,
  combineScheduleInputs,
  formatDateLabel,
  formatDuration,
  sanitizeDurationInput,
  toDateInputValue,
  toTimeInputValue,
} from '../../utils/formatters';
import {
  scholarshipAdmissionLabels,
  scholarshipAdmissionOptions,
  scholarshipTargetLabels,
  scholarshipTargetOptions,
} from '../../constants/scholarship';

const subjectOptions = ['Physics', 'Chemistry', 'Maths', 'Biology'];
type SubjectMode = 'single' | 'multi';

const emptyQuestion = (): CreateTestQuestionPayload => ({
  type: 'mcq',
  prompt: '',
  options: ['', '', '', ''],
  correctOptionIndex: 0,
  integerAnswer: undefined,
  explanation: '',
  imageUrl: null,
  subjectLabel: '',
});

function isQuestionBlank(question: CreateTestQuestionPayload) {
  const hasPrompt = question.prompt.trim().length > 0;
  const hasExplanation = question.explanation.trim().length > 0;
  const hasOptions = question.type === 'mcq' && question.options.some((option) => option.trim().length > 0);
  const hasIntegerAnswer = question.type === 'integer' && typeof question.integerAnswer === 'number' && !Number.isNaN(question.integerAnswer);

  return !hasPrompt && !hasExplanation && !hasOptions && !hasIntegerAnswer && !question.imageUrl;
}

function parseSubjectRangePlan(input: string) {
  return input
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const match = line.match(/^(\d+)\s*-\s*(\d+)\s*[:|-]\s*(.+)$/);
      if (!match) {
        return null;
      }

      const start = Number(match[1]);
      const end = Number(match[2]);
      const label = match[3]?.trim();

      if (!start || !end || !label || start > end) {
        return null;
      }

      return { start, end, label };
    })
    .filter((entry): entry is { start: number; end: number; label: string } => entry !== null);
}

function buildSchedulePickerDate(dateInput: string, timeInput: string) {
  try {
    return new Date(combineScheduleInputs(dateInput, timeInput));
  } catch {
    return new Date();
  }
}

export function CreateTestScreen({ navigation }: RootStackScreenProps<'CreateTest'>) {
  const insets = useSafeAreaInsets();
  const user = useAuthStore((state) => state.user);
  const createTest = useAppStore((state) => state.createTest);
  const consumePendingQuestionBankImport = useAppStore((state) => state.consumePendingQuestionBankImport);
  const batches = useAppStore((state) => state.batches);
  const isAdmin = user?.role === 'admin' && user.approvalStatus === 'approved';

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [subjectMode, setSubjectMode] = useState<SubjectMode>('single');
  const [primarySubject, setPrimarySubject] = useState('Physics');
  const [durationMinutes, setDurationMinutes] = useState('60');
  const [type, setType] = useState<TestType>('weekly');
  const [batchId, setBatchId] = useState<string | undefined>(batches[0]?.id || 'JEE_2026');
  const [scheduleDate, setScheduleDate] = useState(() => toDateInputValue());
  const [scheduleTime, setScheduleTime] = useState(() => toTimeInputValue());
  const [isDatePickerVisible, setIsDatePickerVisible] = useState(false);
  const [isTimePickerVisible, setIsTimePickerVisible] = useState(false);
  const [scholarshipAdmissionClass, setScholarshipAdmissionClass] = useState<ScholarshipAdmissionClass>('8th');
  const [scholarshipTargetExam, setScholarshipTargetExam] = useState<ScholarshipTargetExam>('boards');
  const [questions, setQuestions] = useState<CreateTestQuestionPayload[]>([emptyQuestion()]);
  const [subjectRangePlan, setSubjectRangePlan] = useState('');
  const [uploadingImageIndex, setUploadingImageIndex] = useState<number | null>(null);
  const [isOpenForAll, setIsOpenForAll] = useState(false);
  const [correctMarks, setCorrectMarks] = useState('4');
  const [wrongMarks, setWrongMarks] = useState('-1');
  const [unattemptedMarks, setUnattemptedMarks] = useState('0');
  const [hasCheckedDraft, setHasCheckedDraft] = useState(false);
  const [draftSavedAt, setDraftSavedAt] = useState<string | null>(null);
  const [reorderingTargetIndex, setReorderingTargetIndex] = useState<number | null>(null);
  const [targetPositionInput, setTargetPositionInput] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [validationFieldErrors, setValidationFieldErrors] = useState<{ title?: string; duration?: string; description?: string }>({});

  const resolvedDurationMinutes = coerceDurationMinutes(durationMinutes);
  const isMultiSubject = subjectMode === 'multi';
  const nonBlankQuestionCount = useMemo(
    () => questions.filter((question) => !isQuestionBlank(question)).length,
    [questions],
  );
  const listBottomInset = 120 + Math.max(insets.bottom, spacing.sm);

  React.useEffect(() => {
    if (batches.length === 0) {
      void fetchBatches().then((loaded) => {
        if (loaded && loaded.length > 0) {
          useAppStore.setState({ batches: loaded });
          setBatchId((prev) => prev || loaded[0]?.id || 'JEE_2026');
        }
      });
    }
  }, [batches.length]);

  React.useEffect(() => {
    async function checkForDraft() {
      if (hasCheckedDraft) return;
      setHasCheckedDraft(true);

      const savedDraft = await loadExamCreationDraft();
      if (!savedDraft) return;

      Alert.alert(
        'Restore Exam Creation Draft?',
        `An unsaved exam draft created on ${new Date(savedDraft.savedAt).toLocaleString()} was found. Would you like to restore it?`,
        [
          {
            text: 'Discard Draft',
            style: 'destructive',
            onPress: () => {
              void clearExamCreationDraft();
            },
          },
          {
            text: 'Restore Draft',
            onPress: () => {
              setTitle(savedDraft.title || '');
              setDescription(savedDraft.description || '');
              setDurationMinutes(savedDraft.durationMinutes || '60');
              setSubjectMode(savedDraft.subjectMode || 'single');
              setPrimarySubject(savedDraft.primarySubject || 'Physics');
              setType(savedDraft.type || 'weekly');
              setBatchId(savedDraft.batchId || '');
              setScheduleDate(savedDraft.scheduleDate || toDateInputValue());
              setScheduleTime(savedDraft.scheduleTime || toTimeInputValue());
              setScholarshipAdmissionClass(savedDraft.scholarshipAdmissionClass || '8th');
              setScholarshipTargetExam(savedDraft.scholarshipTargetExam || 'boards');
              if (savedDraft.questions && savedDraft.questions.length > 0) {
                setQuestions(savedDraft.questions);
              }
              setSubjectRangePlan(savedDraft.subjectRangePlan || '');
              setIsOpenForAll(savedDraft.isOpenForAll || false);
              setCorrectMarks(savedDraft.correctMarks || '4');
              setWrongMarks(savedDraft.wrongMarks || '-1');
              setUnattemptedMarks(savedDraft.unattemptedMarks || '0');
              setDraftSavedAt(savedDraft.savedAt);
            },
          },
        ],
      );
    }

    void checkForDraft();
  }, [hasCheckedDraft]);

  React.useEffect(() => {
    if (!hasCheckedDraft) return;

    const timer = setTimeout(() => {
      if (title.trim() || questions.some((q) => q.prompt.trim())) {
        void saveExamCreationDraft({
          title,
          description,
          durationMinutes,
          subjectMode,
          primarySubject,
          type,
          batchId: batchId ?? '',
          scheduleDate,
          scheduleTime,
          scholarshipAdmissionClass,
          scholarshipTargetExam,
          questions,
          subjectRangePlan,
          isOpenForAll,
          correctMarks,
          wrongMarks,
          unattemptedMarks,
          status: 'DRAFT',
        }).then(() => {
          setDraftSavedAt(new Date().toISOString());
        });
      }
    }, 1000);

    return () => clearTimeout(timer);
  }, [
    title,
    description,
    durationMinutes,
    subjectMode,
    primarySubject,
    type,
    batchId,
    scheduleDate,
    scheduleTime,
    scholarshipAdmissionClass,
    scholarshipTargetExam,
    questions,
    subjectRangePlan,
    isOpenForAll,
    correctMarks,
    wrongMarks,
    unattemptedMarks,
    hasCheckedDraft,
  ]);

  useFocusEffect(
    React.useCallback(() => {
      const queuedQuestions = consumePendingQuestionBankImport();

      if (queuedQuestions.length > 0) {
        startTransition(() => {
          const subjects = new Set(queuedQuestions.map((q) => q.subjectLabel).filter(Boolean));
          if (subjects.size > 1) {
            setSubjectMode('multi');
          } else if (subjects.size === 1) {
            const singleSub = Array.from(subjects)[0];
            if (singleSub) {
              setPrimarySubject(singleSub);
            }
          }

          setQuestions((current) => {
            const existingQuestions = current.filter((question) => !isQuestionBlank(question));
            return [...existingQuestions, ...queuedQuestions];
          });
        });
      }

      return undefined;
    }, [consumePendingQuestionBankImport]),
  );

  const handleDateChange = (event: DateTimePickerEvent, selectedDate?: Date) => {
    setIsDatePickerVisible(false);
    if (event.type !== 'set' || !selectedDate) {
      return;
    }

    setScheduleDate(toDateInputValue(selectedDate.toISOString()));
  };

  const handleTimeChange = (event: DateTimePickerEvent, selectedDate?: Date) => {
    setIsTimePickerVisible(false);
    if (event.type !== 'set' || !selectedDate) {
      return;
    }

    setScheduleTime(toTimeInputValue(selectedDate.toISOString()));
  };

  const updateQuestion = useCallback(
    (
      index: number,
      updater: (current: CreateTestQuestionPayload) => CreateTestQuestionPayload,
    ) => {
      setQuestions((current) =>
        current.map((question, questionIndex) => (questionIndex === index ? updater(question) : question)),
      );
    },
    [],
  );

  const applySubjectRangePlan = () => {
    const ranges = parseSubjectRangePlan(subjectRangePlan);

    if (ranges.length === 0) {
      Alert.alert('Invalid plan', 'Use one line per range, for example: 1-25: Physics');
      return;
    }

    setQuestions((current) =>
      current.map((question, index) => {
        const questionNumber = index + 1;
        const matchedRange = ranges.find((range) => questionNumber >= range.start && questionNumber <= range.end);
        return {
          ...question,
          subjectLabel: matchedRange?.label ?? question.subjectLabel ?? '',
        };
      }),
    );

    Alert.alert('Subject plan applied', 'Questions in the matching ranges have been labeled by subject.');
  };

  const applySingleSubjectToAllQuestions = (nextSubject: string) => {
    setQuestions((current) =>
      current.map((question) => ({
        ...question,
        subjectLabel: nextSubject,
      })),
    );
  };

  const handleCreate = async () => {
    if (isCreating) return;

    const fieldErrors: { title?: string; duration?: string; description?: string } = {};
    if (!title.trim()) {
      fieldErrors.title = 'Test title is required';
    }
    if (!description.trim()) {
      fieldErrors.description = 'Test description is required';
    }
    if (!durationMinutes.trim()) {
      fieldErrors.duration = 'Duration is required';
    } else if (resolvedDurationMinutes < 5 || resolvedDurationMinutes > 600) {
      fieldErrors.duration = 'Enter a duration between 5 and 600 minutes';
    }

    if (Object.keys(fieldErrors).length > 0) {
      setValidationFieldErrors(fieldErrors);
      Alert.alert('Missing Details', 'Please complete the highlighted required fields.');
      return;
    }
    setValidationFieldErrors({});

    if (type === 'scholarship' && (!scholarshipAdmissionClass || !scholarshipTargetExam)) {
      Alert.alert('Scholarship audience required', 'Choose the admission class and target exam for this scholarship paper.');
      return;
    }

    const nonBlankQuestions = questions.filter((question) => !isQuestionBlank(question));
    if (nonBlankQuestions.length === 0) {
      Alert.alert('No questions', 'Please add at least one question before publishing.');
      return;
    }

    const validationErrors: string[] = [];
    const normalizedQuestions: CreateTestQuestionPayload[] = nonBlankQuestions.map((question, index) => {
      const qNum = index + 1;
      let prompt = question.prompt.trim();
      if (!prompt) {
        if (question.imageUrl) {
          prompt = 'Refer to the question diagram below.';
        } else {
          validationErrors.push(`Question ${qNum}: Question prompt or image is missing.`);
        }
      }

      if (question.type === 'mcq') {
        let opts = (question.options || []).map((option) => option.trim());
        const allBlank = opts.every((opt) => !opt);
        if (allBlank) {
          opts = ['(A)', '(B)', '(C)', '(D)'];
        } else {
          opts = opts.map((opt, optIndex) => opt || `(${String.fromCharCode(65 + optIndex)})`);
        }
        while (opts.length < 4) {
          opts.push(`(${String.fromCharCode(65 + opts.length)})`);
        }

        if (question.needsReview) {
          validationErrors.push(`Question ${qNum}: Correct answer is marked as Needs Review. Please confirm the answer key.`);
        } else if (question.correctOptionIndex === undefined || question.correctOptionIndex < 0 || question.correctOptionIndex > 3) {
          validationErrors.push(`Question ${qNum}: Correct answer is unresolved. Please select Option A, B, C, or D.`);
        }

        const correctIdx = Math.max(0, Math.min(question.correctOptionIndex ?? 0, opts.length - 1));

        return {
          ...question,
          prompt,
          type: 'mcq' as const,
          options: opts,
          correctOptionIndex: correctIdx,
          integerAnswer: undefined,
          subjectLabel: isMultiSubject ? question.subjectLabel?.trim() || undefined : primarySubject,
        };
      } else {
        let intAns = question.integerAnswer;
        if (question.needsReview || typeof intAns !== 'number' || Number.isNaN(intAns)) {
          validationErrors.push(`Question ${qNum}: Numeric answer is missing or invalid.`);
          intAns = 0;
        }

        return {
          ...question,
          prompt,
          type: 'integer' as const,
          options: ['', '', '', ''],
          integerAnswer: intAns,
          subjectLabel: isMultiSubject ? question.subjectLabel?.trim() || undefined : primarySubject,
        };
      }
    });

    if (validationErrors.length > 0) {
      Alert.alert('Questions incomplete', validationErrors.slice(0, 3).join('\n'));
      return;
    }

    if (
      isMultiSubject &&
      normalizedQuestions.some((question) => !question.subjectLabel)
    ) {
      Alert.alert(
        'Subject mapping required',
        'For multi-subject papers, assign every question to a subject so insights and weak-subject tracking stay accurate.',
      );
      return;
    }

    const resolvedTestSubject = isMultiSubject ? 'Mixed Subjects' : primarySubject;

    const isTestOpenForAll = Boolean(isOpenForAll) || !batchId || batchId === 'ALL';
    const resolvedBatchId = isTestOpenForAll ? undefined : (batchId || undefined);

    try {
      setIsCreating(true);
      const scheduledAt = combineScheduleInputs(scheduleDate, scheduleTime);
      await createTest({
        title: title.trim(),
        description: description.trim(),
        subject: resolvedTestSubject,
        durationMinutes: resolvedDurationMinutes,
        scheduledAt,
        type,
        batchId: resolvedBatchId,
        isOpenForAll: isTestOpenForAll,
        scholarshipAdmissionClass: type === 'scholarship' ? scholarshipAdmissionClass : undefined,
        scholarshipTargetExam: type === 'scholarship' ? scholarshipTargetExam : undefined,
        questions: normalizedQuestions,
      });

      Alert.alert('Test Created Successfully', 'The new paper is now available in the tests feed.');
      await clearExamCreationDraft();
      navigation.goBack();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to publish the test right now.';
      Alert.alert('Creation Failed', message);
    } finally {
      setIsCreating(false);
    }
  };

  const handleQuestionImageUpload = async (index: number) => {
    try {
      const file = await pickSingle({
        type: [types.images],
        copyTo: 'cachesDirectory',
      });

      setUploadingImageIndex(index);
      const uploaded = await uploadExamAsset({
        uri: file.fileCopyUri ?? file.uri,
        name: file.name,
        mimeType: file.type,
        folder: 'images',
        file: (file as { file?: File }).file,
      });

      updateQuestion(index, (current) => ({
        ...current,
        imageUrl: uploaded.publicUrl,
      }));

      Alert.alert('Image uploaded', 'This question now has its image attached.');
    } catch (error) {
      if (DocumentPicker.isCancel?.(error) || isCancel(error)) {
        return;
      }
      Alert.alert('Upload failed', error instanceof Error ? error.message : 'Unable to upload this image.');
    } finally {
      setUploadingImageIndex(null);
    }
  };

  const handleAddManualQuestion = useCallback(() => {
    setQuestions((current) => [...current, emptyQuestion()]);
  }, []);

  const handleDeleteQuestion = useCallback((indexToDelete: number) => {
    setQuestions((current) => current.filter((_, idx) => idx !== indexToDelete));
  }, []);

  const handleMoveQuestion = useCallback((fromIndex: number, toIndex: number) => {
    if (fromIndex === toIndex) return;
    if (toIndex < 0 || toIndex >= questions.length) return;

    setQuestions((prev) => {
      const updated = [...prev];
      const [moved] = updated.splice(fromIndex, 1);
      if (!moved) return prev;
      updated.splice(toIndex, 0, moved);
      return updated;
    });
  }, [questions.length]);

  const handleOpenMoveDialog = useCallback((index: number) => {
    setReorderingTargetIndex(index);
    setTargetPositionInput(String(index + 1));
  }, []);

  const handleConfirmMoveToPosition = useCallback(() => {
    if (reorderingTargetIndex === null) return;
    const parsed = parseInt(targetPositionInput.trim(), 10);
    if (Number.isNaN(parsed) || parsed < 1 || parsed > questions.length) {
      Alert.alert(
        'Invalid Position',
        `Please enter a valid question number between 1 and ${questions.length}.`,
      );
      return;
    }
    const toIndex = parsed - 1;
    handleMoveQuestion(reorderingTargetIndex, toIndex);
    const fromNumber = reorderingTargetIndex + 1;
    setReorderingTargetIndex(null);
    setTargetPositionInput('');
    Alert.alert('Question Moved', `Question ${fromNumber} moved to position ${parsed}.`);
  }, [handleMoveQuestion, questions.length, reorderingTargetIndex, targetPositionInput]);

  const handleShuffleAll = useCallback(() => {
    if (questions.length <= 1) return;
    Alert.alert(
      'Shuffle All Questions?',
      `This will randomly randomize the order of all ${questions.length} questions in this paper. You can adjust individual positions afterwards.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Shuffle Order',
          onPress: () => {
            setQuestions((prev) => {
              const shuffled = [...prev];
              for (let i = shuffled.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                const temp = shuffled[i]!;
                shuffled[i] = shuffled[j]!;
                shuffled[j] = temp;
              }
              return shuffled;
            });
            Alert.alert('Questions Shuffled', 'Questions order has been randomized!');
          },
        },
      ],
    );
  }, [questions.length]);

  const renderQuestionItem = useCallback(
    ({ item: question, index }: { item: CreateTestQuestionPayload; index: number }) => (
      <View style={styles.formCard}>
        <View style={styles.questionHeaderRow}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <Text style={styles.questionTitle}>Question {index + 1}</Text>
            {questions.length > 1 ? (
              <View style={styles.reorderControlsRow}>
                <AnimatedPressable
                  style={[styles.reorderArrowButton, index === 0 && styles.reorderButtonDisabled]}
                  disabled={index === 0}
                  onPress={() => handleMoveQuestion(index, index - 1)}
                  accessibilityLabel="Move Question Up">
                  <ChevronUp size={14} color={index === 0 ? colors.border : colors.text} />
                </AnimatedPressable>
                <AnimatedPressable
                  style={[styles.reorderArrowButton, index === questions.length - 1 && styles.reorderButtonDisabled]}
                  disabled={index === questions.length - 1}
                  onPress={() => handleMoveQuestion(index, index + 1)}
                  accessibilityLabel="Move Question Down">
                  <ChevronDown size={14} color={index === questions.length - 1 ? colors.border : colors.text} />
                </AnimatedPressable>
                <AnimatedPressable
                  style={styles.reorderJumpButton}
                  onPress={() => handleOpenMoveDialog(index)}
                  accessibilityLabel="Move to Position Number">
                  <ArrowUpDown size={11} color={colors.primary} />
                  <Text style={styles.reorderJumpButtonText}>Move #</Text>
                </AnimatedPressable>
              </View>
            ) : null}
          </View>
          {questions.length > 1 ? (
            <AnimatedPressable
              style={styles.deleteQuestionButton}
              onPress={() => handleDeleteQuestion(index)}>
              <Trash2 size={14} color={colors.danger} />
              <Text style={styles.deleteQuestionButtonText}>Delete</Text>
            </AnimatedPressable>
          ) : null}
        </View>
        <Text style={styles.sectionLabel}>Question Type</Text>
        <View style={styles.choiceRow}>
          {(['mcq', 'integer'] as const).map((value) => (
            <AnimatedPressable
              key={`${index}_${value}`}
              style={[styles.choiceChip, question.type === value && styles.choiceChipActive]}
              onPress={() =>
                updateQuestion(index, (current) => ({
                  ...current,
                  type: value,
                  options: value === 'mcq' ? current.options : ['', '', '', ''],
                  integerAnswer: value === 'integer' ? current.integerAnswer ?? 0 : undefined,
                }))
              }>
              <Text style={[styles.choiceText, question.type === value && styles.choiceTextActive]}>{value}</Text>
            </AnimatedPressable>
          ))}
        </View>

        <TextInput
          multiline
          placeholder="Enter question prompt"
          placeholderTextColor={colors.textSubtle}
          style={styles.multilineInput}
          value={question.prompt}
          onChangeText={(value) =>
            updateQuestion(index, (current) => ({
              ...current,
              prompt: value,
            }))
          }
        />

        {isMultiSubject ? (
          <InputField
            label="Question Subject"
            placeholder="Physics / Chemistry / Maths / Biology"
            value={question.subjectLabel ?? ''}
            onChangeText={(value) =>
              updateQuestion(index, (current) => ({
                ...current,
                subjectLabel: value,
              }))
            }
          />
        ) : (
          <View style={styles.subjectLockCard}>
            <Text style={styles.subjectLockLabel}>Question Subject</Text>
            <Text style={styles.subjectLockValue}>{primarySubject}</Text>
            <Text style={styles.subjectLockHint}>
              Single-subject paper selected. Every question will use this subject in insights.
            </Text>
          </View>
        )}

        {question.type === 'mcq' ? (
          <>
            {question.options.map((option, optionIndex) => (
              <InputField
                key={`option_${index}_${optionIndex}`}
                label={`Option ${optionIndex + 1}`}
                placeholder={`Answer option ${optionIndex + 1}`}
                value={option}
                onChangeText={(value) =>
                  updateQuestion(index, (current) => ({
                    ...current,
                    options: current.options.map((currentOption, currentIndex) =>
                      currentIndex === optionIndex ? value : currentOption,
                    ),
                  }))
                }
              />
            ))}

            <Text style={styles.sectionLabel}>Correct Option</Text>
            <View style={styles.choiceRow}>
              {question.options.map((_, optionIndex) => (
                <AnimatedPressable
                  key={`correct_${index}_${optionIndex}`}
                  style={[
                    styles.choiceChip,
                    question.correctOptionIndex === optionIndex && styles.choiceChipActive,
                  ]}
                  onPress={() =>
                    updateQuestion(index, (current) => ({
                      ...current,
                      correctOptionIndex: optionIndex,
                    }))
                  }>
                  <Text
                    style={[
                      styles.choiceText,
                      question.correctOptionIndex === optionIndex && styles.choiceTextActive,
                    ]}>
                    {optionIndex + 1}
                  </Text>
                </AnimatedPressable>
              ))}
            </View>
          </>
        ) : (
          <InputField
            label="Integer Answer"
            placeholder="Enter the correct integer answer"
            keyboardType="numeric"
            value={question.integerAnswer !== undefined && !Number.isNaN(question.integerAnswer) ? String(question.integerAnswer) : ''}
            onChangeText={(value) => {
              const trimmed = value.trim();
              const parsed = parseFloat(trimmed);
              updateQuestion(index, (current) => ({
                ...current,
                integerAnswer: trimmed === '' ? undefined : (Number.isNaN(parsed) ? undefined : parsed),
              }));
            }}
          />
        )}

        <AnimatedPressable style={styles.imageButton} onPress={() => void handleQuestionImageUpload(index)}>
          <FileImage size={18} color={colors.primary} />
          <Text style={styles.imageButtonText}>
            {uploadingImageIndex === index
              ? 'Uploading image...'
              : question.imageUrl
                ? 'Replace Question Image'
                : 'Upload Question Image'}
          </Text>
        </AnimatedPressable>
        {question.imageUrl ? <Text style={styles.fileHint}>Image attached to this question.</Text> : null}

        <TextInput
          multiline
          placeholder="Explanation"
          placeholderTextColor={colors.textSubtle}
          style={styles.multilineInput}
          value={question.explanation}
          onChangeText={(value) =>
            updateQuestion(index, (current) => ({
              ...current,
              explanation: value,
            }))
          }
        />
      </View>
    ),
    [handleDeleteQuestion, handleQuestionImageUpload, isMultiSubject, primarySubject, questions.length, updateQuestion, uploadingImageIndex],
  );

  if (!isAdmin) {
    return (
      <Screen contentContainerStyle={styles.content}>
        <AppHeader title="Create Test" subtitle="Restricted to approved MIITJEE admins" />
        <View style={styles.accessWrap}>
          <EmptyState
            icon={ShieldAlert}
            title="Admin access required"
            description="Only approved admins can publish weekly and scholarship tests."
          />
        </View>
      </Screen>
    );
  }

  return (
    <Screen useScrollView={false}>
      <View style={styles.screen}>
        <FlatList
          data={questions}
          keyExtractor={(_, index) => `question_${index}`}
          renderItem={renderQuestionItem}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          initialNumToRender={4}
          maxToRenderPerBatch={4}
          windowSize={5}
          removeClippedSubviews={false}
          contentContainerStyle={styles.content}
          ListHeaderComponent={
            <>
              <AppHeader title="Create Test" subtitle="Weekly and scholarship setup stays the same. Questions now come from your bank or manual entries." />

              <View style={styles.formCard}>
                <InputField
                  label="Title"
                  placeholder="Weekly Mock Test - Physics"
                  value={title}
                  onChangeText={(val) => {
                    setTitle(val);
                    if (validationFieldErrors.title) {
                      setValidationFieldErrors((prev) => ({ ...prev, title: undefined }));
                    }
                  }}
                  error={validationFieldErrors.title}
                  required
                />
                <InputField
                  label="Description"
                  placeholder="What should learners expect in this test?"
                  value={description}
                  onChangeText={(val) => {
                    setDescription(val);
                    if (validationFieldErrors.description) {
                      setValidationFieldErrors((prev) => ({ ...prev, description: undefined }));
                    }
                  }}
                  error={validationFieldErrors.description}
                  required
                />
                <Text style={styles.sectionTitle}>Subject Setup</Text>
                <Text style={styles.fileHint}>Choose one subject for the whole paper, or use sections for combined papers. This mapping powers insights.</Text>
                <View style={styles.choiceRow}>
                  {([
                    { value: 'single', label: 'Single Subject' },
                    { value: 'multi', label: 'Multi Subject' },
                  ] as const).map((option) => (
                    <AnimatedPressable
                      key={option.value}
                      style={[styles.choiceChip, subjectMode === option.value && styles.choiceChipActive]}
                      onPress={() => setSubjectMode(option.value)}>
                      <Text style={[styles.choiceText, subjectMode === option.value && styles.choiceTextActive]}>{option.label}</Text>
                    </AnimatedPressable>
                  ))}
                </View>
                {!isMultiSubject ? (
                  <>
                    <Text style={styles.sectionLabel}>Paper Subject</Text>
                    <View style={styles.choiceRow}>
                      {subjectOptions.map((value) => (
                        <AnimatedPressable
                          key={value}
                          style={[styles.choiceChip, primarySubject === value && styles.choiceChipActive]}
                          onPress={() => {
                            setPrimarySubject(value);
                            applySingleSubjectToAllQuestions(value);
                          }}>
                          <Text style={[styles.choiceText, primarySubject === value && styles.choiceTextActive]}>{value}</Text>
                        </AnimatedPressable>
                      ))}
                    </View>
                  </>
                ) : null}
                <View style={styles.row}>
                  <View style={styles.flexItem}>
                    <InputField
                      label="Duration"
                      placeholder="60"
                      keyboardType="number-pad"
                      value={durationMinutes}
                      onChangeText={(value) => {
                        setDurationMinutes(sanitizeDurationInput(value));
                        if (validationFieldErrors.duration) {
                          setValidationFieldErrors((prev) => ({ ...prev, duration: undefined }));
                        }
                      }}
                      error={validationFieldErrors.duration}
                      required
                      rightAccessory={<Text style={styles.inputAccessory}>min</Text>}
                    />
                  </View>
                </View>
                <Text style={styles.fileHint}>Timer preview: {formatDuration(resolvedDurationMinutes)}</Text>

                <Text style={styles.sectionLabel}>Test Type</Text>
                <View style={styles.choiceRow}>
                  {(['weekly', 'scholarship'] as const).map((value) => (
                    <AnimatedPressable
                      key={value}
                      style={[styles.choiceChip, type === value && styles.choiceChipActive]}
                      onPress={() => setType(value)}>
                      <Text style={[styles.choiceText, type === value && styles.choiceTextActive]}>{value}</Text>
                    </AnimatedPressable>
                  ))}
                </View>

                <View style={styles.row}>
                  <View style={styles.flexItem}>
                    <Text style={styles.sectionLabel}>Start Date</Text>
                    {Platform.OS === 'web' ? (
                      <View style={styles.pickerField}>
                        {React.createElement('input', {
                          type: 'date',
                          value: scheduleDate,
                          onChange: (e: React.ChangeEvent<HTMLInputElement>) => {
                            if (e?.target?.value) {
                              setScheduleDate(e.target.value);
                            }
                          },
                          onClick: (e: React.MouseEvent<HTMLInputElement>) => {
                            try {
                              (e.target as HTMLInputElement).showPicker?.();
                            } catch {}
                          },
                          style: {
                            width: '100%',
                            height: '100%',
                            minHeight: 44,
                            border: 'none',
                            outline: 'none',
                            background: 'transparent',
                            color: colors.text,
                            fontSize: 14,
                            fontWeight: '600',
                            fontFamily: 'inherit',
                            cursor: 'pointer',
                          },
                        })}
                      </View>
                    ) : (
                      <AnimatedPressable style={styles.pickerField} onPress={() => setIsDatePickerVisible(true)}>
                        <Text style={styles.pickerValue}>{formatDateLabel(combineScheduleInputs(scheduleDate, scheduleTime))}</Text>
                      </AnimatedPressable>
                    )}
                  </View>
                  <View style={styles.flexItem}>
                    <Text style={styles.sectionLabel}>Start Time</Text>
                    {Platform.OS === 'web' ? (
                      <View style={styles.pickerField}>
                        {React.createElement('input', {
                          type: 'time',
                          value: scheduleTime,
                          onChange: (e: React.ChangeEvent<HTMLInputElement>) => {
                            if (e?.target?.value) {
                              setScheduleTime(e.target.value);
                            }
                          },
                          onClick: (e: React.MouseEvent<HTMLInputElement>) => {
                            try {
                              (e.target as HTMLInputElement).showPicker?.();
                            } catch {}
                          },
                          style: {
                            width: '100%',
                            height: '100%',
                            minHeight: 44,
                            border: 'none',
                            outline: 'none',
                            background: 'transparent',
                            color: colors.text,
                            fontSize: 14,
                            fontWeight: '600',
                            fontFamily: 'inherit',
                            cursor: 'pointer',
                          },
                        })}
                      </View>
                    ) : (
                      <AnimatedPressable style={styles.pickerField} onPress={() => setIsTimePickerVisible(true)}>
                        <Text style={styles.pickerValue}>{scheduleTime}</Text>
                      </AnimatedPressable>
                    )}
                  </View>
                </View>

                {Platform.OS !== 'web' && isDatePickerVisible ? (
                  <DateTimePicker
                    mode="date"
                    value={buildSchedulePickerDate(scheduleDate, scheduleTime)}
                    onChange={handleDateChange}
                  />
                ) : null}

                {Platform.OS !== 'web' && isTimePickerVisible ? (
                  <DateTimePicker
                    mode="time"
                    value={buildSchedulePickerDate(scheduleDate, scheduleTime)}
                    onChange={handleTimeChange}
                  />
                ) : null}

                <Text style={styles.sectionLabel}>Access Type</Text>
                <View style={styles.choiceRow}>
                  <AnimatedPressable
                    style={[styles.choiceChip, !isOpenForAll && styles.choiceChipActive]}
                    onPress={() => setIsOpenForAll(false)}>
                    <Text style={[styles.choiceText, !isOpenForAll && styles.choiceTextActive]}>Restricted Batch</Text>
                  </AnimatedPressable>
                  <AnimatedPressable
                    style={[styles.choiceChip, isOpenForAll && styles.choiceChipActive]}
                    onPress={() => {
                      setIsOpenForAll(true);
                      setBatchId(undefined);
                    }}>
                    <Text style={[styles.choiceText, isOpenForAll && styles.choiceTextActive]}>Open for All</Text>
                  </AnimatedPressable>
                </View>

                {isOpenForAll ? (
                  <Text style={styles.fileHint}>
                    Open for All is active: Any student can take and submit this paper. No batch requirement is enforced.
                  </Text>
                ) : null}

                {type === 'weekly' ? (
                  <>
                    <Text style={styles.sectionLabel}>Batch {isOpenForAll ? '(Optional - leave unselected for All Batches)' : ''}</Text>
                    <View style={styles.choiceRow}>
                      {batches.map((batch) => (
                        <AnimatedPressable
                          key={batch.id}
                          style={[styles.choiceChip, batchId === batch.id && styles.choiceChipActive]}
                          onPress={() => setBatchId((current) => (current === batch.id ? undefined : batch.id))}>
                          <Text style={[styles.choiceText, batchId === batch.id && styles.choiceTextActive]}>{batch.label}</Text>
                        </AnimatedPressable>
                      ))}
                    </View>
                  </>
                ) : null}

                {type === 'scholarship' ? (
                  <>
                    <Text style={styles.sectionLabel}>Admission Class</Text>
                    <View style={styles.choiceRow}>
                      {scholarshipAdmissionOptions.map((value) => (
                        <AnimatedPressable
                          key={value}
                          style={[styles.choiceChip, scholarshipAdmissionClass === value && styles.choiceChipActive]}
                          onPress={() => setScholarshipAdmissionClass(value)}>
                          <Text style={[styles.choiceText, scholarshipAdmissionClass === value && styles.choiceTextActive]}>
                            {scholarshipAdmissionLabels[value]}
                          </Text>
                        </AnimatedPressable>
                      ))}
                    </View>

                    <Text style={styles.sectionLabel}>Target Exam</Text>
                    <View style={styles.choiceRow}>
                      {scholarshipTargetOptions.map((value) => (
                        <AnimatedPressable
                          key={value}
                          style={[styles.choiceChip, scholarshipTargetExam === value && styles.choiceChipActive]}
                          onPress={() => setScholarshipTargetExam(value)}>
                          <Text style={[styles.choiceText, scholarshipTargetExam === value && styles.choiceTextActive]}>
                            {scholarshipTargetLabels[value]}
                          </Text>
                        </AnimatedPressable>
                      ))}
                    </View>
                  </>
                ) : null}

                <Text style={styles.sectionTitle}>Marking Scheme</Text>
                <View style={styles.row}>
                  <View style={styles.flexItem}>
                    <InputField
                      label="Correct Marks"
                      placeholder="+4"
                      keyboardType="numeric"
                      value={correctMarks}
                      onChangeText={setCorrectMarks}
                    />
                  </View>
                  <View style={styles.flexItem}>
                    <InputField
                      label="Wrong Marks"
                      placeholder="-1"
                      keyboardType="numeric"
                      value={wrongMarks}
                      onChangeText={setWrongMarks}
                    />
                  </View>
                  <View style={styles.flexItem}>
                    <InputField
                      label="Unattempted"
                      placeholder="0"
                      keyboardType="numeric"
                      value={unattemptedMarks}
                      onChangeText={setUnattemptedMarks}
                    />
                  </View>
                </View>
              </View>

              {isMultiSubject ? (
                <View style={styles.formCard}>
                  <Text style={styles.sectionTitle}>Subject Sections</Text>
                  <Text style={styles.fileHint}>
                    Use this once for combined papers. Example: `1-25: Physics`, `26-50: Chemistry`, `51-75: Maths`. These labels go directly into insights.
                  </Text>
                  <TextInput
                    multiline
                    placeholder={'1-25: Physics\n26-50: Chemistry\n51-75: Maths'}
                    placeholderTextColor={colors.textSubtle}
                    style={styles.multilineInput}
                    value={subjectRangePlan}
                    onChangeText={setSubjectRangePlan}
                  />
                  <AnimatedPressable style={styles.imageButton} onPress={applySubjectRangePlan}>
                    <Text style={styles.imageButtonText}>Apply Subject Sections</Text>
                  </AnimatedPressable>
                </View>
              ) : null}

              <View style={styles.formCard}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: spacing.xs }}>
                  <Text style={styles.sectionTitle}>Questions</Text>
                  {questions.length > 1 ? (
                    <AnimatedPressable style={styles.shuffleAllButton} onPress={handleShuffleAll}>
                      <Shuffle size={13} color={colors.primary} />
                      <Text style={styles.shuffleAllButtonText}>Shuffle Order</Text>
                    </AnimatedPressable>
                  ) : null}
                </View>
                <Text style={styles.fileHint}>
                  Reuse saved PDF sets from the question bank or add questions manually. Current count: {nonBlankQuestionCount}
                </Text>
                <View style={styles.bankActionRow}>
                  <AnimatedPressable style={styles.bankButton} onPress={() => navigation.navigate('QuestionBank', { mode: 'picker' })}>
                    <FolderOpen size={16} color={colors.primary} />
                    <Text style={styles.bankButtonText}>Add From Question Bank</Text>
                  </AnimatedPressable>
                  <AnimatedPressable style={styles.bankButton} onPress={handleAddManualQuestion}>
                    <Text style={styles.bankButtonText}>Add Manual Question</Text>
                  </AnimatedPressable>
                </View>
              </View>
            </>
          }
          ListFooterComponent={<View style={{ height: listBottomInset }} />}
        />

        {/* Move / Jump Question Position Modal */}
        <Modal
          visible={reorderingTargetIndex !== null}
          animationType="fade"
          transparent
          onRequestClose={() => setReorderingTargetIndex(null)}>
          <View style={styles.moveModalOverlay}>
            <View style={styles.moveModalCard}>
              <View style={styles.moveModalHeader}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <ArrowUpDown size={18} color={colors.primary} />
                  <Text style={styles.moveModalTitle}>
                    Move Question {reorderingTargetIndex !== null ? reorderingTargetIndex + 1 : ''}
                  </Text>
                </View>
                <AnimatedPressable onPress={() => setReorderingTargetIndex(null)}>
                  <X size={18} color={colors.textMuted} />
                </AnimatedPressable>
              </View>

              <Text style={styles.moveModalHint}>
                Enter target position (1 to {questions.length}). Other questions will automatically shift.
              </Text>

              <View style={styles.moveInputRow}>
                <Text style={styles.moveInputPrefix}>New Position:</Text>
                <TextInput
                  style={styles.moveNumberInput}
                  keyboardType="number-pad"
                  value={targetPositionInput}
                  onChangeText={setTargetPositionInput}
                  placeholder="e.g. 10"
                  placeholderTextColor={colors.textMuted}
                  autoFocus
                  selectTextOnFocus
                />
              </View>

              {/* Quick jump presets */}
              <View style={styles.movePresetsRow}>
                <AnimatedPressable
                  style={styles.movePresetChip}
                  onPress={() => setTargetPositionInput('1')}>
                  <Text style={styles.movePresetChipText}>Top (#1)</Text>
                </AnimatedPressable>
                {reorderingTargetIndex !== null && reorderingTargetIndex > 0 ? (
                  <AnimatedPressable
                    style={styles.movePresetChip}
                    onPress={() => setTargetPositionInput(String(reorderingTargetIndex))}>
                    <Text style={styles.movePresetChipText}>Up 1 (#{reorderingTargetIndex})</Text>
                  </AnimatedPressable>
                ) : null}
                {reorderingTargetIndex !== null && reorderingTargetIndex < questions.length - 1 ? (
                  <AnimatedPressable
                    style={styles.movePresetChip}
                    onPress={() => setTargetPositionInput(String(reorderingTargetIndex + 2))}>
                    <Text style={styles.movePresetChipText}>Down 1 (#{reorderingTargetIndex + 2})</Text>
                  </AnimatedPressable>
                ) : null}
                <AnimatedPressable
                  style={styles.movePresetChip}
                  onPress={() => setTargetPositionInput(String(questions.length))}>
                  <Text style={styles.movePresetChipText}>Bottom (#{questions.length})</Text>
                </AnimatedPressable>
              </View>

              <View style={styles.moveModalFooter}>
                <AnimatedPressable
                  style={styles.moveCancelButton}
                  onPress={() => setReorderingTargetIndex(null)}>
                  <Text style={styles.moveCancelButtonText}>Cancel</Text>
                </AnimatedPressable>
                <AnimatedPressable
                  style={styles.moveConfirmButton}
                  onPress={handleConfirmMoveToPosition}>
                  <Text style={styles.moveConfirmButtonText}>Move Position</Text>
                </AnimatedPressable>
              </View>
            </View>
          </View>
        </Modal>

        <View
          style={[
            styles.stickyPublishBar,
            { paddingBottom: Math.max(insets.bottom, spacing.sm) },
          ]}>
          <Button
            label="Publish Test"
            loadingLabel="Publishing Test..."
            loading={isCreating}
            onPress={handleCreate}
            size="lg"
            fullWidth
          />
        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  content: {
    gap: spacing.xl,
    paddingBottom: spacing.lg,
  },
  accessWrap: {
    paddingHorizontal: spacing.xl,
  },
  formCard: {
    marginHorizontal: spacing.xl,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.xl,
    padding: spacing.lg,
    gap: spacing.md,
  },
  sectionTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '800',
  },
  row: {
    flexDirection: 'row',
    gap: spacing.md,
    flexWrap: 'wrap',
  },
  flexItem: {
    flex: 1,
    minWidth: 140,
  },
  sectionLabel: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  choiceRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  choiceChip: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceMuted,
  },
  choiceChipActive: {
    backgroundColor: colors.primary,
  },
  choiceText: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'capitalize',
  },
  choiceTextActive: {
    color: colors.white,
  },
  importButton: {
    backgroundColor: colors.info,
    borderRadius: radius.md,
    paddingVertical: spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    flexDirection: 'row',
  },
  appendImportButton: {
    backgroundColor: colors.primary,
  },
  importButtonText: {
    color: colors.white,
    fontSize: 14,
    fontWeight: '800',
  },
  inputAccessory: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  pickerField: {
    minHeight: 48,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceRaised,
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },
  pickerValue: {
    color: colors.text,
    fontSize: 14,
  },
  warningStack: {
    gap: spacing.xs,
  },
  fileHint: {
    color: colors.textMuted,
    fontSize: 12,
    lineHeight: 18,
  },
  warningText: {
    color: colors.warning,
    fontSize: 12,
    lineHeight: 18,
    fontWeight: '700',
  },
  questionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.xs,
  },
  questionTitle: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '800',
  },
  deleteQuestionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radius.sm,
    backgroundColor: colors.dangerSoft ?? colors.surfaceMuted,
  },
  deleteQuestionButtonText: {
    color: colors.danger,
    fontSize: 11,
    fontWeight: '700',
  },
  multilineInput: {
    minHeight: 76,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    color: colors.text,
    fontSize: 14,
    textAlignVertical: 'top',
  },
  imageButton: {
    backgroundColor: colors.primarySoft,
    borderRadius: radius.md,
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    flexDirection: 'row',
  },
  imageButtonText: {
    color: colors.primary,
    fontSize: 14,
    fontWeight: '800',
  },
  subjectLockCard: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceMuted,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.lg,
    gap: spacing.xs,
  },
  subjectLockLabel: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  subjectLockValue: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '800',
  },
  subjectLockHint: {
    color: colors.textMuted,
    fontSize: 12,
    lineHeight: 18,
  },
  bankActionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  bankButton: {
    flex: 1,
    minWidth: 150,
    minHeight: 42,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.primary,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  bankButtonText: {
    color: colors.primary,
    fontSize: 12,
    fontWeight: '800',
  },
  actionRow: {
    paddingHorizontal: spacing.xl,
    flexDirection: 'row',
    gap: spacing.md,
  },
  stickyPublishBar: {
    position: 'absolute',
    left: spacing.lg,
    right: spacing.lg,
    bottom: 0,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    shadowColor: colors.shadow,
    shadowOpacity: 0.12,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: -6 },
    elevation: 10,
  },
  primaryButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
    paddingVertical: spacing.lg,
    borderRadius: radius.md,
  },
  primaryButtonText: {
    color: colors.white,
    fontSize: 14,
    fontWeight: '800',
  },
  secondaryButton: {
    paddingHorizontal: spacing.xl,
    justifyContent: 'center',
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.md,
  },
  secondaryButtonText: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '700',
  },
  reorderControlsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.surfaceMuted,
    paddingHorizontal: 4,
    paddingVertical: 2,
    borderRadius: radius.sm,
  },
  reorderArrowButton: {
    padding: 3,
    borderRadius: radius.sm,
  },
  reorderButtonDisabled: {
    opacity: 0.3,
  },
  reorderJumpButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: radius.sm,
    backgroundColor: colors.primarySoft,
  },
  reorderJumpButtonText: {
    color: colors.primary,
    fontSize: 10,
    fontWeight: '700',
  },
  shuffleAllButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.primarySoft,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radius.pill,
  },
  shuffleAllButtonText: {
    color: colors.primary,
    fontSize: 11,
    fontWeight: '700',
  },
  moveModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.xl,
  },
  moveModalCard: {
    width: '100%',
    maxWidth: 380,
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    padding: spacing.xl,
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: colors.shadow,
    shadowOpacity: 0.2,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },
  moveModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.xs,
  },
  moveModalTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '800',
  },
  moveModalHint: {
    color: colors.textMuted,
    fontSize: 12,
    lineHeight: 16,
    marginBottom: spacing.md,
  },
  moveInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  moveInputPrefix: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '700',
  },
  moveNumberInput: {
    flex: 1,
    height: 44,
    borderWidth: 1.5,
    borderColor: colors.primary,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    fontSize: 16,
    fontWeight: '800',
    color: colors.text,
    backgroundColor: colors.background,
    textAlign: 'center',
  },
  movePresetsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    marginBottom: spacing.lg,
  },
  movePresetChip: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 5,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1,
    borderColor: colors.border,
  },
  movePresetChipText: {
    color: colors.text,
    fontSize: 11,
    fontWeight: '600',
  },
  moveModalFooter: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  moveCancelButton: {
    flex: 1,
    height: 40,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  moveCancelButtonText: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '700',
  },
  moveConfirmButton: {
    flex: 1.4,
    height: 40,
    borderRadius: radius.md,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  moveConfirmButtonText: {
    color: colors.white,
    fontSize: 13,
    fontWeight: '800',
  },
});
