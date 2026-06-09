import React from 'react';
import { ListRenderItem, StyleSheet, View } from 'react-native';
import { ShieldAlert } from 'lucide-react-native';
import { useFocusEffect } from '@react-navigation/native';

import { AdminPagedList } from '../../components/admin/AdminPagedList';
import { AppHeader } from '../../components/common/AppHeader';
import { EmptyState } from '../../components/common/EmptyState';
import { Screen } from '../../components/common/Screen';
import { ScholarshipEmptyState, ScholarshipRegistrationCard } from '../../components/admin/AdminInboxCards';
import { useAppStore } from '../../store/appStore';
import { useAuthStore } from '../../store/authStore';
import { spacing } from '../../theme';
import { ScholarshipRegistrationRecord } from '../../types';

export function ScholarshipRegistrationsScreen() {
  const user = useAuthStore((state) => state.user);
  const scholarshipRegistrations = useAppStore((state) => state.scholarshipRegistrations);
  const deleteScholarshipRegistration = useAppStore((state) => state.deleteScholarshipRegistration);
  const loadAdminData = useAppStore((state) => state.loadAdminData);
  const isAdmin = user?.role === 'admin' && user.approvalStatus === 'approved';
  const renderRegistration = React.useCallback<ListRenderItem<ScholarshipRegistrationRecord>>(
    ({ item }) => <ScholarshipRegistrationCard registration={item} onDelete={deleteScholarshipRegistration} />,
    [deleteScholarshipRegistration],
  );

  useFocusEffect(
    React.useCallback(() => {
      if (!isAdmin || !user) {
        return undefined;
      }

      void loadAdminData(user);
      return undefined;
    }, [isAdmin, loadAdminData, user]),
  );

  if (!isAdmin) {
    return (
      <Screen>
        <AppHeader title="Scholarship Registrations" subtitle="Available only for approved admins" />
        <View style={styles.emptyStateWrap}>
          <EmptyState
            icon={ShieldAlert}
            title="Admin access required"
            description="Only approved admins can review scholarship registrations."
          />
        </View>
      </Screen>
    );
  }

  return (
    <Screen useScrollView={false}>
      <AdminPagedList
        data={scholarshipRegistrations}
        keyExtractor={(item) => item.id}
        renderItem={renderRegistration}
        emptyState={<ScholarshipEmptyState />}
        headerComponent={<AppHeader title="Scholarship Registrations" subtitle="Dedicated queue for scholarship signups and applicant details" />}
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
