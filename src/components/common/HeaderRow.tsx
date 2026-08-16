import React from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { ArrowLeft } from 'lucide-react-native';
import { useNavigation } from '@react-navigation/native';

import miitjeeLogo from '../../assets/branding/miitjee-logo.png';
import { AnimatedPressable } from './AnimatedPressable';
import { colors, radius, spacing, typography } from '../../theme';

interface HeaderRowProps {
  title: string;
  subtitle?: string;
  rightSlot?: React.ReactNode;
  showLogo?: boolean;
  compact?: boolean;
  onBack?: () => void;
  showBack?: boolean;
}

export function HeaderRow({
  title,
  subtitle,
  rightSlot,
  showLogo = true,
  compact = false,
  onBack,
  showBack,
}: HeaderRowProps) {
  let navigation: any = null;
  try {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    navigation = useNavigation();
  } catch {
    // Fallback if component is rendered outside NavigationContainer
  }

  const canGoBack = Boolean(navigation?.canGoBack?.());
  const displayBack = showBack !== undefined ? showBack : (canGoBack || Boolean(onBack));

  const handleBack = () => {
    if (onBack) {
      onBack();
    } else if (navigation?.canGoBack?.()) {
      navigation.goBack();
    }
  };

  return (
    <View style={[styles.container, compact && styles.containerCompact]}>
      <View style={styles.contentRow}>
        <View style={styles.leading}>
          {displayBack ? (
            <AnimatedPressable style={styles.backButton} onPress={handleBack} accessibilityLabel="Go Back">
              <ArrowLeft size={18} color={colors.primary} />
              <Text style={styles.backText}>Back</Text>
            </AnimatedPressable>
          ) : showLogo ? (
            <View style={[styles.logoWrap, compact && styles.logoWrapCompact]}>
              <Image
                source={miitjeeLogo}
                style={[styles.logo, compact && styles.logoCompact]}
                resizeMode="contain"
              />
            </View>
          ) : null}
          <View style={styles.textBlock}>
            <Text
              style={[styles.title, compact && styles.titleCompact]}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.84}>
              {title}
            </Text>
            {subtitle ? (
              <Text style={[styles.subtitle, compact && styles.subtitleCompact]} numberOfLines={2} ellipsizeMode="tail">
                {subtitle}
              </Text>
            ) : null}
          </View>
        </View>
        {rightSlot ? <View style={[styles.trailing, compact && styles.trailingCompact]}>{rightSlot}</View> : null}
      </View>
      <View style={styles.separator} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
    gap: spacing.sm,
  },
  containerCompact: {
    paddingTop: spacing.xs,
    paddingBottom: spacing.sm,
    gap: spacing.xs,
  },
  contentRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
    minWidth: 0,
  },
  leading: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minWidth: 0,
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
    borderRadius: radius.pill,
    backgroundColor: colors.primarySoft,
    borderWidth: 1,
    borderColor: colors.border,
    flexShrink: 0,
  },
  backText: {
    color: colors.primary,
    fontSize: 13,
    fontWeight: '700',
  },
  trailing: {
    flexShrink: 0,
    alignItems: 'flex-end',
    paddingTop: spacing.xs,
  },
  trailingCompact: {
    paddingTop: 2,
  },
  logoWrap: {
    width: 74,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  logoWrapCompact: {
    width: 58,
    height: 22,
  },
  logo: {
    width: 74,
    height: 24,
    flexShrink: 0,
  },
  logoCompact: {
    width: 58,
    height: 18,
  },
  textBlock: {
    flex: 1,
    flexShrink: 1,
    minWidth: 0,
    gap: spacing.xs,
  },
  title: {
    ...typography.title,
    flexShrink: 1,
    minWidth: 0,
  },
  titleCompact: {
    fontSize: 18,
    lineHeight: 22,
  },
  subtitle: {
    color: colors.textMuted,
    fontSize: 13,
    lineHeight: 19,
    flexShrink: 1,
    minWidth: 0,
  },
  subtitleCompact: {
    fontSize: 11,
    lineHeight: 16,
  },
  separator: {
    height: 1,
    backgroundColor: colors.border,
    opacity: 1,
  },
});
