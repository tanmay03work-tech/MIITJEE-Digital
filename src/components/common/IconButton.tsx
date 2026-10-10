import React from 'react';
import { ActivityIndicator, StyleProp, StyleSheet, ViewStyle } from 'react-native';

import { colors, radius, spacing } from '../../theme';
import { AnimatedPressable } from './AnimatedPressable';

export interface IconButtonProps {
  icon: React.ReactNode;
  onPress?: () => void;
  disabled?: boolean;
  loading?: boolean;
  variant?: 'ghost' | 'outline' | 'filled' | 'destructive';
  size?: 'sm' | 'md' | 'lg';
  accessibilityLabel: string;
  style?: StyleProp<ViewStyle>;
}

export function IconButton({
  icon,
  onPress,
  disabled = false,
  loading = false,
  variant = 'ghost',
  size = 'md',
  accessibilityLabel,
  style,
}: IconButtonProps) {
  const isInactive = disabled || loading;

  const spinnerColor =
    variant === 'destructive' ? colors.danger : variant === 'filled' ? colors.white : colors.primary;

  return (
    <AnimatedPressable
      onPress={onPress}
      disabled={isInactive}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      style={[
        styles.base,
        size === 'sm' && styles.sizeSm,
        size === 'md' && styles.sizeMd,
        size === 'lg' && styles.sizeLg,
        variant === 'ghost' && styles.ghost,
        variant === 'outline' && styles.outline,
        variant === 'filled' && styles.filled,
        variant === 'destructive' && styles.destructive,
        isInactive && styles.inactive,
        style,
      ]}>
      {loading ? <ActivityIndicator size="small" color={spinnerColor} /> : icon}
    </AnimatedPressable>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sizeSm: {
    width: 32,
    height: 32,
  },
  sizeMd: {
    width: 40,
    height: 40,
  },
  sizeLg: {
    width: 48,
    height: 48,
  },
  ghost: {
    backgroundColor: 'transparent',
  },
  outline: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  filled: {
    backgroundColor: colors.primary,
  },
  destructive: {
    backgroundColor: colors.dangerSoft,
    borderWidth: 1,
    borderColor: colors.danger,
  },
  inactive: {
    opacity: 0.5,
  },
});
