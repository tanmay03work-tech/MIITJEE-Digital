import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { colors, radius, spacing } from '../../theme';

interface BadgeProps {
  label: string;
  tone?: 'primary' | 'success' | 'warning' | 'danger' | 'neutral';
}

const toneMap = {
  primary: { backgroundColor: colors.primarySoft, color: colors.primary },
  success: { backgroundColor: colors.successSoft, color: colors.success },
  warning: { backgroundColor: colors.warningSoft, color: colors.warning },
  danger: { backgroundColor: colors.dangerSoft, color: colors.danger },
  neutral: { backgroundColor: colors.surfaceMuted, color: colors.textMuted },
};

export function Badge({ label, tone = 'neutral' }: BadgeProps) {
  return (
    <View style={[styles.badge, { backgroundColor: toneMap[tone].backgroundColor }]}>
      <Text
        style={[styles.label, { color: toneMap[tone].color }]}
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.84}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    alignSelf: 'flex-start',
    maxWidth: '100%',
    flexShrink: 1,
    minWidth: 0,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: 6,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
  },
  label: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.2,
    textTransform: 'uppercase',
    flexShrink: 1,
    minWidth: 0,
  },
});
