import React, { memo, useMemo } from 'react';
import { StyleSheet, Text, TextStyle, StyleProp, View } from 'react-native';
import { formatExamTextForDisplay } from '../../utils/examText';

interface FormattedExamTextProps {
  text: string;
  style?: StyleProp<TextStyle>;
  numberOfLines?: number;
}

import { parseExamTextSegments, ExamTextSegment } from '../../utils/examText';
export type { ExamTextSegment };
export { parseExamTextSegments };

function FormattedExamTextComponent({ text, style, numberOfLines }: FormattedExamTextProps) {
  const segments = useMemo(() => parseExamTextSegments(text), [text]);

  const flatStyle = useMemo(() => StyleSheet.flatten(style) || {}, [style]);
  const fontSize = (flatStyle.fontSize as number) || 16;
  const textColor = (flatStyle.color as string) || '#0F172A';
  const arrowFontSize = Math.max(9, Math.round(fontSize * 0.62));
  const containerHeight = Math.round(fontSize * 1.35);

  return (
    <Text style={style} numberOfLines={numberOfLines}>
      {segments.map((seg, idx) => {
        if (seg.type === 'vector') {
          return (
            <View key={`seg_v_${idx}`} style={[styles.vectorContainer, { height: containerHeight }]}>
              <Text
                style={[
                  styles.arrowAbove,
                  {
                    fontSize: arrowFontSize,
                    lineHeight: arrowFontSize,
                    color: textColor,
                  },
                ]}>
                →
              </Text>
              <Text
                style={[
                  styles.vectorLetter,
                  {
                    fontSize,
                    lineHeight: fontSize * 1.05,
                    color: textColor,
                  },
                ]}>
                {seg.content}
              </Text>
            </View>
          );
        }

        if (seg.type === 'hat') {
          return (
            <View key={`seg_h_${idx}`} style={[styles.vectorContainer, { height: containerHeight }]}>
              <Text
                style={[
                  styles.hatAbove,
                  {
                    fontSize: arrowFontSize,
                    lineHeight: arrowFontSize,
                    color: textColor,
                  },
                ]}>
                ^
              </Text>
              <Text
                style={[
                  styles.vectorLetter,
                  {
                    fontSize,
                    lineHeight: fontSize * 1.05,
                    color: textColor,
                  },
                ]}>
                {seg.content}
              </Text>
            </View>
          );
        }

        return <Text key={`seg_t_${idx}`}>{seg.content}</Text>;
      })}
    </Text>
  );
}

export const FormattedExamText = memo(FormattedExamTextComponent);

const styles = StyleSheet.create({
  vectorContainer: {
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'flex-end',
    marginHorizontal: 1,
    paddingBottom: 0,
  },
  arrowAbove: {
    fontWeight: '900',
    textAlign: 'center',
    includeFontPadding: false,
    marginBottom: -2,
  },
  hatAbove: {
    fontWeight: '900',
    textAlign: 'center',
    includeFontPadding: false,
    marginBottom: -4,
  },
  vectorLetter: {
    fontWeight: '700',
    fontStyle: 'italic',
    textAlign: 'center',
    includeFontPadding: false,
  },
});
