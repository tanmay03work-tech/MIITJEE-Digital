import React, { memo } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { colors, radius, spacing } from '../../theme';

interface NativeFormulaBlockProps {
  rawText: string;
  latex?: string;
  isBlockMath?: boolean;
}

function NativeFormulaBlockComponent({ rawText, isBlockMath = true }: NativeFormulaBlockProps) {
  if (!rawText) return null;

  return (
    <View style={[styles.container, isBlockMath && styles.blockContainer]}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        <Text style={styles.formulaText} selectable>
          {rawText}
        </Text>
      </ScrollView>
    </View>
  );
}

export const NativeFormulaBlock = memo(NativeFormulaBlockComponent);

const styles = StyleSheet.create({
  container: {
    marginVertical: spacing.xs,
  },
  blockContainer: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  scrollContent: {
    alignItems: 'center',
  },
  formulaText: {
    color: '#0F172A',
    fontSize: 16,
    lineHeight: 24,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
});
