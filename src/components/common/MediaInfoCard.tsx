import React from 'react';
import { StyleProp, StyleSheet, Text, View, ViewStyle } from 'react-native';

import { Card } from './Card';
import { colors, spacing } from '../../theme';

interface MediaInfoCardProps {
  title: string;
  subtitle?: string;
  rightSlot?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}

export function MediaInfoCard({ title, subtitle, rightSlot, style }: MediaInfoCardProps) {
  return (
    <Card style={[styles.card, style]}>
      <View style={styles.textBlock}>
        <Text style={styles.title} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.88}>
          {title}
        </Text>
        {subtitle ? (
          <Text style={styles.subtitle} numberOfLines={2} ellipsizeMode="tail">
            {subtitle}
          </Text>
        ) : null}
      </View>
      {rightSlot ? <View style={styles.trailing}>{rightSlot}</View> : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  textBlock: {
    flex: 1,
    flexShrink: 1,
    minWidth: 0,
    gap: spacing.xs,
  },
  trailing: {
    flexShrink: 0,
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  title: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '800',
    flexShrink: 1,
  },
  subtitle: {
    color: colors.textMuted,
    fontSize: 13,
    lineHeight: 18,
    flexShrink: 1,
  },
});
