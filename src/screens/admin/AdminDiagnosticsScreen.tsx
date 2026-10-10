import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Laptop,
  Play,
  RotateCcw,
  Search,
  Send,
  ShieldAlert,
  Smartphone,
  Timer,
  WifiOff,
} from 'lucide-react-native';

import { AppHeader } from '../../components/common/AppHeader';
import { Badge } from '../../components/common/Badge';
import { Card } from '../../components/common/Card';
import { EmptyState } from '../../components/common/EmptyState';
import { Screen } from '../../components/common/Screen';
import { SelectField } from '../../components/common/SelectField';
import {
  AdminDiagnosticSession,
  adminExtendSessionTime,
  adminForceSubmitSession,
  adminResetSessionWarnings,
  fetchAdminDiagnostics,
} from '../../services/api/admin';
import { useAppStore } from '../../store/appStore';
import { useAuthStore } from '../../store/authStore';
import { colors, radius, spacing } from '../../theme';

type DiagnosticFilter = 'ALL' | 'VIOLATIONS' | 'AUTO_SUBMIT' | 'DISCONNECTED';

export function AdminDiagnosticsScreen() {
  const user = useAuthStore((state) => state.user);
  const tests = useAppStore((state) => state.tests);
  const isAdmin = user?.role === 'admin' && user.approvalStatus === 'approved';

  const [sessions, setSessions] = useState<AdminDiagnosticSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedTestId, setSelectedTestId] = useState<string>('');
  const [filter, setFilter] = useState<DiagnosticFilter>('ALL');
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
  const [actionFeedback, setActionFeedback] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const loadDiagnostics = useCallback(
    async (refresh = false) => {
      if (refresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }
      try {
        const data = await fetchAdminDiagnostics(selectedTestId || undefined);
        setSessions(data);
      } catch (error) {
        setSessions([]);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [selectedTestId],
  );

  useEffect(() => {
    if (isAdmin) {
      void loadDiagnostics();
    }
  }, [isAdmin, loadDiagnostics]);

  // Action: Force Submit
  const handleForceSubmit = useCallback(
    (session: AdminDiagnosticSession) => {
      Alert.alert(
        'Force Submit Session',
        `Are you sure you want to immediately submit the exam for ${session.studentName}? This action cannot be undone.`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Force Submit',
            style: 'destructive',
            onPress: async () => {
              try {
                setActionLoadingId(session.sessionId);
                setActionFeedback(null);
                await adminForceSubmitSession(session.sessionId);
                setActionFeedback({
                  message: `Exam for ${session.studentName} was submitted successfully.`,
                  type: 'success',
                });
                await loadDiagnostics(true);
              } catch (err) {
                setActionFeedback({
                  message: err instanceof Error ? err.message : 'Failed to force submit session.',
                  type: 'error',
                });
              } finally {
                setActionLoadingId(null);
              }
            },
          },
        ],
      );
    },
    [loadDiagnostics],
  );

  // Action: Extend Time
  const handleExtendTime = useCallback(
    async (session: AdminDiagnosticSession, minutes: number) => {
      try {
        setActionLoadingId(session.sessionId);
        setActionFeedback(null);
        await adminExtendSessionTime(session.sessionId, minutes);
        setActionFeedback({
          message: `Extended ${minutes} minutes for ${session.studentName}.`,
          type: 'success',
        });
        await loadDiagnostics(true);
      } catch (err) {
        setActionFeedback({
          message: err instanceof Error ? err.message : 'Failed to extend session time.',
          type: 'error',
        });
      } finally {
        setActionLoadingId(null);
      }
    },
    [loadDiagnostics],
  );

  // Action: Reset Warnings
  const handleResetWarnings = useCallback(
    async (session: AdminDiagnosticSession) => {
      try {
        setActionLoadingId(session.sessionId);
        setActionFeedback(null);
        await adminResetSessionWarnings(session.sessionId);
        setActionFeedback({
          message: `Warnings reset to 0 for ${session.studentName}.`,
          type: 'success',
        });
        await loadDiagnostics(true);
      } catch (err) {
        setActionFeedback({
          message: err instanceof Error ? err.message : 'Failed to reset warnings.',
          type: 'error',
        });
      } finally {
        setActionLoadingId(null);
      }
    },
    [loadDiagnostics],
  );

  const filteredSessions = useMemo(() => {
    return sessions.filter((s) => {
      if (filter === 'VIOLATIONS') {
        return s.violationsCount > 0 || s.issueCode === 'MAX_TAB_VIOLATIONS' || s.issueCode === 'TAB_SWITCH_WARNING';
      }
      if (filter === 'AUTO_SUBMIT') {
        return s.status === 'AUTO_SUBMITTED' || s.issueCode === 'AUTO_SUBMIT_TRIGGERED';
      }
      if (filter === 'DISCONNECTED') {
        return s.status === 'DISCONNECTED' || s.status === 'EXPIRED';
      }
      return true;
    });
  }, [filter, sessions]);

  if (!isAdmin) {
    return (
      <Screen>
        <AppHeader title="Admin Diagnostics" subtitle="Restricted to approved MIITJEE admins" />
        <EmptyState
          icon={ShieldAlert}
          title="Admin Access Required"
          description="Only approved administrators can access system diagnostics and session monitoring."
        />
      </Screen>
    );
  }

  const testOptions = [
    { label: 'All Active Tests', value: '' },
    ...tests.map((t) => ({ label: t.title, value: t.id })),
  ];

  return (
    <Screen useScrollView={false}>
      <View style={styles.screen}>
        <AppHeader
          title="Issue Diagnostics & CBT Control"
          subtitle="Real-time session monitoring, tab-switch violations & instant admin actions"
          showLogo={false}
        />

        {/* Global Action Feedback Banner */}
        {actionFeedback ? (
          <View
            style={[
              styles.feedbackBanner,
              actionFeedback.type === 'success' ? styles.feedbackSuccess : styles.feedbackError,
            ]}>
            {actionFeedback.type === 'success' ? (
              <CheckCircle2 size={16} color={colors.success} />
            ) : (
              <AlertTriangle size={16} color={colors.danger} />
            )}
            <Text
              style={[
                styles.feedbackText,
                actionFeedback.type === 'success' ? styles.feedbackTextSuccess : styles.feedbackTextError,
              ]}>
              {actionFeedback.message}
            </Text>
          </View>
        ) : null}

        {/* Controls Card */}
        <Card style={styles.controlsCard}>
          <SelectField
            label="Filter by Test"
            value={selectedTestId}
            placeholder="All Active Tests"
            menuTitle="Select Examination"
            options={testOptions}
            onValueChange={setSelectedTestId}
            style={styles.selectField}
          />

          <View style={styles.filterRow}>
            {(
              [
                { key: 'ALL', label: `All (${sessions.length})` },
                {
                  key: 'VIOLATIONS',
                  label: `Violations (${sessions.filter((s) => s.violationsCount > 0).length})`,
                },
                {
                  key: 'AUTO_SUBMIT',
                  label: `Auto-Submitted (${sessions.filter((s) => s.status === 'AUTO_SUBMITTED').length})`,
                },
                {
                  key: 'DISCONNECTED',
                  label: `Offline/Expired (${sessions.filter((s) => s.status === 'DISCONNECTED' || s.status === 'EXPIRED').length})`,
                },
              ] as const
            ).map((item) => {
              const active = filter === item.key;
              return (
                <Pressable
                  key={item.key}
                  style={[styles.filterChip, active && styles.filterChipActive]}
                  onPress={() => setFilter(item.key)}>
                  <Text style={[styles.filterChipText, active && styles.filterChipTextActive]}>
                    {item.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </Card>

        {/* List of Sessions */}
        <FlatList
          data={filteredSessions}
          keyExtractor={(item) => item.sessionId}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => void loadDiagnostics(true)}
              tintColor={colors.primary}
            />
          }
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={
            !loading ? (
              <EmptyState
                icon={Activity}
                title="No diagnostic issues detected"
                description={
                  selectedTestId
                    ? 'No active sessions matching this test require admin intervention.'
                    : 'All active student exam sessions are currently running smoothly.'
                }
              />
            ) : null
          }
          renderItem={({ item }) => {
            const isProcessing = actionLoadingId === item.sessionId;
            const hasViolations = item.violationsCount > 0;
            const isAutoSubmitted = item.status === 'AUTO_SUBMITTED';

            return (
              <Card style={styles.sessionCard}>
                {/* Header */}
                <View style={styles.cardHeader}>
                  <View style={styles.studentInfo}>
                    <Text style={styles.studentName}>{item.studentName}</Text>
                    <Text style={styles.studentId}>
                      ID: {item.userId.slice(0, 8)}... | {item.batchId ? `Batch: ${item.batchId}` : 'Open Batch'}
                    </Text>
                  </View>
                  <Badge
                    label={item.status}
                    tone={
                      isAutoSubmitted
                        ? 'danger'
                        : hasViolations
                          ? 'warning'
                          : item.status === 'IN_PROGRESS'
                            ? 'success'
                            : 'neutral'
                    }
                  />
                </View>

                {/* Exam Title */}
                <Text style={styles.examTitle}>{item.testTitle}</Text>

                {/* Reason & Diagnostics Banner */}
                <View
                  style={[
                    styles.reasonBox,
                    isAutoSubmitted
                      ? styles.reasonBoxDanger
                      : hasViolations
                        ? styles.reasonBoxWarning
                        : styles.reasonBoxNormal,
                  ]}>
                  <AlertTriangle
                    size={16}
                    color={
                      isAutoSubmitted
                        ? colors.danger
                        : hasViolations
                          ? colors.warning
                          : colors.primary
                    }
                  />
                  <View style={styles.reasonTextWrap}>
                    <Text
                      style={[
                        styles.reasonText,
                        isAutoSubmitted && styles.reasonTextDanger,
                      ]}>
                      {item.issueReason}
                    </Text>
                    <Text style={styles.actionPromptText}>Suggested: {item.suggestedAction}</Text>
                  </View>
                </View>

                {/* Metrics Grid */}
                <View style={styles.metricsGrid}>
                  <View style={styles.metricItem}>
                    <Text style={styles.metricLabel}>Tab Warnings</Text>
                    <Text
                      style={[
                        styles.metricValue,
                        hasViolations && { color: colors.warning, fontWeight: '800' },
                      ]}>
                      {item.violationsCount >= 3
                        ? `${item.violationsCount} of 3 (Auto-submit)`
                        : `${item.violationsCount} of 3 warnings`}
                    </Text>
                  </View>
                  <View style={styles.metricItem}>
                    <Text style={styles.metricLabel}>Time Extended</Text>
                    <Text style={styles.metricValue}>+{item.timeExtendedMinutes} min</Text>
                  </View>
                  <View style={styles.metricItem}>
                    <Text style={styles.metricLabel}>Progress</Text>
                    <Text style={styles.metricValue}>
                      {item.attemptedCount} answered
                    </Text>
                  </View>
                  <View style={styles.metricItem}>
                    <Text style={styles.metricLabel}>Last Active</Text>
                    <Text style={styles.metricValue}>
                      {new Date(item.lastActiveAt).toLocaleTimeString()}
                    </Text>
                  </View>
                </View>

                {/* Device Info */}
                {item.deviceInfo ? (
                  <View style={styles.deviceRow}>
                    <Laptop size={13} color={colors.textMuted} />
                    <Text style={styles.deviceText}>{item.deviceInfo}</Text>
                  </View>
                ) : null}

                {/* Action Controls */}
                <View style={styles.actionButtonsRow}>
                  {isProcessing ? (
                    <View style={styles.actionLoadingWrap}>
                      <ActivityIndicator size="small" color={colors.primary} />
                      <Text style={styles.actionLoadingText}>Applying resolution...</Text>
                    </View>
                  ) : (
                    <>
                      {/* Force Submit Button */}
                      {!isAutoSubmitted && item.status !== 'SUBMITTED' && item.status !== 'FORCE_SUBMITTED' ? (
                        <Pressable
                          style={[styles.btnAction, styles.btnForceSubmit]}
                          onPress={() => handleForceSubmit(item)}>
                          <Send size={13} color={colors.danger} />
                          <Text style={[styles.btnActionText, styles.btnForceSubmitText]}>
                            Force Submit
                          </Text>
                        </Pressable>
                      ) : null}

                      {/* Add Time Button */}
                      {!isAutoSubmitted && item.status !== 'SUBMITTED' && item.status !== 'FORCE_SUBMITTED' ? (
                        <Pressable
                          style={[styles.btnAction, styles.btnExtendTime]}
                          onPress={() => void handleExtendTime(item, 15)}>
                          <Timer size={13} color={colors.primary} />
                          <Text style={[styles.btnActionText, styles.btnExtendTimeText]}>
                            +15m Time
                          </Text>
                        </Pressable>
                      ) : null}

                      {/* Reset Warnings Button - cannot reopen or modify submitted attempts */}
                      {!isAutoSubmitted && item.status !== 'SUBMITTED' && item.status !== 'FORCE_SUBMITTED' && hasViolations ? (
                        <Pressable
                          style={[styles.btnAction, styles.btnResetWarnings]}
                          onPress={() => void handleResetWarnings(item)}>
                          <RotateCcw size={13} color="#D97706" />
                          <Text style={[styles.btnActionText, styles.btnResetWarningsText]}>
                            Reset Warnings
                          </Text>
                        </Pressable>
                      ) : null}
                    </>
                  )}
                </View>
              </Card>
            );
          }}
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    padding: spacing.md,
    gap: spacing.sm,
  },
  controlsCard: {
    padding: spacing.md,
    gap: spacing.sm,
  },
  selectField: {
    marginBottom: spacing.xs,
  },
  filterRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  filterChip: {
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  filterChipActive: {
    backgroundColor: colors.primarySoft,
    borderColor: colors.primary,
  },
  filterChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textMuted,
  },
  filterChipTextActive: {
    color: colors.primary,
    fontWeight: '700',
  },
  feedbackBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    padding: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
  },
  feedbackSuccess: {
    backgroundColor: '#F0FDF4',
    borderColor: '#BBF7D0',
  },
  feedbackError: {
    backgroundColor: '#FEF2F2',
    borderColor: '#FECACA',
  },
  feedbackText: {
    fontSize: 12,
    fontWeight: '600',
    flex: 1,
  },
  feedbackTextSuccess: {
    color: '#15803D',
  },
  feedbackTextError: {
    color: '#B91C1C',
  },
  listContent: {
    gap: spacing.md,
    paddingBottom: 100,
  },
  sessionCard: {
    padding: spacing.lg,
    gap: spacing.sm,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  studentInfo: {
    gap: 2,
    flex: 1,
  },
  studentName: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '800',
  },
  studentId: {
    color: colors.textMuted,
    fontSize: 12,
  },
  examTitle: {
    color: colors.primaryDeep,
    fontSize: 14,
    fontWeight: '700',
  },
  reasonBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.xs,
    padding: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
  },
  reasonBoxNormal: {
    backgroundColor: '#F0F9FF',
    borderColor: '#BAE6FD',
  },
  reasonBoxWarning: {
    backgroundColor: '#FFFBEB',
    borderColor: '#FDE68A',
  },
  reasonBoxDanger: {
    backgroundColor: '#FEF2F2',
    borderColor: '#FECACA',
  },
  reasonTextWrap: {
    flex: 1,
    gap: 2,
  },
  reasonText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#B45309',
    lineHeight: 16,
  },
  reasonTextDanger: {
    color: '#B91C1C',
  },
  actionPromptText: {
    fontSize: 11,
    fontStyle: 'italic',
    color: colors.textMuted,
  },
  metricsGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: colors.surfaceMuted,
    padding: spacing.sm,
    borderRadius: radius.md,
  },
  metricItem: {
    alignItems: 'center',
    gap: 2,
  },
  metricLabel: {
    fontSize: 10,
    color: colors.textMuted,
    fontWeight: '600',
  },
  metricValue: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.text,
  },
  deviceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  deviceText: {
    fontSize: 11,
    color: colors.textMuted,
  },
  actionButtonsRow: {
    flexDirection: 'row',
    gap: spacing.xs,
    marginTop: spacing.xs,
    paddingTop: spacing.xs,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    flexWrap: 'wrap',
  },
  btnAction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
  },
  btnActionText: {
    fontSize: 12,
    fontWeight: '700',
  },
  btnForceSubmit: {
    backgroundColor: '#FEF2F2',
    borderColor: '#FECACA',
  },
  btnForceSubmitText: {
    color: colors.danger,
  },
  btnExtendTime: {
    backgroundColor: colors.primarySoft,
    borderColor: colors.primary,
  },
  btnExtendTimeText: {
    color: colors.primary,
  },
  btnResetWarnings: {
    backgroundColor: '#FFFBEB',
    borderColor: '#FDE68A',
  },
  btnResetWarningsText: {
    color: '#B45309',
  },
  actionLoadingWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.xs,
  },
  actionLoadingText: {
    fontSize: 12,
    color: colors.primary,
    fontWeight: '600',
  },
});
