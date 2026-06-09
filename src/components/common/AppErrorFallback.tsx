import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import { AlertTriangle, RefreshCw } from 'lucide-react-native';

import { Button } from './Button';
import { colors, radius, spacing } from '../../theme';

interface AppErrorFallbackProps {
  title?: string;
  message?: string;
  onRetry?: () => void;
}

export function AppErrorFallback({
  title = 'Something went wrong',
  message = 'We ran into an unexpected issue. Please try again. If the problem continues, reopen the app and continue from a stable screen.',
  onRetry,
}: AppErrorFallbackProps) {
  return (
    <View style={styles.container}>
      <View style={styles.backgroundOrbPrimary} />
      <View style={styles.backgroundOrbAccent} />

      <View style={styles.content}>
        <LinearGradient colors={[colors.dangerSoft, colors.surfaceRaised]} style={styles.iconWrap}>
          <AlertTriangle size={30} color={colors.danger} />
        </LinearGradient>

        <View style={styles.textBlock}>
          <Text style={styles.eyebrow}>Recovery Mode</Text>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.message}>{message}</Text>
        </View>

        {onRetry ? (
          <Button style={styles.retryButton} onPress={onRetry}>
            <RefreshCw size={16} color={colors.white} />
            Try Again
          </Button>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
    overflow: 'hidden',
  },
  backgroundOrbPrimary: {
    position: 'absolute',
    top: -90,
    right: -48,
    width: 240,
    height: 240,
    borderRadius: 120,
    backgroundColor: 'rgba(227, 93, 91, 0.08)',
  },
  backgroundOrbAccent: {
    position: 'absolute',
    bottom: -80,
    left: -44,
    width: 220,
    height: 220,
    borderRadius: 110,
    backgroundColor: 'rgba(91, 97, 246, 0.06)',
  },
  content: {
    width: '100%',
    maxWidth: 420,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceRaised,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.xxl,
    alignItems: 'center',
    gap: spacing.lg,
  },
  iconWrap: {
    width: 76,
    height: 76,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
  },
  textBlock: {
    alignItems: 'center',
    gap: spacing.sm,
  },
  eyebrow: {
    color: colors.danger,
    fontSize: 12,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.9,
  },
  title: {
    color: colors.text,
    fontSize: 24,
    lineHeight: 30,
    fontWeight: '900',
    textAlign: 'center',
  },
  message: {
    color: colors.textMuted,
    fontSize: 14,
    lineHeight: 21,
    textAlign: 'center',
  },
  retryButton: {
    minWidth: 160,
  },
});
