import React, { useState } from 'react';
import { Alert, ListRenderItem, StyleSheet, Text, View } from 'react-native';
import { ShieldAlert } from 'lucide-react-native';
import { useFocusEffect } from '@react-navigation/native';

import { AdminPagedList } from '../../components/admin/AdminPagedList';
import { AppHeader } from '../../components/common/AppHeader';
import { EmptyState } from '../../components/common/EmptyState';
import { Screen } from '../../components/common/Screen';
import { AnimatedPressable } from '../../components/common/AnimatedPressable';
import {
  BatchAccessEmptyState,
  BatchAccessRequestCard,
  ReattemptEmptyState,
  ReattemptRequestCard,
} from '../../components/admin/AdminInboxCards';
import { useAppStore } from '../../store/appStore';
import { useAuthStore } from '../../store/authStore';
import { colors, radius, spacing } from '../../theme';
import { EnrollmentQueryRecord, ReattemptRequestRecord } from '../../types';

type TabMode = 'batch' | 'reattempt';

export function BatchAccessRequestsScreen() {
  const user = useAuthStore((state) => state.user);
  const batches = useAppStore((state) => state.batches);
  const enrollmentQueries = useAppStore((state) => state.enrollmentQueries);
  const reattemptRequests = useAppStore((state) => state.reattemptRequests);
  const deleteEnrollmentQuery = useAppStore((state) => state.deleteEnrollmentQuery);
  const assignBatch = useAppStore((state) => state.assignBatch);
  const updateReattemptRequestStatus = useAppStore((state) => state.updateReattemptRequestStatus);
  const deleteReattemptRequest = useAppStore((state) => state.deleteReattemptRequest);
  const loadAdminData = useAppStore((state) => state.loadAdminData);
  const [activeTab, setActiveTab] = useState<TabMode>('batch');
  const isAdmin = user?.role === 'admin' && user.approvalStatus === 'approved';

  const batchOptions = React.useMemo(
    () =>
      batches.map((batch) => ({
        label: batch.label,
        value: batch.id,
        description: `${batch.targetExam} | ${batch.classLabel}`,
      })),
    [batches],
  );

  const handleAssignBatch = React.useCallback(
    async (request: EnrollmentQueryRecord, value: string) => {
      try {
        const selectedBatch = batches.find((batch) => batch.id === value);
        await assignBatch({
          userId: request.userId,
          batchId: value,
          promoteToMiitjeeStudent: true,
        });
        Alert.alert('Batch role granted', `${request.fullName} can now access ${selectedBatch?.label ?? value}.`);
      } catch (error) {
        Alert.alert('Assignment failed', error instanceof Error ? error.message : 'Unable to grant this batch role.');
      }
    },
    [assignBatch, batches],
  );

  const handleApproveReattempt = React.useCallback(
    async (requestId: string) => {
      await updateReattemptRequestStatus(requestId, 'approved');
    },
    [updateReattemptRequestStatus],
  );

  const handleRejectReattempt = React.useCallback(
    async (requestId: string) => {
      await updateReattemptRequestStatus(requestId, 'rejected');
    },
    [updateReattemptRequestStatus],
  );

  const renderBatchRequest = React.useCallback<ListRenderItem<EnrollmentQueryRecord>>(
    ({ item }) => (
      <BatchAccessRequestCard
        request={item}
        onDelete={deleteEnrollmentQuery}
        onAssignBatch={handleAssignBatch}
        batchOptions={batchOptions}
      />
    ),
    [batchOptions, deleteEnrollmentQuery, handleAssignBatch],
  );

  const renderReattemptRequest = React.useCallback<ListRenderItem<ReattemptRequestRecord>>(
    ({ item }) => (
      <ReattemptRequestCard
        request={item}
        onApprove={handleApproveReattempt}
        onReject={handleRejectReattempt}
        onDelete={deleteReattemptRequest}
      />
    ),
    [deleteReattemptRequest, handleApproveReattempt, handleRejectReattempt],
  );

  useFocusEffect(
    React.useCallback(() => {
      if (!isAdmin || !user) {
        return undefined;
      }

      void loadAdminData(user, true);
      return undefined;
    }, [isAdmin, loadAdminData, user]),
  );

  if (!isAdmin) {
    return (
      <Screen>
        <AppHeader title="Access & Re-attempt Requests" subtitle="Available only for approved admins" />
        <View style={styles.emptyStateWrap}>
          <EmptyState
            icon={ShieldAlert}
            title="Admin access required"
            description="Only approved admins can review requests."
          />
        </View>
      </Screen>
    );
  }

  return (
    <Screen useScrollView={false}>
      <View style={styles.headerWrap}>
        <AppHeader
          title="Requests & Approvals"
          subtitle="Manage student batch enrollments and test re-attempt requests"
        />
        <View style={styles.tabBar}>
          <AnimatedPressable
            style={[styles.tabButton, activeTab === 'batch' && styles.tabButtonActive]}
            onPress={() => setActiveTab('batch')}>
            <Text style={[styles.tabText, activeTab === 'batch' && styles.tabTextActive]}>
              Batch Requests ({enrollmentQueries.length})
            </Text>
          </AnimatedPressable>
          <AnimatedPressable
            style={[styles.tabButton, activeTab === 'reattempt' && styles.tabButtonActive]}
            onPress={() => setActiveTab('reattempt')}>
            <Text style={[styles.tabText, activeTab === 'reattempt' && styles.tabTextActive]}>
              Re-attempts ({reattemptRequests.length})
            </Text>
          </AnimatedPressable>
        </View>
      </View>

      {activeTab === 'batch' ? (
        <AdminPagedList
          data={enrollmentQueries}
          keyExtractor={(item) => item.id}
          renderItem={renderBatchRequest}
          emptyState={<BatchAccessEmptyState />}
          contentContainerStyle={styles.list}
        />
      ) : (
        <AdminPagedList
          data={reattemptRequests}
          keyExtractor={(item) => item.id}
          renderItem={renderReattemptRequest}
          emptyState={<ReattemptEmptyState />}
          contentContainerStyle={styles.list}
        />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  headerWrap: {
    gap: spacing.md,
  },
  tabBar: {
    flexDirection: 'row',
    marginHorizontal: spacing.xl,
    padding: spacing.xs,
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.lg,
    gap: spacing.xs,
  },
  tabButton: {
    flex: 1,
    paddingVertical: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
  },
  tabButtonActive: {
    backgroundColor: colors.primary,
  },
  tabText: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.textMuted,
  },
  tabTextActive: {
    color: colors.white,
  },
  list: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.md,
    gap: spacing.md,
  },
  emptyStateWrap: {
    paddingHorizontal: spacing.xl,
  },
});

