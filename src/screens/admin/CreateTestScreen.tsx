import React, { startTransition, useCallback, useMemo, useState } from 'react';
import { Alert, FlatList, StyleSheet, Text, TextInput, View } from 'react-native';
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import DocumentPicker, { isCancel, pickSingle, types } from 'react-native-document-picker';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppHeader } from '../../components/common/AppHeader';
import { AnimatedPressable } from '../../components/common/AnimatedPressable';
import { EmptyState } from '../../components/common/EmptyState';
import { InputField } from '../../components/common/InputField';
import { Screen } from '../../components/common/Screen';
import { uploadExamAsset } from '../../services/api/storage';
import { useAppStore } from '../../store/appStore';
import { useAuthStore } from '../../store/authStore';
import { colors, radius, spacing } from '../../theme';
import { CreateTestQuestionPayload, ScholarshipAdmissionClass, ScholarshipTargetExam, TestType } from '../../types';
import { RootStackScreenProps } from '../../navigation/types';
import { FileImage, FolderOpen, ShieldAlert } from 'lucide-react-native';
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
  const [batchId, setBatchId] = useState<string>(batches[0]?.id ?? '');
  const [scheduleDate, setScheduleDate] = useState(() => toDateInputValue());
  const [scheduleTime, setScheduleTime] = useState(() => toTimeInputValue());
  const [isDatePickerVisible, setIsDatePickerVisible] = useState(false);
  const [isTimePickerVisible, setIsTimePickerVisible] = useState(false);
  const [scholarshipAdmissionClass, setScholarshipAdmissionClass] = useState<ScholarshipAdmissionClass>('8th');
  const [scholarshipTargetExam, setScholarshipTargetExam] = useState<ScholarshipTargetExam>('boards');
  const [questions, setQuestions] = useState<CreateTestQuestionPayload[]>([emptyQuestion()]);
  const [subjectRangePlan, setSubjectRangePlan] = useState('');
  const [uploadingImageIndex, setUploadingImageIndex] = useState<number | null>(null);
  const resolvedDurationMinutes = coerceDurationMinutes(durationMinutes);
  const isMultiSubject = subjectMode === 'multi';
  const nonBlankQuestionCount = useMemo(
    () => questions.filter((question) => !isQuestionBlank(question)).length,
    [questions],
  );
  const listBottomInset = 120 + Math.max(insets.bottom, spacing.sm);

  useFocusEffect(
    React.useCallback(() => {
      const queuedQuestions = consumePendingQuestionBankImport();

      if (queuedQuestions.length > 0) {
        startTransition(() => {
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
    if (!title.trim() || !description.trim()) {
      Alert.alert('Missing details', 'Please add a title and description before publishing.');
      return;
    }

    if (!durationMinutes.trim()) {
      Alert.alert('Duration required', 'Please enter the paper duration in minutes.');
      return;
    }

    if (resolvedDurationMinutes < 5 || resolvedDurationMinutes > 600) {
      Alert.alert('Invalid duration', 'Enter a duration between 5 and 600 minutes.');
      return;
    }

    if (type === 'weekly' && !batchId) {
      Alert.alert('Batch required', 'Create at least one batch in Supabase before publishing a weekly test.');
      return;
    }

    if (type === 'scholarship' && (!scholarshipAdmissionClass || !scholarshipTargetExam)) {
      Alert.alert('Scholarship audience required', 'Choose the admission class and target exam for this scholarship paper.');
      return;
    }

    if (
      questions.some((question) => {
        if (!question.prompt.trim()) {
          return true;
        }

        if (question.type === 'mcq') {
          return question.options.some((option) => !option.trim());
        }

        return typeof question.integerAnswer !== 'number' || Number.isNaN(question.integerAnswer);
      })
    ) {
      Alert.alert('Questions incomplete', 'Every question needs a prompt and valid answer data before publishing.');
      return;
    }

    const normalizedQuestions = questions.map((question) => ({
      ...question,
      subjectLabel: isMultiSubject ? question.subjectLabel?.trim() || undefined : primarySubject,
    }));

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

    try {
      const scheduledAt = combineScheduleInputs(scheduleDate, scheduleTime);
      await createTest({
        title: title.trim(),
        description: description.trim(),
        subject: resolvedTestSubject,
        durationMinutes: resolvedDurationMinutes,
        scheduledAt,
        type,
        batchId: type === 'weekly' ? batchId : undefined,
        scholarshipAdmissionClass: type === 'scholarship' ? scholarshipAdmissionClass : undefined,
        scholarshipTargetExam: type === 'scholarship' ? scholarshipTargetExam : undefined,
        questions: normalizedQuestions,
      });

      Alert.alert('Test created', 'The new paper is now available in the tests feed.');
      navigation.goBack();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to publish the test right now.';
      Alert.alert('Publish failed', message);
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

  const renderQuestionItem = useCallback(
    ({ item: question, index }: { item: CreateTestQuestionPayload; index: number }) => (
      <View style={styles.formCard}>
        <Text style={styles.questionTitle}>Question {index + 1}</Text>
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
            value={question.integerAnswer !== undefined ? String(question.integerAnswer) : ''}
            onChangeText={(value) =>
              updateQuestion(index, (current) => ({
                ...current,
                integerAnswer: Number(value),
              }))
            }
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
    [handleQuestionImageUpload, isMultiSubject, primarySubject, updateQuestion, uploadingImageIndex],
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
                <InputField label="Title" placeholder="Weekly Mock Test - Physics" value={title} onChangeText={setTitle} />
                <InputField
                  label="Description"
                  placeholder="What should learners expect in this test?"
                  value={description}
                  onChangeText={setDescription}
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
                      onChangeText={(value) => setDurationMinutes(sanitizeDurationInput(value))}
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
                    <AnimatedPressable style={styles.pickerField} onPress={() => setIsDatePickerVisible(true)}>
                      <Text style={styles.pickerValue}>{formatDateLabel(combineScheduleInputs(scheduleDate, scheduleTime))}</Text>
                    </AnimatedPressable>
                  </View>
                  <View style={styles.flexItem}>
                    <Text style={styles.sectionLabel}>Start Time</Text>
                    <AnimatedPressable style={styles.pickerField} onPress={() => setIsTimePickerVisible(true)}>
                      <Text style={styles.pickerValue}>{scheduleTime}</Text>
                    </AnimatedPressable>
                  </View>
                </View>

                {isDatePickerVisible ? (
                  <DateTimePicker
                    mode="date"
                    value={buildSchedulePickerDate(scheduleDate, scheduleTime)}
                    onChange={handleDateChange}
                  />
                ) : null}

                {isTimePickerVisible ? (
                  <DateTimePicker
                    mode="time"
                    value={buildSchedulePickerDate(scheduleDate, scheduleTime)}
                    onChange={handleTimeChange}
                  />
                ) : null}

                {type === 'weekly' ? (
                  <>
                    <Text style={styles.sectionLabel}>Batch</Text>
                    <View style={styles.choiceRow}>
                      {batches.map((batch) => (
                        <AnimatedPressable
                          key={batch.id}
                          style={[styles.choiceChip, batchId === batch.id && styles.choiceChipActive]}
                          onPress={() => setBatchId(batch.id)}>
                          <Text style={[styles.choiceText, batchId === batch.id && styles.choiceTextActive]}>{batch.label}</Text>
                        </AnimatedPressable>
                      ))}
                    </View>
                  </>
                ) : (
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
                )}
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
                <Text style={styles.sectionTitle}>Questions</Text>
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

        <View
          style={[
            styles.stickyPublishBar,
            { paddingBottom: Math.max(insets.bottom, spacing.sm) },
          ]}>
          <AnimatedPressable style={styles.primaryButton} onPress={handleCreate}>
            <Text style={styles.primaryButtonText}>Publish Test</Text>
          </AnimatedPressable>
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
  questionTitle: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '800',
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
});
