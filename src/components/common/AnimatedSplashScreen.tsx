import React, { useEffect } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  FadeIn,
  FadeOut,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

import miitjeeLogo from '../../assets/branding/miitjee-logo.png';
import { colors, spacing } from '../../theme';

export function AnimatedSplashScreen() {
  const logoScale = useSharedValue(0.94);
  const logoOpacity = useSharedValue(0.72);
  const pulseScale = useSharedValue(0.88);

  useEffect(() => {
    logoScale.value = withRepeat(
      withSequence(
        withTiming(1.02, { duration: 1100, easing: Easing.out(Easing.cubic) }),
        withTiming(0.98, { duration: 1100, easing: Easing.inOut(Easing.cubic) }),
      ),
      -1,
      false,
    );

    logoOpacity.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 900, easing: Easing.out(Easing.quad) }),
        withTiming(0.82, { duration: 900, easing: Easing.inOut(Easing.quad) }),
      ),
      -1,
      false,
    );

    pulseScale.value = withRepeat(
      withSequence(
        withTiming(1.08, { duration: 1400, easing: Easing.out(Easing.cubic) }),
        withTiming(0.9, { duration: 1400, easing: Easing.inOut(Easing.cubic) }),
      ),
      -1,
      false,
    );
  }, [logoOpacity, logoScale, pulseScale]);

  const logoStyle = useAnimatedStyle(() => ({
    opacity: logoOpacity.value,
    transform: [{ scale: logoScale.value }],
  }));

  const pulseStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pulseScale.value }],
    opacity: 1.15 - pulseScale.value,
  }));

  return (
    <Animated.View entering={FadeIn.duration(220)} exiting={FadeOut.duration(320)} style={styles.container}>
      <View style={styles.backgroundOrbTop} />
      <View style={styles.backgroundOrbBottom} />

      <View style={styles.centerWrap}>
        <Animated.View style={[styles.pulseRing, pulseStyle]} />
        <Animated.Image
          source={miitjeeLogo}
          style={[styles.logo, logoStyle]}
          resizeMode="contain"
        />
        <Text style={styles.tagline}>Preparing your learning space</Text>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  backgroundOrbTop: {
    position: 'absolute',
    top: -120,
    right: -40,
    width: 280,
    height: 280,
    borderRadius: 140,
    backgroundColor: 'rgba(84, 60, 180, 0.07)',
  },
  backgroundOrbBottom: {
    position: 'absolute',
    bottom: -80,
    left: -60,
    width: 220,
    height: 220,
    borderRadius: 110,
    backgroundColor: 'rgba(84, 60, 180, 0.05)',
  },
  centerWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.lg,
    paddingHorizontal: spacing.xl,
  },
  pulseRing: {
    position: 'absolute',
    width: 220,
    height: 220,
    borderRadius: 110,
    borderWidth: 1,
    borderColor: 'rgba(84, 60, 180, 0.16)',
    backgroundColor: 'rgba(84, 60, 180, 0.03)',
  },
  logo: {
    width: 240,
    height: 88,
  },
  tagline: {
    color: colors.textMuted,
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
});
