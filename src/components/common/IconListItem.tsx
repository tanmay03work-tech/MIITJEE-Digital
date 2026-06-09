import React from 'react';
import { StyleProp, StyleSheet, Text, View, ViewStyle } from 'react-native';

import { colors, spacing } from '../../theme';

interface IconListItemProps {
  icon: React.ReactNode;
  title: string;
  subtitle?: string;
  rightSlot?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}

export function IconListItem({ icon, title, subtitle, rightSlot, style }: IconListItemProps) {
  return (
    <View style={[styles.container, style]}>
      <View style={styles.iconWrap}>{icon}</View>
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
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minWidth: 0,
  },
  iconWrap: {
    flexShrink: 0,
    alignItems: 'center',
    justifyContent: 'center',
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
    fontSize: 12,
    lineHeight: 18,
    flexShrink: 1,
  },
});
