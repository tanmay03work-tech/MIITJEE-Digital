import React, { PropsWithChildren } from 'react';
import { ActivityIndicator, StyleProp, StyleSheet, Text, ViewStyle } from 'react-native';

import { colors, radius, spacing, shadows } from '../../theme';
import { AnimatedPressable } from './AnimatedPressable';

interface ButtonProps {
  onPress?: () => void;
  disabled?: boolean;
  loading?: boolean;
  variant?: 'primary' | 'secondary' | 'ghost';
  style?: StyleProp<ViewStyle>;
}

export function Button({
  children,
  onPress,
  disabled = false,
  loading = false,
  variant = 'primary',
  style,
}: PropsWithChildren<ButtonProps>) {
  const isInactive = disabled || loading;

  return (
    <AnimatedPressable
      onPress={onPress}
      disabled={isInactive}
      style={[
        styles.base,
        variant === 'primary' && styles.primary,
        variant === 'secondary' && styles.secondary,
        variant === 'ghost' && styles.ghost,
        isInactive && styles.inactive,
        style,
      ]}>
      {loading ? <ActivityIndicator size="small" color={variant === 'primary' ? colors.white : colors.primary} /> : null}
      <Text
        style={[
          styles.label,
          variant === 'primary' && styles.labelPrimary,
          variant !== 'primary' && styles.labelSecondary,
          isInactive && styles.labelInactive,
        ]}>
        {children}
      </Text>
    </AnimatedPressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: 48,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
    minWidth: 0,
  },
  primary: {
    backgroundColor: colors.primary,
    ...shadows.soft,
  },
  secondary: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  ghost: {
    backgroundColor: colors.surfaceMuted,
  },
  inactive: {
    opacity: 0.65,
  },
  label: {
    fontSize: 14,
    fontWeight: '800',
    flexShrink: 1,
    minWidth: 0,
  },
  labelPrimary: {
    color: colors.white,
  },
  labelSecondary: {
    color: colors.primary,
  },
  labelInactive: {
    color: colors.textSubtle,
  },
});
