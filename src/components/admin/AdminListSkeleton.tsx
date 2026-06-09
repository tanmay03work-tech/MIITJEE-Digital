import React, { memo } from 'react';
import { StyleSheet, View } from 'react-native';

import { Card } from '../common/Card';
import { colors, radius, spacing } from '../../theme';

interface AdminListSkeletonProps {
  rows?: number;
}

export const AdminListSkeleton = memo(function AdminListSkeleton({ rows = 4 }: AdminListSkeletonProps) {
  return (
    <View style={styles.container}>
      {Array.from({ length: rows }).map((_, index) => (
        <Card key={`admin-skeleton-${index}`} style={styles.card}>
          <View style={[styles.line, styles.lineShort]} />
          <View style={[styles.line, styles.lineLong]} />
          <View style={[styles.line, styles.lineMedium]} />
        </Card>
      ))}
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: spacing.xl,
    gap: spacing.md,
  },
  card: {
    gap: spacing.sm,
  },
  line: {
    height: 10,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceMuted,
  },
  lineShort: {
    width: '30%',
  },
  lineLong: {
    width: '90%',
  },
  lineMedium: {
    width: '65%',
  },
});
