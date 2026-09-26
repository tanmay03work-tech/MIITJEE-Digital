import React, { memo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Clock3, GraduationCap, LockKeyhole, Sparkles } from 'lucide-react-native';
import LinearGradient from 'react-native-linear-gradient';

import { TestItem } from '../../types';
import { colors, radius, spacing } from '../../theme';
import { formatDateTimeLabel, formatDuration } from '../../utils/formatters';
import { AnimatedPressable } from '../common/AnimatedPressable';
import { Badge } from '../common/Badge';
import { Card } from '../common/Card';
import { scholarshipAdmissionLabels, scholarshipTargetLabels } from '../../constants/scholarship';
import { getTestLockedMessage, getTestStatusLabel, isTestActive } from '../../utils/testAvailability';

interface TestCardProps {
  test: TestItem;
  eligibility: {
    allowed: boolean;
    label: string;
    reason: string;
    ctaLabel: string;
  };
  onStart: () => void;
}

function TestCardComponent({ test, eligibility, onStart }: TestCardProps) {
  const testActive = isTestActive(test);

  return (
    <Card style={styles.card}>
      <LinearGradient colors={['rgba(56,43,140,0.08)', 'rgba(77,124,254,0.02)']} style={styles.topWash} />

      <View style={styles.headerRow}>
        <Badge
          label={
            test.type === 'scholarship'
              ? 'Scholarship'
              : test.isOpenForAll || test.accessMode === 'OPEN_FOR_ALL' || !test.batchId || test.batchId === 'ALL'
              ? 'Open for All'
              : 'Weekly'
          }
          tone={
            test.type === 'scholarship'
              ? 'warning'
              : test.isOpenForAll || test.accessMode === 'OPEN_FOR_ALL' || !test.batchId || test.batchId === 'ALL'
              ? 'success'
              : 'primary'
          }
        />
        <Badge label={getTestStatusLabel(test)} tone={testActive ? 'success' : 'warning'} />
      </View>

      <Text style={styles.title} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.88}>{test.title}</Text>
      <Text style={styles.description} numberOfLines={2} ellipsizeMode="tail">{test.description}</Text>

      <View style={styles.metaGrid}>
        <View style={styles.metaTile}>
          <Clock3 size={16} color={colors.primary} />
          <Text style={styles.metaLabel}>Duration</Text>
          <Text style={styles.metaValue}>{formatDuration(test.durationMinutes)}</Text>
        </View>
        <View style={styles.metaTile}>
          <GraduationCap size={16} color={colors.accent} />
          <Text style={styles.metaLabel}>Batch</Text>
          <Text style={styles.metaValue}>
            {test.isOpenForAll || test.accessMode === 'OPEN_FOR_ALL' || !test.batchId || test.batchId === 'ALL'
              ? 'Open for All'
              : test.allowedBatches && test.allowedBatches.length > 0
              ? test.allowedBatches.join(', ')
              : test.batchId}
          </Text>
        </View>
        <View style={styles.metaTile}>
          <Sparkles size={16} color={colors.warning} />
          <Text style={styles.metaLabel}>Schedule</Text>
          <Text style={styles.metaValue}>{formatDateTimeLabel(test.scheduledAt)}</Text>
        </View>
      </View>

      {test.type === 'scholarship' && test.scholarshipAdmissionClass && test.scholarshipTargetExam ? (
        <Text style={styles.trackText} numberOfLines={1} ellipsizeMode="tail">
          {scholarshipAdmissionLabels[test.scholarshipAdmissionClass]} | {scholarshipTargetLabels[test.scholarshipTargetExam]}
        </Text>
      ) : null}

      <View style={styles.footer}>
        <View style={styles.reasonRow}>
          <Text style={styles.reason} numberOfLines={2} ellipsizeMode="tail">
            {!testActive && eligibility.allowed ? getTestLockedMessage(test) : eligibility.reason}
          </Text>
          <Text style={styles.questionCount} numberOfLines={1}>{test.questionCount} questions</Text>
        </View>
        <AnimatedPressable
          style={[styles.button, (!eligibility.allowed || !testActive) && styles.buttonDisabled]}
          onPress={onStart}>
          {!eligibility.allowed || !testActive ? <LockKeyhole size={16} color={colors.textSubtle} /> : null}
          <Text style={[styles.buttonText, (!eligibility.allowed || !testActive) && styles.buttonTextDisabled]}>
            {eligibility.allowed ? 'Start Paper' : eligibility.ctaLabel}
          </Text>
        </AnimatedPressable>
      </View>
    </Card>
  );
}

export const TestCard = memo(TestCardComponent);

const styles = StyleSheet.create({
  card: {
    gap: spacing.md,
    overflow: 'hidden',
    paddingTop: spacing.xl,
  },
  topWash: {
    ...StyleSheet.absoluteFillObject,
    bottom: undefined,
    height: 92,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    flexWrap: 'wrap',
    minWidth: 0,
  },
  title: {
    color: colors.text,
    fontSize: 18,
    lineHeight: 24,
    fontWeight: '800',
  },
  description: {
    color: colors.textMuted,
    fontSize: 14,
    lineHeight: 20,
  },
  metaGrid: {
    flexDirection: 'row',
    alignItems: 'stretch',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  metaTile: {
    flex: 1,
    borderRadius: radius.lg,
    padding: spacing.md,
    backgroundColor: colors.surfaceMuted,
    gap: spacing.xs,
    minWidth: 0,
  },
  metaLabel: {
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  metaValue: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 18,
    flexShrink: 1,
  },
  questionCount: {
    color: colors.primary,
    fontSize: 13,
    fontWeight: '700',
    flexShrink: 0,
  },
  trackText: {
    color: colors.accent,
    fontSize: 12,
    fontWeight: '700',
  },
  footer: {
    gap: spacing.md,
  },
  reasonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    minWidth: 0,
  },
  reason: {
    flex: 1,
    flexShrink: 1,
    color: colors.textMuted,
    fontSize: 13,
    lineHeight: 18,
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: colors.primary,
    paddingVertical: spacing.lg,
    minWidth: 0,
  },
  buttonDisabled: {
    backgroundColor: colors.surfaceMuted,
  },
  buttonText: {
    color: colors.white,
    fontWeight: '800',
    fontSize: 14,
    flexShrink: 1,
  },
  buttonTextDisabled: {
    color: colors.textSubtle,
  },
});
