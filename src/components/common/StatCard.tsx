import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { LucideIcon } from 'lucide-react-native';
import LinearGradient from 'react-native-linear-gradient';

import { Card } from './Card';
import { colors, radius, spacing } from '../../theme';

interface StatCardProps {
  icon: LucideIcon;
  iconColor: string;
  iconBackground: string;
  label: string;
  value: string;
}

export function StatCard({
  icon: Icon,
  iconColor,
  iconBackground,
  label,
  value,
}: StatCardProps) {
  return (
    <Card style={styles.card}>
      <LinearGradient colors={[iconBackground, colors.surfaceRaised]} style={styles.iconWrap}>
        <Icon size={20} color={iconColor} />
      </LinearGradient>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.value}>{value}</Text>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    flexGrow: 1,
    flexBasis: '48%',
    minWidth: 0,
    gap: spacing.xs,
    minHeight: 102,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  label: {
    color: colors.textMuted,
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    fontWeight: '700',
    flexShrink: 1,
    minWidth: 0,
  },
  value: {
    color: colors.text,
    fontSize: 19,
    fontWeight: '900',
    flexShrink: 1,
    minWidth: 0,
  },
});
