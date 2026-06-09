import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown, ZoomIn } from 'react-native-reanimated';
import { Trophy } from 'lucide-react-native';

import { AppHeader } from '../../components/common/AppHeader';
import { Badge } from '../../components/common/Badge';
import { Button } from '../../components/common/Button';
import { Card } from '../../components/common/Card';
import { Screen } from '../../components/common/Screen';
import { RootStackScreenProps } from '../../navigation/types';
import { useAppStore } from '../../store/appStore';
import { colors, spacing } from '../../theme';
import { LeaderboardEntry } from '../../types';

const EMPTY_LEADERBOARD: LeaderboardEntry[] = [];

export function TestResultScreen({ route, navigation }: RootStackScreenProps<'TestResult'>) {
  const { resultId, testId } = route.params;
  const result = useAppStore((state) => state.results.find((entry) => entry.id === resultId));
  const storedLeaderboard = useAppStore((state) => state.testLeaderboards[testId]);
  const loadLeaderboard = useAppStore((state) => state.loadLeaderboard);
  const test = useAppStore((state) => state.tests.find((candidate) => candidate.id === testId));
  const [leaderboardError, setLeaderboardError] = useState<string>();
  const [isLeaderboardLoading, setIsLeaderboardLoading] = useState(false);
  const leaderboard = storedLeaderboard ?? EMPTY_LEADERBOARD;

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

  if (!result) {
    return (
      <Screen contentContainerStyle={styles.content}>
        <AppHeader title="Result" subtitle="Result not found" />
      </Screen>
    );
  }

  return (
    <Screen contentContainerStyle={styles.content}>
      <AppHeader title="Result" subtitle={test?.title ?? 'Latest submission'} />

      <Animated.View entering={ZoomIn.duration(450)} style={styles.scoreWrap}>
        <View style={styles.scoreRingOuter}>
          <View style={styles.scoreRingInner}>
            <Text style={styles.scoreValue}>{result.score}%</Text>
            <Text style={styles.scoreLabel}>Score</Text>
          </View>
        </View>
      </Animated.View>

      <Animated.View entering={FadeInDown.delay(40)}>
        <Card style={styles.summaryCard}>
          <Text style={styles.summaryEyebrow}>Result Summary</Text>
          <Text style={styles.summaryTitle}>You have completed this paper successfully.</Text>
          <Text style={styles.summaryText}>
            Your score, rank, and review sheet are ready. Use this summary to identify the next area to improve.
          </Text>
        </Card>
      </Animated.View>

      <Animated.View entering={FadeInDown.delay(80)} style={styles.metricsRow}>
        <Card style={styles.metricCard}>
          <Text style={styles.metricLabel}>Correct</Text>
          <Text style={styles.metricValue}>
            {result.correctAnswers}/{result.totalQuestions}
          </Text>
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

      <Card style={styles.leaderboardCard}>
        <View style={styles.leaderboardHeader}>
          <Text style={styles.leaderboardTitle}>This Batch Paper Leaderboard</Text>
          <Badge label="Live" tone="success" />
        </View>
        {leaderboardError ? (
          <Text style={styles.leaderboardMeta}>{leaderboardError}</Text>
        ) : isLeaderboardLoading && leaderboard.length === 0 ? (
          <Text style={styles.leaderboardMeta}>Loading the latest batch ranking...</Text>
        ) : leaderboard.length === 0 ? (
          <Text style={styles.leaderboardMeta}>This leaderboard will appear after students from your batch attempt this paper.</Text>
        ) : (
          leaderboard.slice(0, 5).map((entry) => (
            <View key={entry.userId} style={styles.leaderboardRow}>
              <View style={styles.rankBadge}>
                <Trophy size={14} color={colors.primary} />
              </View>
              <View style={styles.leaderboardText}>
                <Text style={styles.leaderboardName}>{entry.fullName}</Text>
                <Text style={styles.leaderboardMeta}>{entry.batchId ?? 'Your batch cohort'}</Text>
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
  summaryCard: {
    gap: spacing.sm,
  },
  summaryEyebrow: {
    color: colors.primary,
    fontSize: 12,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.7,
  },
  summaryTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '800',
  },
  summaryText: {
    color: colors.textMuted,
    fontSize: 14,
    lineHeight: 20,
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
