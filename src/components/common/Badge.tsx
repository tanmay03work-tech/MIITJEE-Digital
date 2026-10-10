import React from 'react';
import { StyleProp, StyleSheet, Text, View, ViewStyle } from 'react-native';

import { colors, radius, spacing } from '../../theme';

export interface BadgeProps {
  label: string;
  tone?: 'primary' | 'success' | 'warning' | 'danger' | 'neutral';
  size?: 'sm' | 'md';
  icon?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}

const toneMap = {
  primary: { backgroundColor: colors.primarySoft, color: colors.primary, borderColor: '#C7D2FE' },
  success: { backgroundColor: colors.successSoft, color: colors.success, borderColor: '#A7F3D0' },
  warning: { backgroundColor: colors.warningSoft, color: colors.warning, borderColor: '#FDE68A' },
  danger: { backgroundColor: colors.dangerSoft, color: colors.danger, borderColor: '#FECDD3' },
  neutral: { backgroundColor: colors.surfaceMuted, color: colors.textMuted, borderColor: colors.border },
};

export function Badge({ label, tone = 'neutral', size = 'md', icon, style }: BadgeProps) {
  const currentTone = toneMap[tone] || toneMap.neutral;

  return (
    <View
      style={[
        styles.badge,
        size === 'sm' && styles.badgeSm,
        { backgroundColor: currentTone.backgroundColor, borderColor: currentTone.borderColor },
        style,
      ]}>
      {icon ? <View style={styles.iconWrap}>{icon}</View> : null}
      <Text
        style={[
          styles.label,
          size === 'sm' && styles.labelSm,
          { color: currentTone.color },
        ]}
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
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: 4,
    borderRadius: radius.pill,
    borderWidth: 1,
    gap: 4,
  },
  badgeSm: {
    paddingHorizontal: spacing.xs + 2,
    paddingVertical: 2,
  },
  iconWrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.2,
    textTransform: 'uppercase',
    flexShrink: 1,
    minWidth: 0,
  },
  labelSm: {
    fontSize: 10,
    fontWeight: '600',
  },
});
