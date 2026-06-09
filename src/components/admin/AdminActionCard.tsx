import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { LucideIcon } from 'lucide-react-native';

import { AnimatedPressable } from '../common/AnimatedPressable';
import { colors, radius, spacing } from '../../theme';

interface AdminActionCardProps {
  title: string;
  description: string;
  icon: LucideIcon;
  color: string;
  onPress: () => void;
}

export function AdminActionCard({ title, description, icon: Icon, color, onPress }: AdminActionCardProps) {
  return (
    <AnimatedPressable style={styles.card} onPress={onPress}>
      <View style={[styles.iconWrap, { backgroundColor: color }]}>
        <Icon size={18} color={colors.white} />
      </View>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.description}>{description}</Text>
    </AnimatedPressable>
  );
}

const styles = StyleSheet.create({
  card: {
    width: '47%',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.md,
  },
  iconWrap: {
    width: 44,
    height: 44,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '800',
  },
  description: {
    color: colors.textMuted,
    fontSize: 12,
    lineHeight: 18,
  },
});
