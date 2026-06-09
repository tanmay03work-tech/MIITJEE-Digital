import React, { PropsWithChildren, memo } from 'react';
import { Pressable, PressableProps, StyleProp, ViewStyle } from 'react-native';
import Animated, { AnimatedStyle, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

const AnimatedPressableBase = Animated.createAnimatedComponent(Pressable);

interface AnimatedPressableProps extends Omit<PressableProps, 'style'> {
  style?: StyleProp<ViewStyle | AnimatedStyle<ViewStyle>>;
  pressedScale?: number;
}

function AnimatedPressableComponent({
  children,
  style,
  pressedScale = 0.95,
  onPressIn,
  onPressOut,
  ...props
}: PropsWithChildren<AnimatedPressableProps>) {
  const scale = useSharedValue(1);
  const translateY = useSharedValue(0);
  const opacity = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { scale: scale.value },
      { translateY: translateY.value },
    ],
    opacity: opacity.value,
  }));

  return (
    <AnimatedPressableBase
      {...props}
      style={[style, animatedStyle]}
      onPressIn={(event) => {
        scale.value = withTiming(pressedScale, { duration: 120 });
        translateY.value = withTiming(1, { duration: 120 });
        opacity.value = withTiming(0.96, { duration: 120 });
        onPressIn?.(event);
      }}
      onPressOut={(event) => {
        scale.value = withTiming(1, { duration: 120 });
        translateY.value = withTiming(0, { duration: 120 });
        opacity.value = withTiming(1, { duration: 120 });
        onPressOut?.(event);
      }}>
      {children}
    </AnimatedPressableBase>
  );
}

export const AnimatedPressable = memo(AnimatedPressableComponent);
