import React, { useCallback, useDeferredValue, useMemo, useState } from 'react';
import { Alert, FlatList, ListRenderItem, StyleSheet, Text, View } from 'react-native';
import { ShieldAlert } from 'lucide-react-native';
import { useFocusEffect } from '@react-navigation/native';

import { fetchResultsPage } from '../../services/api/admin';
import { AdminListSkeleton } from '../../components/admin/AdminListSkeleton';
import { AdminResultCard, ResultsEmptyState } from '../../components/admin/AdminInboxCards';
import { AppHeader } from '../../components/common/AppHeader';
import { AnimatedPressable } from '../../components/common/AnimatedPressable';
import { EmptyState } from '../../components/common/EmptyState';
import { InputField } from '../../components/common/InputField';
import { Screen } from '../../components/common/Screen';
import { useAppStore } from '../../store/appStore';
import { useAuthStore } from '../../store/authStore';
import { colors, radius, spacing } from '../../theme';
import { TestResult } from '../../types';

const PAGE_SIZE = 20;

export function ViewResultsScreen() {
  const user = useAuthStore((state) => state.user);
  const users = useAppStore((state) => state.users);
  const tests = useAppStore((state) => state.tests);
  const deleteAttempt = useAppStore((state) => state.deleteAttempt);
  const isAdmin = user?.role === 'admin' && user.approvalStatus === 'approved';
  const usersById = useMemo(() => Object.fromEntries(users.map((entry) => [entry.id, entry])), [users]);
  const testsById = useMemo(() => Object.fromEntries(tests.map((entry) => [entry.id, entry])), [tests]);

  const [results, setResults] = useState<TestResult[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [scoreFilter, setScoreFilter] = useState<'all' | 'high' | 'low'>('all');
  const [loadingInitial, setLoadingInitial] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const deferredSearchTerm = useDeferredValue(searchTerm);

  const loadResultsPage = useCallback(
    async (reset: boolean, searchValue: string) => {
      const offset = reset ? 0 : results.length;
      const loader = reset ? setLoadingInitial : setLoadingMore;
      loader(true);
      try {
        const rows = await fetchResultsPage(undefined, {
          offset,
          limit: PAGE_SIZE,
          search: searchValue,
        });
        setResults((current) => (reset ? rows : [...current, ...rows]));
        setHasMore(rows.length === PAGE_SIZE);
      } catch (error) {
        Alert.alert('Unable to load results', error instanceof Error ? error.message : 'Please try again.');
      } finally {
        loader(false);
      }
    },
    [results.length],
  );

  useFocusEffect(
    React.useCallback(() => {
      if (!isAdmin) {
        return undefined;
      }
      void loadResultsPage(true, deferredSearchTerm);
      return undefined;
    }, [deferredSearchTerm, isAdmin, loadResultsPage]),
  );

  const visibleResults = useMemo(() => {
    const normalizedSearch = deferredSearchTerm.trim().toLowerCase();
    const searchedResults =
      normalizedSearch.length === 0
        ? results
        : results.filter((entry) => [entry.userId, entry.testId].some((value) => value.toLowerCase().includes(normalizedSearch)));

    if (scoreFilter === 'all') {
      return searchedResults;
    }
    if (scoreFilter === 'high') {
      return searchedResults.filter((entry) => entry.score >= 70);
    }
    return searchedResults.filter((entry) => entry.score < 70);
  }, [deferredSearchTerm, results, scoreFilter]);

  const renderResult = useCallback<ListRenderItem<TestResult>>(
    ({ item }) => (
      <AdminResultCard
        result={item}
        user={usersById[item.userId]}
        test={testsById[item.testId]}
        onDelete={async (attemptId) => {
          await deleteAttempt(attemptId);
          setResults((current) => current.filter((entry) => entry.id !== attemptId));
        }}
      />
    ),
    [deleteAttempt, testsById, usersById],
  );

  const handleLoadMore = useCallback(() => {
    if (loadingInitial || loadingMore || !hasMore) {
      return;
    }
    void loadResultsPage(false, deferredSearchTerm);
  }, [deferredSearchTerm, hasMore, loadResultsPage, loadingInitial, loadingMore]);

  if (!isAdmin) {
    return (
      <Screen>
        <AppHeader title="Test Results" subtitle="Available only for approved admins" />
        <View style={styles.emptyStateWrap}>
          <EmptyState
            icon={ShieldAlert}
            title="Admin access required"
            description="Only approved admins can review student submissions."
          />
        </View>
      </Screen>
    );
  }

  return (
    <Screen useScrollView={false}>
      {loadingInitial ? (
        <>
          <AppHeader title="Test Results" subtitle="Student paper submissions in one focused review queue" />
          <View style={styles.controlsWrap}>
            <InputField
              label="Search results"
              value={searchTerm}
              onChangeText={setSearchTerm}
              placeholder="Search by user id or test id"
            />
          </View>
          <AdminListSkeleton rows={5} />
        </>
      ) : (
        <FlatList
          data={visibleResults}
          keyExtractor={(item) => item.id}
          renderItem={renderResult}
          onEndReachedThreshold={0.3}
          onEndReached={handleLoadMore}
          ListHeaderComponent={
            <>
              <AppHeader title="Test Results" subtitle="Student paper submissions in one focused review queue" />
              <View style={styles.controlsWrap}>
                <InputField
                  label="Search results"
                  value={searchTerm}
                  onChangeText={setSearchTerm}
                  placeholder="Search by user id or test id"
                />
                <View style={styles.filterRow}>
                  {[
                    { id: 'all', label: 'All Scores' },
                    { id: 'high', label: '70%+' },
                    { id: 'low', label: '<70%' },
                  ].map((entry) => (
                    <AnimatedPressable
                      key={`score-filter-${entry.id}`}
                      style={[styles.filterChip, scoreFilter === entry.id && styles.filterChipActive]}
                      onPress={() => setScoreFilter(entry.id as typeof scoreFilter)}>
                      <Text style={[styles.filterText, scoreFilter === entry.id && styles.filterTextActive]}>{entry.label}</Text>
                    </AnimatedPressable>
                  ))}
                </View>
              </View>
            </>
          }
          ListEmptyComponent={<ResultsEmptyState />}
          ListFooterComponent={loadingMore ? <AdminListSkeleton rows={1} /> : <View style={styles.footerSpace} />}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          initialNumToRender={8}
          maxToRenderPerBatch={8}
          windowSize={5}
          updateCellsBatchingPeriod={50}
          removeClippedSubviews={false}
        />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  list: {
    paddingBottom: spacing.lg,
  },
  controlsWrap: {
    paddingHorizontal: spacing.xl,
    gap: spacing.md,
    marginBottom: spacing.lg,
  },
  filterRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    flexWrap: 'wrap',
  },
  filterChip: {
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceMuted,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  filterChipActive: {
    backgroundColor: colors.primary,
  },
  filterText: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '700',
  },
  filterTextActive: {
    color: colors.white,
  },
  emptyStateWrap: {
    paddingHorizontal: spacing.xl,
  },
  footerSpace: {
    height: spacing.md,
  },
});
