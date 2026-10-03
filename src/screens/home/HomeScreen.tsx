import React, { startTransition, useCallback, useEffect, useMemo, useState } from 'react';
import { FlatList, ListRenderItem, StyleSheet, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { AppHeader } from '../../components/common/AppHeader';
import { Badge } from '../../components/common/Badge';
import { BrandLoadingState } from '../../components/common/BrandLoadingState';
import {
  ContinueLearningSection,
  HeaderSection,
  HomeFeedSkeleton,
  HomeSectionPlaceholder,
  LeaderboardPreviewSection,
  RecentResultsSection,
  RecommendedTestsSection,
} from '../../components/home/HomeFeedSections';
import { Screen } from '../../components/common/Screen';
import { MainTabScreenProps, RootStackParamList } from '../../navigation/types';
import { useAppStore } from '../../store/appStore';
import { useAuthStore } from '../../store/authStore';
import { spacing } from '../../theme';
import { QuickAction, TestItem } from '../../types';
import { isTestActive } from '../../utils/testAvailability';

type RootNavigation = NativeStackNavigationProp<RootStackParamList>;
type HomeFeedSectionType = 'header' | 'continue_learning' | 'recommended_tests' | 'recent_results' | 'leaderboard_preview';
type IdleAwareGlobal = typeof globalThis & {
  requestIdleCallback?: (callback: () => void) => number;
  cancelIdleCallback?: (handle: number) => void;
};
const idleGlobal = globalThis as IdleAwareGlobal;

interface HomeFeedSectionItem {
  id: HomeFeedSectionType;
  type: HomeFeedSectionType;
}

const HOME_SECTIONS: HomeFeedSectionItem[] = [
  { id: 'header', type: 'header' },
  { id: 'continue_learning', type: 'continue_learning' },
  { id: 'recommended_tests', type: 'recommended_tests' },
  { id: 'recent_results', type: 'recent_results' },
  { id: 'leaderboard_preview', type: 'leaderboard_preview' },
];

export function HomeScreen({ navigation }: MainTabScreenProps<'Home'>) {
  const rootNavigation = useNavigation<RootNavigation>();
  const user = useAuthStore((state) => state.user);
  const batches = useAppStore((state) => state.batches);
  const tests = useAppStore((state) => state.tests);
  const results = useAppStore((state) => state.results);
  const isBootstrapping = useAppStore((state) => state.isBootstrapping);
  const loadLeaderboard = useAppStore((state) => state.loadLeaderboard);
  const loadStudentInsights = useAppStore((state) => state.loadStudentInsights);

  const [homePhase, setHomePhase] = useState(1);

  useEffect(() => {
    const idleCallback = idleGlobal.requestIdleCallback?.(() => {
      startTransition(() => setHomePhase(2));
    });
    const interactionFallbackTimer =
      idleCallback === undefined
        ? setTimeout(() => {
            startTransition(() => setHomePhase(2));
          }, 0)
        : undefined;
    const lazyTimer = setTimeout(() => {
      startTransition(() => setHomePhase(3));
    }, 480);

    return () => {
      if (idleCallback !== undefined) {
        idleGlobal.cancelIdleCallback?.(idleCallback);
      }
      if (interactionFallbackTimer !== undefined) {
        clearTimeout(interactionFallbackTimer);
      }
      clearTimeout(lazyTimer);
    };
  }, []);

  useEffect(() => {
    if (!user?.id) {
      return;
    }

    if (user.role !== 'admin') {
      void loadLeaderboard({ scope: 'overall_history', batchId: null }).catch(() => {});
    }

    if (user.role !== 'admin') {
      void loadStudentInsights(user.id).catch(() => {});
    }
  }, [loadLeaderboard, loadStudentInsights, user?.batchId, user?.id, user?.role]);

  const quickActions = useMemo<QuickAction[]>(() => {
    if (user?.role === 'admin' && user.approvalStatus === 'approved') {
      return [
        { id: 'qa_admin_1', label: 'Create Paper', subtitle: 'Build and publish tests', color: '#382B8C', target: 'create-test' },
        { id: 'qa_admin_2', label: 'Manage Access', subtitle: 'Approve batches and users', color: '#0F8DB7', target: 'manage-users' },
        { id: 'qa_admin_3', label: 'Results', subtitle: 'Track test submissions', color: '#E07A2D', target: 'results' },
        { id: 'qa_admin_4', label: 'Leaderboard', subtitle: 'Monitor rankings', color: '#C88A13', target: 'leaderboard' },
      ];
    }

    return [
      { id: 'qa_student_1', label: 'Weekly Papers', subtitle: 'Available by batch', color: '#382B8C', target: 'tests' },
      { id: 'qa_student_2', label: 'Batch Access', subtitle: 'Explore and request programs', color: '#C88A13', target: 'batches' },
      { id: 'qa_student_3', label: 'Enquiry', subtitle: 'Ask for guidance', color: '#E07A2D', target: 'enquiry' },
      { id: 'qa_student_4', label: 'Profile', subtitle: 'View access and progress', color: '#0F8DB7', target: 'profile' },
    ];
  }, [user]);

  const userResults = useMemo(() => results.filter((result) => result.userId === user?.id), [results, user?.id]);
  const latestResults = useMemo(() => userResults.slice(0, 3), [userResults]);

  const cleanTests = useMemo(() => {
    const isOldTest = (t: TestItem) =>
      t.id.includes('1163869') ||
      (t.title || '').toLowerCase().includes('11th_morning_physics') ||
      (t.title || '').toLowerCase().includes('1163869');

    return tests.filter((t) => !isOldTest(t) && Boolean(t.id));
  }, [tests]);

  const testsById = useMemo(() => Object.fromEntries(cleanTests.map((test) => [test.id, test])), [cleanTests]);
  const upcomingTests = useMemo(() => cleanTests.slice(0, 3), [cleanTests]);
  const nextTest = upcomingTests[0];

  const computedAverageScore = useMemo(
    () => (userResults.length > 0 ? Math.round(userResults.reduce((sum, result) => sum + result.score, 0) / userResults.length) : 0),
    [userResults],
  );

  const resolvedAverageScore = user && user.averageScore > 0 ? user.averageScore : computedAverageScore;
  const latestRank = userResults[0]?.rank ?? 0;
  const resolvedRank = user && user.rank > 0 ? user.rank : latestRank;
  const rankLabel = resolvedRank > 0 ? `#${resolvedRank}` : 'Not ranked yet';
  const averageScoreLabel = `${resolvedAverageScore}%`;

  const visibleSections = HOME_SECTIONS;

  const handleQuickAction = useCallback(
    (target: QuickAction['target']) => {
      if (target === 'tests') {
        navigation.navigate('Tests');
        return;
      }
      if (target === 'leaderboard') {
        navigation.navigate('Leaderboard');
        return;
      }
      if (target === 'profile') {
        navigation.navigate('Profile');
        return;
      }
      if (target === 'create-test') {
        rootNavigation.navigate('CreateTest');
        return;
      }
      if (target === 'batches') {
        rootNavigation.navigate('Batches');
        return;
      }
      if (target === 'enquiry') {
        rootNavigation.navigate('Enquiry');
        return;
      }
      if (target === 'terms') {
        rootNavigation.navigate('Terms');
        return;
      }
      if (target === 'privacy') {
        rootNavigation.navigate('Privacy');
        return;
      }
      if (target === 'manage-users') {
        rootNavigation.navigate('ManageUsers');
        return;
      }
      if (target === 'results') {
        rootNavigation.navigate('ViewResults');
        return;
      }
      if (target === 'scholarship-registrations') {
        rootNavigation.navigate('ScholarshipRegistrations');
        return;
      }
      if (target === 'batch-access-requests') {
        rootNavigation.navigate('BatchAccessRequests');
        return;
      }
      if (target === 'general-enquiries') {
        rootNavigation.navigate('GeneralEnquiries');
        return;
      }

      rootNavigation.navigate('AdminDashboard');
    },
    [navigation, rootNavigation],
  );

  const handleTestOpen = useCallback(
    (test: TestItem) => {
      rootNavigation.navigate('TestIntro', { testId: test.id });
    },
    [rootNavigation],
  );

  const renderSection = useCallback<ListRenderItem<HomeFeedSectionItem>>(
    ({ item }) => {
      if (item.type === 'header') {
        return (
          <HeaderSection
            nextTest={nextTest}
            rankLabel={rankLabel}
            batchCount={batches.length}
            attemptCount={userResults.length}
            averageScoreLabel={averageScoreLabel}
            onPressScholarship={() => navigation.navigate('Tests')}
          />
        );
      }

      if (item.type === 'continue_learning') {
        return (
          <ContinueLearningSection
            quickActions={quickActions}
            onContinue={() => navigation.navigate('Tests')}
            onQuickAction={handleQuickAction}
          />
        );
      }

      if (item.type === 'recommended_tests') {
        if (homePhase < 2) {
          return <HomeSectionPlaceholder title="Test Series" />;
        }
        return <RecommendedTestsSection upcomingTests={upcomingTests} onOpenTest={handleTestOpen} />;
      }

      if (item.type === 'recent_results') {
        if (homePhase < 2) {
          return <HomeSectionPlaceholder title="Recent Results" compact />;
        }
        return <RecentResultsSection latestResults={latestResults} testsById={testsById} />;
      }

      if (homePhase < 3) {
        return <HomeSectionPlaceholder title="Batch Preview" />;
      }

      return (
        <LeaderboardPreviewSection
          batches={batches}
          userRole={user?.role}
          userApproved={user?.approvalStatus === 'approved'}
        />
      );
    },
    [
      averageScoreLabel,
      batches,
      handleQuickAction,
      handleTestOpen,
      homePhase,
      latestResults,
      navigation,
      nextTest,
      quickActions,
      rankLabel,
      testsById,
      upcomingTests,
      user?.approvalStatus,
      user?.role,
      userResults.length,
    ],
  );

  if (isBootstrapping && homePhase === 1) {
    return (
      <Screen>
        <AppHeader
          title={`Hi${user ? `, ${user.fullName.split(' ')[0]}` : ''}`}
          subtitle="Stay consistent and keep moving forward."
          showLogo={false}
          rightSlot={
            user ? (
              <Badge
                label={user.role === 'admin' ? user.approvalStatus : user.role.replace('_', ' ')}
                tone={user.role === 'admin' && user.approvalStatus === 'approved' ? 'success' : 'primary'}
              />
            ) : undefined
          }
        />
        <BrandLoadingState title="Preparing your home screen" subtitle="Loading your papers, performance cards, and latest rank." />
        <HomeFeedSkeleton />
      </Screen>
    );
  }

  return (
    <Screen useScrollView={false}>
      <FlatList
        style={styles.flex}
        data={visibleSections}
        keyExtractor={(item) => item.id}
        renderItem={renderSection}
        ListHeaderComponent={
          <AppHeader
            title={`Hi${user ? `, ${user.fullName.split(' ')[0]}` : ''}`}
            subtitle="Stay consistent and keep moving forward."
            showLogo={false}
            rightSlot={
              user ? (
                <Badge
                  label={user.role === 'admin' ? user.approvalStatus : user.role.replace('_', ' ')}
                  tone={user.role === 'admin' && user.approvalStatus === 'approved' ? 'success' : 'primary'}
                />
              ) : undefined
            }
          />
        }
        ListFooterComponent={<View style={styles.footerSpacer} />}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        initialNumToRender={4}
        maxToRenderPerBatch={4}
        windowSize={5}
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
  content: {
    paddingBottom: spacing.lg,
  },
  footerSpacer: {
    height: spacing.md,
  },
});
