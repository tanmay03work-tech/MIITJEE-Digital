import React, { useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleProp, StyleSheet, Text, View, ViewStyle } from 'react-native';
import { ChevronDown } from 'lucide-react-native';

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
  style,
}: SelectFieldProps) {
  const [visible, setVisible] = useState(false);

  const selectedOption = useMemo(
    () => options.find((option) => option.value === value) ?? null,
    [options, value],
  );

  return (
    <View style={[styles.wrapper, style]}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <Pressable
        disabled={disabled}
        style={[styles.field, disabled && styles.fieldDisabled]}
        onPress={() => setVisible(true)}>
        <Text style={[styles.value, !selectedOption && styles.placeholder]}>
          {selectedOption?.label ?? placeholder}
        </Text>
        <ChevronDown size={18} color={colors.textMuted} />
      </Pressable>

      <Modal visible={visible} transparent animationType="fade" statusBarTranslucent onRequestClose={() => setVisible(false)}>
        <View style={styles.overlay}>
          <Pressable style={styles.backdrop} onPress={() => setVisible(false)} />
          <View style={styles.sheet}>
            <Text style={styles.sheetTitle}>{menuTitle ?? label ?? 'Select an option'}</Text>
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
    gap: spacing.sm,
  },
  label: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  field: {
    minHeight: 52,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceRaised,
    paddingHorizontal: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  fieldDisabled: {
    opacity: 0.6,
  },
  value: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '700',
    flex: 1,
  },
  placeholder: {
    color: colors.textSubtle,
    fontWeight: '500',
  },
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(12,18,30,0.32)',
  },
  sheet: {
    backgroundColor: colors.surfaceRaised,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.xl,
    paddingBottom: spacing.xxl,
    borderWidth: 1,
    borderColor: colors.border,
  },
  sheetTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '800',
    marginBottom: spacing.lg,
  },
  optionList: {
    gap: spacing.sm,
  },
  option: {
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.lg,
  },
  optionSelected: {
    borderColor: colors.primary,
    backgroundColor: colors.primarySoft,
  },
  optionTextWrap: {
    gap: spacing.xs,
  },
  optionTitle: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '800',
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
