import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  FlatList,
  ListRenderItem,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  Filter,
  Info,
  Laptop,
  Search,
  ShieldAlert,
  XCircle,
} from 'lucide-react-native';
import { useFocusEffect } from '@react-navigation/native';

import { AppHeader } from '../../components/common/AppHeader';
import { Card } from '../../components/common/Card';
import { EmptyState } from '../../components/common/EmptyState';
import { Screen } from '../../components/common/Screen';
import { fetchActivityLogs } from '../../services/api/admin';
import { useAuthStore } from '../../store/authStore';
import { colors, radius, spacing } from '../../theme';
import { ActivityLogCategory, ActivityLogEntry, ActivityLogStatus } from '../../types';

type CategoryFilter = 'all' | ActivityLogCategory;

export function ActivityLogsScreen() {
  const user = useAuthStore((state) => state.user);
  const isAdmin = user?.role === 'admin' && user.approvalStatus === 'approved';

  const [logs, setLogs] = useState<ActivityLogEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [activeCategory, setActiveCategory] = useState<CategoryFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedLogId, setExpandedLogId] = useState<string | null>(null);

  const loadLogs = useCallback(
    async (category: CategoryFilter = activeCategory, refresh = false) => {
      if (refresh) {
        setIsRefreshing(true);
      } else {
        setIsLoading(true);
      }

      try {
        const fetched = await fetchActivityLogs({
          category: category === 'all' ? undefined : category,
          limit: 100,
        });
        setLogs(fetched);
      } catch {
        setLogs([]);
      } finally {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    },
    [activeCategory],
  );

  useFocusEffect(
    useCallback(() => {
      if (isAdmin) {
        void loadLogs(activeCategory);
      }
    }, [activeCategory, isAdmin, loadLogs]),
  );

  const handleCategoryChange = (category: CategoryFilter) => {
    setActiveCategory(category);
    void loadLogs(category);
  };

  const filteredLogs = useMemo(() => {
    if (!searchQuery.trim()) {
      return logs;
    }

    const query = searchQuery.toLowerCase().trim();
    return logs.filter((log) => {
      const studentName = (log.studentName || '').toLowerCase();
      const eventType = (log.eventType || '').toLowerCase();
      const userId = (log.userId || '').toLowerCase();
      const reason = String(log.details?.reason || '').toLowerCase();
      return (
        studentName.includes(query) ||
        eventType.includes(query) ||
        userId.includes(query) ||
        reason.includes(query)
      );
    });
  }, [logs, searchQuery]);

  const renderLogItem = useCallback<ListRenderItem<ActivityLogEntry>>(
    ({ item }) => {
      const isExpanded = expandedLogId === item.id;
      const formattedDate = formatDate(item.createdAt);
      const statusConfig = getStatusConfig(item.status);
      const StatusIcon = statusConfig.icon;

      const reason = item.details?.reason ? String(item.details.reason) : null;
      const suggestedFix = item.details?.suggested_fix ? String(item.details.suggested_fix) : null;
      const testTitle = item.details?.test_title ? String(item.details.test_title) : null;

      return (
        <Card style={styles.logCard}>
          <Pressable
            style={styles.cardHeader}
            onPress={() => setExpandedLogId(isExpanded ? null : item.id)}>
            <View style={styles.cardHeaderTop}>
              <View style={[styles.statusBadge, { backgroundColor: statusConfig.bgColor }]}>
                <StatusIcon size={13} color={statusConfig.color} />
                <Text style={[styles.statusText, { color: statusConfig.color }]}>
                  {formatEventType(item.eventType)}
                </Text>
              </View>
              <Text style={styles.timestamp}>{formattedDate}</Text>
            </View>

            <View style={styles.cardMainInfo}>
              <Text style={styles.studentName}>
                {item.studentName || item.userId || 'System Event'}
              </Text>
              {item.deviceInfo ? (
                <View style={styles.deviceRow}>
                  <Laptop size={12} color={colors.textMuted} />
                  <Text style={styles.deviceText}>{item.deviceInfo}</Text>
                </View>
              ) : null}
            </View>

            {reason ? (
              <View style={styles.reasonWrap}>
                <Text style={styles.reasonLabel}>Reason:</Text>
                <Text style={styles.reasonValue}>{reason}</Text>
              </View>
            ) : null}

            <View style={styles.expandToggle}>
              <Text style={styles.expandToggleText}>
                {isExpanded ? 'Hide Details' : 'View Details'}
              </Text>
              {isExpanded ? (
                <ChevronUp size={14} color={colors.primary} />
              ) : (
                <ChevronDown size={14} color={colors.primary} />
              )}
            </View>
          </Pressable>

          {isExpanded ? (
            <View style={styles.expandedDetails}>
              {item.userId ? (
                <DetailRow label="Student / User ID" value={item.userId} />
              ) : null}
              <DetailRow label="Category" value={item.category.toUpperCase()} />
              <DetailRow label="Event Code" value={item.eventType} />

              {testTitle ? <DetailRow label="Test Paper" value={testTitle} /> : null}

              {suggestedFix ? (
                <View style={styles.fixBox}>
                  <Text style={styles.fixLabel}>Suggested Fix:</Text>
                  <Text style={styles.fixText}>{suggestedFix}</Text>
                </View>
              ) : null}

              {item.details && Object.keys(item.details).length > 0 ? (
                <View style={styles.jsonBox}>
                  <Text style={styles.jsonLabel}>Raw Details:</Text>
                  <Text style={styles.jsonText}>{JSON.stringify(item.details, null, 2)}</Text>
                </View>
              ) : null}
            </View>
          ) : null}
        </Card>
      );
    },
    [expandedLogId],
  );

  if (!isAdmin) {
    return (
      <Screen>
        <AppHeader title="Activity Logs" subtitle="Restricted to approved admins" showLogo={false} />
        <View style={styles.emptyWrap}>
          <EmptyState
            icon={ShieldAlert}
            title="Admin access required"
            description="Only approved admins can view system operational logs."
          />
        </View>
      </Screen>
    );
  }

  return (
    <Screen useScrollView={false}>
      <FlatList
        style={styles.flex}
        data={filteredLogs}
        keyExtractor={(item) => item.id}
        renderItem={renderLogItem}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={() => void loadLogs(activeCategory, true)}
            tintColor={colors.primary}
          />
        }
        ListHeaderComponent={
          <>
            <AppHeader
              title="Activity Logs"
              subtitle="Production login attempts, exam lifecycles & admin actions"
              showLogo={false}
              showBack={true}
            />

            {/* Category Filter Pills */}
            <View style={styles.pillContainer}>
              <FilterPill
                label="All Logs"
                active={activeCategory === 'all'}
                onPress={() => handleCategoryChange('all')}
              />
              <FilterPill
                label="Login & Auth"
                active={activeCategory === 'auth'}
                onPress={() => handleCategoryChange('auth')}
              />
              <FilterPill
                label="Exam Lifecycle"
                active={activeCategory === 'exam'}
                onPress={() => handleCategoryChange('exam')}
              />
              <FilterPill
                label="Admin Actions"
                active={activeCategory === 'admin_action'}
                onPress={() => handleCategoryChange('admin_action')}
              />
            </View>

            {/* Search Input */}
            <View style={styles.searchBar}>
              <Search size={16} color={colors.textMuted} />
              <TextInput
                style={styles.searchInput}
                placeholder="Search by name, ID, or failure reason..."
                placeholderTextColor={colors.textMuted}
                value={searchQuery}
                onChangeText={setSearchQuery}
              />
            </View>

            <View style={styles.countRow}>
              <Text style={styles.countText}>
                Showing {filteredLogs.length} event{filteredLogs.length === 1 ? '' : 's'}
              </Text>
            </View>
          </>
        }
        ListEmptyComponent={
          isLoading ? (
            <View style={styles.loadingWrap}>
              <Text style={styles.loadingText}>Fetching activity logs...</Text>
            </View>
          ) : (
            <View style={styles.emptyWrap}>
              <EmptyState
                icon={Clock}
                title="No Activity Logs Found"
                description={
                  searchQuery
                    ? 'No logs match your search query.'
                    : 'Important login, exam, and admin events will appear here automatically.'
                }
              />
            </View>
          )
        }
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
      />
    </Screen>
  );
}

// ─── Component Helpers ───────────────────────────────────────

function FilterPill({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      style={[styles.pill, active && styles.pillActive]}
      onPress={onPress}>
      <Text style={[styles.pillText, active && styles.pillTextActive]}>{label}</Text>
    </Pressable>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.detailRow}>
      <Text style={styles.detailLabel}>{label}:</Text>
      <Text style={styles.detailValue}>{value}</Text>
    </View>
  );
}

function formatEventType(type: string): string {
  return type
    .replace(/_/g, ' ')
    .toLowerCase()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function formatDate(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleString('en-IN', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    });
  } catch {
    return iso;
  }
}

function getStatusConfig(status: ActivityLogStatus) {
  switch (status) {
    case 'success':
      return {
        icon: CheckCircle2,
        color: '#059669',
        bgColor: '#D1FAE5',
      };
    case 'failed':
      return {
        icon: XCircle,
        color: '#DC2626',
        bgColor: '#FEE2E2',
      };
    case 'warning':
      return {
        icon: AlertTriangle,
        color: '#D97706',
        bgColor: '#FEF3C7',
      };
    case 'info':
    default:
      return {
        icon: Info,
        color: '#2563EB',
        bgColor: '#DBEAFE',
      };
  }
}

// ─── Styles ──────────────────────────────────────────────────

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  listContent: {
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.xxxl,
  },
  pillContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  pill: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  pillActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  pillText: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '700',
  },
  pillTextActive: {
    color: colors.white,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    gap: spacing.sm,
    marginBottom: spacing.md,
    height: 42,
  },
  searchInput: {
    flex: 1,
    color: colors.text,
    fontSize: 13,
  },
  countRow: {
    marginBottom: spacing.md,
  },
  countText: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '600',
  },
  logCard: {
    marginBottom: spacing.md,
    padding: spacing.md,
  },
  cardHeader: {
    gap: spacing.xs,
  },
  cardHeaderTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.pill,
  },
  statusText: {
    fontSize: 11,
    fontWeight: '800',
  },
  timestamp: {
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: '600',
  },
  cardMainInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.xs,
  },
  studentName: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '800',
  },
  deviceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  deviceText: {
    color: colors.textMuted,
    fontSize: 11,
  },
  reasonWrap: {
    marginTop: spacing.xs,
    backgroundColor: '#FEF2F2',
    padding: spacing.sm,
    borderRadius: radius.sm,
    borderLeftWidth: 3,
    borderLeftColor: '#EF4444',
  },
  reasonLabel: {
    color: '#991B1B',
    fontSize: 11,
    fontWeight: '800',
  },
  reasonValue: {
    color: '#7F1D1D',
    fontSize: 12,
    marginTop: 2,
    lineHeight: 16,
  },
  expandToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: spacing.xs,
  },
  expandToggleText: {
    color: colors.primary,
    fontSize: 12,
    fontWeight: '700',
  },
  expandedDetails: {
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    gap: spacing.xs,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  detailLabel: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '600',
  },
  detailValue: {
    color: colors.text,
    fontSize: 12,
    fontWeight: '700',
  },
  fixBox: {
    backgroundColor: '#ECFDF5',
    padding: spacing.sm,
    borderRadius: radius.sm,
    marginTop: spacing.xs,
    borderLeftWidth: 3,
    borderLeftColor: '#10B981',
  },
  fixLabel: {
    color: '#065F46',
    fontSize: 11,
    fontWeight: '800',
  },
  fixText: {
    color: '#047857',
    fontSize: 12,
    marginTop: 2,
    lineHeight: 16,
  },
  jsonBox: {
    backgroundColor: colors.background,
    padding: spacing.sm,
    borderRadius: radius.sm,
    marginTop: spacing.xs,
  },
  jsonLabel: {
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: '700',
  },
  jsonText: {
    color: colors.text,
    fontSize: 11,
    fontFamily: 'monospace',
    marginTop: 4,
  },
  loadingWrap: {
    padding: spacing.xxl,
    alignItems: 'center',
  },
  loadingText: {
    color: colors.textMuted,
    fontSize: 13,
  },
  emptyWrap: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.xl,
  },
});
