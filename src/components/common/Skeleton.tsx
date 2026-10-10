import React, { memo, useEffect } from 'react';
import { DimensionValue, StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import Animated, {
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

import { colors, radius } from '../../theme';

export interface SkeletonProps {
  width?: DimensionValue;
  height?: DimensionValue;
  borderRadius?: number;
  style?: StyleProp<ViewStyle>;
}

function SkeletonComponent({
  width = '100%',
  height = 16,
  borderRadius = radius.sm,
  style,
}: SkeletonProps) {
  const progress = useSharedValue(0.4);

  useEffect(() => {
    progress.value = withRepeat(
      withSequence(
        withTiming(0.9, { duration: 900 }),
        withTiming(0.4, { duration: 900 }),
      ),
      -1,
      true,
    );
  }, [progress]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0.4, 0.9], [0.4, 0.85]),
  }));

  return (
    <View style={[{ width, height, overflow: 'hidden', borderRadius }, style]}>
      <Animated.View style={[styles.skeleton, { borderRadius }, animatedStyle]} />
    </View>
  );
}

export const Skeleton = memo(SkeletonComponent);

const styles = StyleSheet.create({
  skeleton: {
    width: '100%',
    height: '100%',
    backgroundColor: colors.borderStrong,
  },
});
