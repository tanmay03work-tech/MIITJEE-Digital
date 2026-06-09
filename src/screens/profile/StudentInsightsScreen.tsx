import React, { useEffect, useMemo, useState } from 'react';
import { FlatList, ListRenderItem, StyleSheet, Text, View } from 'react-native';
import { AlertTriangle, LineChart, TrendingDown, TrendingUp } from 'lucide-react-native';

import { AppHeader } from '../../components/common/AppHeader';
import { Badge } from '../../components/common/Badge';
import { Card } from '../../components/common/Card';
import { EmptyState } from '../../components/common/EmptyState';
import { Screen } from '../../components/common/Screen';
import { useAppStore } from '../../store/appStore';
import { useAuthStore } from '../../store/authStore';
import { colors, radius, spacing } from '../../theme';
import { StudentInsights, StudentSubjectInsight } from '../../types';

type InsightItem =
  | { id: string; type: 'weak-area'; payload: StudentSubjectInsight }
  | { id: string; type: 'subject'; payload: StudentSubjectInsight }
  | { id: string; type: 'history'; payload: StudentInsights['history'][number] };

export function StudentInsightsScreen() {
  const cachedInsights = useAppStore((state) => state.studentInsights);
  const loadStudentInsights = useAppStore((state) => state.loadStudentInsights);
  const user = useAuthStore((state) => state.user);
  const [isLoading, setIsLoading] = useState(!cachedInsights);
  const [error, setError] = useState<string>();
  const [showHeavySections] = useState(true);

  useEffect(() => {
    let isMounted = true;

    async function load() {
      if (cachedInsights) {
        setIsLoading(false);
        return;
      }

      try {
        setError(undefined);
        const insights = await loadStudentInsights(user?.id);
        if (isMounted && insights) {
          setIsLoading(false);
        }
      } catch (loadError) {
        if (isMounted) {
          setError(loadError instanceof Error ? loadError.message : 'Unable to load your insights right now.');
          setIsLoading(false);
        }
      }
    }

    void load();

    return () => {
      isMounted = false;
    };
  }, [cachedInsights, loadStudentInsights, user?.id]);

  const insights = useAppStore((state) => state.studentInsights);

  const trendBars = useMemo(() => {
    const history = insights?.history.slice().reverse().slice(-6) ?? [];
    const maxScore = Math.max(...history.map((entry) => entry.score), 100);

    return history.map((entry) => ({
      ...entry,
      heightPercent: Math.max(18, Math.round((entry.score / maxScore) * 100)),
    }));
  }, [insights]);

  const prioritizedSubjects = useMemo(() => {
    return [...(insights?.subjectBreakdown ?? [])].sort((left, right) => {
      if (left.accuracyPercent !== right.accuracyPercent) {
        return left.accuracyPercent - right.accuracyPercent;
      }

      if (left.avgPercentile !== right.avgPercentile) {
        return left.avgPercentile - right.avgPercentile;
      }

      return left.subject.localeCompare(right.subject);
    });
  }, [insights]);

  const items = useMemo<InsightItem[]>(() => {
    if (!insights) {
      return [];
    }

    return [
      ...insights.weakAreas.map((item) => ({ id: `weak-${item.subject}`, type: 'weak-area' as const, payload: item })),
      ...prioritizedSubjects.map((item) => ({ id: `subject-${item.subject}`, type: 'subject' as const, payload: item })),
      ...insights.history.map((item) => ({ id: `history-${item.attemptId}`, type: 'history' as const, payload: item })),
    ];
  }, [insights, prioritizedSubjects]);

  if (isLoading) {
    return (
      <Screen useScrollView={false} contentContainerStyle={styles.loadingState}>
        <AppHeader title="Performance Insights" subtitle="Loading your progress summary" showLogo={false} />
        <Card>
          <Text style={styles.loadingTitle}>Loading insights...</Text>
          <Text style={styles.loadingText}>Fetching score trend and weak areas.</Text>
        </Card>
      </Screen>
    );
  }

  if (error || !insights) {
    return (
      <Screen contentContainerStyle={styles.content}>
        <AppHeader title="Performance Insights" subtitle="Your personal exam progress" showLogo={false} />
        <EmptyState
          icon={AlertTriangle}
          title="Insights are not ready"
          description={error ?? 'Attempt a paper to unlock your score trend, weak areas, and detailed progress view.'}
        />
      </Screen>
    );
  }

  const { summary } = insights;
  const overallAccuracy = Math.round(
    insights.subjectBreakdown.reduce((sum, item) => sum + item.correctAnswers, 0) /
      Math.max(
        insights.subjectBreakdown.reduce((sum, item) => sum + item.totalQuestions, 0),
        1,
      ) *
      100,
  );
  const latestHistoryEntry = insights.history[0];

  const renderInsightItem = ({ item }: { item: InsightItem }) => {
    if (item.type === 'weak-area') {
      return (
        <Card style={styles.listCard}>
          <Text style={styles.cardTitle}>Focus Area</Text>
          <View style={styles.listRow}>
            <View style={styles.rowText}>
              <Text style={styles.rowTitle}>{item.payload.subject}</Text>
              <Text style={styles.rowSubtitle}>
                {`${item.payload.totalQuestions} questions | Accuracy ${item.payload.accuracyPercent}% | Avg ${item.payload.avgScore}%`}
              </Text>
            </View>
            <Badge
              label={item.payload.recentDelta >= 0 ? `+${item.payload.recentDelta}% recent` : `${item.payload.recentDelta}% recent`}
              tone="warning"
            />
          </View>
        </Card>
      );
    }

    if (item.type === 'subject') {
      return (
        <Card style={styles.listCard}>
          <Text style={styles.cardTitle}>Subject Snapshot</Text>
          <View style={styles.subjectRow}>
            <View style={styles.rowText}>
              <Text style={styles.rowTitle}>{item.payload.subject}</Text>
              <Text style={styles.rowSubtitle}>
                {`${item.payload.attempts} attempts | ${item.payload.correctAnswers}/${item.payload.totalQuestions} correct | Accuracy ${item.payload.accuracyPercent}%`}
              </Text>
              <View style={styles.subjectMetaWrap}>
                <Badge label={`Avg ${item.payload.avgScore}%`} tone="neutral" />
                <Badge label={`Latest ${item.payload.latestScore}%`} tone="primary" />
                <Badge label={`P${item.payload.avgPercentile}`} tone="warning" />
              </View>
            </View>
            <View style={styles.subjectTrendWrap}>
              <Text style={styles.subjectPercentile}>{item.payload.accuracyPercent}%</Text>
              <View style={styles.subjectTrendRow}>
                {item.payload.recentDelta >= 0 ? (
                  <TrendingUp size={14} color={colors.success} />
                ) : (
                  <TrendingDown size={14} color={colors.danger} />
                )}
                <Text style={[styles.subjectTrendText, item.payload.recentDelta >= 0 ? styles.trendPositive : styles.trendNegative]}>
                  {item.payload.recentDelta >= 0 ? `+${item.payload.recentDelta}` : item.payload.recentDelta}%
                </Text>
              </View>
            </View>
          </View>
        </Card>
      );
    }

    return (
      <Card style={styles.listCard}>
        <Text style={styles.cardTitle}>Recent Paper</Text>
        <View style={styles.historyRow}>
          <View style={styles.rowText}>
            <Text style={styles.rowTitle}>{item.payload.testTitle}</Text>
            <Text style={styles.rowSubtitle}>{`${item.payload.subject} | Rank #${item.payload.rank} | Percentile ${item.payload.percentile}`}</Text>
          </View>
          <Text style={styles.historyScore}>{item.payload.score}%</Text>
        </View>
      </Card>
    );
  };

  const listHeader = (
    <>
      <AppHeader title="Performance Insights" subtitle="Track growth, score quality, and subject strength" showLogo={false} />

      <Card style={styles.summaryCard}>
        <View style={styles.summaryHeader}>
          <View>
            <Text style={styles.summaryTitle}>Your Exam Snapshot</Text>
            <Text style={styles.summarySubtitle}>Keep the essentials visible: score quality, accuracy, and rank.</Text>
          </View>
          <Badge
            label={summary.improvementScore >= 0 ? `+${summary.improvementScore}% change` : `${summary.improvementScore}% change`}
            tone={summary.improvementScore >= 0 ? 'success' : 'warning'}
          />
        </View>

        <View style={styles.metricsGrid}>
          <View style={styles.metricCard}>
            <Text style={styles.metricValue}>{overallAccuracy}%</Text>
            <Text style={styles.metricLabel}>Accuracy</Text>
          </View>
          <View style={styles.metricCard}>
            <Text style={styles.metricValue}>{latestHistoryEntry?.rank ? `#${latestHistoryEntry.rank}` : 'NA'}</Text>
            <Text style={styles.metricLabel}>Latest Rank</Text>
          </View>
          <View style={styles.metricCard}>
            <Text style={styles.metricValue}>{summary.latestScore}%</Text>
            <Text style={styles.metricLabel}>Latest Score</Text>
          </View>
          <View style={styles.metricCard}>
            <Text style={styles.metricValue}>{summary.avgPercentile}</Text>
            <Text style={styles.metricLabel}>Avg Percentile</Text>
          </View>
        </View>

        <View style={styles.focusStrip}>
          <View style={styles.focusCard}>
            <Text style={styles.focusLabel}>Latest</Text>
            <Text style={styles.focusValue}>{summary.latestScore}%</Text>
            <Text style={styles.focusMeta}>Percentile {summary.latestPercentile}</Text>
          </View>
          <View style={styles.focusCard}>
            <Text style={styles.focusLabel}>Best Percentile</Text>
            <Text style={styles.focusValue}>{summary.bestPercentile}</Text>
            <Text style={styles.focusMeta}>Top exam standing</Text>
          </View>
        </View>
      </Card>

      {showHeavySections ? (
        <Card style={styles.chartCard}>
          <View style={styles.cardHeader}>
            <View style={styles.headerIcon}>
              <LineChart size={18} color={colors.primary} />
            </View>
            <View style={styles.headerText}>
              <Text style={styles.cardTitle}>Score Improvement</Text>
              <Text style={styles.cardSubtitle}>Your last six papers in one quick scan</Text>
            </View>
          </View>

          {trendBars.length === 0 ? (
            <EmptyState
              icon={TrendingUp}
              title="No trend yet"
              description="Once you attempt a few papers, your improvement graph will appear here."
            />
          ) : (
            <View style={styles.chartWrap}>
              {trendBars.map((bar, index) => (
                <View key={bar.attemptId} style={styles.barColumn}>
                  <Text style={styles.barValue}>{bar.score}%</Text>
                  <View style={styles.barTrack}>
                    <View style={[styles.barFill, { height: `${bar.heightPercent}%` }]} />
                  </View>
                  <Text style={styles.barLabel}>{index + 1}</Text>
                </View>
              ))}
            </View>
          )}
        </Card>
      ) : (
        <Card style={styles.chartCard}>
          <Text style={styles.cardTitle}>Preparing deeper analytics</Text>
          <Text style={styles.cardSubtitle}>The summary loads first, then the chart and detailed breakdowns follow in the background.</Text>
        </Card>
      )}
    </>
  );

  return (
    <Screen useScrollView={false}>
      <FlatList
        data={items}
        keyExtractor={(item) => item.id}
        renderItem={renderInsightItem as ListRenderItem<InsightItem>}
        ListHeaderComponent={listHeader}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        initialNumToRender={4}
        windowSize={5}
        maxToRenderPerBatch={4}
        updateCellsBatchingPeriod={50}
        removeClippedSubviews={false}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: spacing.xl,
    gap: spacing.xl,
    paddingBottom: spacing.xxxl,
  },
  loadingState: {
    paddingHorizontal: spacing.xl,
    gap: spacing.lg,
    flex: 1,
  },
  loadingTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '800',
  },
  loadingText: {
    color: colors.textMuted,
    fontSize: 13,
  },
  summaryCard: {
    gap: spacing.lg,
  },
  summaryHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: spacing.md,
  },
  summaryTitle: {
    color: colors.text,
    fontSize: 22,
    fontWeight: '800',
  },
  summarySubtitle: {
    color: colors.textMuted,
    fontSize: 13,
    lineHeight: 19,
    marginTop: spacing.xs,
  },
  metricsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
  },
  metricCard: {
    width: '47%',
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.xs,
  },
  metricValue: {
    color: colors.text,
    fontSize: 26,
    fontWeight: '900',
  },
  metricLabel: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  focusStrip: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  focusCard: {
    flex: 1,
    backgroundColor: colors.primarySoft,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.xs,
  },
  focusLabel: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  focusValue: {
    color: colors.primary,
    fontSize: 28,
    fontWeight: '900',
  },
  focusMeta: {
    color: colors.textMuted,
    fontSize: 12,
  },
  chartCard: {
    gap: spacing.lg,
  },
  cardHeader: {
    flexDirection: 'row',
    gap: spacing.md,
    alignItems: 'center',
  },
  headerIcon: {
    width: 42,
    height: 42,
    borderRadius: 16,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerText: {
    flex: 1,
  },
  cardTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '800',
  },
  cardSubtitle: {
    color: colors.textMuted,
    fontSize: 13,
    lineHeight: 18,
    marginTop: spacing.xs,
  },
  chartWrap: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: spacing.md,
    minHeight: 170,
  },
  barColumn: {
    flex: 1,
    alignItems: 'center',
    gap: spacing.sm,
  },
  barValue: {
    color: colors.text,
    fontSize: 12,
    fontWeight: '700',
  },
  barTrack: {
    width: '100%',
    height: 112,
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceMuted,
    justifyContent: 'flex-end',
    overflow: 'hidden',
  },
  barFill: {
    width: '100%',
    borderRadius: radius.lg,
    backgroundColor: colors.primary,
  },
  barLabel: {
    color: colors.textSubtle,
    fontSize: 11,
    fontWeight: '700',
  },
  listCard: {
    gap: spacing.md,
  },
  listRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: spacing.md,
  },
  subjectRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: spacing.md,
  },
  historyRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: spacing.md,
  },
  rowText: {
    flex: 1,
    minWidth: 0,
  },
  rowTitle: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '800',
  },
  rowSubtitle: {
    color: colors.textMuted,
    fontSize: 12,
    lineHeight: 18,
    marginTop: spacing.xs,
  },
  subjectPercentile: {
    color: colors.primary,
    fontSize: 20,
    fontWeight: '900',
  },
  subjectMetaWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    marginTop: spacing.sm,
  },
  subjectTrendWrap: {
    alignItems: 'flex-end',
    gap: spacing.xs,
    minWidth: 58,
  },
  subjectTrendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  subjectTrendText: {
    fontSize: 12,
    fontWeight: '800',
  },
  trendPositive: {
    color: colors.success,
  },
  trendNegative: {
    color: colors.danger,
  },
  historyScore: {
    color: colors.primary,
    fontSize: 20,
    fontWeight: '900',
  },
});
