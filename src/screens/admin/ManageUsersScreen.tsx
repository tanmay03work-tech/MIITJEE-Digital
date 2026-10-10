import React, { memo, useCallback, useMemo, useState } from 'react';
import { Alert, FlatList, ListRenderItem, StyleSheet, Text, View } from 'react-native';
import { Check, ShieldAlert } from 'lucide-react-native';
import { useFocusEffect } from '@react-navigation/native';

import { fetchUsersPage } from '../../services/api/admin';
import { AdminListSkeleton } from '../../components/admin/AdminListSkeleton';
import { AppHeader } from '../../components/common/AppHeader';
import { Badge } from '../../components/common/Badge';
import { EmptyState } from '../../components/common/EmptyState';
import { Screen } from '../../components/common/Screen';
import { AnimatedPressable } from '../../components/common/AnimatedPressable';
import { Card } from '../../components/common/Card';
import { InputField } from '../../components/common/InputField';
import { SelectField } from '../../components/common/SelectField';
import { useAppStore } from '../../store/appStore';
import { useAuthStore } from '../../store/authStore';
import { colors, radius, spacing } from '../../theme';
import { AppUser } from '../../types';

const PAGE_SIZE = 20;

type ManageUserListItem =
  | { id: string; type: 'section'; title: string; description: string }
  | { id: string; type: 'student'; user: AppUser }
  | { id: string; type: 'admin'; user: AppUser };

interface StudentAccessCardProps {
  user: AppUser;
  onAssignBatch: (user: AppUser, value: string) => Promise<void>;
  batchOptions: Array<{ label: string; value: string; description?: string }>;
}

interface AdminApprovalCardProps {
  user: AppUser;
  onApprove: (user: AppUser) => Promise<void>;
  isApproving?: boolean;
}

const StudentAccessCard = memo(function StudentAccessCard({ user, onAssignBatch, batchOptions }: StudentAccessCardProps) {
  return (
    <Card style={styles.userCard}>
      <View style={styles.cardHeader}>
        <View style={styles.userInfo}>
          <Text style={styles.userName}>{user.fullName}</Text>
          <Text style={styles.userEmail}>{user.email}</Text>
        </View>
        <Badge label={user.role === 'miitjee_student' ? 'miitjee' : 'student'} tone={user.role === 'miitjee_student' ? 'success' : 'neutral'} />
      </View>

      <View style={styles.metaRow}>
        <View style={styles.metaPill}>
          <Text style={styles.metaLabel}>Current Batch</Text>
          <Text style={styles.metaValue}>{user.batchId ?? 'Scholarship Only'}</Text>
        </View>
      </View>

      <SelectField
        label="Assign Batch Access"
        placeholder="Assign batch"
        value={user.batchId ?? '__student__'}
        menuTitle={`Assign batch for ${user.fullName}`}
        options={batchOptions}
        onValueChange={(value) => {
          void onAssignBatch(user, value);
        }}
      />
    </Card>
  );
});

const AdminApprovalCard = memo(function AdminApprovalCard({ user, onApprove, isApproving }: AdminApprovalCardProps) {
  return (
    <Card style={styles.userCard}>
      <View style={styles.cardHeader}>
        <View style={styles.userInfo}>
          <Text style={styles.userName}>{user.fullName}</Text>
          <Text style={styles.userEmail}>{user.email}</Text>
        </View>
        {user.approvalStatus === 'pending' ? (
          <AnimatedPressable
            style={[styles.approveButton, isApproving && { opacity: 0.6 }]}
            disabled={isApproving}
            onPress={() => void onApprove(user)}>
            <Text style={styles.approveButtonText}>{isApproving ? 'Approving...' : 'Approve Admin'}</Text>
          </AnimatedPressable>
        ) : (
          <Badge label="approved" tone="success" />
        )}
      </View>
      <Text style={styles.adminHelper}>
        {user.approvalStatus === 'pending'
          ? 'Pending admin accounts stay read-only until you approve them.'
          : 'This admin account is already approved and can access the full panel.'}
      </Text>
    </Card>
  );
});

const SectionMarker = memo(function SectionMarker({ title, description }: { title: string; description: string }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <Text style={styles.sectionSubtitle}>{description}</Text>
    </View>
  );
});

export function ManageUsersScreen() {
  const currentUser = useAuthStore((state) => state.user);
  const batches = useAppStore((state) => state.batches);
  const assignBatch = useAppStore((state) => state.assignBatch);
  const approveAdmin = useAppStore((state) => state.approveAdmin);
  const isAdmin = currentUser?.role === 'admin' && currentUser.approvalStatus === 'approved';

  const [users, setUsers] = useState<AppUser[]>([]);
  const [searchDraft, setSearchDraft] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [filter, setFilter] = useState<'all' | 'students' | 'admin_pending' | 'admin_approved'>('all');
  const [loadingInitial, setLoadingInitial] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);

  const usersRef = React.useRef<AppUser[]>([]);
  usersRef.current = users;

  const loadUsersPage = useCallback(
    async (reset: boolean, searchValue: string) => {
      const offset = reset ? 0 : usersRef.current.length;
      const loader = reset ? setLoadingInitial : setLoadingMore;
      loader(true);
      try {
        const rows = await fetchUsersPage({
          offset,
          limit: PAGE_SIZE,
          search: searchValue,
        });
        setUsers((current) => {
          const next = reset ? rows : [...current, ...rows];
          usersRef.current = next;
          return next;
        });
        setHasMore(rows.length === PAGE_SIZE);
      } catch (error) {
        Alert.alert('Unable to load users', error instanceof Error ? error.message : 'Please try again.');
      } finally {
        loader(false);
      }
    },
    [],
  );

  useFocusEffect(
    React.useCallback(() => {
      if (!isAdmin) {
        return undefined;
      }
      void loadUsersPage(true, searchTerm);
      return undefined;
    }, [isAdmin, loadUsersPage, searchTerm]),
  );

  const filteredUsers = useMemo(() => {
    const normalizedSearch = searchTerm.trim().toLowerCase();
    const searchedUsers =
      normalizedSearch.length === 0
        ? users
        : users.filter((entry) =>
            [entry.fullName, entry.email].some((value) => value.toLowerCase().includes(normalizedSearch)),
          );

    if (filter === 'all') {
      return searchedUsers;
    }
    if (filter === 'students') {
      return searchedUsers.filter((entry) => entry.role !== 'admin');
    }
    if (filter === 'admin_pending') {
      return searchedUsers.filter((entry) => entry.role === 'admin' && entry.approvalStatus === 'pending');
    }
    return searchedUsers.filter((entry) => entry.role === 'admin' && entry.approvalStatus === 'approved');
  }, [filter, searchTerm, users]);

  const studentUsers = useMemo(() => filteredUsers.filter((user) => user.role !== 'admin'), [filteredUsers]);
  const adminUsers = useMemo(() => filteredUsers.filter((user) => user.role === 'admin'), [filteredUsers]);

  const batchOptions = useMemo(
    () => [
      {
        label: 'Keep As Student',
        value: '__student__',
        description: 'Scholarship-only access without weekly paper unlock.',
      },
      ...batches.map((batch) => ({
        label: batch.label,
        value: batch.id,
        description: `${batch.targetExam} | ${batch.classLabel}`,
      })),
    ],
    [batches],
  );

  const items = useMemo<ManageUserListItem[]>(() => {
    const nextItems: ManageUserListItem[] = [];
    if (studentUsers.length > 0) {
      nextItems.push({
        id: 'students-section',
        type: 'section',
        title: 'Student Access Queue',
        description:
          'New signups remain `student` by default. Assign a batch and MIITJEE role only when weekly paper access should open.',
      });
      nextItems.push(...studentUsers.map((entry) => ({ id: `student-${entry.id}`, type: 'student' as const, user: entry })));
    }
    if (adminUsers.length > 0) {
      nextItems.push({
        id: 'admins-section',
        type: 'section',
        title: 'Admin Approvals',
        description: 'Pending admin accounts stay reviewable in the same virtualized feed for faster moderation.',
      });
      nextItems.push(...adminUsers.map((entry) => ({ id: `admin-${entry.id}`, type: 'admin' as const, user: entry })));
    }
    return nextItems;
  }, [adminUsers, studentUsers]);

  const handleAssignBatch = useCallback(
    async (targetUser: AppUser, value: string) => {
      try {
        if (value === '__student__') {
          const updated = await assignBatch({
            userId: targetUser.id,
            batchId: undefined,
            promoteToMiitjeeStudent: false,
          });
          setUsers((current) => current.map((entry) => (entry.id === updated.id ? updated : entry)));
          Alert.alert('Moved to student access', `${targetUser.fullName} now remains on scholarship-only access.`);
          return;
        }

        const selectedBatch = batches.find((batch) => batch.id === value);
        const updated = await assignBatch({
          userId: targetUser.id,
          batchId: value,
          promoteToMiitjeeStudent: true,
        });
        setUsers((current) => current.map((entry) => (entry.id === updated.id ? updated : entry)));
        Alert.alert('Access updated', `${targetUser.fullName} can now attempt ${selectedBatch?.label ?? value} weekly papers.`);
      } catch (error) {
        Alert.alert('Assignment failed', error instanceof Error ? error.message : 'Unable to assign this batch.');
      }
    },
    [assignBatch, batches],
  );

  const [approvingUserId, setApprovingUserId] = useState<string | null>(null);

  const handleApprove = useCallback(
    async (targetUser: AppUser) => {
      if (approvingUserId) return;
      try {
        setApprovingUserId(targetUser.id);
        const updated = await approveAdmin(targetUser.id);
        setUsers((current) => current.map((entry) => (entry.id === updated.id ? updated : entry)));
        Alert.alert('Approved', `${targetUser.fullName} now has admin access.`);
      } catch (error) {
        Alert.alert('Approval failed', error instanceof Error ? error.message : 'Unable to approve this account.');
      } finally {
        setApprovingUserId(null);
      }
    },
    [approveAdmin, approvingUserId],
  );

  const renderItem = useCallback<ListRenderItem<ManageUserListItem>>(
    ({ item }) => {
      if (item.type === 'section') {
        return <SectionMarker title={item.title} description={item.description} />;
      }

      if (item.type === 'student') {
        return <StudentAccessCard user={item.user} onAssignBatch={handleAssignBatch} batchOptions={batchOptions} />;
      }

      return (
        <AdminApprovalCard
          user={item.user}
          onApprove={handleApprove}
          isApproving={approvingUserId === item.user.id}
        />
      );
    },
    [approvingUserId, batchOptions, handleApprove, handleAssignBatch],
  );

  const handleSearchSubmit = useCallback(() => {
    const normalizedValue = searchDraft.trim();
    setSearchTerm(normalizedValue);
    void loadUsersPage(true, normalizedValue);
  }, [loadUsersPage, searchDraft]);

  const handleLoadMore = useCallback(() => {
    if (loadingInitial || loadingMore || !hasMore) {
      return;
    }
    void loadUsersPage(false, searchTerm);
  }, [hasMore, loadUsersPage, loadingInitial, loadingMore, searchTerm]);

  if (!isAdmin) {
    return (
      <Screen>
        <AppHeader title="Manage Access" subtitle="Available only for approved admins" />
        <View style={styles.emptyStateWrap}>
          <EmptyState
            icon={ShieldAlert}
            title="Admin access required"
            description="Only approved admins can assign MIITJEE batch access and manage weekly paper visibility."
          />
        </View>
      </Screen>
    );
  }

  return (
    <Screen useScrollView={false}>
      {loadingInitial ? (
        <>
          <AppHeader title="Manage Access" subtitle="Grant student batch access and approve admin accounts from one faster moderation feed" />
          <View style={styles.controlsWrap}>
            <InputField
              label="Search users"
              value={searchDraft}
              onChangeText={setSearchDraft}
              placeholder="Name or email"
              returnKeyType="search"
              onSubmitEditing={handleSearchSubmit}
              rightAccessory={
                <AnimatedPressable style={styles.searchActionButton} onPress={handleSearchSubmit}>
                  <Check size={18} color={colors.white} />
                </AnimatedPressable>
              }
            />
          </View>
          <AdminListSkeleton rows={5} />
        </>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          onEndReachedThreshold={0.3}
          onEndReached={handleLoadMore}
          ListHeaderComponent={
            <>
              <AppHeader title="Manage Access" subtitle="Grant student batch access and approve admin accounts from one faster moderation feed" />
              <View style={styles.controlsWrap}>
                <InputField
                  label="Search users"
                  value={searchDraft}
                  onChangeText={setSearchDraft}
                  placeholder="Name or email"
                  returnKeyType="search"
                  onSubmitEditing={handleSearchSubmit}
                  rightAccessory={
                    <AnimatedPressable style={styles.searchActionButton} onPress={handleSearchSubmit}>
                      <Check size={18} color={colors.white} />
                    </AnimatedPressable>
                  }
                />
                <View style={styles.filterRow}>
                  {[
                    { id: 'all', label: 'All' },
                    { id: 'students', label: 'Students' },
                    { id: 'admin_pending', label: 'Admin Pending' },
                    { id: 'admin_approved', label: 'Admin Approved' },
                  ].map((entry) => (
                    <AnimatedPressable
                      key={`filter-${entry.id}`}
                      style={[styles.filterChip, filter === entry.id && styles.filterChipActive]}
                      onPress={() => setFilter(entry.id as typeof filter)}>
                      <Text style={[styles.filterText, filter === entry.id && styles.filterTextActive]}>{entry.label}</Text>
                    </AnimatedPressable>
                  ))}
                </View>
              </View>
            </>
          }
          ListEmptyComponent={
            <View style={styles.emptyStateWrap}>
              <EmptyState
                icon={ShieldAlert}
                title="No users to manage yet"
                description="Once students or admins sign up, they will appear here for access review."
              />
            </View>
          }
          ListFooterComponent={loadingMore ? <AdminListSkeleton rows={1} /> : <View style={styles.footerSpace} />}
          contentContainerStyle={styles.content}
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
  content: {
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
  searchActionButton: {
    width: 38,
    height: 38,
    borderRadius: radius.pill,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
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
  section: {
    paddingHorizontal: spacing.xl,
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  emptyStateWrap: {
    paddingHorizontal: spacing.xl,
  },
  sectionTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '800',
  },
  sectionSubtitle: {
    color: colors.textMuted,
    fontSize: 13,
    lineHeight: 19,
  },
  userCard: {
    marginHorizontal: spacing.xl,
    marginBottom: spacing.md,
    gap: spacing.md,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: spacing.md,
  },
  userInfo: {
    flex: 1,
  },
  userName: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '800',
  },
  userEmail: {
    color: colors.textMuted,
    fontSize: 12,
    marginTop: spacing.xs,
  },
  metaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  metaPill: {
    minWidth: 140,
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceMuted,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  metaLabel: {
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  metaValue: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '700',
    marginTop: spacing.xs,
  },
  approveButton: {
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  approveButtonText: {
    color: colors.white,
    fontSize: 13,
    fontWeight: '800',
  },
  adminHelper: {
    color: colors.textMuted,
    fontSize: 13,
    lineHeight: 19,
  },
  footerSpace: {
    height: spacing.md,
  },
});
