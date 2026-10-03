import React, { useEffect, useState } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { CheckCircle2, XCircle } from 'lucide-react-native';

import { AppHeader } from '../../components/common/AppHeader';
import { Badge } from '../../components/common/Badge';
import { BrandLoadingState } from '../../components/common/BrandLoadingState';
import { Card } from '../../components/common/Card';
import { Screen } from '../../components/common/Screen';
import { QuestionBodyRenderer } from '../../components/tests/QuestionBodyRenderer';
import { useAppStore } from '../../store/appStore';
import { colors, radius, spacing } from '../../theme';
import { RootStackScreenProps } from '../../navigation/types';

export function ReviewAnswersScreen({ route }: RootStackScreenProps<'ReviewAnswers'>) {
  const { resultId, testId } = route.params;
  const loadReview = useAppStore((state) => state.loadReview);
  const test = useAppStore((state) => state.tests.find((item) => item.id === testId));
  const [error, setError] = useState<string>();
  const [loading, setLoading] = useState(true);
  const [review, setReview] = useState<Awaited<ReturnType<typeof loadReview>>>([]);

  useEffect(() => {
    let active = true;

    async function bootstrap() {
      try {
        setLoading(true);
        const items = await loadReview(resultId);
        if (active) {
          setReview(items);
          setError(undefined);
        }
      } catch (loadError) {
        if (active) {
          setError(loadError instanceof Error ? loadError.message : 'Unable to load answer review.');
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    void bootstrap();
    return () => {
      active = false;
    };
  }, [loadReview, resultId]);

  return (
    <Screen contentContainerStyle={styles.content}>
      <AppHeader title="Check Your Answers" subtitle={test?.title ?? 'Detailed review'} />

      {loading ? (
        <BrandLoadingState title="Loading your answer review" subtitle="Fetching each question, your response, and the correct explanation." />
      ) : error ? (
        <Card>
          <Text style={styles.errorText}>{error}</Text>
        </Card>
      ) : review.length === 0 ? (
        <Card style={styles.reviewCard}>
          <Text style={styles.questionText}>No review questions available for this paper.</Text>
        </Card>
      ) : (
        review.map((item, index) => {
          const isUnatt = item.isUnattempted || !item.userAnswer || item.userAnswer.trim() === '';

          let isActuallyCorrect = Boolean(item.isCorrect);
          if (!isActuallyCorrect && !isUnatt) {
            const normUser = (item.userAnswer || '').trim().replace(/^Option\s+/i, '');
            const normCorrect = (item.correctAnswer || '').trim().replace(/^Option\s+/i, '');

            if (normUser.toLowerCase() === normCorrect.toLowerCase()) {
              isActuallyCorrect = true;
            } else if (/^[A-D]$/i.test(normUser) && item.options && item.options.length > 0) {
              const userOptIndex = normUser.toUpperCase().charCodeAt(0) - 65;
              const userOptText = (item.options[userOptIndex] || '').trim();
              if (userOptText.toLowerCase() === normCorrect.toLowerCase()) {
                isActuallyCorrect = true;
              }
            } else if (/^[A-D]$/i.test(normCorrect) && item.options && item.options.length > 0) {
              const corrOptIndex = normCorrect.toUpperCase().charCodeAt(0) - 65;
              const corrOptText = (item.options[corrOptIndex] || '').trim();
              if (corrOptText.toLowerCase() === normUser.toLowerCase()) {
                isActuallyCorrect = true;
              }
            } else if (!isNaN(Number(normUser)) && !isNaN(Number(normCorrect)) && Number(normUser) === Number(normCorrect)) {
              isActuallyCorrect = true;
            }
          }

          const badgeLabel = isActuallyCorrect
            ? 'Correct (+4 Marks)'
            : isUnatt
            ? 'Unattempted (0 Marks)'
            : 'Incorrect (-1 Mark)';
          const badgeTone: 'success' | 'warning' | 'danger' = isActuallyCorrect
            ? 'success'
            : isUnatt
            ? 'warning'
            : 'danger';

          return (
            <Card key={item.questionId} style={styles.reviewCard}>
              <View style={styles.headerRow}>
                <Badge label={`Q${index + 1}`} tone="neutral" />
                <Badge label={badgeLabel} tone={badgeTone} />
              </View>

              <QuestionBodyRenderer prompt={item.prompt} imageUrl={item.imageUrl} />

              {item.questionType === 'mcq' ? (
                <View style={styles.optionList}>
                  {item.options.map((option, optionIndex) => {
                    const badgeLetter = String.fromCharCode(65 + optionIndex);
                    const normUser = (item.userAnswer || '').trim().replace(/^Option\s+/i, '');
                    const normCorrect = (item.correctAnswer || '').trim().replace(/^Option\s+/i, '');

                    const isUser =
                      !isUnatt &&
                      (/^[A-D]$/i.test(normUser)
                        ? normUser.toUpperCase() === badgeLetter
                        : normUser.toLowerCase() === option.trim().toLowerCase() ||
                          normUser.toUpperCase() === badgeLetter);

                    const isCorrect = /^[A-D]$/i.test(normCorrect)
                      ? normCorrect.toUpperCase() === badgeLetter
                      : normCorrect.toLowerCase() === option.trim().toLowerCase() ||
                        normCorrect.toUpperCase() === badgeLetter;

                    return (
                      <View
                        key={`${item.questionId}_${optionIndex}`}
                        style={[
                          styles.optionRow,
                          isCorrect && styles.optionCorrect,
                          isUser && !isCorrect && styles.optionIncorrect,
                          isUser && isCorrect && styles.optionCorrect,
                        ]}>
                        <Text style={styles.optionText}>{option}</Text>
                        {isCorrect ? <CheckCircle2 size={18} color={colors.accent} /> : null}
                        {isUser && !isCorrect ? <XCircle size={18} color={colors.danger} /> : null}
                      </View>
                    );
                  })}
                </View>
              ) : (
                <View style={styles.integerWrap}>
                  <View style={styles.answerBox}>
                    <Text style={styles.answerLabel}>Your Answer</Text>
                    <Text style={styles.answerValue}>{isUnatt ? 'Unattempted' : item.userAnswer}</Text>
                  </View>
                  <View style={[styles.answerBox, styles.correctBox]}>
                    <Text style={styles.answerLabel}>Correct Answer</Text>
                    <Text style={styles.answerValue}>{item.correctAnswer}</Text>
                  </View>
                </View>
              )}

            <View style={styles.explanationWrap}>
              <Text style={styles.explanationLabel}>Explanation</Text>
              <Text style={styles.helperText}>{item.explanation || 'No explanation available for this question yet.'}</Text>
            </View>
          </Card>
          );
        })
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: spacing.xl,
    gap: spacing.lg,
  },
  reviewCard: {
    gap: spacing.md,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  questionText: {
    color: colors.text,
    fontSize: 17,
    lineHeight: 24,
    fontWeight: '800',
  },
  questionImage: {
    width: '100%',
    height: 360,
    maxHeight: 560,
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceMuted,
  },
  optionList: {
    gap: spacing.sm,
  },
  optionRow: {
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  optionCorrect: {
    borderColor: colors.accent,
    backgroundColor: colors.accentSoft,
  },
  optionIncorrect: {
    borderColor: colors.danger,
    backgroundColor: colors.dangerSoft,
  },
  optionText: {
    color: colors.text,
    flex: 1,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '600',
  },
  integerWrap: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  answerBox: {
    flex: 1,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceMuted,
    padding: spacing.lg,
    gap: spacing.xs,
  },
  correctBox: {
    backgroundColor: colors.accentSoft,
    borderColor: colors.accent,
  },
  answerLabel: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  answerValue: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '800',
  },
  explanationWrap: {
    gap: spacing.sm,
  },
  explanationLabel: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '800',
  },
  helperText: {
    color: colors.textMuted,
    fontSize: 13,
    lineHeight: 19,
  },
  errorText: {
    color: colors.danger,
    fontSize: 14,
    fontWeight: '700',
  },
});
