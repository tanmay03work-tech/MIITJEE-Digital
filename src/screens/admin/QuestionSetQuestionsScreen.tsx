import React, { memo, useCallback, useMemo, useState } from 'react';
import { Alert, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CheckSquare, ShieldAlert, Square } from 'lucide-react-native';

import { AppHeader } from '../../components/common/AppHeader';
import { AnimatedPressable } from '../../components/common/AnimatedPressable';
import { Card } from '../../components/common/Card';
import { EmptyState } from '../../components/common/EmptyState';
import { Screen } from '../../components/common/Screen';
import { RootStackScreenProps } from '../../navigation/types';
import { useAppStore } from '../../store/appStore';
import { useAuthStore } from '../../store/authStore';
import { colors, radius, spacing } from '../../theme';
import { QuestionBankQuestion } from '../../types';
import { formatExamTextForDisplay } from '../../utils/examText';

interface QuestionSetQuestionCardProps {
  index: number;
  item: QuestionBankQuestion;
  mode: 'manage' | 'picker';
  selectionIndex?: number;
  onToggleSelection: (question: QuestionBankQuestion) => void;
}

const QuestionSetQuestionCard = memo(
  function QuestionSetQuestionCard({
    index,
    item,
    mode,
    selectionIndex,
    onToggleSelection,
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
        {formattedOptions.length > 0 ? (
          <View style={styles.optionList}>
            {formattedOptions.map((option, optionIndex) => (
              <Text
                key={`${item.id}_${optionIndex}`}
                style={[
                  styles.optionText,
                  item.options[optionIndex] === item.correctAnswer ? styles.correctOptionText : null,
                ]}>
                {optionIndex + 1}. {option}
              </Text>
            ))}
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
  const queueSelectedQuestionBankQuestions = useAppStore((state) => state.queueSelectedQuestionBankQuestions);

  const [isLoading, setIsLoading] = useState(false);
  const [questions, setQuestions] = useState<QuestionBankQuestion[]>([]);

  const loadQuestions = useCallback(async () => {
    setIsLoading(true);
    try {
      const rows = await loadQuestionSetQuestions(setId);
      setQuestions(rows);
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
      />
    ),
    [handleToggleSelection, mode, selectionOrder],
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
              {mode === 'picker' ? (
                <Card style={styles.selectionCard}>
                  <Text style={styles.selectionTitle}>{selectedCount} selected for this paper</Text>
                  <Text style={styles.selectionHint}>
                    Selection numbering continues across sets. Keep selecting here, then use the fixed button below whenever you are ready.
                  </Text>
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
});
