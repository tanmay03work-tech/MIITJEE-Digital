import React from 'react';
import { Alert, ListRenderItem, StyleSheet, View } from 'react-native';
import { ShieldAlert } from 'lucide-react-native';
import { useFocusEffect } from '@react-navigation/native';

import { AdminPagedList } from '../../components/admin/AdminPagedList';
import { AppHeader } from '../../components/common/AppHeader';
import { EmptyState } from '../../components/common/EmptyState';
import { Screen } from '../../components/common/Screen';
import { BatchAccessEmptyState, BatchAccessRequestCard } from '../../components/admin/AdminInboxCards';
import { useAppStore } from '../../store/appStore';
import { useAuthStore } from '../../store/authStore';
import { spacing } from '../../theme';
import { EnrollmentQueryRecord } from '../../types';

export function BatchAccessRequestsScreen() {
  const user = useAuthStore((state) => state.user);
  const batches = useAppStore((state) => state.batches);
  const enrollmentQueries = useAppStore((state) => state.enrollmentQueries);
  const deleteEnrollmentQuery = useAppStore((state) => state.deleteEnrollmentQuery);
  const assignBatch = useAppStore((state) => state.assignBatch);
  const loadAdminData = useAppStore((state) => state.loadAdminData);
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

  const renderRequest = React.useCallback<ListRenderItem<EnrollmentQueryRecord>>(
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
        <AppHeader title="Batch Access Requests" subtitle="Available only for approved admins" />
        <View style={styles.emptyStateWrap}>
          <EmptyState
            icon={ShieldAlert}
            title="Admin access required"
            description="Only approved admins can review batch access requests."
          />
        </View>
      </Screen>
    );
  }

  return (
    <Screen useScrollView={false}>
      <AdminPagedList
        data={enrollmentQueries}
        keyExtractor={(item) => item.id}
        renderItem={renderRequest}
        emptyState={<BatchAccessEmptyState />}
        headerComponent={<AppHeader title="Batch Access Requests" subtitle="Separate review queue for students asking batch access" />}
        contentContainerStyle={styles.list}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  list: {
    paddingHorizontal: spacing.xl,
    gap: spacing.md,
  },
  emptyStateWrap: {
    paddingHorizontal: spacing.xl,
  },
});
