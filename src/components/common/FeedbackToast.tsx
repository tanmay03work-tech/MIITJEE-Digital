import React, { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInUp, FadeOutUp } from 'react-native-reanimated';
import { AlertCircle, CheckCircle2, Info, X } from 'lucide-react-native';

import { colors, radius, spacing } from '../../theme';
import { IconButton } from './IconButton';

export interface FeedbackToastProps {
  visible: boolean;
  type?: 'success' | 'error' | 'info';
  message: string;
  title?: string;
  duration?: number;
  onDismiss: () => void;
}

export function FeedbackToast({
  visible,
  type = 'success',
  message,
  title,
  duration = 3000,
  onDismiss,
}: FeedbackToastProps) {
  useEffect(() => {
    if (!visible) return;
    const timer = setTimeout(() => {
      onDismiss();
    }, duration);
    return () => clearTimeout(timer);
  }, [duration, onDismiss, visible]);

  if (!visible) return null;

  const isSuccess = type === 'success';
  const isError = type === 'error';

  return (
    <Animated.View
      entering={FadeInUp.duration(200)}
      exiting={FadeOutUp.duration(200)}
      style={[
        styles.container,
        isSuccess && styles.containerSuccess,
        isError && styles.containerError,
      ]}>
      <View style={styles.iconWrap}>
        {isSuccess ? (
          <CheckCircle2 size={18} color={colors.success} />
        ) : isError ? (
          <AlertCircle size={18} color={colors.danger} />
        ) : (
          <Info size={18} color={colors.info} />
        )}
      </View>
      <View style={styles.textWrap}>
        {title ? <Text style={styles.title}>{title}</Text> : null}
        <Text style={styles.message}>{message}</Text>
      </View>
      <IconButton
        icon={<X size={14} color={colors.textMuted} />}
        accessibilityLabel="Dismiss notification"
        size="sm"
        onPress={onDismiss}
      />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 16,
    left: 16,
    right: 16,
    zIndex: 9999,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    shadowColor: colors.shadow,
    shadowOpacity: 0.12,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  containerSuccess: {
    borderColor: '#A7F3D0',
    backgroundColor: '#F0FDF4',
  },
  containerError: {
    borderColor: '#FECDD3',
    backgroundColor: '#FFF1F2',
  },
  iconWrap: {
    flexShrink: 0,
  },
  textWrap: {
    flex: 1,
  },
  title: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '700',
  },
  message: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '500',
    lineHeight: 18,
  },
});
