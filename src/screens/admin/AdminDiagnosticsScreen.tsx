import React, { useCallback, useEffect, useState } from 'react';
import { FlatList, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { Activity, AlertTriangle, ShieldAlert, Smartphone, WifiOff } from 'lucide-react-native';

import { AppHeader } from '../../components/common/AppHeader';
import { Badge } from '../../components/common/Badge';
import { Card } from '../../components/common/Card';
import { EmptyState } from '../../components/common/EmptyState';
import { Screen } from '../../components/common/Screen';
import { useAuthStore } from '../../store/authStore';
import { colors, radius, spacing } from '../../theme';
import { selectRows } from '../../services/supabase/client';

export interface StudentIssueRecord {
  id: string;
  studentId: string;
  studentName: string;
  examTitle: string;
  status: 'LOGIN_FAILED' | 'DEVICE_BLOCKED' | 'EXAM_NOT_AVAILABLE' | 'SUBMISSION_PENDING' | 'SUBMISSION_FAILED' | 'RESUME_AVAILABLE' | 'IN_PROGRESS' | 'HEALTHY';
  issueCode: string;
  reason: string;
  lastSyncAt: string;
  submissionStatus: string;
  suggestedAction: string;
  deviceInfo?: string;
}

export function AdminDiagnosticsScreen() {
  const user = useAuthStore((state) => state.user);
  const isAdmin = user?.role === 'admin' && user.approvalStatus === 'approved';
  const [issues, setIssues] = useState<StudentIssueRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchDiagnostics = useCallback(async () => {
    try {
      setLoading(true);
      const data = await selectRows<any>('active_exam_sessions', '*');

      if (data && data.length > 0) {
        const mapped: StudentIssueRecord[] = data.map((item: any) => ({
          id: item.id,
          studentId: item.user_id,
          studentName: item.student_name || 'Student',
          examTitle: item.exam_title || 'Weekly Exam',
          status: item.status || 'SUBMISSION_PENDING',
          issueCode: item.status || 'GENERIC_ISSUE',
          reason: item.issue_reason || 'Reason: Session state flag requires verification.',
          lastSyncAt: item.last_active_at || new Date().toISOString(),
          submissionStatus: item.submission_status || item.status,
          suggestedAction: 'Resolve issue via admin actions below.',
          deviceInfo: item.device_info,
        }));
        setIssues(mapped);
      } else {
        setIssues([]);
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void fetchDiagnostics();
  }, [fetchDiagnostics]);

  if (!isAdmin) {
    return (
      <Screen>
        <AppHeader title="Admin Diagnostics" subtitle="Restricted to approved MIITJEE admins" />
        <EmptyState icon={ShieldAlert} title="Admin Access Required" description="Only approved admins can access system diagnostics." />
      </Screen>
    );
  }

  return (
    <Screen useScrollView={false}>
      <View style={styles.screen}>
        <AppHeader
          title="Admin Issue Diagnostics"
          subtitle="Real-time issue details, exact error reasons & instant resolution controls"
        />

        <FlatList
          data={issues}
          keyExtractor={(item) => item.id}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); void fetchDiagnostics(); }} />}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={!loading ? <EmptyState icon={Activity} title="No active exam issues" description="There are no live sessions requiring admin action." /> : null}
          renderItem={({ item }) => (
            <Card style={styles.card}>
              <View style={styles.cardHeader}>
                <View style={styles.studentInfo}>
                  <Text style={styles.studentName}>{item.studentName}</Text>
                  <Text style={styles.studentId}>ID: {item.studentId}</Text>
                </View>
                <Badge
                  label={item.status}
                  tone={
                    item.status === 'DEVICE_BLOCKED' || item.status === 'SUBMISSION_FAILED'
                      ? 'warning'
                      : item.status === 'SUBMISSION_PENDING'
                        ? 'primary'
                        : 'neutral'
                  }
                />
              </View>

              <Text style={styles.examTitle}>{item.examTitle}</Text>
              
              <View style={styles.reasonWrap}>
                <AlertTriangle size={16} color={colors.warning} />
                <Text style={styles.reasonText}>{item.reason}</Text>
              </View>

              <View style={styles.metaRow}>
                <Text style={styles.metaText}>Last Sync: {new Date(item.lastSyncAt).toLocaleTimeString()}</Text>
                <Text style={styles.metaText}>Status: {item.submissionStatus}</Text>
              </View>

              {item.deviceInfo ? (
                <View style={styles.deviceRow}>
                  <Smartphone size={14} color={colors.textMuted} />
                  <Text style={styles.deviceText}>{item.deviceInfo}</Text>
                </View>
              ) : null}

              <Text style={styles.suggestedActionLabel}>Suggested Action: {item.suggestedAction}</Text>

            </Card>
          )}
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    padding: spacing.md,
    gap: spacing.md,
  },
  listContent: {
    gap: spacing.md,
    paddingBottom: 100,
  },
  card: {
    gap: spacing.sm,
    padding: spacing.lg,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  studentInfo: {
    gap: 2,
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
  reasonWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: '#FFF4E5',
    borderColor: '#FFE0B2',
    borderWidth: 1,
    padding: spacing.sm,
    borderRadius: radius.md,
  },
  reasonText: {
    flex: 1,
    color: '#E65100',
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 16,
  },
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  metaText: {
    color: colors.textMuted,
    fontSize: 11,
  },
  deviceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  deviceText: {
    color: colors.textSubtle,
    fontSize: 11,
  },
  suggestedActionLabel: {
    color: colors.text,
    fontSize: 12,
    fontWeight: '600',
    fontStyle: 'italic',
  },
});
