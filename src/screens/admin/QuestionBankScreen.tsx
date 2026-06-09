import React, { useCallback, useMemo, useState } from 'react';
import { Alert, FlatList, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import DocumentPicker, { isCancel, pickSingle, types } from 'react-native-document-picker';
import { FilePlus2, FolderOpen, ShieldAlert } from 'lucide-react-native';

import { AppHeader } from '../../components/common/AppHeader';
import { AnimatedPressable } from '../../components/common/AnimatedPressable';
import { Card } from '../../components/common/Card';
import { EmptyState } from '../../components/common/EmptyState';
import { Screen } from '../../components/common/Screen';
import { uploadExamAsset } from '../../services/api/storage';
import { RootStackScreenProps } from '../../navigation/types';
import { useAppStore } from '../../store/appStore';
import { useAuthStore } from '../../store/authStore';
import { colors, radius, spacing } from '../../theme';

export function QuestionBankScreen({ navigation, route }: RootStackScreenProps<'QuestionBank'>) {
  const mode = route.params?.mode ?? 'manage';
  const user = useAuthStore((state) => state.user);
  const isAdmin = user?.role === 'admin' && user.approvalStatus === 'approved';
  const questionBankSets = useAppStore((state) => state.questionBankSets);
  const questionBankSelection = useAppStore((state) => state.questionBankSelection);
  const importQuestionsFromPdf = useAppStore((state) => state.importQuestionsFromPdf);
  const createQuestionSet = useAppStore((state) => state.createQuestionSet);
  const loadQuestionBankSets = useAppStore((state) => state.loadQuestionBankSets);
  const queueSelectedQuestionBankQuestions = useAppStore((state) => state.queueSelectedQuestionBankQuestions);
  const clearQuestionBankSelection = useAppStore((state) => state.clearQuestionBankSelection);

  const [isLoading, setIsLoading] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [pdfUrl, setPdfUrl] = useState('');
  const [pdfFileName, setPdfFileName] = useState('');
  const isCreateDisabled = isUploading || isSaving || !pdfUrl.trim() || !pdfFileName.trim();

  const loadSets = useCallback(
    async (force = false) => {
      setIsLoading(true);
      try {
        await loadQuestionBankSets(force);
      } catch (error) {
        Alert.alert('Unable to load question bank', error instanceof Error ? error.message : 'Please try again.');
      } finally {
        setIsLoading(false);
      }
    },
    [loadQuestionBankSets],
  );

  useFocusEffect(
    React.useCallback(() => {
      if (!isAdmin) {
        return undefined;
      }

      void loadSets();
      return undefined;
    }, [isAdmin, loadSets]),
  );

  const handlePickPdf = async () => {
    try {
      const file = await pickSingle({
        type: [types.pdf],
        copyTo: 'cachesDirectory',
      });

      setIsUploading(true);
      const uploaded = await uploadExamAsset({
        uri: file.fileCopyUri ?? file.uri,
        name: file.name,
        mimeType: file.type,
        folder: 'pdfs',
      });

      setPdfUrl(uploaded.publicUrl);
      setPdfFileName(file.name ?? 'Selected PDF');
      Alert.alert('PDF ready', 'You can now create the question set from this file.');
    } catch (error) {
      if (DocumentPicker.isCancel?.(error) || isCancel(error)) {
        return;
      }
      Alert.alert('Upload failed', error instanceof Error ? error.message : 'Unable to upload this PDF.');
    } finally {
      setIsUploading(false);
    }
  };

  const handleCreateSet = async () => {
    if (!pdfUrl.trim() || !pdfFileName.trim()) {
      Alert.alert('PDF required', 'Choose a PDF first so we can extract and save its questions.');
      return;
    }

    try {
      setIsSaving(true);
      const imported = await importQuestionsFromPdf({
        pdfUrl: pdfUrl.trim(),
        importMode: 'replace',
      });

      if (imported.draftQuestions.length === 0) {
        Alert.alert('No questions found', 'The PDF did not return any usable questions.');
        return;
      }

      const created = await createQuestionSet({
        pdfName: pdfFileName.trim(),
        questions: imported.draftQuestions.map((question) => ({
          question: question.prompt,
          options: question.type === 'mcq' ? question.options : [],
          correct_answer:
            question.type === 'integer'
              ? String(question.integerAnswer ?? '')
              : question.options[question.correctOptionIndex] ?? question.options[0] ?? '',
          type: question.type,
          explanation: question.explanation,
          image_url: question.imageUrl ?? null,
        })),
      });

      setPdfUrl('');
      setPdfFileName('');
      await loadSets(true);
      Alert.alert('Question set created', `Set ${created.set_id} is saved with ${created.question_count} questions.`);
    } catch (error) {
      Alert.alert('Unable to create set', error instanceof Error ? error.message : 'Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleUseSelection = () => {
    const queued = queueSelectedQuestionBankQuestions();
    if (queued.length === 0) {
      Alert.alert('No questions selected', 'Select at least one question from the bank first.');
      return;
    }

    navigation.goBack();
  };

  const subtitle = useMemo(
    () =>
      mode === 'picker'
        ? 'Choose saved question sets and build a paper from one or more PDFs'
        : 'Upload a PDF, save the extracted set, and review every question quickly',
    [mode],
  );

  if (!isAdmin) {
    return (
      <Screen>
        <AppHeader title="Question Bank" subtitle="Restricted to approved MIITJEE admins" showLogo={false} />
        <View style={styles.accessWrap}>
          <EmptyState
            icon={ShieldAlert}
            title="Admin access required"
            description="Only approved admins can manage or reuse question-bank sets."
          />
        </View>
      </Screen>
    );
  }

  return (
    <Screen useScrollView={false}>
      <FlatList
        data={questionBankSets}
        keyExtractor={(item) => String(item.setId)}
        contentContainerStyle={styles.content}
        ListHeaderComponent={
          <>
            <AppHeader title="Question Bank" subtitle={subtitle} showLogo={false} />
            {mode === 'manage' ? (
              <Card style={styles.uploadCard}>
                <Text style={styles.cardTitle}>Create New Set</Text>
                <Text style={styles.cardHint}>Upload one PDF, extract the questions, and save it as a reusable bank set.</Text>
                <AnimatedPressable style={[styles.primaryButton, isUploading || isSaving ? styles.buttonDisabled : null]} onPress={() => void handlePickPdf()} disabled={isUploading || isSaving}>
                  <FilePlus2 size={16} color={colors.white} />
                  <Text style={styles.primaryButtonText}>{isUploading ? 'Uploading PDF...' : 'Choose PDF'}</Text>
                </AnimatedPressable>
                {pdfFileName ? <Text style={styles.fileName}>{pdfFileName}</Text> : null}
                <AnimatedPressable style={[styles.secondaryButton, isCreateDisabled ? styles.buttonDisabled : null]} onPress={() => void handleCreateSet()} disabled={isCreateDisabled}>
                  <FolderOpen size={16} color={colors.primary} />
                  <Text style={styles.secondaryButtonText}>{isSaving ? 'Saving Set...' : 'Extract and Save Set'}</Text>
                </AnimatedPressable>
              </Card>
            ) : (
              <Card style={styles.selectionCard}>
                <Text style={styles.cardTitle}>Paper Builder Selection</Text>
                <Text style={styles.cardHint}>
                  {questionBankSelection.length > 0
                    ? `${questionBankSelection.length} questions selected. You can open more sets and keep adding.`
                    : 'Open any set and tap questions in order. The number on each checkbox will track your paper flow.'}
                </Text>
                <View style={styles.selectionRow}>
                  <AnimatedPressable style={styles.secondaryInlineButton} onPress={clearQuestionBankSelection}>
                    <Text style={styles.secondaryInlineButtonText}>Clear</Text>
                  </AnimatedPressable>
                  <AnimatedPressable style={styles.primaryInlineButton} onPress={handleUseSelection}>
                    <Text style={styles.primaryInlineButtonText}>
                      {questionBankSelection.length > 0 ? `Use ${questionBankSelection.length} Questions` : 'Use Selection'}
                    </Text>
                  </AnimatedPressable>
                </View>
              </Card>
            )}
            <Text style={styles.sectionTitle}>Saved Sets</Text>
          </>
        }
        renderItem={({ item }) => (
          <AnimatedPressable
            style={styles.setCard}
            onPress={() =>
              navigation.navigate('QuestionSetQuestions', {
                setId: item.setId,
                setName: item.pdfName,
                mode,
              })
            }>
            <View style={styles.setHeader}>
              <Text style={styles.setTitle} numberOfLines={1}>
                {item.pdfName}
              </Text>
              <Text style={styles.setId}>Set {item.setId}</Text>
            </View>
            <Text style={styles.setMeta}>{item.questionCount} questions</Text>
          </AnimatedPressable>
        )}
        ListEmptyComponent={
          isLoading ? (
            <Card style={styles.emptyCard}>
              <Text style={styles.cardHint}>Loading saved sets...</Text>
            </Card>
          ) : (
            <EmptyState
              icon={FolderOpen}
              title="No question sets yet"
              description="Upload the first PDF from the admin question bank to start building reusable sets."
            />
          )
        }
        showsVerticalScrollIndicator={false}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingBottom: spacing.xxxl,
  },
  accessWrap: {
    paddingHorizontal: spacing.xl,
  },
  uploadCard: {
    marginHorizontal: spacing.xl,
    marginBottom: spacing.lg,
    gap: spacing.md,
  },
  selectionCard: {
    marginHorizontal: spacing.xl,
    marginBottom: spacing.lg,
    gap: spacing.md,
    backgroundColor: colors.primarySoft,
  },
  cardTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '800',
  },
  cardHint: {
    color: colors.textMuted,
    fontSize: 12,
    lineHeight: 18,
  },
  fileName: {
    color: colors.text,
    fontSize: 12,
    fontWeight: '600',
  },
  primaryButton: {
    minHeight: 44,
    borderRadius: radius.lg,
    backgroundColor: colors.primary,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  primaryButtonText: {
    color: colors.white,
    fontSize: 13,
    fontWeight: '800',
  },
  secondaryButton: {
    minHeight: 44,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.primary,
    backgroundColor: colors.white,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  secondaryButtonText: {
    color: colors.primary,
    fontSize: 13,
    fontWeight: '800',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  selectionRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  secondaryInlineButton: {
    flex: 1,
    minHeight: 40,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryInlineButtonText: {
    color: colors.text,
    fontSize: 12,
    fontWeight: '700',
  },
  primaryInlineButton: {
    flex: 2,
    minHeight: 40,
    borderRadius: radius.lg,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryInlineButtonText: {
    color: colors.white,
    fontSize: 12,
    fontWeight: '800',
  },
  sectionTitle: {
    marginHorizontal: spacing.xl,
    marginBottom: spacing.sm,
    color: colors.text,
    fontSize: 14,
    fontWeight: '800',
  },
  setCard: {
    marginHorizontal: spacing.xl,
    marginBottom: spacing.md,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    gap: spacing.xs,
  },
  setHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  setTitle: {
    flex: 1,
    color: colors.text,
    fontSize: 13,
    fontWeight: '700',
  },
  setId: {
    color: colors.primary,
    fontSize: 11,
    fontWeight: '800',
  },
  setMeta: {
    color: colors.textMuted,
    fontSize: 11,
  },
  emptyCard: {
    marginHorizontal: spacing.xl,
  },
});
