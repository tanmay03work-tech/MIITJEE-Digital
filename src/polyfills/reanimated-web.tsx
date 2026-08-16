// Web polyfill for react-native-reanimated
// Provides basic stubs so that components using Animated from reanimated compile on web.

import React from 'react';
import { View, Text, Image, ScrollView, FlatList } from 'react-native';

// Shared value stub
export function useSharedValue(initialValue: any) {
  const ref = React.useRef({ value: initialValue });
  return ref.current;
}

// Animated style stub - just returns the style as-is
export function useAnimatedStyle(updater: () => any, _deps?: any[]) {
  return updater();
}

// Derived value stub
export function useDerivedValue(updater: () => any, _deps?: any[]) {
  return { value: updater() };
}

// Animation functions - just return the target value
export function withTiming(toValue: number, _config?: any, _callback?: any) {
  return toValue;
}

export function withSpring(toValue: number, _config?: any, _callback?: any) {
  return toValue;
}

export function withDelay(_delay: number, animation: any) {
  return animation;
}

export function withSequence(...animations: any[]) {
  return animations[animations.length - 1];
}

export function withRepeat(animation: any, _numberOfReps?: number, _reverse?: boolean) {
  return animation;
}

export function withDecay(_config?: any) {
  return 0;
}

// Easing stubs
export const Easing = {
  linear: (t: number) => t,
  ease: (t: number) => t,
  quad: (t: number) => t * t,
  cubic: (t: number) => t * t * t,
  bezier: () => (t: number) => t,
  in: (easing: any) => easing,
  out: (easing: any) => easing,
  inOut: (easing: any) => easing,
};

// Run on JS/UI stubs
export function runOnJS(fn: any) {
  return fn;
}

export function runOnUI(fn: any) {
  return fn;
}

// useAnimatedScrollHandler
export function useAnimatedScrollHandler(_handler: any) {
  return undefined;
}

// useAnimatedGestureHandler
export function useAnimatedGestureHandler(_handler: any) {
  return undefined;
}

// useAnimatedRef
export function useAnimatedRef() {
  return React.useRef(null);
}

// Interpolation
export function interpolate(value: number, inputRange: number[], outputRange: number[]) {
  const firstIn = inputRange[0] ?? 0;
  const firstOut = outputRange[0] ?? 0;
  const lastOut = outputRange[outputRange.length - 1] ?? 0;

  if (inputRange.length < 2 || outputRange.length < 2) return firstOut;

  for (let i = 0; i < inputRange.length - 1; i++) {
    const minIn = inputRange[i] ?? 0;
    const maxIn = inputRange[i + 1] ?? 0;
    const minOut = outputRange[i] ?? 0;
    const maxOut = outputRange[i + 1] ?? 0;

    if (value >= minIn && value <= maxIn && maxIn !== minIn) {
      const progress = (value - minIn) / (maxIn - minIn);
      return minOut + progress * (maxOut - minOut);
    }
  }

  if (value < firstIn) return firstOut;
  return lastOut;
}

export const Extrapolate = {
  EXTEND: 'extend',
  CLAMP: 'clamp',
  IDENTITY: 'identity',
};

export const Extrapolation = Extrapolate;

// Layout animations
export const FadeIn = { duration: () => FadeIn };
export const FadeOut = { duration: () => FadeOut };
export const FadeInDown = { duration: () => FadeInDown, delay: () => FadeInDown };
export const FadeInRight = { duration: () => FadeInRight, delay: () => FadeInRight };
export const FadeInLeft = { duration: () => FadeInLeft, delay: () => FadeInLeft };
export const FadeInUp = { duration: () => FadeInUp, delay: () => FadeInUp };
export const FadeOutUp = { duration: () => FadeOutUp };
export const FadeOutDown = { duration: () => FadeOutDown };
export const SlideInRight = { duration: () => SlideInRight };
export const SlideOutLeft = { duration: () => SlideOutLeft };
export const SlideInLeft = { duration: () => SlideInLeft };
export const SlideOutRight = { duration: () => SlideOutRight };
export const ZoomIn = { duration: () => ZoomIn };
export const ZoomOut = { duration: () => ZoomOut };
export const Layout = { duration: () => Layout, springify: () => Layout };

// cancelAnimation
export function cancelAnimation(_sharedValue: any) {}

// measure
export function measure(_ref: any) {
  return { x: 0, y: 0, width: 0, height: 0, pageX: 0, pageY: 0 };
}

// Animated components - just pass through to regular RN components
const Animated = {
  View,
  Text,
  Image,
  ScrollView,
  FlatList,
  createAnimatedComponent: (Component: any) => Component,
};

export default Animated;

// Also export createAnimatedComponent standalone
export const createAnimatedComponent = (Component: any) => Component;
