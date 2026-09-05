import React, { memo } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { CheckCircle2, ShieldAlert, Trash2, XCircle } from 'lucide-react-native';

import { AnimatedPressable } from '../common/AnimatedPressable';
import { Badge } from '../common/Badge';
import { Card } from '../common/Card';
import { EmptyState } from '../common/EmptyState';
import { SelectField, SelectOption } from '../common/SelectField';
import { colors, spacing } from '../../theme';
import { EnquiryRecord, EnrollmentQueryRecord, ScholarshipRegistrationRecord, TestItem, TestResult, AppUser, ReattemptRequestRecord } from '../../types';
import { formatDateLabel } from '../../utils/formatters';

interface DeleteButtonProps {
  label: string;
  onPress: () => void;
}

interface ResultCardProps {
  result: TestResult;
  user?: AppUser;
  test?: TestItem;
  onDelete: (attemptId: string) => Promise<void>;
}

interface ScholarshipCardProps {
  registration: ScholarshipRegistrationRecord;
  onDelete: (registrationId: string) => Promise<void>;
}

interface BatchAccessCardProps {
  request: EnrollmentQueryRecord;
  onDelete: (queryId: string) => Promise<void>;
  onAssignBatch?: (request: EnrollmentQueryRecord, value: string) => Promise<void>;
  batchOptions?: SelectOption[];
}

interface EnquiryCardProps {
  enquiry: EnquiryRecord;
  onDelete: (enquiryId: string) => Promise<void>;
}

interface ReattemptCardProps {
  request: ReattemptRequestRecord;
  onApprove: (requestId: string) => Promise<void>;
  onReject: (requestId: string) => Promise<void>;
  onDelete: (requestId: string) => Promise<void>;
}

function DeleteButton({ label, onPress }: DeleteButtonProps) {
  return (
    <AnimatedPressable style={styles.deleteButton} onPress={onPress}>
      <Trash2 size={15} color={colors.danger} />
      <Text style={styles.deleteButtonText}>{label}</Text>
    </AnimatedPressable>
  );
}

export const ResultsEmptyState = memo(function ResultsEmptyState() {
  return (
    <EmptyState
      icon={ShieldAlert}
      title="No results yet"
      description="Submissions will appear here once students complete a paper."
    />
  );
});

export const ScholarshipEmptyState = memo(function ScholarshipEmptyState() {
  return (
    <EmptyState
      icon={ShieldAlert}
      title="No scholarship forms yet"
      description="Scholarship registrations will appear here as soon as students begin applying."
    />
  );
});

export const BatchAccessEmptyState = memo(function BatchAccessEmptyState() {
  return (
    <EmptyState
      icon={ShieldAlert}
      title="No batch requests yet"
      description="Enrollment requests will appear here for review once students submit them."
    />
  );
});

export const GeneralEnquiryEmptyState = memo(function GeneralEnquiryEmptyState() {
  return (
    <EmptyState
      icon={ShieldAlert}
      title="No enquiries yet"
      description="General enquiry submissions will appear here for the admissions team."
    />
  );
});

export const AdminResultCard = memo(function AdminResultCard({ result, user, test, onDelete }: ResultCardProps) {
  const isOpenExam = Boolean(test?.isOpenForAll) || test?.accessMode === 'OPEN_FOR_ALL';
  const batchLabel = isOpenExam ? 'Open for All' : (user?.batchId || test?.batchId || 'Open for All');
  const wrongCount = result.wrongAnswers ?? Math.max(0, result.totalQuestions - result.correctAnswers - (result.unattempted ?? 0));
  const unattemptedCount = result.unattempted ?? Math.max(0, result.totalQuestions - result.correctAnswers - wrongCount);

  return (
    <Card style={styles.resultCard}>
      <View style={styles.headerRow}>
        <Badge label={test?.type ?? 'paper'} tone={test?.type === 'scholarship' ? 'warning' : 'primary'} />
        <Badge label={batchLabel} tone={isOpenExam ? 'success' : 'primary'} />
        <Badge label={`Rank #${result.rank}`} tone="neutral" />
      </View>
      <Text style={styles.title}>{test?.title ?? 'Untitled paper'}</Text>
      <Text style={styles.emphasis}>{result.studentName || user?.fullName || 'Student'}</Text>
      <Text style={styles.meta}>
        {`${result.correctAnswers} Correct • ${wrongCount} Wrong • ${unattemptedCount} Unattempted | ${formatDateLabel(result.submittedAt)}`}
      </Text>
      <View style={styles.footerRow}>
        <View style={styles.scoreWrap}>
          <Text style={styles.score}>{result.score} Marks</Text>
          <Text style={styles.percentile}>Percentile P{result.percentile}</Text>
        </View>
        <DeleteButton
          label="Delete"
          onPress={() =>
            Alert.alert('Delete result?', 'This attempt will be removed permanently.', [
              { text: 'Cancel', style: 'cancel' },
              {
                text: 'Delete',
                style: 'destructive',
                onPress: () => {
                  void onDelete(result.id).catch((error) => {
                    Alert.alert('Delete failed', error instanceof Error ? error.message : 'Unable to delete this result.');
                  });
                },
              },
            ])
          }
        />
      </View>
    </Card>
  );
});

export const ScholarshipRegistrationCard = memo(function ScholarshipRegistrationCard({
  registration,
  onDelete,
}: ScholarshipCardProps) {
  return (
    <Card style={styles.dataCard}>
      <View style={styles.headerRow}>
        <Badge label="Scholarship" tone="warning" />
        <Badge label={formatDateLabel(registration.createdAt)} tone="neutral" />
      </View>
      <Text style={styles.title}>{registration.fullName}</Text>
      <Text style={styles.meta}>{registration.testTitle}</Text>
      <Text style={styles.meta}>{`${registration.email} | ${registration.phone}`}</Text>
      <Text style={styles.meta}>{`${registration.city} | ${registration.classLabel} | ${registration.targetExam}`}</Text>
      <DeleteButton
        label="Delete"
        onPress={() =>
          Alert.alert('Delete registration?', 'This scholarship form will be removed permanently.', [
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'Delete',
              style: 'destructive',
              onPress: () => {
                void onDelete(registration.id).catch((error) => {
                  Alert.alert('Delete failed', error instanceof Error ? error.message : 'Unable to delete this registration.');
                });
              },
            },
          ])
        }
      />
    </Card>
  );
});

export const BatchAccessRequestCard = memo(function BatchAccessRequestCard({
  request,
  onDelete,
  onAssignBatch,
  batchOptions = [],
}: BatchAccessCardProps) {
  return (
    <Card style={styles.dataCard}>
      <View style={styles.headerRow}>
        <Badge label={request.batchLabel} tone="primary" />
        <Badge label={request.status} tone={request.status === 'open' ? 'warning' : 'success'} />
      </View>
      <Text style={styles.title}>{request.fullName}</Text>
      <Text style={styles.meta}>{`${request.email} | ${request.phone}`}</Text>
      <Text style={styles.message}>{request.message}</Text>
      {onAssignBatch && batchOptions.length > 0 ? (
        <SelectField
          label="Grant Batch Role"
          placeholder="Select batch role"
          value={request.batchId}
          menuTitle={`Grant batch role for ${request.fullName}`}
          options={batchOptions}
          onValueChange={(value) => {
            void onAssignBatch(request, value);
          }}
        />
      ) : null}
      <DeleteButton
        label="Delete"
        onPress={() =>
          Alert.alert('Delete request?', 'This batch access request will be removed permanently.', [
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'Delete',
              style: 'destructive',
              onPress: () => {
                void onDelete(request.id).catch((error) => {
                  Alert.alert('Delete failed', error instanceof Error ? error.message : 'Unable to delete this request.');
                });
              },
            },
          ])
        }
      />
    </Card>
  );
});

export const GeneralEnquiryCard = memo(function GeneralEnquiryCard({ enquiry, onDelete }: EnquiryCardProps) {
  return (
    <Card style={styles.dataCard}>
      <View style={styles.headerRow}>
        <Badge label="Enquiry" tone="primary" />
        <Badge label={formatDateLabel(enquiry.createdAt)} tone="neutral" />
      </View>
      <Text style={styles.title}>{enquiry.fullName}</Text>
      <Text style={styles.meta}>{`${enquiry.email} | ${enquiry.phone}`}</Text>
      <Text style={styles.message}>{enquiry.message}</Text>
      <DeleteButton
        label="Delete"
        onPress={() =>
          Alert.alert('Delete enquiry?', 'This general enquiry will be removed permanently.', [
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'Delete',
              style: 'destructive',
              onPress: () => {
                void onDelete(enquiry.id).catch((error) => {
                  Alert.alert('Delete failed', error instanceof Error ? error.message : 'Unable to delete this enquiry.');
                });
              },
            },
          ])
        }
      />
    </Card>
  );
});

export const ReattemptEmptyState = memo(function ReattemptEmptyState() {
  return (
    <EmptyState
      icon={ShieldAlert}
      title="No re-attempt requests"
      description="Requests from students asking permission to re-take a test will appear here."
    />
  );
});

export const ReattemptRequestCard = memo(function ReattemptRequestCard({
  request,
  onApprove,
  onReject,
  onDelete,
}: ReattemptCardProps) {
  const isApproved = request.status === 'approved';
  const isPending = request.status === 'pending';
  const isRejected = request.status === 'rejected';

  return (
    <Card style={styles.dataCard}>
      <View style={styles.headerRow}>
        <Badge
          label={isApproved ? 'Approved' : isRejected ? 'Declined' : 'Pending Approval'}
          tone={isApproved ? 'success' : isRejected ? 'danger' : 'warning'}
        />
        <Badge label={formatDateLabel(request.createdAt)} tone="neutral" />
      </View>
      <Text style={styles.title}>{request.studentName}</Text>
      <Text style={[styles.emphasis, { color: colors.primary }]}>{request.testTitle}</Text>
      {request.phone ? <Text style={styles.meta}>Phone: {request.phone}</Text> : null}
      {request.reason ? <Text style={styles.message}>Reason: {request.reason}</Text> : null}
      
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.xs, flexWrap: 'wrap' }}>
        {isPending || isRejected ? (
          <AnimatedPressable
            style={[styles.deleteButton, { backgroundColor: '#ECFDF5', borderColor: '#10B981' }]}
            onPress={() =>
              Alert.alert('Approve Re-attempt?', `Allow ${request.studentName} to re-attempt "${request.testTitle}"?`, [
                { text: 'Cancel', style: 'cancel' },
                {
                  text: 'Approve',
                  onPress: () => {
                    void onApprove(request.id).then(() => {
                      Alert.alert('Approved', `Re-attempt permission granted for ${request.studentName}.`);
                    }).catch((error) => {
                      Alert.alert('Approval failed', error instanceof Error ? error.message : 'Unable to approve request.');
                    });
                  },
                },
              ])
            }>
            <CheckCircle2 size={15} color="#10B981" />
            <Text style={[styles.deleteButtonText, { color: '#10B981' }]}>Approve Re-attempt</Text>
          </AnimatedPressable>
        ) : null}

        {isPending || isApproved ? (
          <AnimatedPressable
            style={[styles.deleteButton, { backgroundColor: '#FEF2F2', borderColor: '#EF4444' }]}
            onPress={() =>
              Alert.alert('Decline Request?', `Decline re-attempt request for ${request.studentName}?`, [
                { text: 'Cancel', style: 'cancel' },
                {
                  text: 'Decline',
                  style: 'destructive',
                  onPress: () => {
                    void onReject(request.id).then(() => {
                      Alert.alert('Declined', `Re-attempt request declined for ${request.studentName}.`);
                    }).catch((error) => {
                      Alert.alert('Action failed', error instanceof Error ? error.message : 'Unable to reject request.');
                    });
                  },
                },
              ])
            }>
            <XCircle size={15} color="#EF4444" />
            <Text style={[styles.deleteButtonText, { color: '#EF4444' }]}>Decline</Text>
          </AnimatedPressable>
        ) : null}

        <DeleteButton
          label="Delete"
          onPress={() =>
            Alert.alert('Delete record?', 'This re-attempt request record will be removed permanently.', [
              { text: 'Cancel', style: 'cancel' },
              {
                text: 'Delete',
                style: 'destructive',
                onPress: () => {
                  void onDelete(request.id).catch((error) => {
                    Alert.alert('Delete failed', error instanceof Error ? error.message : 'Unable to delete this record.');
                  });
                },
              },
            ])
          }
        />
      </View>
    </Card>
  );
});

const styles = StyleSheet.create({
  resultCard: {
    marginHorizontal: spacing.xl,
    marginBottom: spacing.md,
    gap: spacing.md,
  },
  dataCard: {
    marginHorizontal: spacing.xl,
    marginBottom: spacing.md,
    gap: spacing.sm,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: spacing.md,
    flexWrap: 'wrap',
  },
  footerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    gap: spacing.md,
    flexWrap: 'wrap',
  },
  scoreWrap: {
    gap: spacing.xs,
    flexShrink: 1,
  },
  title: {
    color: colors.text,
    fontSize: 16,
    lineHeight: 22,
    fontWeight: '800',
  },
  emphasis: {
    color: colors.textMuted,
    fontSize: 14,
    fontWeight: '700',
  },
  meta: {
    color: colors.textMuted,
    fontSize: 12,
    lineHeight: 18,
  },
  message: {
    color: colors.text,
    fontSize: 13,
    lineHeight: 19,
  },
  score: {
    color: colors.primary,
    fontSize: 24,
    fontWeight: '800',
  },
  percentile: {
    color: colors.accent,
    fontSize: 13,
    fontWeight: '700',
  },
  deleteButton: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: 999,
    backgroundColor: colors.dangerSoft,
    borderWidth: 1,
    borderColor: colors.danger,
  },
  deleteButtonText: {
    color: colors.danger,
    fontSize: 12,
    fontWeight: '800',
  },
});
