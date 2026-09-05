import React, { useCallback, useMemo, useState } from 'react';
import { Alert, FlatList, ListRenderItem, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import Animated, { FadeInUp } from 'react-native-reanimated';
import LinearGradient from 'react-native-linear-gradient';
import { ClipboardList } from 'lucide-react-native';

import { AppHeader } from '../../components/common/AppHeader';
import { AnimatedPressable } from '../../components/common/AnimatedPressable';
import { EmptyState } from '../../components/common/EmptyState';
import { BrandLoadingState } from '../../components/common/BrandLoadingState';
import { Button } from '../../components/common/Button';
import { Screen } from '../../components/common/Screen';
import { SectionTitle } from '../../components/common/SectionTitle';
import { TestCard } from '../../components/tests/TestCard';
import { RootStackParamList } from '../../navigation/types';
import { useAppStore } from '../../store/appStore';
import { useAuthStore } from '../../store/authStore';
import { colors, radius, spacing } from '../../theme';
import { TestItem } from '../../types';
import { getEligibility } from '../../utils/accessControl';
import { getTestLockedMessage, isTestActive } from '../../utils/testAvailability';

import { NAVIGATOR_BATCH_TEST_ID, NAVIGATOR_BATCH_TEST_ITEM } from '../../services/api/navigatorBatchTestData';
import { useFocusEffect } from '@react-navigation/native';
import { RefreshControl } from 'react-native';

type Filter = 'all' | 'eligible' | 'weekly' | 'scholarship';
type RootNavigation = NativeStackNavigationProp<RootStackParamList>;

const filterOptions: Array<{ key: Filter; label: string }> = [
  { key: 'all', label: 'All' },
  { key: 'eligible', label: 'Available For Me' },
  { key: 'weekly', label: 'Weekly' },
  { key: 'scholarship', label: 'Scholarship' },
];

export function TestsScreen() {
  const rootNavigation = useNavigation<RootNavigation>();
  const user = useAuthStore((state) => state.user);
  const tests = useAppStore((state) => state.tests);
  const batches = useAppStore((state) => state.batches);
  const results = useAppStore((state) => state.results);
  const isBootstrapping = useAppStore((state) => state.isBootstrapping);
  const bootstrap = useAppStore((state) => state.bootstrap);
  const [activeFilter, setActiveFilter] = useState<Filter>('all');
  const [isRefreshing, setIsRefreshing] = useState(false);

  useFocusEffect(
    useCallback(() => {
      void bootstrap(user);
    }, [bootstrap, user])
  );

  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    try {
      await bootstrap(user);
    } finally {
      setIsRefreshing(false);
    }
  }, [bootstrap, user]);

  const cleanTests = useMemo(() => {
    const isOldTest = (t: TestItem) =>
      t.id.includes('1163869') ||
      (t.title || '').toLowerCase().includes('11th_morning_physics') ||
      (t.title || '').toLowerCase().includes('1163869');

    let list = tests.filter((t) => !isOldTest(t));
    const hasNavigator = list.some(
      (t) => t.id === NAVIGATOR_BATCH_TEST_ID || (t.title || '').toLowerCase().includes('navigator batch')
    );
    if (!hasNavigator) {
      list = [NAVIGATOR_BATCH_TEST_ITEM, ...list];
    }
    return list;
  }, [tests]);

  const completedCount = useMemo(
    () => results.filter((result) => result.userId === user?.id).length,
    [results, user?.id],
  );

  const filteredTests = useMemo(() => {
    return cleanTests.filter((test) => {
      const eligibility = getEligibility(user, test);

      if (activeFilter === 'eligible') {
        return eligibility.allowed;
      }
      if (activeFilter === 'weekly') {
        return test.type === 'weekly';
      }
      if (activeFilter === 'scholarship') {
        return test.type === 'scholarship';
      }

      return true;
    });
  }, [activeFilter, cleanTests, user]);

  const handleFilterPress = useCallback((filter: Filter) => {
    setActiveFilter(filter);
  }, []);

  const handleStartTest = useCallback(
    (test: TestItem) => {
      const eligibility = getEligibility(user, test);

      if (eligibility.allowed && !isTestActive(test) && user?.role !== 'admin') {
        Alert.alert('Paper locked', getTestLockedMessage(test));
        return;
      }

      rootNavigation.navigate('TestIntro', { testId: test.id });
    },
    [rootNavigation, user],
  );

  const renderFilterChip = useCallback<ListRenderItem<{ key: Filter; label: string }>>(
    ({ item }) => {
      const isActive = activeFilter === item.key;

      return (
        <AnimatedPressable
          style={[styles.filterChip, isActive && styles.filterChipActive]}
          onPress={() => handleFilterPress(item.key)}>
          <Text style={[styles.filterText, isActive && styles.filterTextActive]}>{item.label}</Text>
        </AnimatedPressable>
      );
    },
    [activeFilter, handleFilterPress],
  );

  const renderTestItem = useCallback<ListRenderItem<TestItem>>(
    ({ item, index }) => (
      <Animated.View entering={FadeInUp.delay(index * 50)}>
        <TestCard test={item} eligibility={getEligibility(user, item)} onStart={() => handleStartTest(item)} />
      </Animated.View>
    ),
    [handleStartTest, user],
  );

  const listHeader = useMemo(
    () => (
      <>
        <AppHeader title="Test Center" subtitle="Weekly batch papers and scholarship exams in one place" />

        <LinearGradient colors={[colors.primaryDeep, colors.primary]} style={styles.summaryCard}>
          <View style={styles.summaryOrb} />
          <View style={styles.summaryText}>
            <Text style={styles.summaryEyebrow} numberOfLines={1}>
              TEST DASHBOARD
            </Text>
            <Text style={styles.summaryTitle} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.88}>
              Your snapshot
            </Text>
            <Text style={styles.summarySubtitle} numberOfLines={3} ellipsizeMode="tail">
              Weekly papers follow batch access. Scholarship exams open after a quick registration form.
            </Text>
          </View>
          <View style={styles.scorePill}>
            <Text style={styles.scorePillText}>{user?.averageScore ?? 0}%</Text>
            <Text style={styles.scorePillLabel}>Average</Text>
          </View>
        </LinearGradient>

        {user?.role === 'student' ? (
          <View style={styles.batchPanel}>
            <SectionTitle title="Available Batches" />
            <View style={styles.batchGrid}>
              {batches.map((batch) => (
                <View key={batch.id} style={styles.batchCard}>
                  <Text style={styles.batchTitle}>{batch.label}</Text>
                  <Text style={styles.batchMeta}>{`${batch.targetExam} | ${batch.classLabel}`}</Text>
                </View>
              ))}
            </View>
            <Button variant="secondary" onPress={() => rootNavigation.navigate('Batches')}>
              Request Batch Access
            </Button>
          </View>
        ) : null}

        <FlatList
          horizontal
          data={filterOptions}
          keyExtractor={(item) => item.key}
          renderItem={renderFilterChip}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterRow}
        />

        <View style={styles.sectionTitleWrap}>
          <SectionTitle title={`Available Tests | ${completedCount} attempted`} />
        </View>
      </>
    ),
    [batches, completedCount, renderFilterChip, rootNavigation, user?.averageScore, user?.role],
  );

  return (
    <Screen useScrollView={false}>
      <FlatList
        style={styles.flex}
        data={filteredTests}
        keyExtractor={(item) => item.id}
        renderItem={renderTestItem}
        ListHeaderComponent={listHeader}
        ListEmptyComponent={
          isBootstrapping && tests.length === 0 ? (
            <BrandLoadingState
              title="Preparing your test dashboard"
              subtitle="Loading current papers, access rules, and the latest attempt status."
            />
          ) : (
            <EmptyState
              icon={ClipboardList}
              title="No tests in this view"
              description="Try another filter or wait for the next paper to be published."
            />
          )
        }
        contentContainerStyle={styles.listContent}
        refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={handleRefresh} />}
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
  flex: {
    flex: 1,
  },
  summaryCard: {
    marginHorizontal: spacing.xl,
    marginBottom: spacing.xl,
    borderRadius: radius.xl,
    padding: spacing.xl,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    overflow: 'hidden',
    minWidth: 0,
  },
  summaryOrb: {
    position: 'absolute',
    width: 180,
    height: 180,
    borderRadius: 90,
    backgroundColor: 'rgba(255,255,255,0.1)',
    right: -50,
    top: -30,
  },
  summaryText: {
    flex: 1,
    flexShrink: 1,
    minWidth: 0,
  },
  summaryEyebrow: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.9,
    marginBottom: spacing.xs,
  },
  summaryTitle: {
    color: colors.white,
    fontSize: 20,
    fontWeight: '800',
  },
  summarySubtitle: {
    color: 'rgba(255,255,255,0.76)',
    fontSize: 13,
    lineHeight: 18,
    marginTop: spacing.sm,
  },
  scorePill: {
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: 'rgba(255,255,255,0.16)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
    flexShrink: 0,
  },
  scorePillText: {
    color: colors.white,
    fontSize: 18,
    fontWeight: '800',
  },
  scorePillLabel: {
    color: 'rgba(255,255,255,0.72)',
    fontSize: 11,
    fontWeight: '700',
    marginTop: 2,
  },
  filterRow: {
    paddingHorizontal: spacing.xl,
    gap: spacing.sm,
    marginBottom: spacing.xl,
  },
  filterChip: {
    minWidth: 108,
    maxWidth: 170,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
  },
  filterChipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  filterText: {
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: '700',
    flexShrink: 1,
  },
  filterTextActive: {
    color: colors.white,
  },
  batchPanel: {
    paddingHorizontal: spacing.xl,
    gap: spacing.md,
    marginBottom: spacing.xl,
  },
  batchGrid: {
    gap: spacing.sm,
  },
  batchCard: {
    backgroundColor: colors.surfaceRaised,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.xl,
    padding: spacing.lg,
    gap: spacing.xs,
    minWidth: 0,
  },
  batchTitle: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '800',
    flexShrink: 1,
    minWidth: 0,
  },
  batchMeta: {
    color: colors.textMuted,
    fontSize: 12,
    flexShrink: 1,
    minWidth: 0,
  },
  sectionTitleWrap: {
    paddingHorizontal: spacing.xl,
    marginBottom: spacing.md,
  },
  listContent: {
    paddingBottom: spacing.xxxl,
    gap: spacing.md,
  },
});
