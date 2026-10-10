import React, { PropsWithChildren } from 'react';
import { ActivityIndicator, StyleProp, StyleSheet, Text, TextStyle, ViewStyle } from 'react-native';

import { colors, radius, spacing, shadows } from '../../theme';
import { AnimatedPressable } from './AnimatedPressable';

export interface ButtonProps {
  label?: string;
  onPress?: () => void;
  disabled?: boolean;
  loading?: boolean;
  loadingText?: string;
  loadingLabel?: string;
  fullWidth?: boolean;
  variant?: 'primary' | 'secondary' | 'outline' | 'destructive' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  icon?: React.ReactNode;
  iconRight?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
  accessibilityLabel?: string;
}

export function Button({
  children,
  label,
  onPress,
  disabled = false,
  loading = false,
  loadingText,
  loadingLabel,
  fullWidth = false,
  variant = 'primary',
  size = 'md',
  icon,
  iconRight,
  style,
  textStyle,
  accessibilityLabel,
}: PropsWithChildren<ButtonProps>) {
  const isInactive = disabled || loading;
  const activeLoadingText = loadingText || loadingLabel;
  const content = loading && activeLoadingText ? activeLoadingText : (label || children);

  const spinnerColor =
    variant === 'primary' || variant === 'destructive' ? colors.white : colors.primary;

  return (
    <AnimatedPressable
      onPress={onPress}
      disabled={isInactive}
      accessibilityRole="button"
      accessibilityState={{ disabled: isInactive, busy: loading }}
      accessibilityLabel={accessibilityLabel}
      style={[
        styles.base,
        fullWidth && styles.fullWidth,
        size === 'sm' && styles.sizeSm,
        size === 'md' && styles.sizeMd,
        size === 'lg' && styles.sizeLg,
        variant === 'primary' && styles.primary,
        variant === 'secondary' && styles.secondary,
        variant === 'outline' && styles.outline,
        variant === 'destructive' && styles.destructive,
        variant === 'ghost' && styles.ghost,
        isInactive && styles.inactive,
        style,
      ]}>
      {loading ? (
        <ActivityIndicator size="small" color={spinnerColor} />
      ) : (
        icon || null
      )}
      <Text
        style={[
          styles.label,
          size === 'sm' && styles.labelSm,
          size === 'md' && styles.labelMd,
          size === 'lg' && styles.labelLg,
          variant === 'primary' && styles.labelPrimary,
          variant === 'secondary' && styles.labelSecondary,
          variant === 'outline' && styles.labelOutline,
          variant === 'destructive' && styles.labelDestructive,
          variant === 'ghost' && styles.labelGhost,
          isInactive && styles.labelInactive,
          textStyle,
        ]}>
        {content}
      </Text>
      {!loading && iconRight ? iconRight : null}
    </AnimatedPressable>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
    minWidth: 0,
  },
  fullWidth: {
    width: '100%',
  },
  sizeSm: {
    minHeight: 36,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
  },
  sizeMd: {
    minHeight: 48,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  sizeLg: {
    minHeight: 54,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md + 2,
  },
  primary: {
    backgroundColor: colors.primary,
    ...shadows.soft,
  },
  secondary: {
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1,
    borderColor: colors.border,
  },
  outline: {
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: colors.borderStrong,
  },
  destructive: {
    backgroundColor: colors.danger,
    ...shadows.soft,
  },
  ghost: {
    backgroundColor: 'transparent',
  },
  inactive: {
    opacity: 0.6,
  },
  label: {
    fontWeight: '700',
    flexShrink: 1,
    minWidth: 0,
    textAlign: 'center',
  },
  labelSm: {
    fontSize: 13,
  },
  labelMd: {
    fontSize: 14,
  },
  labelLg: {
    fontSize: 16,
  },
  labelPrimary: {
    color: colors.white,
  },
  labelSecondary: {
    color: colors.text,
  },
  labelOutline: {
    color: colors.text,
  },
  labelDestructive: {
    color: colors.white,
  },
  labelGhost: {
    color: colors.textMuted,
  },
  labelInactive: {
    color: colors.textSubtle,
  },
});
