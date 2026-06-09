import React, { memo, useEffect } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import Animated, {
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

import { colors, radius, spacing } from '../../theme';

interface BrandLoadingStateProps {
  title?: string;
  subtitle?: string;
  variant?: 'screen' | 'overlay';
}

function LoadingSkeletonRow({ width }: { width: `${number}%` }) {
  const progress = useSharedValue(0.55);

  useEffect(() => {
    progress.value = withRepeat(
      withSequence(withTiming(1, { duration: 850 }), withTiming(0.55, { duration: 850 })),
      -1,
      true,
    );
  }, [progress]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0.55, 1], [0.45, 0.95]),
  }));

  return (
    <View style={{ width }}>
      <Animated.View style={[styles.skeletonRow, animatedStyle]} />
    </View>
  );
}

function BrandLoadingStateComponent({
  title = 'Loading MIITJEE Digital',
  subtitle = 'Please wait while we prepare the latest data for this screen.',
  variant = 'screen',
}: BrandLoadingStateProps) {
  return (
    <View style={[styles.container, variant === 'overlay' ? styles.containerOverlay : styles.containerScreen]}>
      <View style={[styles.panel, variant === 'overlay' ? styles.panelOverlay : styles.panelScreen]}>
        <Image source={require('../../assets/branding/miitjee-logo.png')} style={styles.logo} resizeMode="contain" />
        <View style={styles.copyWrap}>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.subtitle}>{subtitle}</Text>
        </View>
        <View style={styles.skeletonWrap}>
          <LoadingSkeletonRow width="88%" />
          <LoadingSkeletonRow width="72%" />
          <LoadingSkeletonRow width="58%" />
        </View>
      </View>
    </View>
  );
}

export const BrandLoadingState = memo(BrandLoadingStateComponent);

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  containerScreen: {
    flex: 1,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.xxxl,
  },
  containerOverlay: {
    width: '100%',
  },
  panel: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.lg,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    shadowColor: colors.shadow,
    shadowOpacity: 0.08,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 10 },
    elevation: 4,
  },
  panelScreen: {
    width: '100%',
    maxWidth: 360,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.xxxl,
  },
  panelOverlay: {
    width: '100%',
    maxWidth: 320,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.xl,
  },
  logo: {
    width: 188,
    height: 56,
  },
  copyWrap: {
    alignItems: 'center',
    gap: spacing.sm,
  },
  title: {
    color: colors.text,
    fontSize: 20,
    lineHeight: 26,
    fontWeight: '800',
    textAlign: 'center',
  },
  subtitle: {
    color: colors.textMuted,
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
    maxWidth: 280,
  },
  skeletonWrap: {
    width: '100%',
    gap: spacing.sm,
    alignItems: 'center',
  },
  skeletonRow: {
    height: 10,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceMuted,
  },
});
