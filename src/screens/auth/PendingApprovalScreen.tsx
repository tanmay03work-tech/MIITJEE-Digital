import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import { Clock3, LogOut } from 'lucide-react-native';

import { AnimatedPressable } from '../../components/common/AnimatedPressable';
import { Screen } from '../../components/common/Screen';
import { colors, radius, spacing, typography } from '../../theme';
import { useAuthStore } from '../../store/authStore';

export function PendingApprovalScreen() {
  const user = useAuthStore((state) => state.user);
  const signOut = useAuthStore((state) => state.signOut);

  return (
    <Screen contentContainerStyle={styles.content}>
      <LinearGradient colors={[colors.primary, colors.primaryDeep]} style={styles.hero}>
        <View style={styles.iconWrap}>
          <Clock3 size={30} color={colors.white} />
        </View>
        <Text style={styles.heroTitle}>Admin approval pending</Text>
        <Text style={styles.heroSubtitle}>
          {user?.email} is waiting for MIITJEE approval before the admin panel becomes visible.
        </Text>
      </LinearGradient>

      <View style={styles.infoCard}>
        <Text style={typography.title}>What happens next?</Text>
        <Text style={styles.body}>
          Faculty and admin accounts are intentionally paused after signup. Once the backend role flag is approved,
          this screen automatically unlocks the admin flow.
        </Text>
      </View>

      <AnimatedPressable style={styles.logoutButton} onPress={signOut}>
        <LogOut size={18} color={colors.primary} />
        <Text style={styles.logoutText}>Sign out</Text>
      </AnimatedPressable>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.xxl,
    gap: spacing.xl,
  },
  hero: {
    borderRadius: radius.xl,
    padding: spacing.xxl,
    gap: spacing.md,
  },
  iconWrap: {
    width: 60,
    height: 60,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroTitle: {
    color: colors.white,
    fontSize: 28,
    fontWeight: '800',
  },
  heroSubtitle: {
    color: 'rgba(255,255,255,0.82)',
    fontSize: 15,
    lineHeight: 22,
  },
  infoCard: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: spacing.xl,
    gap: spacing.md,
  },
  body: {
    color: colors.textMuted,
    fontSize: 15,
    lineHeight: 22,
  },
  logoutButton: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.lg,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.primarySoft,
  },
  logoutText: {
    color: colors.primary,
    fontSize: 14,
    fontWeight: '800',
  },
});
