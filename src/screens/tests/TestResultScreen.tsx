import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown, ZoomIn } from 'react-native-reanimated';
import { Award, BookOpen, CheckCircle2, Clock, HelpCircle, Layers, Trophy, User, XCircle } from 'lucide-react-native';

import { AppHeader } from '../../components/common/AppHeader';
import { Badge } from '../../components/common/Badge';
import { BrandLoadingState } from '../../components/common/BrandLoadingState';
import { Button } from '../../components/common/Button';
import { Card } from '../../components/common/Card';
import { Screen } from '../../components/common/Screen';
import { RootStackScreenProps } from '../../navigation/types';
import { fetchExistingAttemptForTest, fetchResultById } from '../../services/api/tests';
import { useAppStore } from '../../store/appStore';
import { useAuthStore } from '../../store/authStore';
import { colors, radius, spacing } from '../../theme';
import { LeaderboardEntry, TestResult } from '../../types';
import { formatDateTimeLabel } from '../../utils/formatters';

const EMPTY_LEADERBOARD: LeaderboardEntry[] = [];

interface SubjectScoreItem {
  subject: string;
  correct: number;
  wrong: number;
  unattempted: number;
  score: number;
  total: number;
}

export function TestResultScreen({ route, navigation }: RootStackScreenProps<'TestResult'>) {
  const { resultId, testId } = route.params;
  const user = useAuthStore((state) => state.user);
  const storeResult = useAppStore((state) =>
    state.results.find((entry) => entry.id === resultId || entry.id === route.params?.resultId)
    || state.results.find((entry) => entry.testId === testId)
  );
  const [fetchedResult, setFetchedResult] = useState<TestResult | null>(null);
  const result = storeResult || fetchedResult;
  const [isResultLoading, setIsResultLoading] = useState<boolean>(!result);
  const storedLeaderboard = useAppStore((state) => state.testLeaderboards[testId]);
  const loadLeaderboard = useAppStore((state) => state.loadLeaderboard);
  const loadQuestions = useAppStore((state) => state.loadQuestions);
  const test = useAppStore((state) => state.tests.find((candidate) => candidate.id === testId));
  const [leaderboardError, setLeaderboardError] = useState<string>();
  const [isLeaderboardLoading, setIsLeaderboardLoading] = useState(false);
  const leaderboard = storedLeaderboard ?? EMPTY_LEADERBOARD;

  const loadReview = useAppStore((state) => state.loadReview);
  const [subjectBreakdown, setSubjectBreakdown] = useState<SubjectScoreItem[]>([]);

  useEffect(() => {
    let active = true;

    async function loadSubjectBreakdown() {
      if (!resultId) return;
      try {
        const [reviews, questions] = await Promise.all([
          loadReview(resultId),
          loadQuestions(testId).catch(() => []),
        ]);

        if (!active || !reviews.length) return;

        const questionSubjectMap: Record<string, string> = {};
        if (questions && questions.length > 0) {
          questions.forEach((q) => {
            if (q.id && q.subjectLabel?.trim()) {
              questionSubjectMap[q.id] = q.subjectLabel.trim();
            }
          });
        }

        const breakdownMap: Record<string, { correct: number; wrong: number; unattempted: number; score: number; total: number }> = {};
        const defaultSubject = (test?.subject || 'Physics').trim();

        reviews.forEach((item, index) => {
          let sub = questionSubjectMap[item.questionId];
          if (!sub) {
            if (defaultSubject.toLowerCase().includes('physics') && defaultSubject.toLowerCase().includes('chem')) {
              const third = Math.ceil(reviews.length / 3);
              if (index < third) sub = 'Physics';
              else if (index < third * 2) sub = 'Chemistry';
              else sub = 'Mathematics';
            } else {
              sub = defaultSubject;
            }
          }

          if (!breakdownMap[sub]) {
            breakdownMap[sub] = { correct: 0, wrong: 0, unattempted: 0, score: 0, total: 0 };
          }
          breakdownMap[sub].total += 1;

          const ans = (item.userAnswer || '').trim();
          if (ans === '' || item.isUnattempted) {
            breakdownMap[sub].unattempted += 1;
          } else if (item.isCorrect) {
            breakdownMap[sub].correct += 1;
          } else {
            breakdownMap[sub].wrong += 1;
          }
        });

        const correctMarkVal = Number(test?.correctMarks) || 4;
        const wrongMarkVal = Number(test?.wrongMarks) ? Math.abs(Number(test?.wrongMarks)) : 1;

        Object.keys(breakdownMap).forEach((key) => {
          const b = breakdownMap[key];
          if (b) {
            b.score = b.correct * correctMarkVal - b.wrong * wrongMarkVal;
          }
        });

        const list: SubjectScoreItem[] = Object.keys(breakdownMap).map((key) => {
          const entry = breakdownMap[key]!;
          return {
            subject: key,
            correct: entry.correct,
            wrong: entry.wrong,
            unattempted: entry.unattempted,
            score: entry.score,
            total: entry.total,
          };
        });

        if (active) {
          setSubjectBreakdown(list);
        }
      } catch {
        // Fallback to empty breakdown list
      }
    }

    void loadSubjectBreakdown();
    return () => {
      active = false;
    };
  }, [loadQuestions, loadReview, resultId, test?.correctMarks, test?.subject, test?.wrongMarks, testId]);

  useEffect(() => {
    let active = true;

    if (leaderboard.length > 0) {
      setLeaderboardError(undefined);
      return () => {
        active = false;
      };
    }

    async function bootstrapLeaderboard() {
      try {
        setIsLeaderboardLoading(true);
        await loadLeaderboard({
          scope: 'test_wise',
          testId,
        });
        if (active) {
          setLeaderboardError(undefined);
        }
      } catch (error) {
        if (active) {
          setLeaderboardError(error instanceof Error ? error.message : 'Unable to load this batch leaderboard.');
        }
      } finally {
        if (active) {
          setIsLeaderboardLoading(false);
        }
      }
    }

    void bootstrapLeaderboard();
    return () => {
      active = false;
    };
  }, [leaderboard.length, loadLeaderboard, testId]);

  useEffect(() => {
    let active = true;

    if (result) {
      setIsResultLoading(false);
      return;
    }

    async function loadMissingResult() {
      try {
        setIsResultLoading(true);
        let loaded = resultId ? await fetchResultById(resultId) : null;

        if (!loaded && testId) {
          const user = useAuthStore.getState().user;
          loaded = await fetchExistingAttemptForTest(testId, user?.id);
        }

        if (active) {
          if (loaded) {
            setFetchedResult(loaded);
            useAppStore.setState((state) => ({
              results: [loaded!, ...state.results.filter((entry) => entry.id !== loaded!.id)],
            }));
          }
          setIsResultLoading(false);
        }
      } catch {
        if (active) {
          setIsResultLoading(false);
        }
      }
    }

    void loadMissingResult();
    return () => {
      active = false;
    };
  }, [result, resultId, testId]);

  if (isResultLoading) {
    return (
      <Screen contentContainerStyle={styles.content}>
        <AppHeader title="Result" subtitle="Loading scorecard..." />
        <BrandLoadingState title="Loading Scorecard" subtitle="Retrieving your test result and performance metrics." />
      </Screen>
    );
  }

  if (!result) {
    return (
      <Screen contentContainerStyle={styles.content}>
        <AppHeader title="Result" subtitle="Result not found" />
      </Screen>
    );
  }

  const wrongCount = result.wrongAnswers ?? Math.max(0, result.totalQuestions - result.correctAnswers - (result.unattempted ?? 0));
  const unattemptedCount = result.unattempted ?? Math.max(0, result.totalQuestions - result.correctAnswers - wrongCount);

  const studentDisplayName = result.studentName || user?.fullName || 'Student';
  const isOpenExam = Boolean(test?.isOpenForAll) || test?.accessMode === 'OPEN_FOR_ALL';
  const batchDisplayName = isOpenExam ? 'Open for All' : (test?.batchId || user?.batchId || 'Open for All');
  const timingFormatted = result.submittedAt ? formatDateTimeLabel(result.submittedAt) : 'Submitted';

  return (
    <Screen contentContainerStyle={styles.content}>
      <AppHeader title="Test Result" subtitle={test?.title ?? 'Official scorecard'} />

      {/* 1. Candidate Info Card */}
      <Animated.View entering={FadeInDown.delay(20)}>
        <Card style={styles.candidateCard}>
          <View style={styles.candidateHeaderRow}>
            <View style={styles.candidateAvatar}>
              <User size={20} color={colors.primary} />
            </View>
            <View style={styles.candidateInfo}>
              <Text style={styles.candidateName}>{studentDisplayName}</Text>
              <Text style={styles.candidateTestTitle}>{test?.title ?? 'Test Paper'}</Text>
            </View>
            <Badge label={batchDisplayName} tone={isOpenExam ? 'success' : 'primary'} />
          </View>

          <View style={styles.candidateMetaGrid}>
            <View style={styles.candidateMetaItem}>
              <Clock size={14} color={colors.textMuted} />
              <Text style={styles.candidateMetaText}>{timingFormatted}</Text>
            </View>
            <View style={styles.candidateMetaItem}>
              <Layers size={14} color={colors.textMuted} />
              <Text style={styles.candidateMetaText}>
                {test?.durationMinutes ? `${test.durationMinutes} mins duration` : 'Completed Paper'}
              </Text>
            </View>
          </View>
        </Card>
      </Animated.View>

      {/* 2. Overall Score Ring */}
      <Animated.View entering={ZoomIn.duration(450)} style={styles.scoreWrap}>
        <View style={styles.scoreRingOuter}>
          <View style={styles.scoreRingInner}>
            <Text style={styles.scoreValue}>{result.score}</Text>
            <Text style={styles.scoreLabel}>Total Score</Text>
          </View>
        </View>
      </Animated.View>

      {/* 3. Overall Performance Metrics */}
      <Animated.View entering={FadeInDown.delay(60)} style={styles.metricsRow}>
        <Card style={styles.metricCard}>
          <Text style={styles.metricLabel}>Correct</Text>
          <Text style={[styles.metricValue, { color: colors.success }]}>
            {result.correctAnswers}/{result.totalQuestions}
          </Text>
        </Card>
        <Card style={styles.metricCard}>
          <Text style={styles.metricLabel}>Wrong</Text>
          <Text style={[styles.metricValue, { color: colors.danger }]}>{wrongCount}</Text>
        </Card>
        <Card style={styles.metricCard}>
          <Text style={styles.metricLabel}>Unattempted</Text>
          <Text style={styles.metricValue}>{unattemptedCount}</Text>
        </Card>
        <Card style={styles.metricCard}>
          <Text style={styles.metricLabel}>Rank</Text>
          <Text style={styles.metricValue}>#{result.rank}</Text>
        </Card>
        <Card style={styles.metricCard}>
          <Text style={styles.metricLabel}>Percentile</Text>
          <Text style={styles.metricValue}>{result.percentile}</Text>
        </Card>
      </Animated.View>

      {/* 4. Subject-Wise Breakdown Section (Physics, Chemistry, Math) */}
      <Animated.View entering={FadeInDown.delay(80)}>
        <Card style={styles.subjectSectionCard}>
          <View style={styles.subjectHeaderRow}>
            <View style={styles.subjectHeaderLeft}>
              <BookOpen size={18} color={colors.primary} />
              <Text style={styles.subjectSectionTitle}>Subject-Wise Score Breakdown</Text>
            </View>
            <Badge label="Detailed" tone="primary" />
          </View>

          {subjectBreakdown.length > 0 ? (
            <View style={styles.subjectList}>
              {subjectBreakdown.map((sb, idx) => (
                <View key={`${sb.subject}_${idx}`} style={styles.subjectCard}>
                  <View style={styles.subjectTitleRow}>
                    <Text style={styles.subjectName}>{sb.subject}</Text>
                    <View style={styles.subjectScorePill}>
                      <Text style={styles.subjectScoreText}>
                        Score: <Text style={styles.subjectScoreBold}>{sb.score}</Text> marks
                      </Text>
                    </View>
                  </View>

                  <View style={styles.subjectStatsRow}>
                    <View style={styles.subjectStat}>
                      <CheckCircle2 size={13} color={colors.success} />
                      <Text style={styles.subjectStatLabel}>Correct: </Text>
                      <Text style={[styles.subjectStatVal, { color: colors.success }]}>{sb.correct}</Text>
                    </View>
                    <View style={styles.subjectStat}>
                      <XCircle size={13} color={colors.danger} />
                      <Text style={styles.subjectStatLabel}>Wrong: </Text>
                      <Text style={[styles.subjectStatVal, { color: colors.danger }]}>{sb.wrong}</Text>
                    </View>
                    <View style={styles.subjectStat}>
                      <HelpCircle size={13} color={colors.textMuted} />
                      <Text style={styles.subjectStatLabel}>Unattempted: </Text>
                      <Text style={styles.subjectStatVal}>{sb.unattempted}</Text>
                    </View>
                    <View style={styles.subjectStat}>
                      <Award size={13} color={colors.primary} />
                      <Text style={styles.subjectStatLabel}>Total: </Text>
                      <Text style={styles.subjectStatVal}>{sb.total}</Text>
                    </View>
                  </View>
                </View>
              ))}
            </View>
          ) : (
            /* Fallback single breakdown view */
            <View style={styles.subjectList}>
              <View style={styles.subjectCard}>
                <View style={styles.subjectTitleRow}>
                  <Text style={styles.subjectName}>{test?.subject || 'All Subjects'}</Text>
                  <View style={styles.subjectScorePill}>
                    <Text style={styles.subjectScoreText}>
                      Score: <Text style={styles.subjectScoreBold}>{result.score}</Text> marks
                    </Text>
                  </View>
                </View>
                <View style={styles.subjectStatsRow}>
                  <View style={styles.subjectStat}>
                    <CheckCircle2 size={13} color={colors.success} />
                    <Text style={styles.subjectStatLabel}>Correct: </Text>
                    <Text style={[styles.subjectStatVal, { color: colors.success }]}>{result.correctAnswers}</Text>
                  </View>
                  <View style={styles.subjectStat}>
                    <XCircle size={13} color={colors.danger} />
                    <Text style={styles.subjectStatLabel}>Wrong: </Text>
                    <Text style={[styles.subjectStatVal, { color: colors.danger }]}>{wrongCount}</Text>
                  </View>
                  <View style={styles.subjectStat}>
                    <HelpCircle size={13} color={colors.textMuted} />
                    <Text style={styles.subjectStatLabel}>Unattempted: </Text>
                    <Text style={styles.subjectStatVal}>{unattemptedCount}</Text>
                  </View>
                  <View style={styles.subjectStat}>
                    <Award size={13} color={colors.primary} />
                    <Text style={styles.subjectStatLabel}>Total: </Text>
                    <Text style={styles.subjectStatVal}>{result.totalQuestions}</Text>
                  </View>
                </View>
              </View>
            </View>
          )}
        </Card>
      </Animated.View>

      {/* 5. Batch Leaderboard */}
      <Card style={styles.leaderboardCard}>
        <View style={styles.leaderboardHeader}>
          <Text style={styles.leaderboardTitle}>Paper Leaderboard</Text>
          <Badge label="Live" tone="success" />
        </View>
        {leaderboardError ? (
          <Text style={styles.leaderboardMeta}>{leaderboardError}</Text>
        ) : isLeaderboardLoading && leaderboard.length === 0 ? (
          <Text style={styles.leaderboardMeta}>Loading the latest ranking...</Text>
        ) : leaderboard.length === 0 ? (
          <Text style={styles.leaderboardMeta}>Leaderboard will appear as students complete this paper.</Text>
        ) : (
          leaderboard.slice(0, 5).map((entry) => (
            <View key={entry.userId} style={styles.leaderboardRow}>
              <View style={styles.rankBadge}>
                <Trophy size={14} color={colors.primary} />
              </View>
              <View style={styles.leaderboardText}>
                <Text style={styles.leaderboardName}>{entry.fullName}</Text>
                <Text style={styles.leaderboardMeta}>{entry.batchId ?? (isOpenExam ? 'Open for All' : 'Batch Cohort')}</Text>
              </View>
              <View style={styles.leaderboardScore}>
                <Text style={styles.rankNumber}>#{entry.rank}</Text>
                <Text style={styles.rankPercent}>{`${entry.score}% | P${entry.percentile}`}</Text>
              </View>
            </View>
          ))
        )}
      </Card>

      <Button variant="secondary" onPress={() => navigation.navigate('ReviewAnswers', { testId, resultId })}>
        Check Your Answers
      </Button>

      <Button onPress={() => navigation.navigate('MainTabs', { screen: 'Tests' })}>Back to Tests</Button>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: spacing.xl,
    gap: spacing.xl,
    paddingBottom: spacing.xxxl,
  },
  candidateCard: {
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
  },
  candidateHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  candidateAvatar: {
    width: 44,
    height: 44,
    borderRadius: radius.pill,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  candidateInfo: {
    flex: 1,
    gap: 2,
  },
  candidateName: {
    fontSize: 16,
    fontWeight: '800',
    color: colors.text,
  },
  candidateTestTitle: {
    fontSize: 12,
    color: colors.textMuted,
  },
  candidateMetaGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.lg,
    paddingTop: spacing.xs,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  candidateMetaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  candidateMetaText: {
    fontSize: 12,
    color: colors.textMuted,
    fontWeight: '600',
  },
  scoreWrap: {
    alignItems: 'center',
    paddingTop: spacing.sm,
  },
  scoreRingOuter: {
    width: 188,
    height: 188,
    borderRadius: 94,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scoreRingInner: {
    width: 138,
    height: 138,
    borderRadius: 69,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
  },
  scoreValue: {
    color: colors.primary,
    fontSize: 38,
    fontWeight: '900',
  },
  scoreLabel: {
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: '700',
  },
  metricsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
  },
  metricCard: {
    flexGrow: 1,
    flexBasis: '30%',
    minWidth: 96,
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.lg,
  },
  metricLabel: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    textAlign: 'center',
  },
  metricValue: {
    color: colors.text,
    fontSize: 20,
    fontWeight: '800',
    textAlign: 'center',
  },
  subjectSectionCard: {
    gap: spacing.md,
    backgroundColor: colors.surface,
  },
  subjectHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingBottom: spacing.xs,
  },
  subjectHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  subjectSectionTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: colors.text,
  },
  subjectList: {
    gap: spacing.md,
  },
  subjectCard: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  subjectTitleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  subjectName: {
    fontSize: 15,
    fontWeight: '800',
    color: colors.text,
  },
  subjectScorePill: {
    backgroundColor: colors.primarySoft,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: 3,
    borderRadius: radius.pill,
  },
  subjectScoreText: {
    fontSize: 12,
    color: colors.primary,
    fontWeight: '700',
  },
  subjectScoreBold: {
    fontWeight: '900',
    color: colors.primary,
  },
  subjectStatsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
    alignItems: 'center',
  },
  subjectStat: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  subjectStatLabel: {
    fontSize: 12,
    color: colors.textMuted,
    fontWeight: '600',
  },
  subjectStatVal: {
    fontSize: 12,
    color: colors.text,
    fontWeight: '800',
  },
  leaderboardCard: {
    gap: spacing.md,
  },
  leaderboardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: spacing.md,
  },
  leaderboardTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '800',
    flex: 1,
  },
  leaderboardRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
  },
  rankBadge: {
    width: 36,
    height: 36,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primarySoft,
  },
  leaderboardText: {
    flex: 1,
  },
  leaderboardName: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '700',
  },
  leaderboardMeta: {
    color: colors.textMuted,
    fontSize: 12,
    marginTop: spacing.xs,
  },
  leaderboardScore: {
    alignItems: 'flex-end',
    minWidth: 62,
  },
  rankNumber: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '800',
  },
  rankPercent: {
    color: colors.primary,
    fontSize: 12,
    marginTop: spacing.xs,
    fontWeight: '700',
  },
});
