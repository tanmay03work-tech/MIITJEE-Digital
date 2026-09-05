import React, { useEffect, useMemo, useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';

import { AppHeader } from '../../components/common/AppHeader';
import { Badge } from '../../components/common/Badge';
import { BrandLoadingState } from '../../components/common/BrandLoadingState';
import { Card } from '../../components/common/Card';
import { Screen } from '../../components/common/Screen';
import { AnimatedPressable } from '../../components/common/AnimatedPressable';
import { InputField } from '../../components/common/InputField';
import { useAppStore } from '../../store/appStore';
import { useAuthStore } from '../../store/authStore';
import { useTestSessionStore } from '../../store/testSessionStore';
import { useLoader } from '../../providers/GlobalLoaderProvider';
import { colors, radius, spacing } from '../../theme';
import { RootStackScreenProps } from '../../navigation/types';
import { getEligibility } from '../../utils/accessControl';
import { formatDateTimeLabel, formatDuration } from '../../utils/formatters';
import {
  scholarshipAdmissionLabels,
  scholarshipAdmissionOptions,
  scholarshipTargetLabels,
  scholarshipTargetOptions,
} from '../../constants/scholarship';
import { ScholarshipAdmissionClass, ScholarshipTargetExam, TestResult, ReattemptRequestRecord } from '../../types';
import { updateRows } from '../../services/supabase/client';
import { getTestLockedMessage, getTestStatusLabel, isTestActive } from '../../utils/testAvailability';
import { fetchExistingAttemptForTest } from '../../services/api/tests';
import { fetchReattemptStatusForTest, submitReattemptRequest } from '../../services/api/reattemptRequests';

import { NAVIGATOR_BATCH_TEST_ID, NAVIGATOR_BATCH_TEST_ITEM } from '../../services/api/navigatorBatchTestData';

export function TestIntroScreen({ route, navigation }: RootStackScreenProps<'TestIntro'>) {
  const { testId } = route.params;
  const test =
    useAppStore((state) => state.tests.find((candidate) => candidate.id === testId)) ??
    (testId === NAVIGATOR_BATCH_TEST_ID ? NAVIGATOR_BATCH_TEST_ITEM : undefined);
  const user = useAuthStore((state) => state.user);
  const questionCache = useAppStore((state) => state.questionCache);
  const tests = useAppStore((state) => state.tests);
  const batches = useAppStore((state) => state.batches);
  const results = useAppStore((state) => state.results);
  const isBootstrapping = useAppStore((state) => state.isBootstrapping);
  const submitEnrollmentQuery = useAppStore((state) => state.submitEnrollmentQuery);
  const registerScholarshipAttempt = useAppStore((state) => state.registerScholarshipAttempt);
  const { showLoader, hideLoader } = useLoader();
  const [enrollmentBatchId, setEnrollmentBatchId] = useState(test?.batchId ?? batches[0]?.id ?? '');
  const [phone, setPhone] = useState('');
  const [message, setMessage] = useState('');
  const [scholarshipFullName, setScholarshipFullName] = useState(user?.fullName ?? '');
  const [scholarshipEmail, setScholarshipEmail] = useState(user?.email ?? '');
  const [scholarshipPhone, setScholarshipPhone] = useState('');
  const [scholarshipCity, setScholarshipCity] = useState('');
  const [scholarshipClassLabel, setScholarshipClassLabel] = useState<ScholarshipAdmissionClass>(
    test?.scholarshipAdmissionClass ?? '8th',
  );
  const [scholarshipTargetExam, setScholarshipTargetExam] = useState<ScholarshipTargetExam>(
    test?.scholarshipTargetExam ?? 'boards',
  );
  const [showNameModal, setShowNameModal] = useState(false);
  const [promptName, setPromptName] = useState(user?.fullName ?? '');
  const [reattemptRecord, setReattemptRecord] = useState<ReattemptRequestRecord | null>(null);
  const [showReattemptForm, setShowReattemptForm] = useState(false);
  const [reattemptPhone, setReattemptPhone] = useState('');
  const [reattemptReason, setReattemptReason] = useState('');

  const handleSaveNameAndStart = async () => {
    const trimmedName = promptName.trim();
    if (!trimmedName) {
      Alert.alert('Name Required', 'Please enter your full name to start the exam.');
      return;
    }

    try {
      showLoader({ title: 'Preparing Exam', subtitle: 'Saving your student name...' });
      if (user?.id) {
        void updateRows('profiles', { full_name: trimmedName }, { id: `eq.${user.id}` }).catch(() => undefined);
        useAuthStore.getState().setUser({ ...user, fullName: trimmedName });
      }
      useTestSessionStore.getState().setStudentName(trimmedName);
      setShowNameModal(false);
      if (test) {
        navigation.navigate('TestAttempt', { testId: test.id, studentName: trimmedName });
      }
    } catch {
      if (test) {
        useTestSessionStore.getState().setStudentName(trimmedName);
        setShowNameModal(false);
        navigation.navigate('TestAttempt', { testId: test.id, studentName: trimmedName });
      }
    } finally {
      hideLoader();
    }
  };

  if (!test && isBootstrapping) {
    return (
      <Screen contentContainerStyle={styles.loadingContent}>
        <AppHeader title="Loading Test Details" subtitle="Checking paper status and access." showLogo={false} />
        <BrandLoadingState title="Preparing this paper" subtitle="Verifying schedule, access, and result status for your account." />
      </Screen>
    );
  }

  if (!test) {
    return (
      <Screen contentContainerStyle={styles.content}>
        <AppHeader title="Test Details" subtitle="This test is no longer available" showLogo={false} />
      </Screen>
    );
  }

  const eligibility = getEligibility(user, test);
  const testActive = isTestActive(test);
  const statusLabel = getTestStatusLabel(test);
  const batchCards = useMemo(() => batches.slice(0, 6), [batches]);
  const cachedExistingAttempt = results.find((entry) => entry.userId === user?.id && entry.testId === test.id);
  const [existingAttempt, setExistingAttempt] = useState<TestResult | null | undefined>(cachedExistingAttempt);

  useEffect(() => {
    let isMounted = true;
    if (test?.id) {
      fetchExistingAttemptForTest(test.id, user?.id)
        .then((attempt) => {
          if (isMounted) {
            setExistingAttempt(attempt);
            if (!attempt) {
              // If attempt was deleted in Supabase, purge from app store results
              useAppStore.setState((prev) => ({
                results: prev.results.filter(
                  (r) => !(r.testId === test.id && (user?.id ? r.userId === user.id : true)),
                ),
              }));
            }
          }
        })
        .catch(() => {
          if (isMounted) {
            setExistingAttempt(cachedExistingAttempt);
          }
        });

      fetchReattemptStatusForTest(test.id, user?.id, user?.fullName)
        .then((statusRecord) => {
          if (isMounted) {
            setReattemptRecord(statusRecord);
          }
        })
        .catch(() => {
          // Ignore
        });
    }
    return () => {
      isMounted = false;
    };
  }, [test?.id, user?.id, user?.fullName, cachedExistingAttempt?.id]);

  const handleCheckReattemptStatus = async () => {
    if (!test?.id) return;
    try {
      showLoader({ title: 'Checking Status', subtitle: 'Fetching latest re-attempt approval...' });
      const record = await fetchReattemptStatusForTest(test.id, user?.id, user?.fullName || promptName);
      setReattemptRecord(record);
      if (record?.status === 'approved') {
        Alert.alert('Re-attempt Approved!', 'The admin has approved your re-attempt request. You can now start the exam.');
      } else if (record?.status === 'pending') {
        Alert.alert('Request Pending', 'Your request is currently awaiting admin approval. Please check back shortly.');
      } else if (record?.status === 'rejected') {
        Alert.alert('Request Declined', 'Your re-attempt request was declined by the admin.');
      } else {
        Alert.alert('No Request Found', 'No re-attempt request has been submitted yet.');
      }
    } finally {
      hideLoader();
    }
  };

  const handleSendReattemptRequest = async () => {
    const trimmedName = promptName.trim();
    if (!trimmedName) {
      Alert.alert('Name Required', 'Please enter your full name before submitting the re-attempt request.');
      return;
    }
    if (!test) return;

    try {
      showLoader({ title: 'Sending Request', subtitle: 'Submitting re-attempt request to admin...' });
      const record = await submitReattemptRequest({
        testId: test.id,
        testTitle: test.title,
        userId: user?.id,
        studentName: trimmedName,
        phone: reattemptPhone.trim() || undefined,
        reason: reattemptReason.trim() || undefined,
      });

      setReattemptRecord(record);
      setShowReattemptForm(false);
      Alert.alert(
        'Request Sent to Admin',
        'Your re-attempt request has been submitted. The admin will review it and once approved, you can start the exam.',
      );
    } catch (err) {
      Alert.alert('Submission Failed', err instanceof Error ? err.message : 'Unable to send request right now.');
    } finally {
      hideLoader();
    }
  };

  const handleEnrollmentSubmit = async () => {
    if (!enrollmentBatchId || !phone.trim() || !message.trim()) {
      Alert.alert('Missing details', 'Please choose a batch, phone number, and your query before sending.');
      return;
    }

    try {
      showLoader({
        title: 'Sending your request',
        subtitle: 'Submitting your batch access request to the MIITJEE team.',
      });
      await submitEnrollmentQuery({
        batchId: enrollmentBatchId,
        phone: phone.trim(),
        message: message.trim(),
      });

      Alert.alert('Request sent', 'Our team has received your enrollment query and will contact you shortly.');
    } finally {
      hideLoader();
    }
  };

  const handleScholarshipStart = async () => {
    if (
      !scholarshipFullName.trim() ||
      !scholarshipEmail.trim() ||
      !scholarshipPhone.trim() ||
      !scholarshipCity.trim() ||
      !scholarshipClassLabel ||
      !scholarshipTargetExam
    ) {
      Alert.alert('Complete your details', 'Please fill all scholarship details before starting the exam.');
      return;
    }

    const resolvedScholarshipTest =
      tests.find(
        (candidate) =>
          candidate.type === 'scholarship' &&
          candidate.scholarshipAdmissionClass === scholarshipClassLabel &&
          candidate.scholarshipTargetExam === scholarshipTargetExam,
      ) ?? test;

    if (
      resolvedScholarshipTest.type !== 'scholarship' ||
      resolvedScholarshipTest.scholarshipAdmissionClass !== scholarshipClassLabel ||
      resolvedScholarshipTest.scholarshipTargetExam !== scholarshipTargetExam
    ) {
      Alert.alert(
        'No matching scholarship paper',
        'No scholarship test is available yet for this admission class and target exam combination.',
      );
      return;
    }

    const alreadyAttemptedScholarship = results.find(
      (entry) => entry.userId === user?.id && entry.testId === resolvedScholarshipTest.id,
    );

    if (alreadyAttemptedScholarship) {
      Alert.alert('Already submitted', 'You have already given this test.');
      navigation.navigate('TestResult', {
        testId: resolvedScholarshipTest.id,
        resultId: alreadyAttemptedScholarship.id,
      });
      return;
    }

    if (!isTestActive(resolvedScholarshipTest) && user?.role !== 'admin') {
      Alert.alert('Paper locked', getTestLockedMessage(resolvedScholarshipTest));
      return;
    }

    try {
      showLoader({
        title: 'Preparing your scholarship paper',
        subtitle: 'Saving your details and unlocking the right scholarship test.',
      });
      await registerScholarshipAttempt({
        testId: resolvedScholarshipTest.id,
        fullName: scholarshipFullName.trim(),
        email: scholarshipEmail.trim(),
        phone: scholarshipPhone.trim(),
        city: scholarshipCity.trim(),
        classLabel: scholarshipClassLabel,
        targetExam: scholarshipTargetExam,
      });

      useTestSessionStore.getState().setStudentName(scholarshipFullName.trim());
      navigation.navigate('TestAttempt', { testId: resolvedScholarshipTest.id, studentName: scholarshipFullName.trim() });
    } finally {
      hideLoader();
    }
  };

  return (
    <Screen contentContainerStyle={styles.content}>
      <AppHeader title={test.title} subtitle="Review details before starting" showLogo={false} />

      <Card style={styles.summaryCard}>
        <View style={styles.badgeRow}>
          <Badge label={test.type} tone={test.type === 'scholarship' ? 'warning' : 'primary'} />
          <Badge label={statusLabel} tone={testActive ? 'success' : 'warning'} />
        </View>
        <Text style={styles.description}>{test.description}</Text>
        <Text style={styles.meta}>Subject / Stream: {test.subject || 'All Subjects'}</Text>
        <Text style={styles.meta}>Duration: {formatDuration(test.durationMinutes)}</Text>
        <Text style={styles.meta}>Total Questions: {test.questionCount}</Text>
        <Text style={styles.meta}>
          Access: {test.isOpenForAll ? 'Open for All Students' : test.allowedBatches && test.allowedBatches.length > 0 ? `Batch: ${test.allowedBatches.join(', ')}` : (test.batchId ? `Batch: ${test.batchId}` : 'Batch Restricted')}
        </Text>
        <Text style={styles.meta}>Starts: {formatDateTimeLabel(test.scheduledAt || test.startedAt || new Date().toISOString())}</Text>
        {test.endsAt ? <Text style={styles.meta}>Closing Deadline: {formatDateTimeLabel(test.endsAt)}</Text> : null}
        <Text style={styles.meta}>Status: {statusLabel}</Text>
        {existingAttempt ? <Text style={styles.reason}>You have already completed this paper. Review your result below.</Text> : null}
        <Text style={styles.reason}>{!testActive && eligibility.allowed ? getTestLockedMessage(test) : eligibility.reason}</Text>
      </Card>

      <Card style={styles.instructionsCard}>
        <Text style={styles.sectionTitle}>Before You Start</Text>
        <Text style={styles.instruction}>1. Questions appear one at a time for a calm, focused experience.</Text>
        <Text style={styles.instruction}>2. The timer submits the paper automatically when time runs out.</Text>
        <Text style={styles.instruction}>3. Weekly papers are available only for the assigned batch.</Text>
        <Text style={styles.instruction}>4. Scholarship papers open after you submit your details.</Text>
        {questionCache[test.id] && !existingAttempt ? (
          <Text style={styles.cacheHint}>This paper is loaded and ready.</Text>
        ) : null}
      </Card>

      {showNameModal ? (
        <Card style={styles.formCard}>
          <Text style={styles.sectionTitle}>Student Details</Text>
          <Text style={styles.helperText}>Please enter or verify your full name before starting the exam.</Text>
          <InputField
            label="Full Name *"
            value={promptName}
            onChangeText={setPromptName}
            placeholder="Enter your full name"
            autoFocus
          />
          <AnimatedPressable style={styles.startButton} onPress={() => void handleSaveNameAndStart()}>
            <Text style={styles.startText}>Start Exam</Text>
          </AnimatedPressable>
          <AnimatedPressable
            style={[styles.startButton, { backgroundColor: colors.surfaceMuted, marginTop: spacing.xs }]}
            onPress={() => setShowNameModal(false)}>
            <Text style={[styles.startText, { color: colors.textMuted }]}>Cancel</Text>
          </AnimatedPressable>
        </Card>
      ) : existingAttempt ? (
        showReattemptForm ? (
          <Card style={styles.formCard}>
            <Text style={styles.sectionTitle}>Request Paper Re-attempt</Text>
            <Text style={styles.helperText}>
              Send a request to the admin team to get approval for re-attempting this paper.
            </Text>
            <InputField
              label="Full Name *"
              value={promptName}
              onChangeText={setPromptName}
              placeholder="Enter your full name"
            />
            <InputField
              label="Phone Number (Optional)"
              value={reattemptPhone}
              onChangeText={setReattemptPhone}
              keyboardType="phone-pad"
              placeholder="Enter your phone number"
            />
            <InputField
              label="Reason for Re-attempt (Optional)"
              value={reattemptReason}
              onChangeText={setReattemptReason}
              placeholder="e.g. Disconnected during exam / Network issue"
              multiline
              style={styles.multilineInput}
            />
            <AnimatedPressable style={styles.startButton} onPress={() => void handleSendReattemptRequest()}>
              <Text style={styles.startText}>Send Request to Admin</Text>
            </AnimatedPressable>
            <AnimatedPressable
              style={[styles.startButton, { backgroundColor: colors.surfaceMuted, marginTop: spacing.xs }]}
              onPress={() => setShowReattemptForm(false)}>
              <Text style={[styles.startText, { color: colors.textMuted }]}>Cancel</Text>
            </AnimatedPressable>
          </Card>
        ) : reattemptRecord?.status === 'approved' ? (
          <Card style={[styles.formCard, { borderColor: '#10B981', borderWidth: 1.5 }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
              <Badge label="Approved by Admin" tone="success" />
              <Text style={[styles.sectionTitle, { fontSize: 16, color: '#10B981' }]}>Re-attempt Granted</Text>
            </View>
            <Text style={styles.instruction}>
              The admin team has approved your request. You can now start a fresh attempt of this paper.
            </Text>
            <AnimatedPressable
              style={[styles.startButton, { backgroundColor: '#10B981' }]}
              onPress={() => {
                if (!testActive && user?.role !== 'admin') {
                  Alert.alert('Paper locked', getTestLockedMessage(test));
                  return;
                }
                setShowNameModal(true);
              }}>
              <Text style={styles.startText}>Start Re-attempt Paper</Text>
            </AnimatedPressable>
            <AnimatedPressable
              style={[styles.startButton, { backgroundColor: colors.surfaceMuted, marginTop: spacing.xs }]}
              onPress={() => navigation.navigate('TestResult', { testId: test.id, resultId: existingAttempt.id })}>
              <Text style={[styles.startText, { color: colors.textMuted }]}>View Result</Text>
            </AnimatedPressable>
          </Card>
        ) : reattemptRecord?.status === 'pending' ? (
          <Card style={[styles.formCard, { borderColor: '#F59E0B', borderWidth: 1.5 }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
              <Badge label="Pending Admin Approval" tone="warning" />
              <Text style={[styles.sectionTitle, { fontSize: 16, color: '#F59E0B' }]}>Re-attempt Requested</Text>
            </View>
            <Text style={styles.instruction}>
              Your request to re-attempt this paper has been submitted to the admin team for review. Once approved, you will be able to start the exam.
            </Text>
            <AnimatedPressable
              style={[styles.startButton, { backgroundColor: colors.primary }]}
              onPress={() => void handleCheckReattemptStatus()}>
              <Text style={styles.startText}>Check Approval Status</Text>
            </AnimatedPressable>
            <AnimatedPressable
              style={[styles.startButton, { backgroundColor: colors.surfaceMuted, marginTop: spacing.xs }]}
              onPress={() => navigation.navigate('TestResult', { testId: test.id, resultId: existingAttempt.id })}>
              <Text style={[styles.startText, { color: colors.textMuted }]}>View Result</Text>
            </AnimatedPressable>
          </Card>
        ) : reattemptRecord?.status === 'rejected' ? (
          <Card style={[styles.formCard, { borderColor: colors.danger, borderWidth: 1.5 }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
              <Badge label="Declined" tone="danger" />
              <Text style={[styles.sectionTitle, { fontSize: 16, color: colors.danger }]}>Re-attempt Declined</Text>
            </View>
            <Text style={styles.instruction}>
              Your previous request to re-attempt this paper was declined by the admin team.
            </Text>
            <AnimatedPressable
              style={[styles.startButton, { backgroundColor: colors.primary }]}
              onPress={() => setShowReattemptForm(true)}>
              <Text style={styles.startText}>Send New Request</Text>
            </AnimatedPressable>
            <AnimatedPressable
              style={[styles.startButton, { backgroundColor: colors.surfaceMuted, marginTop: spacing.xs }]}
              onPress={() => navigation.navigate('TestResult', { testId: test.id, resultId: existingAttempt.id })}>
              <Text style={[styles.startText, { color: colors.textMuted }]}>View Result</Text>
            </AnimatedPressable>
          </Card>
        ) : (
          <View style={{ gap: spacing.md }}>
            <AnimatedPressable
              style={styles.startButton}
              onPress={() => navigation.navigate('TestResult', { testId: test.id, resultId: existingAttempt.id })}>
              <Text style={styles.startText}>View Result</Text>
            </AnimatedPressable>
            <AnimatedPressable
              style={[styles.startButton, { backgroundColor: colors.surface, borderColor: colors.primary, borderWidth: 1 }]}
              onPress={() => {
                if (!testActive && user?.role !== 'admin') {
                  Alert.alert('Paper locked', getTestLockedMessage(test));
                  return;
                }
                setShowReattemptForm(true);
              }}>
              <Text style={[styles.startText, { color: colors.primary }]}>Request Re-attempt</Text>
            </AnimatedPressable>
          </View>
        )
      ) : test.type === 'scholarship' ? (
        <Card style={styles.formCard}>
          <Text style={styles.sectionTitle}>Scholarship Details</Text>
          <InputField label="Full Name" value={scholarshipFullName} onChangeText={setScholarshipFullName} />
          <InputField
            label="Email"
            value={scholarshipEmail}
            autoCapitalize="none"
            keyboardType="email-address"
            onChangeText={setScholarshipEmail}
          />
          <InputField label="Phone" value={scholarshipPhone} keyboardType="phone-pad" onChangeText={setScholarshipPhone} />
          <InputField label="City" value={scholarshipCity} onChangeText={setScholarshipCity} />
          <Text style={styles.sectionLabel}>Admission Class</Text>
          <View style={styles.batchGrid}>
            {scholarshipAdmissionOptions.map((value) => (
              <AnimatedPressable
                key={value}
                style={[styles.batchChip, scholarshipClassLabel === value && styles.batchChipActive]}
                onPress={() => setScholarshipClassLabel(value)}>
                <Text style={[styles.batchChipText, scholarshipClassLabel === value && styles.batchChipTextActive]}>
                  {scholarshipAdmissionLabels[value]}
                </Text>
              </AnimatedPressable>
            ))}
          </View>

          <Text style={styles.sectionLabel}>Target Exam</Text>
          <View style={styles.batchGrid}>
            {scholarshipTargetOptions.map((value) => (
              <AnimatedPressable
                key={value}
                style={[styles.batchChip, scholarshipTargetExam === value && styles.batchChipActive]}
                onPress={() => setScholarshipTargetExam(value)}>
                <Text style={[styles.batchChipText, scholarshipTargetExam === value && styles.batchChipTextActive]}>
                  {scholarshipTargetLabels[value]}
                </Text>
              </AnimatedPressable>
            ))}
          </View>

          <AnimatedPressable style={styles.startButton} onPress={() => void handleScholarshipStart()}>
            <Text style={styles.startText}>Continue to Scholarship Test</Text>
          </AnimatedPressable>
        </Card>
      ) : eligibility.allowed ? (
        <AnimatedPressable
          style={styles.startButton}
          onPress={() => {
            if (!testActive && user?.role !== 'admin') {
              Alert.alert('Paper locked', getTestLockedMessage(test));
              return;
            }
            setShowNameModal(true);
          }}>
          <Text style={styles.startText}>Enter Paper</Text>
        </AnimatedPressable>
      ) : (
        <Card style={styles.formCard}>
          <Text style={styles.sectionTitle}>
            {eligibility.label === 'Different Batch' ? 'This Paper Belongs to a Different Batch' : 'Batch Access Request'}
          </Text>
          <Text style={styles.helperText}>
            {eligibility.label === 'Different Batch'
              ? 'Your current batch does not match this paper. If you need access to another batch, send a request below.'
              : 'Choose the batch you want and send your request to the admin team for review.'}
          </Text>
          <View style={styles.batchGrid}>
            {batchCards.map((batch) => (
              <AnimatedPressable
                key={batch.id}
                style={[styles.batchChip, enrollmentBatchId === batch.id && styles.batchChipActive]}
                onPress={() => setEnrollmentBatchId(batch.id)}>
                <Text style={[styles.batchChipText, enrollmentBatchId === batch.id && styles.batchChipTextActive]}>
                  {batch.label}
                </Text>
              </AnimatedPressable>
            ))}
          </View>
          <InputField label="Phone" value={phone} keyboardType="phone-pad" onChangeText={setPhone} />
          <InputField
            label="Query"
            value={message}
            multiline
            style={styles.multilineInput}
            onChangeText={setMessage}
            placeholder="I want to enroll in this batch and unlock weekly tests."
          />
          <AnimatedPressable style={styles.startButton} onPress={() => void handleEnrollmentSubmit()}>
            <Text style={styles.startText}>Send Request</Text>
          </AnimatedPressable>
        </Card>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: spacing.xl,
    gap: spacing.xl,
  },
  loadingContent: {
    paddingHorizontal: spacing.xl,
    gap: spacing.xl,
    flex: 1,
  },
  summaryCard: {
    gap: spacing.md,
  },
  badgeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  description: {
    color: colors.text,
    fontSize: 16,
    lineHeight: 22,
    fontWeight: '700',
  },
  meta: {
    color: colors.textMuted,
    fontSize: 13,
  },
  reason: {
    color: colors.primary,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '700',
  },
  instructionsCard: {
    gap: spacing.md,
  },
  formCard: {
    gap: spacing.md,
  },
  sectionTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '800',
  },
  sectionLabel: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  instruction: {
    color: colors.textMuted,
    fontSize: 14,
    lineHeight: 20,
  },
  cacheHint: {
    color: colors.accent,
    fontSize: 13,
    fontWeight: '700',
  },
  helperText: {
    color: colors.textMuted,
    fontSize: 13,
    lineHeight: 19,
  },
  batchGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  batchChip: {
    borderRadius: radius.pill,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    backgroundColor: colors.surfaceMuted,
  },
  batchChipActive: {
    backgroundColor: colors.primary,
  },
  batchChipText: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '700',
  },
  batchChipTextActive: {
    color: colors.white,
  },
  multilineInput: {
    minHeight: 96,
    textAlignVertical: 'top',
  },
  startButton: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingVertical: spacing.lg,
  },
  startText: {
    color: colors.white,
    fontSize: 15,
    fontWeight: '800',
  },
});
