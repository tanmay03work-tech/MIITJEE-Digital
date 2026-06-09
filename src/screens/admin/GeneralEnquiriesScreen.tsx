import React from 'react';
import { ListRenderItem, StyleSheet, View } from 'react-native';
import { ShieldAlert } from 'lucide-react-native';
import { useFocusEffect } from '@react-navigation/native';

import { AdminPagedList } from '../../components/admin/AdminPagedList';
import { AppHeader } from '../../components/common/AppHeader';
import { EmptyState } from '../../components/common/EmptyState';
import { Screen } from '../../components/common/Screen';
import { GeneralEnquiryCard, GeneralEnquiryEmptyState } from '../../components/admin/AdminInboxCards';
import { useAppStore } from '../../store/appStore';
import { useAuthStore } from '../../store/authStore';
import { spacing } from '../../theme';
import { EnquiryRecord } from '../../types';

export function GeneralEnquiriesScreen() {
  const user = useAuthStore((state) => state.user);
  const enquiries = useAppStore((state) => state.enquiries);
  const deleteGeneralEnquiry = useAppStore((state) => state.deleteGeneralEnquiry);
  const loadAdminData = useAppStore((state) => state.loadAdminData);
  const isAdmin = user?.role === 'admin' && user.approvalStatus === 'approved';
  const renderEnquiry = React.useCallback<ListRenderItem<EnquiryRecord>>(
    ({ item }) => <GeneralEnquiryCard enquiry={item} onDelete={deleteGeneralEnquiry} />,
    [deleteGeneralEnquiry],
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
        <AppHeader title="General Enquiries" subtitle="Available only for approved admins" />
        <View style={styles.emptyStateWrap}>
          <EmptyState
            icon={ShieldAlert}
            title="Admin access required"
            description="Only approved admins can review general enquiries."
          />
        </View>
      </Screen>
    );
  }

  return (
    <Screen useScrollView={false}>
      <AdminPagedList
        data={enquiries}
        keyExtractor={(item) => item.id}
        renderItem={renderEnquiry}
        emptyState={<GeneralEnquiryEmptyState />}
        headerComponent={<AppHeader title="General Enquiries" subtitle="Admission and support messages in a dedicated tab" />}
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
