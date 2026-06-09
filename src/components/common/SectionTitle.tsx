import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { colors, spacing } from '../../theme';

interface SectionTitleProps {
  title: string;
  action?: React.ReactNode;
}

export function SectionTitle({ title, action }: SectionTitleProps) {
  return (
    <View style={styles.container}>
      <Text style={styles.title} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.88}>
        {title}
      </Text>
      {action ? <View style={styles.actionWrap}>{action}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.xl,
    marginBottom: spacing.md,
    gap: spacing.md,
    minWidth: 0,
  },
  title: {
    flex: 1,
    flexShrink: 1,
    minWidth: 0,
    color: colors.text,
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: -0.2,
  },
  actionWrap: {
    flexShrink: 0,
    alignItems: 'flex-end',
  },
});
