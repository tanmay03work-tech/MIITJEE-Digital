import React, { useState } from 'react';
import { Alert, Image, StyleSheet, Text, View } from 'react-native';
import { FileImage, ShieldAlert, Trash2 } from 'lucide-react-native';

import { AppHeader } from '../../components/common/AppHeader';
import { AnimatedPressable } from '../../components/common/AnimatedPressable';
import { EmptyState } from '../../components/common/EmptyState';
import { InputField } from '../../components/common/InputField';
import { Screen } from '../../components/common/Screen';
import { uploadExamAsset } from '../../services/api/storage';
import { useAppStore } from '../../store/appStore';
import { useAuthStore } from '../../store/authStore';
import { colors, radius, spacing } from '../../theme';
import { RootStackScreenProps } from '../../navigation/types';
import { isCancel, pickSingle, types } from 'react-native-document-picker';

export function CreateBatchScreen({ navigation }: RootStackScreenProps<'CreateBatch'>) {
  const user = useAuthStore((state) => state.user);
  const createBatch = useAppStore((state) => state.createBatch);
  const batches = useAppStore((state) => state.batches);
  const deleteBatch = useAppStore((state) => state.deleteBatch);
  const isAdmin = user?.role === 'admin' && user.approvalStatus === 'approved';

  const [name, setName] = useState('');
  const [targetExam, setTargetExam] = useState('');
  const [classLabel, setClassLabel] = useState('');
  const [description, setDescription] = useState('');
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [isUploadingImage, setIsUploadingImage] = useState(false);

  const handleImageUpload = async () => {
    try {
      const file = await pickSingle({
        type: [types.images],
        copyTo: 'cachesDirectory',
      });

      setIsUploadingImage(true);
      const uploaded = await uploadExamAsset({
        uri: file.fileCopyUri ?? file.uri,
        name: file.name,
        mimeType: file.type,
        folder: 'images',
        file: (file as { file?: File }).file,
      });

      setImageUrl(uploaded.publicUrl);
      Alert.alert('Image uploaded', 'Batch cover image is ready to publish.');
    } catch (error) {
      if (isCancel(error)) {
        return;
      }

      Alert.alert('Upload failed', error instanceof Error ? error.message : 'Unable to upload this image.');
    } finally {
      setIsUploadingImage(false);
    }
  };

  const handleCreateBatch = async () => {
    if (!name.trim() || !targetExam.trim() || !classLabel.trim() || !description.trim()) {
      Alert.alert('Batch details missing', 'Add the name, target exam, class, and description before creating the batch.');
      return;
    }

    try {
      await createBatch({
        label: name.trim(),
        targetExam: targetExam.trim(),
        classLabel: classLabel.trim(),
        description: description.trim(),
        imageUrl,
      });

      Alert.alert('Batch created', 'This batch is now visible across the app for all learners.');
      navigation.goBack();
    } catch (error) {
      Alert.alert('Unable to create batch', error instanceof Error ? error.message : 'Please try again in a moment.');
    }
  };

  if (!isAdmin) {
    return (
      <Screen>
        <AppHeader title="Create Batch" subtitle="Restricted to approved MIITJEE admins" />
        <View style={styles.emptyStateWrap}>
          <EmptyState
            icon={ShieldAlert}
            title="Admin access required"
            description="Only approved admins can create new batches for the MIITJEE learning catalog."
          />
        </View>
      </Screen>
    );
  }

  return (
    <Screen>
      <AppHeader title="Create Batch" subtitle="Build a polished batch profile with image, class, and program details" />

      <View style={styles.list}>
        <View style={styles.formCard}>
          <InputField label="Batch Name" placeholder="JEE 2027 Evening" value={name} onChangeText={setName} />
          <View style={styles.row}>
            <View style={styles.flexItem}>
              <InputField label="Target Exam" placeholder="JEE Advanced" value={targetExam} onChangeText={setTargetExam} />
            </View>
            <View style={styles.flexItem}>
              <InputField label="Class" placeholder="Class 12" value={classLabel} onChangeText={setClassLabel} />
            </View>
          </View>
          <InputField
            label="Description"
            placeholder="Describe the preparation style, schedule, and who this batch is for"
            multiline
            value={description}
            onChangeText={setDescription}
            style={styles.descriptionInput}
          />

          <AnimatedPressable style={styles.imageButton} onPress={() => void handleImageUpload()}>
            <FileImage size={18} color={colors.primary} />
            <Text style={styles.imageButtonText}>{isUploadingImage ? 'Uploading image...' : imageUrl ? 'Replace Batch Image' : 'Upload Batch Image'}</Text>
          </AnimatedPressable>

          {imageUrl ? (
            <View style={styles.previewCard}>
              <Image source={{ uri: imageUrl }} style={styles.previewImage} resizeMode="cover" />
              <Text style={styles.previewText}>This cover image will be visible in the batch catalog.</Text>
            </View>
          ) : null}

          <AnimatedPressable style={styles.primaryButton} onPress={() => void handleCreateBatch()}>
            <Text style={styles.primaryButtonText}>Create Batch</Text>
          </AnimatedPressable>
        </View>

        <View style={styles.formCard}>
          <Text style={styles.sectionTitle}>Existing Batches</Text>
          {batches.length === 0 ? (
            <Text style={styles.helperText}>No batches available yet.</Text>
          ) : (
            batches.map((batch) => (
              <View key={batch.id} style={styles.manageRow}>
                <View style={styles.manageMeta}>
                  <Text style={styles.manageTitle}>{batch.label}</Text>
                  <Text style={styles.helperText}>{`${batch.targetExam} | ${batch.classLabel}`}</Text>
                </View>
                <AnimatedPressable
                  style={styles.deleteButton}
                  onPress={() =>
                    Alert.alert('Delete batch?', `${batch.label} will only delete if no tests still use it.`, [
                      { text: 'Cancel', style: 'cancel' },
                      {
                        text: 'Delete',
                        style: 'destructive',
                        onPress: () => {
                          void deleteBatch(batch.id).catch((error) => {
                            Alert.alert('Delete failed', error instanceof Error ? error.message : 'Unable to delete this batch.');
                          });
                        },
                      },
                    ])
                  }>
                  <Trash2 size={15} color={colors.danger} />
                  <Text style={styles.deleteButtonText}>Delete</Text>
                </AnimatedPressable>
              </View>
            ))
          )}
        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  list: {
    paddingHorizontal: spacing.xl,
    gap: spacing.md,
  },
  emptyStateWrap: {
    paddingHorizontal: spacing.xl,
  },
  formCard: {
    backgroundColor: colors.surfaceRaised,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.xl,
    padding: spacing.xl,
    gap: spacing.lg,
  },
  sectionTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '800',
  },
  row: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  flexItem: {
    flex: 1,
  },
  descriptionInput: {
    minHeight: 112,
    textAlignVertical: 'top',
  },
  imageButton: {
    backgroundColor: colors.primarySoft,
    borderRadius: radius.md,
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    flexDirection: 'row',
  },
  imageButtonText: {
    color: colors.primary,
    fontSize: 14,
    fontWeight: '800',
  },
  previewCard: {
    gap: spacing.sm,
  },
  previewImage: {
    width: '100%',
    height: 180,
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceMuted,
  },
  previewText: {
    color: colors.textMuted,
    fontSize: 12,
    lineHeight: 18,
  },
  helperText: {
    color: colors.textMuted,
    fontSize: 12,
    lineHeight: 18,
  },
  manageRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  manageMeta: {
    flex: 1,
    gap: spacing.xs,
  },
  manageTitle: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '800',
  },
  deleteButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    backgroundColor: colors.dangerSoft,
    borderWidth: 1,
    borderColor: colors.danger,
  },
  deleteButtonText: {
    color: colors.danger,
    fontSize: 12,
    fontWeight: '800',
  },
  primaryButton: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
    paddingVertical: spacing.lg,
    borderRadius: radius.md,
  },
  primaryButtonText: {
    color: colors.white,
    fontSize: 14,
    fontWeight: '800',
  },
});
