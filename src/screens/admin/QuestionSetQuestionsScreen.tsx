import React, { memo, useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import DocumentPicker, { isCancel, pickSingle, types } from 'react-native-document-picker';
import {
  Check,
  CheckSquare,
  Edit3,
  ImageIcon,
  ShieldAlert,
  Sparkles,
  Square,
  Trash2,
  UploadCloud,
  X,
} from 'lucide-react-native';

import { AppHeader } from '../../components/common/AppHeader';
import { AnimatedPressable } from '../../components/common/AnimatedPressable';
import { Card } from '../../components/common/Card';
import { EmptyState } from '../../components/common/EmptyState';
import { Screen } from '../../components/common/Screen';
import { RootStackScreenProps } from '../../navigation/types';
import { useAppStore } from '../../store/appStore';
import { useAuthStore } from '../../store/authStore';
import { colors, radius, spacing } from '../../theme';
import { CreateTestQuestionPayload, QuestionBankQuestion, QuestionType } from '../../types';
import { updateQuestionInSet } from '../../services/api/admin';
import { uploadExamAsset } from '../../services/api/storage';
import { formatExamTextForDisplay } from '../../utils/examText';

interface QuestionSetQuestionCardProps {
  index: number;
  item: QuestionBankQuestion;
  mode: 'manage' | 'picker';
  selectionIndex?: number;
  onToggleSelection: (question: QuestionBankQuestion) => void;
  onEditQuestion: (question: QuestionBankQuestion, index: number) => void;
}

const QuestionSetQuestionCard = memo(
  function QuestionSetQuestionCard({
    index,
    item,
    mode,
    selectionIndex,
    onToggleSelection,
    onEditQuestion,
  }: QuestionSetQuestionCardProps) {
    const formattedQuestion = useMemo(() => formatExamTextForDisplay(item.question), [item.question]);
    const formattedOptions = useMemo(
      () => item.options.map((option) => formatExamTextForDisplay(option)),
      [item.options],
    );
    const formattedCorrectAnswer = useMemo(
      () => formatExamTextForDisplay(item.correctAnswer),
      [item.correctAnswer],
    );

    return (
      <Card style={styles.questionCard}>
        <View style={styles.questionHeader}>
          <Text style={styles.questionIndex}>Q{index + 1}</Text>
          <Text style={styles.questionType}>{item.type.toUpperCase()}</Text>

          {mode === 'manage' ? (
            <AnimatedPressable
              style={styles.editQuestionPill}
              onPress={() => onEditQuestion(item, index)}>
              <Edit3 size={12} color={colors.primary} />
              <Text style={styles.editQuestionPillText}>Edit</Text>
            </AnimatedPressable>
          ) : null}

          {mode === 'picker' ? (
            <Pressable
              android_ripple={{ color: colors.primarySoft, borderless: false }}
              hitSlop={8}
              style={({ pressed }) => [
                styles.selectButton,
                pressed ? styles.selectButtonPressed : null,
              ]}
              onPress={() => onToggleSelection(item)}>
              {selectionIndex ? (
                <CheckSquare size={18} color={colors.primary} />
              ) : (
                <Square size={18} color={colors.textMuted} />
              )}
              <Text style={[styles.selectButtonText, selectionIndex ? styles.selectButtonTextActive : null]}>
                {selectionIndex ? selectionIndex : 'Select'}
              </Text>
            </Pressable>
          ) : null}
        </View>

        <Text style={styles.questionText}>{formattedQuestion}</Text>

        {item.imageUrl ? (
          <Image
            source={{ uri: item.imageUrl }}
            style={styles.questionImage}
            resizeMode="contain"
            onError={(e) => {
              console.error('QUESTION IMAGE FAILED TO LOAD', {
                src: item.imageUrl,
                questionId: item.id,
                error: e.nativeEvent,
              });
            }}
          />
        ) : null}

        {item.needsReview ? (
          <View style={styles.reviewBadge}>
            <Text style={styles.reviewBadgeText}>Needs Review (AI Confidence: {Math.round((item.aiConfidence ?? 0.75) * 100)}%)</Text>
          </View>
        ) : null}

        {formattedOptions.length > 0 ? (
          <View style={styles.optionList}>
            {formattedOptions.map((option, optionIndex) => {
              const optLetter = String.fromCharCode(65 + optionIndex);
              const isCorrect =
                item.options[optionIndex] === item.correctAnswer ||
                item.correctAnswer.toUpperCase() === optLetter ||
                item.correctAnswer === String(optionIndex + 1);
              return (
                <View key={`${item.id}_${optionIndex}`} style={styles.optionRow}>
                  <Text
                    style={[
                      styles.optionText,
                      isCorrect ? styles.correctOptionText : null,
                    ]}>
                    ({optLetter}) {option}
                  </Text>
                  {item.optionImageUrls && item.optionImageUrls[optionIndex] ? (
                    <Image source={{ uri: item.optionImageUrls[optionIndex] }} style={styles.optionImage} resizeMode="contain" />
                  ) : null}
                </View>
              );
            })}
          </View>
        ) : (
          <Text style={styles.integerAnswer}>Correct answer: {formattedCorrectAnswer}</Text>
        )}
      </Card>
    );
  },
  (previous, next) =>
    previous.index === next.index &&
    previous.item === next.item &&
    previous.mode === next.mode &&
    previous.selectionIndex === next.selectionIndex,
);

export function QuestionSetQuestionsScreen({ navigation, route }: RootStackScreenProps<'QuestionSetQuestions'>) {
  const { mode = 'manage', setId, setName } = route.params;
  const insets = useSafeAreaInsets();
  const user = useAuthStore((state) => state.user);
  const isAdmin = user?.role === 'admin' && user.approvalStatus === 'approved';
  const loadQuestionSetQuestions = useAppStore((state) => state.loadQuestionSetQuestions);
  const questionBankSelection = useAppStore((state) => state.questionBankSelection);
  const toggleQuestionBankSelection = useAppStore((state) => state.toggleQuestionBankSelection);
  const selectAllQuestionBankQuestions = useAppStore((state) => state.selectAllQuestionBankQuestions);
  const deselectAllQuestionBankQuestions = useAppStore((state) => state.deselectAllQuestionBankQuestions);
  const queueSelectedQuestionBankQuestions = useAppStore((state) => state.queueSelectedQuestionBankQuestions);
  const queueDraftQuestions = useAppStore((state) => state.queueDraftQuestions);

  const [isLoading, setIsLoading] = useState(false);
  const [questions, setQuestions] = useState<QuestionBankQuestion[]>([]);

  // Edit question modal state
  const [editingTarget, setEditingTarget] = useState<{ question: QuestionBankQuestion; index: number } | null>(null);
  const [editPrompt, setEditPrompt] = useState('');
  const [editType, setEditType] = useState<QuestionType>('mcq');
  const [editOptions, setEditOptions] = useState<string[]>(['', '', '', '']);
  const [editCorrectAnswer, setEditCorrectAnswer] = useState('');
  const [editExplanation, setEditExplanation] = useState('');
  const [editImageUrl, setEditImageUrl] = useState<string | null>(null);
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const [isUploadingImage, setIsUploadingImage] = useState(false);

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

      const picked = await pickSingle({
        type: [types.images],
        copyTo: 'cachesDirectory',
      });

      const uploaded = await uploadExamAsset({
        uri: picked.fileCopyUri || picked.uri,
        name: picked.name || `question-diagram-${Date.now()}.png`,
        mimeType: picked.type || 'image/png',
        folder: 'images',
      });

      setEditImageUrl(uploaded.publicUrl);
    } catch (err) {
      if (!isCancel(err)) {
        Alert.alert('Upload Failed', 'Could not upload diagram image. Please try again.');
      }
    } finally {
      setIsUploadingImage(false);
    }
  };

  const allSetQuestionsSelected = useMemo(() => {
    if (questions.length === 0) return false;
    const selectedIds = new Set(questionBankSelection.map((q) => q.id));
    return questions.every((q) => selectedIds.has(q.id));
  }, [questionBankSelection, questions]);

  const handleToggleSelectAll = useCallback(() => {
    if (allSetQuestionsSelected) {
      deselectAllQuestionBankQuestions(questions);
    } else {
      selectAllQuestionBankQuestions(questions);
    }
  }, [allSetQuestionsSelected, deselectAllQuestionBankQuestions, questions, selectAllQuestionBankQuestions]);

  const loadQuestions = useCallback(async () => {
    setIsLoading(true);
    try {
      const rows = await loadQuestionSetQuestions(setId);
      const sorted = [...(rows || [])].sort((a, b) => Number(a.id) - Number(b.id));
      setQuestions(sorted);
    } catch (error) {
      Alert.alert('Unable to load questions', error instanceof Error ? error.message : 'Please try again.');
    } finally {
      setIsLoading(false);
    }
  }, [loadQuestionSetQuestions, setId]);

  useFocusEffect(
    React.useCallback(() => {
      if (!isAdmin) {
        return undefined;
      }

      void loadQuestions();
      return undefined;
    }, [isAdmin, loadQuestions]),
  );

  const handleUseSelection = useCallback(() => {
    const queued = queueSelectedQuestionBankQuestions();
    if (queued.length === 0) {
      Alert.alert('No questions selected', 'Select at least one question before sending them to Create Test.');
      return;
    }

    navigation.pop(2);
  }, [navigation, queueSelectedQuestionBankQuestions]);

  const handleCreateTestFromSet = useCallback(() => {
    if (questions.length === 0) {
      Alert.alert('Empty Set', 'No questions in this set.');
      return;
    }

    const sortedQuestions = [...questions].sort((a, b) => Number(a.id) - Number(b.id));
    const draftQuestions: CreateTestQuestionPayload[] = sortedQuestions.map((q) => {
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
  }, [navigation, queueDraftQuestions, questions]);

  const handleOpenEdit = useCallback((q: QuestionBankQuestion, idx: number) => {
    setEditingTarget({ question: q, index: idx });
    setEditPrompt(q.question);
    setEditType(q.type);
    setEditOptions(q.options.length >= 4 ? [...q.options] : [...q.options, ...Array(Math.max(0, 4 - q.options.length)).fill('')]);
    setEditCorrectAnswer(q.correctAnswer);
    setEditExplanation('');
    setEditImageUrl(q.imageUrl ?? null);
  }, []);

  const handleSaveEdit = async () => {
    if (!editingTarget) return;

    if (!editPrompt.trim()) {
      Alert.alert('Prompt required', 'Question prompt cannot be empty.');
      return;
    }

    setIsSavingEdit(true);
    try {
      const qId = editingTarget.question.id;
      const formattedOptions = editType === 'mcq' ? editOptions.map((o) => o.trim()) : [];
      const formattedAnswer = editCorrectAnswer.trim().toUpperCase();

      await updateQuestionInSet({
        id: Number(qId),
        question: editPrompt.trim(),
        options: formattedOptions,
        correct_answer: formattedAnswer,
        type: editType,
        explanation: editExplanation.trim(),
        image_url: editImageUrl,
      });

      // Update in local state
      setQuestions((prev) =>
        prev.map((item, idx) =>
          idx === editingTarget.index
            ? {
                ...item,
                question: editPrompt.trim(),
                options: formattedOptions,
                correctAnswer: formattedAnswer,
                type: editType,
                imageUrl: editImageUrl,
              }
            : item,
        ),
      );

      setEditingTarget(null);
      Alert.alert('Question Updated', 'Changes saved to database successfully!');
    } catch (error) {
      Alert.alert('Update Failed', error instanceof Error ? error.message : 'Unable to update question.');
    } finally {
      setIsSavingEdit(false);
    }
  };

  const handleToggleSelection = useCallback(
    (question: QuestionBankQuestion) => {
      toggleQuestionBankSelection(question);
    },
    [toggleQuestionBankSelection],
  );

  const selectionOrder = useMemo(
    () => new Map(questionBankSelection.map((question, index) => [question.id, index + 1])),
    [questionBankSelection],
  );
  const selectedCount = questionBankSelection.length;

  const renderQuestionItem = useCallback(
    ({ item, index }: { item: QuestionBankQuestion; index: number }) => (
      <QuestionSetQuestionCard
        index={index}
        item={item}
        mode={mode}
        selectionIndex={selectionOrder.get(item.id)}
        onToggleSelection={handleToggleSelection}
        onEditQuestion={handleOpenEdit}
      />
    ),
    [handleOpenEdit, handleToggleSelection, mode, selectionOrder],
  );

  if (!isAdmin) {
    return (
      <Screen>
        <AppHeader title="Question Set" subtitle="Restricted to approved MIITJEE admins" showLogo={false} />
        <View style={styles.accessWrap}>
          <EmptyState
            icon={ShieldAlert}
            title="Admin access required"
            description="Only approved admins can view question-bank details."
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
          keyExtractor={(item) => String(item.id)}
          renderItem={renderQuestionItem}
          contentContainerStyle={[
            styles.content,
            mode === 'picker' ? { paddingBottom: 118 + insets.bottom } : null,
          ]}
          ListHeaderComponent={
            <>
              <AppHeader title={`Set ${setId}`} subtitle={setName} showLogo={false} />
              {mode === 'manage' && questions.length > 0 ? (
                <Card style={styles.selectionCard}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                    <View style={{ flex: 1, paddingRight: spacing.xs }}>
                      <Text style={styles.selectionTitle}>{questions.length} Questions in this Set</Text>
                      <Text style={styles.selectionHint}>Quickly prefill and create an official exam using all questions from this set.</Text>
                    </View>
                    <AnimatedPressable
                      style={{
                        backgroundColor: colors.primary,
                        paddingHorizontal: spacing.md,
                        paddingVertical: spacing.sm,
                        borderRadius: radius.md,
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: 6,
                      }}
                      onPress={handleCreateTestFromSet}>
                      <Sparkles size={15} color={colors.white} />
                      <Text style={{ color: colors.white, fontWeight: '700', fontSize: 13 }}>Create Exam</Text>
                    </AnimatedPressable>
                  </View>
                </Card>
              ) : null}
              {mode === 'picker' ? (
                <Card style={styles.selectionCard}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                    <View style={{ flex: 1, paddingRight: spacing.xs }}>
                      <Text style={styles.selectionTitle}>{selectedCount} selected for this paper</Text>
                      <Text style={styles.selectionHint}>
                        Selection numbering continues across sets. Keep selecting here, then use the fixed button below when ready.
                      </Text>
                    </View>
                    <AnimatedPressable
                      style={{
                        backgroundColor: allSetQuestionsSelected ? colors.danger : colors.primary,
                        paddingHorizontal: spacing.md,
                        paddingVertical: spacing.sm,
                        borderRadius: radius.md,
                      }}
                      onPress={handleToggleSelectAll}>
                      <Text style={{ color: colors.white, fontWeight: '700', fontSize: 13 }}>
                        {allSetQuestionsSelected ? 'Deselect All' : 'Select All'}
                      </Text>
                    </AnimatedPressable>
                  </View>
                </Card>
              ) : null}
            </>
          }
          ListEmptyComponent={
            isLoading ? (
              <Card style={styles.loadingCard}>
                <Text style={styles.selectionHint}>Loading questions...</Text>
              </Card>
            ) : (
              <EmptyState
                icon={CheckSquare}
                title="No questions found"
                description="This set is empty right now or could not be loaded."
              />
            )
          }
          showsVerticalScrollIndicator={false}
          initialNumToRender={8}
          maxToRenderPerBatch={8}
          windowSize={7}
          removeClippedSubviews
        />

        {mode === 'picker' ? (
          <View
            style={[
              styles.stickyBar,
              { paddingBottom: Math.max(insets.bottom, spacing.sm) },
            ]}>
            <View style={styles.stickySummary}>
              <Text style={styles.stickyTitle}>{selectedCount} selected</Text>
              <Text style={styles.stickyHint}>Send them to Create Test without scrolling back to the top.</Text>
            </View>
            <AnimatedPressable
              style={[
                styles.stickyButton,
                selectedCount === 0 ? styles.stickyButtonDisabled : null,
              ]}
              onPress={handleUseSelection}
              disabled={selectedCount === 0}>
              <Text style={styles.stickyButtonText}>
                {selectedCount > 0 ? `Use ${selectedCount} Questions` : 'Use Selected Questions'}
              </Text>
            </AnimatedPressable>
          </View>
        ) : null}

        {/* Edit Question Modal */}
        <Modal
          visible={editingTarget !== null}
          animationType="slide"
          transparent
          onRequestClose={() => setEditingTarget(null)}>
          <View style={styles.modalOverlay}>
            <View style={styles.modalContainer}>
              <View style={styles.modalHeader}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}>
                  <Edit3 size={18} color={colors.primary} />
                  <Text style={styles.modalTitle}>Edit Question</Text>
                </View>
                <AnimatedPressable style={styles.modalCloseButton} onPress={() => setEditingTarget(null)}>
                  <X size={18} color={colors.textMuted} />
                </AnimatedPressable>
              </View>

              <ScrollView contentContainerStyle={styles.modalScrollContent} showsVerticalScrollIndicator={false}>
                {/* Format Selector */}
                <Text style={styles.inputSectionLabel}>Question Format</Text>
                <View style={styles.choiceChipsRow}>
                  {['mcq', 'integer'].map((t) => (
                    <AnimatedPressable
                      key={t}
                      style={[styles.choiceChip, editType === t ? styles.choiceChipActive : null]}
                      onPress={() => setEditType(t as QuestionType)}>
                      <Text style={[styles.choiceChipText, editType === t ? styles.choiceChipTextActive : null]}>
                        {t === 'mcq' ? 'Multiple Choice (MCQ)' : 'Numeric Answer'}
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
                  placeholder="Enter full question text..."
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
                    <Text style={styles.correctSelectHint}>* Tap option letter (A, B, C, D) to set as correct answer.</Text>
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
                <AnimatedPressable style={styles.modalCancelButton} onPress={() => setEditingTarget(null)}>
                  <Text style={styles.modalCancelButtonText}>Cancel</Text>
                </AnimatedPressable>
                <AnimatedPressable
                  style={[styles.modalSaveButton, isSavingEdit ? styles.buttonDisabled : null]}
                  onPress={() => void handleSaveEdit()}
                  disabled={isSavingEdit}>
                  {isSavingEdit ? (
                    <ActivityIndicator size="small" color={colors.white} />
                  ) : (
                    <Check size={16} color={colors.white} />
                  )}
                  <Text style={styles.modalSaveButtonText}>Save Changes</Text>
                </AnimatedPressable>
              </View>
            </View>
          </View>
        </Modal>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  content: {
    paddingBottom: spacing.xxxl,
  },
  accessWrap: {
    paddingHorizontal: spacing.xl,
  },
  selectionCard: {
    marginHorizontal: spacing.xl,
    marginBottom: spacing.lg,
    gap: spacing.sm,
    backgroundColor: colors.primarySoft,
  },
  selectionTitle: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '800',
  },
  selectionHint: {
    color: colors.textMuted,
    fontSize: 12,
    lineHeight: 18,
  },
  questionCard: {
    marginHorizontal: spacing.xl,
    marginBottom: spacing.md,
    gap: spacing.sm,
    padding: spacing.lg,
  },
  questionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  questionIndex: {
    color: colors.primary,
    fontSize: 12,
    fontWeight: '800',
  },
  questionType: {
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
  selectButton: {
    marginLeft: 'auto',
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  selectButtonPressed: {
    backgroundColor: colors.primarySoft,
  },
  selectButtonText: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '700',
  },
  selectButtonTextActive: {
    color: colors.primary,
  },
  questionText: {
    color: colors.text,
    fontSize: 13,
    lineHeight: 19,
    fontWeight: '600',
  },
  optionList: {
    gap: spacing.xs,
  },
  optionText: {
    color: colors.textMuted,
    fontSize: 12,
    lineHeight: 18,
  },
  correctOptionText: {
    color: colors.success,
    fontWeight: '700',
  },
  questionImage: {
    width: '100%',
    height: 180,
    borderRadius: radius.md,
    marginVertical: spacing.xs,
  },
  reviewBadge: {
    backgroundColor: '#FFF4E5',
    borderColor: '#FFE0B2',
    borderWidth: 1,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radius.sm,
    alignSelf: 'flex-start',
    marginVertical: spacing.xs,
  },
  reviewBadgeText: {
    color: '#E65100',
    fontSize: 11,
    fontWeight: '700',
  },
  optionRow: {
    gap: spacing.xs,
  },
  optionImage: {
    width: '100%',
    height: 100,
    borderRadius: radius.sm,
    marginVertical: 2,
  },
  integerAnswer: {
    color: colors.success,
    fontSize: 12,
    fontWeight: '700',
  },
  loadingCard: {
    marginHorizontal: spacing.xl,
  },
  stickyBar: {
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
    gap: spacing.sm,
    shadowColor: colors.shadow,
    shadowOpacity: 0.12,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: -6 },
    elevation: 10,
  },
  stickySummary: {
    gap: 2,
  },
  stickyTitle: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '800',
  },
  stickyHint: {
    color: colors.textMuted,
    fontSize: 11,
    lineHeight: 16,
  },
  stickyButton: {
    minHeight: 44,
    borderRadius: radius.lg,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stickyButtonDisabled: {
    opacity: 0.55,
  },
  stickyButtonText: {
    color: colors.white,
    fontSize: 12,
    fontWeight: '800',
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
  buttonDisabled: {
    opacity: 0.6,
  },
});
