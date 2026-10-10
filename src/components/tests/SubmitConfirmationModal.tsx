import React from 'react';
import { Modal, StyleSheet, Text, View } from 'react-native';
import { Clock, HelpCircle, ShieldAlert, CheckCircle2 } from 'lucide-react-native';

import { AnimatedPressable } from '../common/AnimatedPressable';
import { colors, radius, spacing } from '../../theme';
import { formatRemainingMinutes } from '../../utils/formatters';

interface SubmitConfirmationModalProps {
  visible: boolean;
  totalQuestions: number;
  attemptedCount: number;
  unattemptedCount: number;
  flaggedCount: number;
  secondsRemaining: number;
  isSubmitting?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function SubmitConfirmationModal({
  visible,
  totalQuestions,
  attemptedCount,
  unattemptedCount,
  flaggedCount,
  secondsRemaining,
  isSubmitting = false,
  onConfirm,
  onCancel,
}: SubmitConfirmationModalProps) {
  const formattedTimeRemaining = formatRemainingMinutes(secondsRemaining);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={styles.overlay}>
        <View style={styles.card}>
          <View style={styles.headerIconWrap}>
            <ShieldAlert size={28} color={colors.primary} />
          </View>

          <Text style={styles.title}>Submit Exam Confirmation</Text>
          <Text style={styles.subtitle}>Are you sure you want to finish and submit your exam?</Text>

          <View style={styles.statsContainer}>
            <View style={styles.statRow}>
              <View style={styles.statLabelWrap}>
                <CheckCircle2 size={16} color={colors.success} />
                <Text style={styles.statLabel}>Attempted Questions</Text>
              </View>
              <Text style={[styles.statValue, { color: colors.success }]}>
                {attemptedCount} / {totalQuestions}
              </Text>
            </View>

            <View style={styles.statRow}>
              <View style={styles.statLabelWrap}>
                <HelpCircle size={16} color={colors.warning} />
                <Text style={styles.statLabel}>Unattempted Questions</Text>
              </View>
              <Text style={[styles.statValue, { color: colors.warning }]}>{unattemptedCount}</Text>
            </View>

            <View style={styles.statRow}>
              <View style={styles.statLabelWrap}>
                <ShieldAlert size={16} color={colors.primary} />
                <Text style={styles.statLabel}>Marked for Review</Text>
              </View>
              <Text style={[styles.statValue, { color: colors.primary }]}>{flaggedCount}</Text>
            </View>

            <View style={[styles.statRow, styles.statRowLast]}>
              <View style={styles.statLabelWrap}>
                <Clock size={16} color={colors.textMuted} />
                <Text style={styles.statLabel}>Time Remaining</Text>
              </View>
              <Text style={styles.statValue}>{formattedTimeRemaining}</Text>
            </View>
          </View>

          {flaggedCount > 0 ? (
            <View style={styles.warningBanner}>
              <Text style={styles.warningText}>
                You have {flaggedCount} question{flaggedCount > 1 ? 's' : ''} marked for review. They will be scored based on your selected answer.
              </Text>
            </View>
          ) : null}

          <View style={styles.buttonRow}>
            <AnimatedPressable
              disabled={isSubmitting}
              style={[styles.button, styles.cancelButton]}
              onPress={onCancel}>
              <Text style={styles.cancelButtonText}>Continue Exam</Text>
            </AnimatedPressable>

            <AnimatedPressable
              disabled={isSubmitting}
              style={[styles.button, styles.confirmButton, isSubmitting && styles.disabledButton]}
              onPress={onConfirm}>
              <Text style={styles.confirmButtonText}>{isSubmitting ? 'Submitting Paper...' : 'Submit Paper'}</Text>
            </AnimatedPressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.lg,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    padding: spacing.xl,
    width: '100%',
    maxWidth: 440,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.25,
    shadowRadius: 15,
    elevation: 8,
  },
  headerIconWrap: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.surfaceMuted,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  title: {
    fontSize: 20,
    fontWeight: '800',
    color: colors.text,
    textAlign: 'center',
    marginBottom: spacing.xs,
  },
  subtitle: {
    fontSize: 14,
    color: colors.textMuted,
    textAlign: 'center',
    marginBottom: spacing.lg,
  },
  statsContainer: {
    width: '100%',
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    marginBottom: spacing.lg,
  },
  statRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  statRowLast: {
    borderBottomWidth: 0,
  },
  statLabelWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  statLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
  },
  statValue: {
    fontSize: 15,
    fontWeight: '800',
    color: colors.text,
  },
  warningBanner: {
    width: '100%',
    backgroundColor: '#FFFBEB',
    borderColor: '#FCD34D',
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.lg,
  },
  warningText: {
    fontSize: 13,
    color: '#92400E',
    fontWeight: '600',
    textAlign: 'center',
  },
  buttonRow: {
    flexDirection: 'row',
    gap: spacing.md,
    width: '100%',
  },
  button: {
    flex: 1,
    height: 48,
    borderRadius: radius.md,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cancelButton: {
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cancelButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.text,
  },
  confirmButton: {
    backgroundColor: colors.primary,
  },
  confirmButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.white,
  },
  disabledButton: {
    opacity: 0.6,
  },
});
