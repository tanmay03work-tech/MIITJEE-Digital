import React, { useMemo, useState } from 'react';
import { Modal, Platform, Pressable, ScrollView, StyleProp, StyleSheet, Text, View, ViewStyle } from 'react-native';
import { AlertCircle, Check, ChevronDown, X } from 'lucide-react-native';

import { colors, radius, spacing } from '../../theme';

export interface SelectOption {
  label: string;
  value: string;
  description?: string;
}

interface SelectFieldProps {
  label?: string;
  placeholder?: string;
  value?: string | null;
  options: SelectOption[];
  onValueChange: (value: string) => void;
  disabled?: boolean;
  menuTitle?: string;
  error?: string;
  required?: boolean;
  style?: StyleProp<ViewStyle>;
}

export function SelectField({
  label,
  placeholder = 'Select',
  value,
  options,
  onValueChange,
  disabled = false,
  menuTitle,
  error,
  required = false,
  style,
}: SelectFieldProps) {
  const [visible, setVisible] = useState(false);

  const selectedOption = useMemo(
    () => options.find((option) => option.value === value) ?? null,
    [options, value],
  );

  return (
    <View style={[styles.wrapper, style]}>
      {label ? (
        <View style={styles.labelRow}>
          <Text style={[styles.label, error ? styles.labelError : null]}>{label}</Text>
          {required ? <Text style={styles.requiredStar}>*</Text> : null}
        </View>
      ) : null}
      <Pressable
        disabled={disabled}
        accessibilityRole="combobox"
        style={[
          styles.field,
          error ? styles.fieldError : null,
          disabled && styles.fieldDisabled,
        ]}
        onPress={() => setVisible(true)}>
        <Text style={[styles.value, !selectedOption && styles.placeholder]}>
          {selectedOption?.label ?? placeholder}
        </Text>
        <ChevronDown size={18} color={error ? colors.danger : colors.textMuted} />
      </Pressable>
      {error ? (
        <View style={styles.errorRow}>
          <AlertCircle size={14} color={colors.danger} />
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : null}

      <Modal visible={visible} transparent animationType="fade" statusBarTranslucent onRequestClose={() => setVisible(false)}>
        <View style={styles.overlay}>
          <Pressable style={styles.backdrop} onPress={() => setVisible(false)} />
          <View style={styles.sheet}>
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>{menuTitle ?? label ?? 'Select an option'}</Text>
              <Pressable
                onPress={() => setVisible(false)}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                style={styles.closeBtn}>
                <X size={18} color={colors.textMuted} />
              </Pressable>
            </View>
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.optionList}>
              {options.map((option) => {
                const selected = option.value === value;

                return (
                  <Pressable
                    key={option.value}
                    style={[styles.option, selected && styles.optionSelected]}
                    onPress={() => {
                      setVisible(false);
                      onValueChange(option.value);
                    }}>
                    <View style={styles.optionTextWrap}>
                      <Text style={[styles.optionTitle, selected && styles.optionTitleSelected]}>{option.label}</Text>
                      {option.description ? <Text style={styles.optionDescription}>{option.description}</Text> : null}
                    </View>
                    {selected ? <Check size={18} color={colors.primary} /> : null}
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>
        </View>
      </Modal>
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
  field: {
    minHeight: 48,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  fieldError: {
    borderColor: colors.danger,
    backgroundColor: '#FFF5F5',
  },
  fieldDisabled: {
    opacity: 0.6,
  },
  value: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '600',
    flex: 1,
  },
  placeholder: {
    color: colors.textSubtle,
    fontWeight: '400',
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
  overlay: {
    flex: 1,
    justifyContent: Platform.OS === 'web' ? 'center' : 'flex-end',
    alignItems: Platform.OS === 'web' ? 'center' : 'stretch',
    padding: Platform.OS === 'web' ? spacing.xl : 0,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: colors.overlay,
  },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    borderBottomLeftRadius: Platform.OS === 'web' ? radius.xl : 0,
    borderBottomRightRadius: Platform.OS === 'web' ? radius.xl : 0,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.xl,
    paddingBottom: spacing.xxl,
    borderWidth: 1,
    borderColor: colors.border,
    width: Platform.OS === 'web' ? '100%' : 'auto',
    maxWidth: Platform.OS === 'web' ? 480 : undefined,
    maxHeight: '80%',
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.lg,
  },
  sheetTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '800',
  },
  closeBtn: {
    padding: 4,
    borderRadius: radius.pill,
  },
  optionList: {
    gap: spacing.sm,
  },
  option: {
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  optionSelected: {
    borderColor: colors.primary,
    backgroundColor: colors.primarySoft,
  },
  optionTextWrap: {
    gap: 2,
    flex: 1,
  },
  optionTitle: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '700',
  },
  optionTitleSelected: {
    color: colors.primary,
  },
  optionDescription: {
    color: colors.textMuted,
    fontSize: 12,
    lineHeight: 18,
  },
});
