import React, { useState } from 'react';
import { StyleSheet, Text, TextInput, TextInputProps, View } from 'react-native';
import { AlertCircle } from 'lucide-react-native';

import { colors, radius, spacing } from '../../theme';

export interface InputFieldProps extends TextInputProps {
  label: string;
  rightAccessory?: React.ReactNode;
  leftIcon?: React.ReactNode;
  error?: string;
  helperText?: string;
  required?: boolean;
}

export function InputField({
  label,
  style,
  rightAccessory,
  leftIcon,
  error,
  helperText,
  required = false,
  onFocus,
  onBlur,
  ...props
}: InputFieldProps) {
  const [isFocused, setIsFocused] = useState(false);

  return (
    <View style={styles.wrapper}>
      <View style={styles.labelRow}>
        <Text style={[styles.label, error ? styles.labelError : null]}>{label}</Text>
        {required ? <Text style={styles.requiredStar}>*</Text> : null}
      </View>
      <View
        style={[
          styles.inputShell,
          isFocused && styles.inputShellFocused,
          error ? styles.inputShellError : null,
        ]}>
        {leftIcon ? <View style={styles.leftIconWrap}>{leftIcon}</View> : null}
        <TextInput
          placeholderTextColor={colors.textSubtle}
          style={[styles.input, style]}
          onFocus={(e) => {
            setIsFocused(true);
            onFocus?.(e);
          }}
          onBlur={(e) => {
            setIsFocused(false);
            onBlur?.(e);
          }}
          {...props}
        />
        {rightAccessory ? <View style={styles.accessory}>{rightAccessory}</View> : null}
      </View>
      {error ? (
        <View style={styles.errorRow}>
          <AlertCircle size={14} color={colors.danger} />
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : helperText ? (
        <Text style={styles.helperText}>{helperText}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    gap: spacing.xs,
  },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  label: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  labelError: {
    color: colors.danger,
  },
  requiredStar: {
    color: colors.danger,
    fontSize: 12,
    fontWeight: '700',
  },
  inputShell: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingRight: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 48,
  },
  inputShellFocused: {
    borderColor: colors.primary,
  },
  inputShellError: {
    borderColor: colors.danger,
    backgroundColor: '#FFF5F5',
  },
  leftIconWrap: {
    paddingLeft: spacing.md,
    justifyContent: 'center',
    alignItems: 'center',
  },
  input: {
    flex: 1,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    color: colors.text,
    fontSize: 15,
  },
  accessory: {
    marginLeft: spacing.sm,
  },
  errorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 2,
  },
  errorText: {
    color: colors.danger,
    fontSize: 12,
    fontWeight: '600',
  },
  helperText: {
    color: colors.textSubtle,
    fontSize: 12,
    marginTop: 2,
  },
});
