import React, { memo, useMemo } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown, FadeOutDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, radius, spacing } from '../../theme';
import { AnimatedPressable } from '../common/AnimatedPressable';
import { Card } from '../common/Card';

interface QuestionPaletteSheetProps {
  currentIndex: number;
  totalQuestions: number;
  answers: Record<string, string>;
  questionIds: string[];
  flaggedQuestionIds: string[];
  onJump: (index: number) => void;
}

function QuestionPaletteSheetComponent({
  currentIndex,
  totalQuestions,
  answers,
  questionIds,
  flaggedQuestionIds,
  onJump,
}: QuestionPaletteSheetProps) {
  const insets = useSafeAreaInsets();
  const flaggedQuestionIdSet = useMemo(() => new Set(flaggedQuestionIds), [flaggedQuestionIds]);
  const answeredCount = useMemo(
    () => questionIds.filter((questionId) => !!(questionId && answers[questionId])).length,
    [answers, questionIds],
  );
  const flaggedCount = useMemo(
    () => questionIds.filter((questionId) => !!(questionId && flaggedQuestionIdSet.has(questionId))).length,
    [flaggedQuestionIdSet, questionIds],
  );
  const unansweredCount = Math.max(totalQuestions - answeredCount, 0);

  return (
    <Animated.View entering={FadeInDown} exiting={FadeOutDown} style={[styles.wrapper, { paddingBottom: Math.max(insets.bottom, spacing.sm) }]}>
      <Card style={styles.card}>
        <View style={styles.header}>
          <Text style={styles.title}>Question Palette</Text>
          <Text style={styles.subtitle}>
            {answeredCount} Answered • {unansweredCount} Unanswered • {flaggedCount} Marked for Review
          </Text>
        </View>
        <View style={styles.legend}>
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, styles.itemAnswered]} />
            <Text style={styles.legendLabel}>Answered ({answeredCount})</Text>
          </View>
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, styles.itemUnanswered]} />
            <Text style={styles.legendLabel}>Unanswered ({unansweredCount})</Text>
          </View>
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, styles.itemFlagged]} />
            <Text style={styles.legendLabel}>Marked for Review ({flaggedCount})</Text>
          </View>
        </View>
        <ScrollView style={styles.gridScroll} contentContainerStyle={styles.grid} showsVerticalScrollIndicator={false}>
          {Array.from({ length: totalQuestions }, (_, index) => {
            const questionId = questionIds[index];
            const isCurrent = currentIndex === index;
            const isAnswered = !!(questionId && answers[questionId]);
            const isFlagged = !!(questionId && flaggedQuestionIdSet.has(questionId));

            let paletteStyle = styles.itemUnanswered;
            let textStyle = styles.itemTextUnanswered;

            if (isFlagged && isAnswered) {
              paletteStyle = styles.itemAnsweredAndFlagged;
              textStyle = styles.itemTextFlagged;
            } else if (isFlagged) {
              paletteStyle = styles.itemFlagged;
              textStyle = styles.itemTextFlagged;
            } else if (isAnswered) {
              paletteStyle = styles.itemAnswered;
              textStyle = styles.itemTextAnswered;
            }

            return (
              <AnimatedPressable
                key={questionId ?? `slot_${index}`}
                style={[
                  styles.item,
                  paletteStyle,
                  isCurrent && styles.itemCurrent,
                ]}
                onPress={() => onJump(index)}>
                <Text style={[styles.itemText, textStyle, isCurrent && styles.itemTextCurrent]}>
                  {index + 1}
                </Text>
                {isFlagged && isAnswered ? (
                  <View style={styles.answeredDotBadge} />
                ) : null}
              </AnimatedPressable>
            );
          })}
        </ScrollView>
      </Card>
    </Animated.View>
  );
}

export const QuestionPaletteSheet = memo(QuestionPaletteSheetComponent);

const styles = StyleSheet.create({
  wrapper: {
    flex: 1,
    paddingHorizontal: spacing.xl,
    marginBottom: spacing.lg,
  },
  card: {
    flex: 1,
    gap: spacing.md,
  },
  header: {
    gap: spacing.xs,
  },
  title: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '800',
  },
  subtitle: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '600',
  },
  legend: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  legendDot: {
    width: 12,
    height: 12,
    borderRadius: radius.pill,
  },
  legendLabel: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '700',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    paddingBottom: spacing.sm,
  },
  gridScroll: {
    flex: 1,
  },
  item: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: 'transparent',
    position: 'relative',
  },
  itemCurrent: {
    borderColor: colors.primary,
    shadowColor: colors.primary,
    shadowOpacity: 0.25,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  itemAnswered: {
    backgroundColor: '#DCFCE7',
    borderColor: '#86EFAC',
  },
  itemUnanswered: {
    backgroundColor: '#F1F5F9',
    borderColor: '#E2E8F0',
  },
  itemFlagged: {
    backgroundColor: '#EDE9FE',
    borderColor: '#C4B5FD',
  },
  itemAnsweredAndFlagged: {
    backgroundColor: '#EDE9FE',
    borderColor: '#15803D',
    borderWidth: 2,
  },
  answeredDotBadge: {
    position: 'absolute',
    top: 3,
    right: 3,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#15803D',
  },
  itemText: {
    fontSize: 14,
    fontWeight: '800',
  },
  itemTextAnswered: {
    color: '#15803D',
  },
  itemTextUnanswered: {
    color: '#64748B',
  },
  itemTextFlagged: {
    color: '#7C3AED',
  },
  itemTextCurrent: {
    color: colors.primary,
  },
});
