import React, { memo, useEffect, useMemo, useState } from 'react';
import { FlatList, ListRenderItem, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInUp } from 'react-native-reanimated';
import { RefreshCw, Trophy } from 'lucide-react-native';

import { AppHeader } from '../../components/common/AppHeader';
import { AdminListSkeleton } from '../../components/admin/AdminListSkeleton';
import { AppErrorFallback } from '../../components/common/AppErrorFallback';
import { Badge } from '../../components/common/Badge';
import { Card } from '../../components/common/Card';
import { EmptyState } from '../../components/common/EmptyState';
import { Screen } from '../../components/common/Screen';
import { SelectField } from '../../components/common/SelectField';
import { useAppStore } from '../../store/appStore';
import { useAuthStore } from '../../store/authStore';
import { colors, radius, spacing } from '../../theme';
import { LeaderboardEntry, LeaderboardScope } from '../../types';

const scopeOptions: Array<{ label: string; value: LeaderboardScope }> = [
  { label: 'Overall History', value: 'overall_history' },
  { label: 'Test Wise', value: 'test_wise' },
];

const leaderboardLimitOptions = [
  { label: 'Top 20', value: '20', description: 'Show the first 20 ranks.' },
  { label: 'Top 50', value: '50', description: 'Show the first 50 ranks.' },
  { label: 'Top 100', value: '100', description: 'Show the first 100 ranks.' },
] as const;

const DEFAULT_LEADERBOARD_LIMIT = 20;

const LeaderboardRow = memo(function LeaderboardRow({ entry, scope }: { entry: LeaderboardEntry; scope: LeaderboardScope }) {
  return (
    <Card style={[styles.rowCard, entry.isCurrentUser && styles.rowCardCurrent]}>
      <View style={styles.rankIcon}>
        <Trophy size={16} color={colors.primary} />
      </View>
      <View style={styles.rowText}>
        <Text style={styles.rowName}>{entry.fullName}</Text>
        <Text style={styles.rowMeta}>
          {scope === 'overall_history'
            ? `${entry.batchId ?? 'Open category'} | ${entry.testsAttempted ?? 0} tests | P${entry.percentile}`
            : `${entry.batchId ?? 'Batch cohort'} | Score ${entry.score}% | P${entry.percentile}`}
        </Text>
      </View>
      <View style={styles.rowScore}>
        <Text style={styles.rowRank}>#{entry.rank}</Text>
        <Text style={styles.rowValue}>{`${entry.score}%`}</Text>
      </View>
    </Card>
  );
});

export function LeaderboardScreen() {
  const user = useAuthStore((state) => state.user);
  const leaderboard = useAppStore((state) => state.leaderboard);
  const loadLeaderboard = useAppStore((state) => state.loadLeaderboard);
  const batches = useAppStore((state) => state.batches);
  const tests = useAppStore((state) => state.tests);
  const isAdmin = user?.role === 'admin' && user.approvalStatus === 'approved';

  const [scope, setScope] = useState<LeaderboardScope>('overall_history');
  const [selectedBatchId, setSelectedBatchId] = useState<string | undefined>(user?.batchId);
  const [selectedTestId, setSelectedTestId] = useState<string>();
  const [leaderboardLimit, setLeaderboardLimit] = useState<number>(DEFAULT_LEADERBOARD_LIMIT);
  const [reloadKey, setReloadKey] = useState(0);
  const [entries, setEntries] = useState<LeaderboardEntry[]>(leaderboard);
  const [currentUserEntry, setCurrentUserEntry] = useState<LeaderboardEntry | undefined>(() =>
    leaderboard.find((entry) => entry.userId === user?.id),
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>();

  useEffect(() => {
    if (isAdmin) {
      if (!selectedBatchId && batches[0]?.id) {
        setSelectedBatchId(batches[0].id);
      }
      return;
    }

    setSelectedBatchId(user?.batchId);
  }, [batches, isAdmin, selectedBatchId, user?.batchId]);

  const effectiveBatchId = isAdmin ? selectedBatchId : user?.batchId;
  const batchLabel =
    batches.find((batch) => batch.id === effectiveBatchId)?.label ??
    (effectiveBatchId ? effectiveBatchId : undefined);

  const availableTests = useMemo(
    () => tests.filter((test) => test.batchId === effectiveBatchId),
    [effectiveBatchId, tests],
  );
  const selectedTest = availableTests.find((test) => test.id === selectedTestId);

  useEffect(() => {
    if (scope !== 'test_wise') {
      return;
    }

    if (availableTests.length === 0) {
      if (selectedTestId) {
        setSelectedTestId(undefined);
      }
      return;
    }

    if (!availableTests.some((test) => test.id === selectedTestId)) {
      setSelectedTestId(availableTests[0]?.id);
    }
  }, [availableTests, scope, selectedTestId]);

  useEffect(() => {
    if (!isAdmin && scope === 'overall_history' && leaderboard.length > 0) {
      setEntries(leaderboard.slice(0, leaderboardLimit));
      setCurrentUserEntry(leaderboard.find((entry) => entry.userId === user?.id));
    }
  }, [isAdmin, leaderboard, leaderboardLimit, scope, user?.id]);

  useEffect(() => {
    let active = true;

    if (!effectiveBatchId) {
      setEntries([]);
      setError(undefined);
      return () => {
        active = false;
      };
    }

    if (scope === 'test_wise' && !selectedTestId) {
      setEntries([]);
      setError(undefined);
      return () => {
        active = false;
      };
    }

    async function bootstrapLeaderboard() {
      try {
        setLoading(true);
        const resolved = await loadLeaderboard({
          scope,
          batchId: isAdmin ? effectiveBatchId : null,
          testId: scope === 'test_wise' ? selectedTestId : undefined,
        });

        if (active) {
          setEntries(resolved.slice(0, leaderboardLimit));
          setCurrentUserEntry(resolved.find((entry) => entry.userId === user?.id));
          setError(undefined);
        }
      } catch (loadError) {
        if (active) {
          setError(loadError instanceof Error ? loadError.message : 'Unable to load the leaderboard right now.');
          setEntries([]);
          setCurrentUserEntry(undefined);
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    void bootstrapLeaderboard();
    return () => {
      active = false;
    };
  }, [effectiveBatchId, isAdmin, leaderboardLimit, loadLeaderboard, reloadKey, scope, selectedTestId, user?.id]);

  const subtitle =
    scope === 'overall_history'
      ? `${batchLabel ?? 'Your'} batch ranking across full test history`
      : selectedTest
        ? `${selectedTest.title} ranking for ${batchLabel ?? 'your batch'}`
        : 'Pick a test to view batch-wise paper rankings';

  const listHeader = useMemo(
    () => (
      <>
        <AppHeader title="Leaderboard" subtitle={subtitle} showLogo={false} />

        <Card style={styles.controlsCard}>
          <View style={styles.summaryStrip}>
            <View style={styles.summaryPill}>
              <SelectField
                label="Showing"
                value={String(leaderboardLimit)}
                placeholder="Select rank range"
                menuTitle="Choose leaderboard range"
                options={leaderboardLimitOptions.map((option) => ({
                  label: option.label,
                  value: option.value,
                  description: option.description,
                }))}
                onValueChange={(value) => setLeaderboardLimit(Number(value))}
                style={styles.summarySelect}
              />
            </View>
            <View style={styles.summaryPill}>
              <Text style={styles.summaryPillLabel}>Scope</Text>
              <Text style={styles.summaryPillValue}>{scope === 'overall_history' ? 'Overall' : 'Test wise'}</Text>
            </View>
          </View>

          <View style={styles.scopeSwitch}>
            {scopeOptions.map((option) => {
              const active = option.value === scope;
              return (
                <Pressable
                  key={option.value}
                  style={[styles.scopeChip, active && styles.scopeChipActive]}
                  onPress={() => setScope(option.value)}>
                  <Text style={[styles.scopeChipText, active && styles.scopeChipTextActive]}>{option.label}</Text>
                </Pressable>
              );
            })}
          </View>

          <View style={styles.metaRow}>
            {isAdmin ? (
              <SelectField
                label="Batch"
                value={selectedBatchId}
                placeholder="Select batch"
                menuTitle="Choose batch"
                options={batches.map((batch) => ({
                  label: batch.label,
                  value: batch.id,
                  description: `${batch.targetExam} | ${batch.classLabel}`,
                }))}
                onValueChange={setSelectedBatchId}
                style={styles.controlField}
              />
            ) : (
              <View style={styles.batchInfo}>
                <Text style={styles.batchLabel}>Your Batch</Text>
                <Badge label={batchLabel ?? 'Not assigned'} tone="primary" />
              </View>
            )}

            {scope === 'test_wise' ? (
              <SelectField
                label="Test"
                value={selectedTestId}
                placeholder="Select test"
                menuTitle="Choose test"
                options={availableTests.map((test) => ({
                  label: test.title,
                  value: test.id,
                  description: `${test.subject} | ${test.durationMinutes} min`,
                }))}
                onValueChange={setSelectedTestId}
                disabled={availableTests.length === 0}
                style={styles.controlField}
              />
            ) : null}
          </View>
        </Card>

        {currentUserEntry ? (
          <View style={styles.currentUserWrap}>
            <Text style={styles.sectionTitle}>Your Position</Text>
            <Card style={styles.currentUserCard}>
              <View style={styles.currentUserText}>
                <Text style={styles.currentUserName}>{currentUserEntry.fullName}</Text>
                <Text style={styles.currentUserMeta}>
                  {scope === 'overall_history'
                    ? `Rank #${currentUserEntry.rank} | Avg score ${currentUserEntry.score}% | Avg percentile P${currentUserEntry.percentile} | ${currentUserEntry.testsAttempted ?? 0} tests`
                    : `Rank #${currentUserEntry.rank} | Score ${currentUserEntry.score}% | Percentile P${currentUserEntry.percentile}`}
                </Text>
              </View>
              <Badge label="Current User" tone="primary" />
            </Card>
          </View>
        ) : user ? (
          <View style={styles.currentUserWrap}>
            <Text style={styles.sectionTitle}>Your Position</Text>
            <Card style={styles.currentUserCard}>
              <View style={styles.currentUserText}>
                <Text style={styles.currentUserName}>{user.fullName}</Text>
                <Text style={styles.currentUserMeta}>
                  {user.rank > 0
                    ? `Overall Profile Rank #${user.rank} | Avg score ${user.averageScore}%`
                    : 'No test submissions recorded yet for this selection. Complete a paper to see your rank here.'}
                </Text>
              </View>
              <Badge label="Your Profile" tone="primary" />
            </Card>
          </View>
        ) : null}

        {entries.length > 0 ? (
          <View style={styles.listWrap}>
            <Text style={styles.sectionTitle}>Top Rankings</Text>
            <Text style={styles.helperText}>Showing the top {Math.min(entries.length, leaderboardLimit)} positions for a faster leaderboard experience.</Text>
          </View>
        ) : null}
      </>
    ),
    [
      availableTests,
      batchLabel,
      batches,
      currentUserEntry,
      entries.length,
      isAdmin,
      leaderboardLimit,
      scope,
      selectedBatchId,
      selectedTestId,
      subtitle,
    ],
  );

  const renderRow: ListRenderItem<LeaderboardEntry> = ({ item, index }) => (
    <Animated.View entering={FadeInUp.delay(index * 35)}>
      <LeaderboardRow entry={item} scope={scope} />
    </Animated.View>
  );

  let emptyState = (
    <EmptyState
      icon={Trophy}
      title="Leaderboard will unlock after submissions"
      description="Once students from this batch complete papers, the ranking will appear here."
    />
  );

  if (!effectiveBatchId) {
    emptyState = (
      <EmptyState
        icon={Trophy}
        title="Batch required for leaderboard"
        description="Assign the student to a batch first, then the batch-only leaderboard will appear here."
      />
    );
  } else if (scope === 'test_wise' && availableTests.length === 0) {
    emptyState = (
      <EmptyState
        icon={Trophy}
        title="No tests in this batch yet"
        description="Create or publish a batch test first, then test-wise rankings will show up here."
      />
    );
  } else if (scope === 'test_wise' && !selectedTestId) {
    emptyState = (
      <EmptyState
        icon={Trophy}
        title="Select a test"
        description="Choose a batch paper to see who attempted it and how the batch ranking looks."
      />
    );
  }

  return (
    <Screen useScrollView={false}>
      {loading && entries.length === 0 ? (
        <View style={styles.loadingWrap}>
          <AppHeader title="Leaderboard" subtitle={subtitle} showLogo={false} />
          <AdminListSkeleton rows={4} />
        </View>
      ) : error ? (
        <View style={styles.errorWrap}>
          <AppHeader title="Leaderboard" subtitle={subtitle} showLogo={false} />
          <AppErrorFallback
            title="Unable to open leaderboard"
            message="We couldn’t load ranking data right now. Please retry in a moment."
            onRetry={() => {
              setError(undefined);
              setReloadKey((current) => current + 1);
            }}
          />
        </View>
      ) : entries.length === 0 ? (
        <FlatList
          style={styles.flex}
          data={[]}
          renderItem={null}
          ListHeaderComponent={listHeader}
          ListEmptyComponent={emptyState}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
        />
      ) : (
        <FlatList
          style={styles.flex}
          data={entries}
          keyExtractor={(item) => item.userId}
          renderItem={renderRow}
          ListHeaderComponent={listHeader}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          initialNumToRender={4}
          windowSize={5}
          maxToRenderPerBatch={4}
          updateCellsBatchingPeriod={50}
          removeClippedSubviews={false}
        />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  listContent: {
    paddingBottom: spacing.xxxl,
  },
  loadingWrap: {
    paddingHorizontal: spacing.xl,
    gap: spacing.md,
  },
  controlsCard: {
    marginHorizontal: spacing.xl,
    gap: spacing.lg,
  },
  summaryStrip: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  summaryPill: {
    flex: 1,
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceMuted,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    gap: spacing.xs,
  },
  summarySelect: {
    gap: spacing.xs,
  },
  summaryPillLabel: {
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  summaryPillValue: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '800',
  },
  scopeSwitch: {
    flexDirection: 'row',
    gap: spacing.sm,
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.pill,
    padding: spacing.xs,
  },
  scopeChip: {
    flex: 1,
    minHeight: 42,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
  },
  scopeChipActive: {
    backgroundColor: colors.primary,
  },
  scopeChipText: {
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: '800',
  },
  scopeChipTextActive: {
    color: colors.surface,
  },
  metaRow: {
    gap: spacing.md,
  },
  controlField: {
    width: '100%',
  },
  batchInfo: {
    gap: spacing.sm,
  },
  batchLabel: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  currentUserWrap: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.xl,
    gap: spacing.md,
  },
  sectionTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '800',
  },
  currentUserCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: spacing.md,
  },
  currentUserText: {
    flex: 1,
  },
  currentUserName: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '800',
  },
  currentUserMeta: {
    color: colors.textMuted,
    fontSize: 13,
    marginTop: spacing.xs,
    lineHeight: 19,
  },
  listWrap: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.xl,
    paddingBottom: spacing.md,
    gap: spacing.xs,
  },
  helperText: {
    color: colors.textMuted,
    fontSize: 12,
    lineHeight: 18,
  },
  rowCard: {
    marginHorizontal: spacing.xl,
    marginBottom: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  rowCardCurrent: {
    backgroundColor: colors.primarySoft,
    borderColor: 'transparent',
  },
  rankIcon: {
    width: 42,
    height: 42,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primarySoft,
  },
  rowText: {
    flex: 1,
  },
  rowName: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '700',
  },
  rowMeta: {
    color: colors.textMuted,
    fontSize: 12,
    marginTop: spacing.xs,
    lineHeight: 18,
  },
  rowScore: {
    alignItems: 'flex-end',
  },
  rowRank: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '800',
  },
  rowValue: {
    color: colors.primary,
    fontSize: 13,
    fontWeight: '700',
    marginTop: spacing.xs,
  },
  errorWrap: {
    flex: 1,
  },
});
