import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { AlertCircle, RefreshCw } from 'lucide-react-native';

import { Card } from './Card';
import { Button } from './Button';
import { colors, radius, spacing } from '../../theme';

export interface ErrorStateProps {
  title?: string;
  message: string;
  onRetry?: () => void;
  isRetrying?: boolean;
}

export function ErrorState({
  title = 'Something went wrong',
  message,
  onRetry,
  isRetrying = false,
}: ErrorStateProps) {
  return (
    <Card style={styles.card}>
      <View style={styles.iconWrap}>
        <AlertCircle size={28} color={colors.danger} />
      </View>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.message}>{message}</Text>
      {onRetry ? (
        <Button
          variant="outline"
          size="sm"
          onPress={onRetry}
          loading={isRetrying}
          loadingText="Retrying..."
          icon={<RefreshCw size={14} color={colors.text} />}
          style={styles.retryBtn}>
          Try Again
        </Button>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    alignItems: 'center',
    paddingVertical: spacing.xxl,
    paddingHorizontal: spacing.xl,
    gap: spacing.sm,
    backgroundColor: colors.surface,
  },
  iconWrap: {
    width: 56,
    height: 56,
    borderRadius: radius.pill,
    backgroundColor: colors.dangerSoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xs,
  },
  title: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '800',
    textAlign: 'center',
  },
  message: {
    color: colors.textMuted,
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
    maxWidth: 320,
  },
  retryBtn: {
    marginTop: spacing.md,
  },
});
