import React from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import { ArrowRight, Sparkles } from 'lucide-react-native';

import { AnimatedPressable } from '../common/AnimatedPressable';
import { colors, radius, shadows, spacing } from '../../theme';

interface ScholarshipHeroProps {
  onPress: () => void;
}

export function ScholarshipHero({ onPress }: ScholarshipHeroProps) {
  return (
    <LinearGradient
      colors={[colors.primaryDeep, colors.primary, '#40368D']}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={styles.gradient}>
      <View style={styles.row}>
        <View style={styles.badge}>
          <Sparkles size={14} color={colors.white} />
          <Text style={styles.badgeText}>Scholarship Test</Text>
        </View>
      </View>
      <View style={styles.brandPlate}>
        <Image source={require('../../assets/branding/miitjee-logo.png')} style={styles.brandImage} resizeMode="contain" />
      </View>
      <Text style={styles.title}>Earn up to 100% scholarship through our national challenge</Text>
      <Text style={styles.subtitle}>
        Register in minutes, take the paper with a clean exam interface, and unlock rankings, analysis, and admission follow-up.
      </Text>
      <AnimatedPressable onPress={onPress} style={styles.cta}>
        <Text style={styles.ctaText}>Register Now</Text>
        <ArrowRight size={16} color={colors.primary} />
      </AnimatedPressable>
      <View style={styles.glow} />
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  gradient: {
    marginHorizontal: spacing.xl,
    marginBottom: spacing.xxl,
    borderRadius: radius.xl,
    padding: spacing.xxl,
    overflow: 'hidden',
    ...shadows.card,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    marginBottom: spacing.md,
    minWidth: 0,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    maxWidth: '100%',
    minWidth: 0,
  },
  badgeText: {
    color: colors.white,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
    flexShrink: 1,
  },
  title: {
    color: colors.white,
    fontSize: 26,
    lineHeight: 32,
    fontWeight: '900',
    marginBottom: spacing.sm,
    flexShrink: 1,
    minWidth: 0,
  },
  subtitle: {
    color: 'rgba(255,255,255,0.78)',
    fontSize: 14,
    lineHeight: 20,
    marginBottom: spacing.xl,
    flexShrink: 1,
    minWidth: 0,
  },
  cta: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.white,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.lg,
    borderRadius: radius.md,
    maxWidth: '100%',
  },
  ctaText: {
    color: colors.primary,
    fontSize: 14,
    fontWeight: '800',
    flexShrink: 1,
  },
  brandPlate: {
    alignSelf: 'flex-start',
    backgroundColor: '#fff800',
    borderRadius: radius.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: 'rgba(27,34,51,0.08)',
    maxWidth: '100%',
  },
  brandImage: {
    width: 156,
    height: 44,
    opacity: 1,
    flexShrink: 0,
  },
  glow: {
    position: 'absolute',
    width: 220,
    height: 220,
    borderRadius: 110,
    backgroundColor: 'rgba(255,255,255,0.12)',
    right: -70,
    bottom: -100,
  },
});
