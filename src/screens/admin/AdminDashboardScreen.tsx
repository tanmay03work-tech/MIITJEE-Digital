import React, { useCallback, useMemo } from 'react';
import { Alert, FlatList, ListRenderItem, StyleSheet, Text, View } from 'react-native';
import { Activity, BarChart3, CircleHelp, FilePlus, FilePlus2, FileText, FolderOpen, GraduationCap, Layers3, ListChecks, ScrollText, ShieldAlert, Trash2, UsersRound } from 'lucide-react-native';
import { useFocusEffect } from '@react-navigation/native';

import { AppHeader } from '../../components/common/AppHeader';
import { Card } from '../../components/common/Card';
import { EmptyState } from '../../components/common/EmptyState';
import { Screen } from '../../components/common/Screen';
import { AdminActionCard } from '../../components/admin/AdminActionCard';
import { useAppStore } from '../../store/appStore';
import { useAuthStore } from '../../store/authStore';
import { colors, spacing } from '../../theme';
import { RootStackScreenProps } from '../../navigation/types';

type DashboardItem =
  | { id: 'summary'; type: 'summary'; totalQuestions: number }
  | { id: 'actions'; type: 'actions' };

export function AdminDashboardScreen({ navigation }: RootStackScreenProps<'AdminDashboard'>) {
  const user = useAuthStore((state) => state.user);
  const users = useAppStore((state) => state.users);
  const tests = useAppStore((state) => state.tests);
  const results = useAppStore((state) => state.results);
  const analytics = useAppStore((state) => state.analytics);
  const loadAdminData = useAppStore((state) => state.loadAdminData);
  const wipeLeaderboard = useAppStore((state) => state.wipeLeaderboard);
  const isAdminDataLoading = useAppStore((state) => state.isAdminDataLoading);
  const isAdmin = user?.role === 'admin' && user.approvalStatus === 'approved';

  useFocusEffect(
    React.useCallback(() => {
      if (!isAdmin || !user) {
        return undefined;
      }

      void loadAdminData(user);
      return undefined;
    }, [isAdmin, loadAdminData, user]),
  );

  const questionBankSets = useAppStore((state) => state.questionBankSets);
  const totalQuestions = useMemo(() => {
    const testQuestions = tests.reduce((sum, test) => sum + test.questionCount, 0);
    const bankQuestions = questionBankSets.reduce((sum, set) => sum + set.questionCount, 0);
    return Math.max(analytics.totalQuestions || 0, testQuestions + bankQuestions);
  }, [analytics.totalQuestions, questionBankSets, tests]);
  const hasVisibleDashboardData =
    tests.length > 0 || users.length > 0 ||
    results.length > 0 ||
    analytics.totalTests > 0 ||
    analytics.totalUsers > 0 ||
    analytics.totalAttempts > 0;

  const items = useMemo<DashboardItem[]>(
    () => [
      { id: 'summary', type: 'summary', totalQuestions },
      { id: 'actions', type: 'actions' },
    ],
    [totalQuestions],
  );

  const renderItem = useCallback<ListRenderItem<DashboardItem>>(
    ({ item }) => {
      if (item.type === 'summary') {
        return (
          <View style={styles.summaryGrid}>
            <Card style={styles.summaryCard}>
              <Text style={styles.summaryLabel}>Tests</Text>
              <Text style={styles.summaryValue}>{analytics.totalTests || tests.length}</Text>
            </Card>
            <Card style={styles.summaryCard}>
              <Text style={styles.summaryLabel}>Users</Text>
              <Text style={styles.summaryValue}>{analytics.totalUsers || users.length}</Text>
            </Card>
            <Card style={styles.summaryCard}>
              <Text style={styles.summaryLabel}>Attempts</Text>
              <Text style={styles.summaryValue}>{analytics.totalAttempts || results.length}</Text>
            </Card>
            <Card style={styles.summaryCard}>
              <Text style={styles.summaryLabel}>Questions</Text>
              <Text style={styles.summaryValue}>{item.totalQuestions}</Text>
            </Card>
          </View>
        );
      }

      if (item.type === 'actions') {
        return (
          <View style={styles.actions}>
            <AdminActionCard title="Question Bank (.docx)" description="Upload Word (.docx) papers, extract questions & diagrams into Question Sets." icon={FolderOpen} color={colors.primary} onPress={() => navigation.navigate('QuestionBank', { mode: 'manage' })} />
            <AdminActionCard title="Create Test" description="Build weekly or scholarship papers from Question Sets or scratch." icon={FilePlus2} color="#15803D" onPress={() => navigation.navigate('CreateTest')} />
            <AdminActionCard title="Manage Tests" description="Edit timing, schedule, lock state, and batch access of every paper." icon={ListChecks} color={colors.accent} onPress={() => navigation.navigate('ManageTests')} />
            <AdminActionCard title="Test Results" description="Review student submissions, subject-wise breakdowns, and export to CSV/Excel." icon={BarChart3} color="#2563EB" onPress={() => navigation.navigate('ViewResults')} />
            <AdminActionCard title="Manage Users" description="Assign roles, batch access, and student permissions in one place." icon={UsersRound} color={colors.info} onPress={() => navigation.navigate('ManageUsers')} />
            <AdminActionCard title="Create Batch" description="Add a new batch with image, description, and class details." icon={Layers3} color={colors.warning} onPress={() => navigation.navigate('CreateBatch')} />
            <AdminActionCard
              title="Wipe Leaderboard"
              description="Clear leaderboard and attempt history when you need a fresh restart."
              icon={Trash2}
              color={colors.danger}
              onPress={() =>
                Alert.alert('Wipe leaderboard?', 'This will remove all stored attempts and ranking data.', [
                  { text: 'Cancel', style: 'cancel' },
                  {
                    text: 'Wipe',
                    style: 'destructive',
                    onPress: () => {
                      void wipeLeaderboard()
                        .then(() => {
                          Alert.alert('Leaderboard wiped', 'All attempt-based leaderboard data has been cleared.');
                        })
                        .catch((error) => {
                          Alert.alert('Unable to wipe leaderboard', error instanceof Error ? error.message : 'Please try again.');
                        });
                    },
                  },
                ])
              }
            />
            <AdminActionCard title="Activity Logs" description="Review operational logs for logins, device issues, exams, and admin actions." icon={ScrollText} color={colors.primary} onPress={() => navigation.navigate('ActivityLogs')} />
            <AdminActionCard title="Issue Diagnostics" description="Real-time student login issues, submission errors, device blocks, and quick resolution controls." icon={Activity} color={colors.warning} onPress={() => navigation.navigate('AdminDiagnostics')} />
            <AdminActionCard title="Scholarship Forms" description="Check scholarship registrations in their own dedicated queue." icon={GraduationCap} color={colors.warning} onPress={() => navigation.navigate('ScholarshipRegistrations')} />
            <AdminActionCard title="Batch Requests" description="Open batch access requests in a separate moderation tab." icon={Layers3} color={colors.info} onPress={() => navigation.navigate('BatchAccessRequests')} />
            <AdminActionCard title="General Enquiries" description="Handle admission and support questions without mixing them into results." icon={CircleHelp} color={colors.primary} onPress={() => navigation.navigate('GeneralEnquiries')} />
          </View>
        );
      }

      return null;
    },
    [analytics, navigation, results.length, tests.length, users.length, wipeLeaderboard],
  );

  if (!isAdmin) {
    return (
      <Screen>
        <AppHeader title="Admin Panel" subtitle="Restricted to approved MIITJEE admins" showLogo={false} />
        <View style={styles.emptyStateWrap}>
          <EmptyState
            icon={ShieldAlert}
            title="Admin access required"
            description="This panel is only available to approved teacher and admin accounts."
          />
        </View>
      </Screen>
    );
  }

  if (isAdminDataLoading && !hasVisibleDashboardData) {
    return (
      <Screen>
        <AppHeader title="Admin Panel" subtitle="Loading admin controls" showLogo={false} />
        <View style={styles.loadingCardWrap}>
          <Card>
            <Text style={styles.loadingTitle}>Loading admin panel...</Text>
            <Text style={styles.loadingText}>Syncing users and moderation data.</Text>
          </Card>
        </View>
      </Screen>
    );
  }

  return (
    <Screen useScrollView={false}>
      <FlatList
        style={styles.flex}
        data={items}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        ListHeaderComponent={
          <>
            <AppHeader
              title="Admin Panel"
              subtitle="Batches, tests, access, and moderation tools"
              showLogo={false}
              showBack={true}
              onBack={() => navigation.navigate('MainTabs')}
            />
            {isAdminDataLoading ? (
              <View style={styles.syncBannerWrap}>
                <Card style={styles.syncBanner}>
                  <Text style={styles.syncBannerTitle}>Syncing admin queues</Text>
                  <Text style={styles.syncBannerText}>Fresh users, attempts, enquiries, and moderation signals are loading in the background.</Text>
                </Card>
              </View>
            ) : null}
          </>
        }
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
    paddingBottom: spacing.xxxl,
  },
  summaryGrid: {
    paddingHorizontal: spacing.xl,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
    marginBottom: spacing.xxl,
  },
  syncBannerWrap: {
    paddingHorizontal: spacing.xl,
    marginBottom: spacing.lg,
  },
  syncBanner: {
    gap: spacing.xs,
    backgroundColor: colors.primarySoft,
  },
  syncBannerTitle: {
    color: colors.primaryDeep,
    fontSize: 13,
    fontWeight: '800',
  },
  syncBannerText: {
    color: colors.textMuted,
    fontSize: 12,
    lineHeight: 18,
  },
  summaryCard: {
    flex: 1,
    minWidth: '47%',
    gap: spacing.sm,
  },
  summaryLabel: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  summaryValue: {
    color: colors.text,
    fontSize: 28,
    fontWeight: '800',
  },
  actions: {
    paddingHorizontal: spacing.xl,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
    marginBottom: spacing.xxl,
  },
  emptyStateWrap: {
    paddingHorizontal: spacing.xl,
  },
  loadingCardWrap: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.lg,
  },
  loadingTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '800',
  },
  loadingText: {
    color: colors.textMuted,
    fontSize: 13,
    lineHeight: 18,
  },
});
