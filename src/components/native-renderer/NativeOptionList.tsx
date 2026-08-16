import React, { memo } from 'react';
import { Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { CheckCircle2, X } from 'lucide-react-native';
import { NativeOptionItem } from '../../services/pdf-native/nativeQuestionTypes';
import { colors, radius, spacing } from '../../theme';

interface NativeOptionListProps {
  options: NativeOptionItem[];
  selectedAnswer: string | null;
  onSelectOption: (optionLabel: string) => void;
  onClearResponse?: () => void;
  showClearButton?: boolean;
}

function NativeOptionListComponent({
  options,
  selectedAnswer,
  onSelectOption,
  onClearResponse,
  showClearButton = true,
}: NativeOptionListProps) {
  if (!options || options.length === 0) return null;

  return (
    <View style={styles.container}>
      <View style={styles.list}>
        {options.map((opt) => {
          const isSelected =
            selectedAnswer === opt.label ||
            selectedAnswer === `Option ${opt.label}` ||
            selectedAnswer === opt.text;

          return (
            <TouchableOpacity
              key={opt.id || opt.label}
              style={[styles.optionCard, isSelected && styles.optionCardSelected]}
              onPress={() => onSelectOption(opt.label)}
              activeOpacity={0.75}
            >
              {/* Option Badge */}
              <View style={[styles.badge, isSelected && styles.badgeSelected]}>
                <Text style={[styles.badgeText, isSelected && styles.badgeTextSelected]}>
                  {opt.label}
                </Text>
              </View>

              {/* Option Text & Diagram */}
              <View style={styles.contentWrap}>
                <Text style={[styles.optionText, isSelected && styles.optionTextSelected]} selectable>
                  {opt.text}
                </Text>

                {opt.visualAssetUrl ? (
                  <Image
                    source={{ uri: opt.visualAssetUrl }}
                    style={styles.optionDiagram}
                    resizeMode="contain"
                  />
                ) : null}
              </View>

              {/* Selected Check Icon */}
              {isSelected ? (
                <View style={styles.checkWrap}>
                  <CheckCircle2 size={18} color={colors.primary} />
                </View>
              ) : null}
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Clear Response Inline Button */}
      {selectedAnswer && showClearButton && onClearResponse ? (
        <TouchableOpacity
          style={styles.clearBtn}
          onPress={onClearResponse}
          activeOpacity={0.7}
        >
          <X size={14} color={colors.danger} />
          <Text style={styles.clearBtnText}>Unselect / Clear Response</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

export const NativeOptionList = memo(NativeOptionListComponent);

const styles = StyleSheet.create({
  container: {
    width: '100%',
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  list: {
    gap: spacing.md,
  },
  optionCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: radius.lg,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    padding: spacing.md,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
    minWidth: 0,
    shadowColor: '#000000',
    shadowOpacity: 0.02,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  optionCardSelected: {
    borderColor: colors.primary,
    backgroundColor: '#F7F4FF',
  },
  badge: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F1F5F9',
    flexShrink: 0,
  },
  badgeSelected: {
    backgroundColor: colors.primary,
  },
  badgeText: {
    color: '#475569',
    fontWeight: '800',
    fontSize: 14,
  },
  badgeTextSelected: {
    color: '#FFFFFF',
  },
  contentWrap: {
    flex: 1,
    flexShrink: 1,
    gap: spacing.xs,
    justifyContent: 'center',
    paddingTop: 6,
  },
  optionText: {
    color: colors.text,
    fontSize: 15,
    lineHeight: 22,
    fontWeight: '600',
    flexShrink: 1,
  },
  optionTextSelected: {
    color: colors.primaryDeep,
    fontWeight: '700',
  },
  optionDiagram: {
    width: '100%',
    height: 100,
    borderRadius: radius.sm,
    marginTop: spacing.xs,
    backgroundColor: '#FFFFFF',
  },
  checkWrap: {
    flexShrink: 0,
    paddingTop: 8,
  },
  clearBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: radius.md,
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
    alignSelf: 'center',
    marginTop: spacing.xs,
  },
  clearBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.danger,
  },
});
