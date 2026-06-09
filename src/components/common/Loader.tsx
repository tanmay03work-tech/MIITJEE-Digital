import React, { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import { colors, radius, spacing } from '../../theme';

interface LoaderProps {
  lines?: number;
  compact?: boolean;
}

export function Loader({ lines = 3, compact = false }: LoaderProps) {
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withRepeat(withTiming(1, { duration: 1000, easing: Easing.inOut(Easing.ease) }), -1, true);
  }, [progress]);

  const animatedStyle = useAnimatedStyle(() => {
    const opacity = interpolate(progress.value, [0, 1], [0.45, 1]);
    return { opacity };
  });

  return (
    <View style={[styles.wrapper, compact && styles.wrapperCompact]}>
      <Animated.View style={[styles.badge, animatedStyle]} />
      {Array.from({ length: lines }, (_, index) => (
        <Animated.View
          key={`loader_line_${index}`}
          style={[
            styles.line,
            index === 0 && styles.lineLong,
            index === lines - 1 && styles.lineShort,
            animatedStyle,
          ]}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    padding: spacing.xl,
    gap: spacing.md,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  wrapperCompact: {
    padding: spacing.lg,
  },
  badge: {
    width: 56,
    height: 56,
    borderRadius: 18,
    backgroundColor: colors.primarySoft,
  },
  line: {
    height: 12,
    borderRadius: radius.pill,
    backgroundColor: colors.backgroundAlt,
    width: '100%',
  },
  lineLong: {
    width: '82%',
  },
  lineShort: {
    width: '58%',
  },
});
