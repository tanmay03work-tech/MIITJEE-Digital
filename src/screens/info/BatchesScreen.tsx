import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Image, StyleSheet, Text, View } from 'react-native';
import LinearGradient from 'react-native-linear-gradient';

import { AppHeader } from '../../components/common/AppHeader';
import { Badge } from '../../components/common/Badge';
import { Button } from '../../components/common/Button';
import { Card } from '../../components/common/Card';
import { InputField } from '../../components/common/InputField';
import { Screen } from '../../components/common/Screen';
import { SelectField } from '../../components/common/SelectField';
import { SectionTitle } from '../../components/common/SectionTitle';
import { useLoader } from '../../providers/GlobalLoaderProvider';
import { useAppStore } from '../../store/appStore';
import { useAuthStore } from '../../store/authStore';
import { colors, radius, spacing } from '../../theme';
import { Batch } from '../../types';

function BatchImage({ batch }: { batch: Batch }) {
  const [failed, setFailed] = useState(false);
  const imageUri = typeof batch.imageUrl === 'string' ? batch.imageUrl : undefined;
  const showRemoteImage = !!imageUri && !failed;

  if (showRemoteImage) {
    return <Image source={{ uri: imageUri }} style={styles.image} resizeMode="cover" onError={() => setFailed(true)} />;
  }

  return (
    <LinearGradient colors={[colors.primaryDeep, colors.primary]} style={styles.imageFallback}>
      <Text style={styles.imageFallbackEyebrow}>{batch.targetExam}</Text>
      <Text style={styles.imageFallbackTitle}>{batch.label}</Text>
      <Text style={styles.imageFallbackText}>{batch.classLabel}</Text>
    </LinearGradient>
  );
}

export function BatchesScreen() {
  const batches = useAppStore((state) => state.batches);
  const submitEnrollmentQuery = useAppStore((state) => state.submitEnrollmentQuery);
  const user = useAuthStore((state) => state.user);
  const { showLoader, hideLoader } = useLoader();
  const currentBatch = useMemo(
    () => batches.find((batch) => batch.id === user?.batchId),
    [batches, user?.batchId],
  );
  const [selectedBatchId, setSelectedBatchId] = useState(user?.batchId ?? batches[0]?.id ?? '');
  const [phone, setPhone] = useState('');
  const [message, setMessage] = useState('');
  const canRequestBatchAccess = !!user && user.role !== 'admin' && batches.length > 0;
  const batchOptions = useMemo(
    () =>
      batches.map((batch) => ({
        label: batch.label,
        value: batch.id,
        description: `${batch.targetExam} | ${batch.classLabel}`,
      })),
    [batches],
  );

  useEffect(() => {
    if (!selectedBatchId && batches.length > 0) {
      setSelectedBatchId(user?.batchId ?? batches[0]?.id ?? '');
    }
  }, [batches, selectedBatchId, user?.batchId]);

  const handleSubmitRequest = async () => {
    if (!selectedBatchId || !phone.trim() || !message.trim()) {
      Alert.alert('Missing details', 'Please choose a batch, add your phone number, and tell us what access you need.');
      return;
    }

    if (selectedBatchId === user?.batchId) {
      Alert.alert('Already assigned', 'This batch is already linked to your account.');
      return;
    }

    try {
      showLoader({
        title: 'Sending your batch request',
        subtitle: 'Submitting your access request to the MIITJEE admin team.',
      });
      await submitEnrollmentQuery({
        batchId: selectedBatchId,
        phone: phone.trim(),
        message: message.trim(),
      });
      setPhone('');
      setMessage('');
      Alert.alert('Request sent', 'Your batch access request has been submitted successfully.');
    } catch (error) {
      Alert.alert('Unable to submit', error instanceof Error ? error.message : 'Please try again in a moment.');
    } finally {
      hideLoader();
    }
  };

  return (
    <Screen>
      <AppHeader title="Our Batches" subtitle="Explore MIITJEE Digital programs built for serious preparation and long-term results" />

      {canRequestBatchAccess ? (
        <View style={styles.list}>
          <Card style={styles.requestCard}>
            <View style={styles.requestHeader}>
              <Text style={styles.requestTitle}>Request Batch Access</Text>
              <Badge
                label={currentBatch?.label ?? 'Scholarship only'}
                tone={currentBatch ? 'success' : 'warning'}
              />
            </View>
            <Text style={styles.requestDescription}>
              Choose the batch you want, share your contact number, and our team will review the request for weekly paper access.
            </Text>
            <SelectField
              label="Target Batch"
              placeholder="Choose a batch"
              value={selectedBatchId}
              options={batchOptions}
              onValueChange={setSelectedBatchId}
              menuTitle="Choose a batch for access"
            />
            <InputField
              label="Phone Number"
              placeholder="Mobile number"
              keyboardType="phone-pad"
              value={phone}
              onChangeText={setPhone}
            />
            <InputField
              label="Why do you want this batch?"
              placeholder="I want access to the weekly papers for this batch."
              multiline
              style={styles.requestMessageInput}
              value={message}
              onChangeText={setMessage}
            />
            <Button
              onPress={() => void handleSubmitRequest()}
              disabled={!selectedBatchId || selectedBatchId === user?.batchId}>
              {selectedBatchId === user?.batchId ? 'Already Your Batch' : 'Send Batch Request'}
            </Button>
          </Card>
        </View>
      ) : null}

      <SectionTitle title="Active Learning Tracks" />
      <View style={styles.list}>
        {batches.map((batch) => (
          <Card key={batch.id} style={styles.card}>
            <BatchImage batch={batch} />
            <View style={styles.header}>
              <Badge label={batch.targetExam} tone="primary" />
              <Badge label={batch.classLabel} tone="warning" />
            </View>
            <Text style={styles.title}>{batch.label}</Text>
            <Text style={styles.description}>
              {batch.description || 'Carefully structured preparation with subject discipline, weekly paper rhythm, and focused mentoring.'}
            </Text>
            {canRequestBatchAccess ? (
              <Button
                variant={selectedBatchId === batch.id ? 'primary' : 'secondary'}
                onPress={() => setSelectedBatchId(batch.id)}>
                {user?.batchId === batch.id ? 'Current Batch' : selectedBatchId === batch.id ? 'Selected For Request' : 'Request This Batch'}
              </Button>
            ) : null}
          </Card>
        ))}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  list: {
    paddingHorizontal: spacing.xl,
    gap: spacing.md,
  },
  requestCard: {
    gap: spacing.md,
  },
  requestHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: spacing.md,
    flexWrap: 'wrap',
  },
  requestTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '800',
  },
  requestDescription: {
    color: colors.textMuted,
    fontSize: 14,
    lineHeight: 21,
  },
  requestMessageInput: {
    minHeight: 104,
    textAlignVertical: 'top',
  },
  card: {
    gap: spacing.md,
  },
  image: {
    width: '100%',
    height: 180,
    borderRadius: 20,
    backgroundColor: colors.surfaceMuted,
  },
  imageFallback: {
    width: '100%',
    height: 180,
    borderRadius: 20,
    padding: spacing.xl,
    justifyContent: 'flex-end',
    gap: spacing.xs,
  },
  imageFallbackEyebrow: {
    color: 'rgba(255,255,255,0.72)',
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  imageFallbackTitle: {
    color: colors.white,
    fontSize: 24,
    lineHeight: 30,
    fontWeight: '900',
  },
  imageFallbackText: {
    color: 'rgba(255,255,255,0.82)',
    fontSize: 14,
    fontWeight: '600',
  },
  header: {
    flexDirection: 'row',
    gap: spacing.sm,
    flexWrap: 'wrap',
  },
  title: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '800',
  },
  description: {
    color: colors.textMuted,
    fontSize: 14,
    lineHeight: 21,
  },
});
