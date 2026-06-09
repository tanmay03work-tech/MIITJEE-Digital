import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import {
  ClipboardList,
  FilePlus2,
  GraduationCap,
  Layers3,
  Lock,
  LucideIcon,
  MessageSquareText,
  ScrollText,
  ShieldCheck,
  Trophy,
  UserRoundCog,
  Users,
} from 'lucide-react-native';

import { QuickAction } from '../../types';
import { colors, radius, shadows, spacing } from '../../theme';
import { AnimatedPressable } from '../common/AnimatedPressable';

const iconMap: Record<QuickAction['target'], LucideIcon> = {
  tests: ClipboardList,
  leaderboard: Trophy,
  profile: ShieldCheck,
  batches: Layers3,
  enquiry: MessageSquareText,
  terms: ScrollText,
  privacy: Lock,
  admin: UserRoundCog,
  'create-test': FilePlus2,
  'manage-users': Users,
  results: Trophy,
  'scholarship-registrations': GraduationCap,
  'batch-access-requests': Layers3,
  'general-enquiries': MessageSquareText,
};

interface QuickActionGridProps {
  actions: QuickAction[];
  onPress: (target: QuickAction['target']) => void;
}

export function QuickActionGrid({ actions, onPress }: QuickActionGridProps) {
  return (
    <View style={styles.grid}>
      {actions.map((action) => {
        const Icon = iconMap[action.target];
        return (
          <AnimatedPressable
            key={action.id}
            style={styles.item}
            onPress={() => onPress(action.target)}>
            <LinearGradient colors={[`${action.color}20`, `${action.color}08`]} style={styles.iconWrap}>
              <Icon size={18} color={action.color} />
            </LinearGradient>
            <View style={[styles.accentBar, { backgroundColor: action.color }]} />
            <Text style={styles.label}>{action.label}</Text>
            <Text style={styles.subtitle}>{action.subtitle}</Text>
          </AnimatedPressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: {
    paddingHorizontal: spacing.xl,
    marginBottom: spacing.xxl,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
  },
  item: {
    flexBasis: '47%',
    flexGrow: 1,
    minWidth: 148,
    backgroundColor: colors.surfaceRaised,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.sm,
    ...shadows.soft,
  },
  iconWrap: {
    width: 48,
    height: 48,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    flexShrink: 0,
  },
  accentBar: {
    width: 36,
    height: 4,
    borderRadius: radius.pill,
  },
  label: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '800',
    flexShrink: 1,
  },
  subtitle: {
    color: colors.textMuted,
    fontSize: 12,
    lineHeight: 18,
    flexShrink: 1,
  },
});
