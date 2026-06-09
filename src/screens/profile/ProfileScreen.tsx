import React, { useEffect, useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown, FadeOutUp } from 'react-native-reanimated';
import { BarChart3, FileText, LogOut, RefreshCcw, Settings2, ShieldCheck, ShieldQuestion } from 'lucide-react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { AnimatedPressable } from '../../components/common/AnimatedPressable';
import { AppHeader } from '../../components/common/AppHeader';
import { Badge } from '../../components/common/Badge';
import { Card } from '../../components/common/Card';
import { IconListItem } from '../../components/common/IconListItem';
import { Screen } from '../../components/common/Screen';
import { useAppStore } from '../../store/appStore';
import { useAuthStore } from '../../store/authStore';
import { colors, radius, spacing } from '../../theme';
import { initials } from '../../utils/formatters';
import { RootStackParamList } from '../../navigation/types';

type RootNavigation = NativeStackNavigationProp<RootStackParamList>;

export function ProfileScreen() {
  const navigation = useNavigation<RootNavigation>();
  const user = useAuthStore((state) => state.user);
  const signOut = useAuthStore((state) => state.signOut);
  const bootstrap = useAppStore((state) => state.bootstrap);
  const [refreshNotice, setRefreshNotice] = useState<{ tone: 'success' | 'danger'; title: string; message: string } | null>(null);

  useEffect(() => {
    if (!refreshNotice) {
      return;
    }

    const timeout = setTimeout(() => {
      setRefreshNotice(null);
    }, 2400);

    return () => clearTimeout(timeout);
  }, [refreshNotice]);

  if (!user) {
    return null;
  }

  const isAdmin = user.role === 'admin' && user.approvalStatus === 'approved';

  return (
    <Screen>
      <AppHeader title="Profile" subtitle="Identity, role status, batch and quick controls" showLogo={false} />

      {refreshNotice ? (
        <Animated.View
          entering={FadeInDown.duration(180)}
          exiting={FadeOutUp.duration(180)}
          style={[
            styles.noticeBanner,
            refreshNotice.tone === 'success' ? styles.noticeBannerSuccess : styles.noticeBannerDanger,
          ]}>
          <Text style={styles.noticeTitle}>{refreshNotice.title}</Text>
          <Text style={styles.noticeText}>{refreshNotice.message}</Text>
        </Animated.View>
      ) : null}

      <Card style={styles.heroCard}>
        <View style={styles.heroTopRow}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{initials(user.fullName)}</Text>
          </View>
          <View style={styles.identityBlock}>
            <Text style={styles.name} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.82}>
              {user.fullName}
            </Text>
            <Text style={styles.email} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.84}>
              {user.email}
            </Text>
            <View style={styles.badges}>
              <Badge label={user.role.replace('_', ' ')} tone="primary" />
              <Badge label={user.approvalStatus} tone={user.approvalStatus === 'approved' ? 'success' : 'warning'} />
            </View>
          </View>
        </View>

        <View style={styles.metrics}>
          <View style={[styles.metric, styles.metricWide]}>
            <Text numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.8} style={styles.metricValue}>
              {user.batchId ?? 'Not Assigned'}
            </Text>
            <Text style={styles.metricLabel} numberOfLines={1}>
              Batch
            </Text>
          </View>
          <View style={styles.metric}>
            <Text style={styles.metricValue} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.86}>
              #{user.rank}
            </Text>
            <Text style={styles.metricLabel} numberOfLines={1}>
              Rank
            </Text>
          </View>
          <View style={styles.metric}>
            <Text style={styles.metricValue} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.86}>
              {user.averageScore}%
            </Text>
            <Text style={styles.metricLabel} numberOfLines={1}>
              Average
            </Text>
          </View>
        </View>
      </Card>

      <View style={styles.actionList}>
        {isAdmin ? (
          <AnimatedPressable style={styles.actionCard} onPress={() => navigation.navigate('AdminDashboard')}>
            <IconListItem
              icon={
                <View style={[styles.actionIcon, { backgroundColor: colors.primarySoft }]}>
                  <ShieldCheck size={18} color={colors.primary} />
                </View>
              }
              title="Open Admin Panel"
              subtitle="Create tests, assign batches, manage results."
            />
          </AnimatedPressable>
        ) : null}

        <AnimatedPressable
          style={styles.actionCard}
          onPress={async () => {
            try {
              await bootstrap(user);
              setRefreshNotice({
                tone: 'success',
                title: 'Updated',
                message: 'Latest tests, access, and leaderboard data have been synced.',
              });
            } catch (error) {
              setRefreshNotice({
                tone: 'danger',
                title: 'Refresh failed',
                message: error instanceof Error ? error.message : 'Unable to refresh right now.',
              });
            }
          }}>
          <IconListItem
            icon={
              <View style={[styles.actionIcon, { backgroundColor: colors.infoSoft }]}>
                <RefreshCcw size={18} color={colors.info} />
              </View>
            }
            title="Refresh Data"
            subtitle="Reload your feed, test list and ranking."
          />
        </AnimatedPressable>

        <AnimatedPressable style={styles.actionCard} onPress={() => navigation.navigate('StudentInsights')}>
          <IconListItem
            icon={
              <View style={[styles.actionIcon, { backgroundColor: colors.primarySoft }]}>
                <BarChart3 size={18} color={colors.primary} />
              </View>
            }
            title="Performance Insights"
            subtitle="Review your test history, score trend, percentile, and weak subjects."
          />
        </AnimatedPressable>

        <AnimatedPressable style={styles.actionCard}>
          <IconListItem
            icon={
              <View style={[styles.actionIcon, { backgroundColor: colors.surfaceMuted }]}>
                <Settings2 size={18} color={colors.textMuted} />
              </View>
            }
            title="Account Snapshot"
            subtitle={`${user.targetExam} | ${user.classLabel}`}
          />
        </AnimatedPressable>

        <AnimatedPressable style={styles.actionCard} onPress={() => navigation.navigate('Enquiry')}>
          <IconListItem
            icon={
              <View style={[styles.actionIcon, { backgroundColor: colors.accentSoft }]}>
                <ShieldQuestion size={18} color={colors.accent} />
              </View>
            }
            title="Enquiry"
            subtitle="Reach out for batch guidance, admissions, or learning support."
          />
        </AnimatedPressable>

        <AnimatedPressable style={styles.actionCard} onPress={() => navigation.navigate('Terms')}>
          <IconListItem
            icon={
              <View style={[styles.actionIcon, { backgroundColor: colors.warningSoft }]}>
                <FileText size={18} color={colors.warning} />
              </View>
            }
            title="Terms & Conditions"
            subtitle="Review platform usage, access rules, and test integrity guidelines."
          />
        </AnimatedPressable>

        <AnimatedPressable style={styles.actionCard} onPress={() => navigation.navigate('Privacy')}>
          <IconListItem
            icon={
              <View style={[styles.actionIcon, { backgroundColor: colors.infoSoft }]}>
                <ShieldCheck size={18} color={colors.info} />
              </View>
            }
            title="Privacy Policy"
            subtitle="Understand how profile, exam, and enquiry data are handled."
          />
        </AnimatedPressable>

        <AnimatedPressable
          style={styles.actionCard}
          onPress={async () => {
            try {
              await signOut();
            } catch (error) {
              Alert.alert('Logout failed', error instanceof Error ? error.message : 'Unable to sign out right now.');
            }
          }}>
          <IconListItem
            icon={
              <View style={[styles.actionIcon, { backgroundColor: colors.dangerSoft }]}>
                <LogOut size={18} color={colors.danger} />
              </View>
            }
            title="Logout"
            subtitle="Exit the current MIITJEE session safely."
          />
        </AnimatedPressable>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  noticeBanner: {
    marginHorizontal: spacing.xl,
    marginBottom: spacing.lg,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderWidth: 1,
    gap: spacing.xs,
  },
  noticeBannerSuccess: {
    backgroundColor: colors.infoSoft,
    borderColor: colors.info,
  },
  noticeBannerDanger: {
    backgroundColor: colors.dangerSoft,
    borderColor: colors.danger,
  },
  noticeTitle: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '800',
  },
  noticeText: {
    color: colors.textMuted,
    fontSize: 12,
    lineHeight: 18,
  },
  heroCard: {
    marginHorizontal: spacing.xl,
    alignItems: 'stretch',
    gap: spacing.md,
    marginBottom: spacing.xl,
    paddingTop: spacing.lg,
    paddingBottom: spacing.lg,
    minWidth: 0,
  },
  heroTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minWidth: 0,
  },
  avatar: {
    width: 76,
    height: 76,
    borderRadius: 24,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  avatarText: {
    color: colors.white,
    fontSize: 28,
    fontWeight: '900',
  },
  identityBlock: {
    flex: 1,
    alignItems: 'flex-start',
    gap: 6,
    minWidth: 0,
  },
  name: {
    color: colors.text,
    fontSize: 28,
    fontWeight: '800',
    textAlign: 'left',
    maxWidth: '100%',
    flexShrink: 1,
    minWidth: 0,
  },
  email: {
    color: colors.textMuted,
    fontSize: 14,
    maxWidth: '100%',
    flexShrink: 1,
    minWidth: 0,
  },
  badges: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'flex-start',
    gap: 6,
    width: '100%',
    minWidth: 0,
  },
  metrics: {
    width: '100%',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: spacing.sm,
    minWidth: 0,
  },
  metric: {
    flex: 1,
    flexBasis: '47%',
    minWidth: 0,
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.md,
    paddingVertical: 18,
    paddingHorizontal: spacing.sm,
    alignItems: 'center',
    gap: 4,
    minHeight: 92,
    justifyContent: 'center',
  },
  metricWide: {
    flexBasis: '100%',
    minHeight: 82,
  },
  metricValue: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '800',
    textAlign: 'center',
    flexShrink: 1,
    minWidth: 0,
    width: '100%',
  },
  metricLabel: {
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    flexShrink: 1,
    minWidth: 0,
  },
  actionList: {
    paddingHorizontal: spacing.xl,
    gap: spacing.md,
    minWidth: 0,
  },
  actionCard: {
    backgroundColor: colors.surfaceRaised,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: spacing.lg,
    minWidth: 0,
  },
  actionIcon: {
    width: 44,
    height: 44,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
});
