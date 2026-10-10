import React, { memo, useEffect, useMemo } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { CheckCircle2 } from 'lucide-react-native';
import Animated, { FadeIn, useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';

import { AnimatedPressable } from '../common/AnimatedPressable';
import { colors, radius, spacing } from '../../theme';
import { FormattedExamText } from '../common/FormattedExamText';

interface OptionCardProps {
  badgeLabel: string;
  label: string;
  selected: boolean;
  onPress: () => void;
  imageUrl?: string | null;
}

function OptionCardComponent({ badgeLabel, label, selected, onPress, imageUrl }: OptionCardProps) {
  const selectedScale = useSharedValue(selected ? 1.01 : 1);

  useEffect(() => {
    selectedScale.value = withSpring(selected ? 1.01 : 1, {
      damping: 14,
      stiffness: 170,
    });
  }, [selected, selectedScale]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: selectedScale.value }],
  }));

  return (
    <AnimatedPressable onPress={onPress} style={[styles.card, selected && styles.cardSelected, animatedStyle]}>
      <View style={[styles.pill, selected && styles.pillSelected]}>
        <Text style={[styles.pillText, selected && styles.pillTextSelected]}>{badgeLabel}</Text>
      </View>
      <View style={styles.contentWrap}>
        <FormattedExamText text={label} style={[styles.text, selected && styles.textSelected]} />
        {imageUrl ? (
          <Image source={{ uri: imageUrl }} style={styles.optionImage} resizeMode="contain" />
        ) : null}
      </View>
      {selected ? (
        <Animated.View entering={FadeIn} style={styles.checkWrap}>
          <CheckCircle2 size={18} color={colors.primary} />
        </Animated.View>
      ) : null}
    </AnimatedPressable>
  );
}

export const OptionCard = memo(OptionCardComponent);

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
    minWidth: 0,
  },
  cardSelected: {
    borderColor: colors.primary,
    backgroundColor: '#F7F4FF',
  },
  pill: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceMuted,
    flexShrink: 0,
  },
  pillSelected: {
    backgroundColor: colors.primary,
  },
  pillText: {
    color: colors.textMuted,
    fontWeight: '800',
    fontSize: 14,
  },
  pillTextSelected: {
    color: colors.white,
  },
  contentWrap: {
    flex: 1,
    flexShrink: 1,
    gap: spacing.xs,
  },
  text: {
    flexShrink: 1,
    minWidth: 0,
    color: colors.text,
    fontSize: 15,
    lineHeight: 22,
    fontWeight: '700',
  },
  optionImage: {
    width: '100%',
    maxWidth: '100%',
    maxHeight: 85,
    height: 65,
    borderRadius: radius.sm,
    marginTop: spacing.xs,
    alignSelf: 'flex-start',
  },
  textSelected: {
    color: colors.primaryDeep,
  },
  checkWrap: {
    flexShrink: 0,
    marginTop: 2,
  },
});
