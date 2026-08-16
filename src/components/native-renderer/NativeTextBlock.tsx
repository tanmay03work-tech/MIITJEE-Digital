import React, { memo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors, spacing } from '../../theme';

interface NativeTextBlockProps {
  content: string;
  isHeading?: boolean;
  style?: object;
}

function NativeTextBlockComponent({ content, isHeading, style }: NativeTextBlockProps) {
  if (!content) return null;

  return (
    <View style={[styles.container, style]}>
      <Text
        style={[
          styles.text,
          isHeading && styles.heading,
        ]}
        selectable
      >
        {content}
      </Text>
    </View>
  );
}

export const NativeTextBlock = memo(NativeTextBlockComponent);

const styles = StyleSheet.create({
  container: {
    width: '100%',
    minWidth: 0,
  },
  text: {
    color: colors.text,
    fontSize: 16,
    lineHeight: 25,
    fontWeight: '600',
    flexShrink: 1,
    letterSpacing: 0.2,
  },
  heading: {
    fontSize: 18,
    lineHeight: 28,
    fontWeight: '800',
    color: colors.text,
    marginBottom: spacing.xs,
  },
});
