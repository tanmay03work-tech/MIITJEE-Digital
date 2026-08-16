import React, { useCallback, useMemo, useState } from 'react';
import { Alert, FlatList, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import DocumentPicker, { isCancel, pick, pickSingle, types } from 'react-native-document-picker';
import { CheckCircle2, FilePlus2, Files, FileText, FolderOpen, ShieldAlert, Trash2 } from 'lucide-react-native';

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
  const deleteQuestionSet = useAppStore((state) => state.deleteQuestionSet);
  const loadQuestionBankSets = useAppStore((state) => state.loadQuestionBankSets);
  const queueSelectedQuestionBankQuestions = useAppStore((state) => state.queueSelectedQuestionBankQuestions);
  const clearQuestionBankSelection = useAppStore((state) => state.clearQuestionBankSelection);

  const [isLoading, setIsLoading] = useState(false);
  const [isUploadingQuestions, setIsUploadingQuestions] = useState(false);
  const [isUploadingAnswerKey, setIsUploadingAnswerKey] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const [pdfUrl, setPdfUrl] = useState('');
  const [pdfFileName, setPdfFileName] = useState('');

  const [answerKeyPdfUrl, setAnswerKeyPdfUrl] = useState('');
  const [answerKeyFileName, setAnswerKeyFileName] = useState('');

  const isAnyUploading = isUploadingQuestions || isUploadingAnswerKey;
  const isCreateDisabled = isAnyUploading || isSaving || !pdfUrl.trim() || !pdfFileName.trim();

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

  const handlePickMultiplePdfs = async () => {
    try {
      const files = (await pick({
        type: [types.pdf],
        allowMultiSelection: true,
      })) as unknown[];

      if (!files || files.length === 0) {
        return;
      }

      setIsUploadingQuestions(true);

      if (files.length === 1 && files[0]) {
        const file = files[0] as { fileCopyUri?: string; uri: string; name?: string; type?: string; file?: File };
        const uploaded = await uploadExamAsset({
          uri: file.fileCopyUri ?? file.uri,
          name: file.name,
          mimeType: file.type,
          folder: 'pdfs',
          file: file.file,
        });
        setPdfUrl(uploaded.publicUrl);
        setPdfFileName(file.name ?? 'Questions PDF');
        Alert.alert('Master Exam PDF Uploaded', 'PDF uploaded successfully! Single Master PDF Intelligence will extract Questions, Answer Key, Solutions, and Diagrams automatically.');
      } else {
        setIsUploadingAnswerKey(true);
        const file1 = files[0] as { fileCopyUri?: string; uri: string; name?: string; type?: string; file?: File };
        const file2 = files[1] as { fileCopyUri?: string; uri: string; name?: string; type?: string; file?: File };

        const name1Lower = (file1.name ?? '').toLowerCase();
        const name2Lower = (file2.name ?? '').toLowerCase();

        const isFile2AnswerKey =
          name2Lower.includes('answer') ||
          name2Lower.includes('key') ||
          name2Lower.includes('ans') ||
          name2Lower.includes('sol');
        const isFile1AnswerKey =
          name1Lower.includes('answer') ||
          name1Lower.includes('key') ||
          name1Lower.includes('ans') ||
          name1Lower.includes('sol');

        const qFile = isFile1AnswerKey ? file2 : file1;
        const akFile = isFile1AnswerKey ? file1 : file2;

        const [qUpload, akUpload] = await Promise.all([
          uploadExamAsset({
            uri: qFile.fileCopyUri ?? qFile.uri,
            name: qFile.name,
            mimeType: qFile.type,
            folder: 'pdfs',
            file: qFile.file,
          }),
          uploadExamAsset({
            uri: akFile.fileCopyUri ?? akFile.uri,
            name: akFile.name,
            mimeType: akFile.type,
            folder: 'pdfs',
            file: akFile.file,
          }),
        ]);

        setPdfUrl(qUpload.publicUrl);
        setPdfFileName(qFile.name ?? 'Questions PDF');
        setAnswerKeyPdfUrl(akUpload.publicUrl);
        setAnswerKeyFileName(akFile.name ?? 'Answer Key PDF');

        Alert.alert(
          'Multiple PDFs Uploaded',
          `Selected & Uploaded:\n1. Questions PDF: ${qFile.name}\n2. Answer Key PDF: ${akFile.name}`,
        );
      }
    } catch (error) {
      if (DocumentPicker.isCancel?.(error) || isCancel(error)) {
        return;
      }
      Alert.alert('Upload failed', error instanceof Error ? error.message : 'Unable to upload selected PDFs.');
    } finally {
      setIsUploadingQuestions(false);
      setIsUploadingAnswerKey(false);
    }
  };

  const handlePickQuestionsPdf = async () => {
    try {
      const file = await pickSingle({
        type: [types.pdf],
        copyTo: 'cachesDirectory',
      });

      setIsUploadingQuestions(true);
      const uploaded = await uploadExamAsset({
        uri: file.fileCopyUri ?? file.uri,
        name: file.name,
        mimeType: file.type,
        folder: 'pdfs',
        file: (file as { file?: File }).file,
      });

      setPdfUrl(uploaded.publicUrl);
      setPdfFileName(file.name ?? 'Questions PDF');
      Alert.alert('Questions PDF uploaded', 'You can now pick an Answer Key PDF (optional) or extract the set.');
    } catch (error) {
      if (DocumentPicker.isCancel?.(error) || isCancel(error)) {
        return;
      }
      Alert.alert('Upload failed', error instanceof Error ? error.message : 'Unable to upload Questions PDF.');
    } finally {
      setIsUploadingQuestions(false);
    }
  };

  const handlePickAnswerKeyPdf = async () => {
    try {
      const file = await pickSingle({
        type: [types.pdf],
        copyTo: 'cachesDirectory',
      });

      setIsUploadingAnswerKey(true);
      const uploaded = await uploadExamAsset({
        uri: file.fileCopyUri ?? file.uri,
        name: file.name,
        mimeType: file.type,
        folder: 'pdfs',
        file: (file as { file?: File }).file,
      });

      setAnswerKeyPdfUrl(uploaded.publicUrl);
      setAnswerKeyFileName(file.name ?? 'Answer Key PDF');
      Alert.alert('Answer Key PDF uploaded', 'Answer Key PDF attached successfully!');
    } catch (error) {
      if (DocumentPicker.isCancel?.(error) || isCancel(error)) {
        return;
      }
      Alert.alert('Upload failed', error instanceof Error ? error.message : 'Unable to upload Answer Key PDF.');
    } finally {
      setIsUploadingAnswerKey(false);
    }
  };

  const handleClearAnswerKeyPdf = () => {
    setAnswerKeyPdfUrl('');
    setAnswerKeyFileName('');
  };

  const handleCreateSet = async () => {
    if (!pdfUrl.trim() || !pdfFileName.trim()) {
      Alert.alert('Questions PDF required', 'Please select a Questions PDF first.');
      return;
    }

    try {
      setIsSaving(true);
      console.log('[PDF-IMPORT-DEBUG] 1. selected PDF filename:', pdfFileName.trim());
      console.log('[PDF-IMPORT-DEBUG] 3. endpoint being called: importQuestionsFromPdf');

      const imported = await importQuestionsFromPdf({
        pdfUrl: pdfUrl.trim(),
        answerKeyPdfUrl: answerKeyPdfUrl.trim() || undefined,
        importMode: 'replace',
      });

      console.log('[PDF-IMPORT-DEBUG] 6. number of questions returned:', imported.questions?.length ?? 0);
      console.log('[PDF-IMPORT-DEBUG] 7. first returned question_number:', (imported.questions?.[0] as any)?.question_number ?? '1');
      console.log('[PDF-IMPORT-DEBUG] 8. number of questions after transformation:', imported.draftQuestions?.length ?? 0);
      console.log('[PDF-IMPORT-DEBUG] 9. number of questions after validation:', imported.draftQuestions?.length ?? 0);

      if (imported.draftQuestions.length === 0) {
        console.log('[PDF-IMPORT-DEBUG] 12. final value used by the UI "usable questions" check: 0 (TRIGGERED ALERT)');
        Alert.alert('No questions found', 'The PDF did not return any usable questions.');
        return;
      }

      const formattedQuestions = imported.draftQuestions.map((question) => ({
        question: question.prompt,
        options: question.type === 'mcq' ? question.options : [],
        correct_answer:
          question.type === 'integer'
            ? String(question.integerAnswer ?? '')
            : question.options[question.correctOptionIndex] ?? question.options[0] ?? '',
        type: question.type,
        explanation: question.explanation,
        image_url: question.imageUrl ?? null,
      }));

      console.log('[PDF-IMPORT-DEBUG] 10. number of questions sent to save-questions/createQuestionSet:', formattedQuestions.length);

      const created = await createQuestionSet({
        pdfName: pdfFileName.trim(),
        questions: formattedQuestions,
      });

      console.log('[PDF-IMPORT-DEBUG] 11. number of questions returned after save:', created.question_count);
      console.log('[PDF-IMPORT-DEBUG] 12. final value used by the UI "usable questions" check:', created.question_count);

      setPdfUrl('');
      setPdfFileName('');
      setAnswerKeyPdfUrl('');
      setAnswerKeyFileName('');

      await loadSets(true);
      Alert.alert('Question set created', `Set ${created.set_id} is saved with ${created.question_count} questions.`);
    } catch (error) {
      console.error('[PDF-IMPORT-DEBUG] ERROR CATCH:', error);
      Alert.alert('Unable to create set', error instanceof Error ? error.message : 'Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteSet = (setId: number, setName: string) => {
    Alert.alert(
      'Delete Question Set',
      `Are you sure you want to delete set #${setId} (${setName})? This action cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete Set',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteQuestionSet(setId);
              await loadSets(true);
              Alert.alert('Set deleted', `Question Set #${setId} has been deleted.`);
            } catch (error) {
              Alert.alert('Delete failed', error instanceof Error ? error.message : 'Unable to delete set.');
            }
          },
        },
      ],
    );
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
        : 'Upload Questions & Answer Key PDFs, extract the set, and review every question',
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
                <Text style={styles.cardTitle}>Create New Question Set</Text>
                <Text style={styles.cardHint}>
                  Upload any Master Exam PDF containing Questions, Answer Key, Solutions, and Diagrams. Single Master PDF Intelligence extracts everything automatically.
                </Text>

                {/* Master PDF Picker Block */}
                <View style={styles.pickerBox}>
                  <View style={styles.pickerHeader}>
                    <Text style={styles.pickerTitle}>Master Exam PDF</Text>
                    {pdfFileName ? <CheckCircle2 size={16} color={colors.success} /> : null}
                  </View>
                  {pdfFileName ? (
                    <View style={styles.fileRow}>
                      <FilePlus2 size={16} color={colors.primary} />
                      <Text style={styles.fileNameText} numberOfLines={1}>{pdfFileName}</Text>
                      <AnimatedPressable
                        style={styles.changeFileButton}
                        onPress={() => void handlePickQuestionsPdf()}
                        disabled={isAnyUploading || isSaving}>
                        <Text style={styles.changeFileButtonText}>Change PDF</Text>
                      </AnimatedPressable>
                    </View>
                  ) : (
                    <AnimatedPressable
                      style={[styles.primaryButton, isAnyUploading || isSaving ? styles.buttonDisabled : null]}
                      onPress={() => void handlePickQuestionsPdf()}
                      disabled={isAnyUploading || isSaving}>
                      <FilePlus2 size={16} color={colors.white} />
                      <Text style={styles.primaryButtonText}>
                        {isUploadingQuestions ? 'Uploading Master Exam PDF...' : 'Choose Master Exam PDF'}
                      </Text>
                    </AnimatedPressable>
                  )}
                </View>

                {/* Summary badge if PDF selected */}
                {pdfFileName ? (
                  <View style={styles.statusBadge}>
                    <CheckCircle2 size={14} color={colors.primary} />
                    <Text style={styles.statusBadgeText}>
                      Master PDF ready for auto-extraction (Questions, Key, Solutions & Diagrams)
                    </Text>
                  </View>
                ) : null}

                {/* Submit Action Button */}
                <AnimatedPressable
                  style={[styles.primaryButton, isCreateDisabled ? styles.buttonDisabled : null]}
                  onPress={() => void handleCreateSet()}
                  disabled={isCreateDisabled}>
                  <FolderOpen size={16} color={colors.white} />
                  <Text style={styles.primaryButtonText}>
                    {isSaving ? 'Extracting & Saving Set with Gemini...' : 'Extract and Save Question Set'}
                  </Text>
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
          <View style={styles.setCardRow}>
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
            {mode === 'manage' ? (
              <AnimatedPressable
                style={styles.deleteSetIconButton}
                onPress={() => handleDeleteSet(item.setId, item.pdfName)}>
                <Trash2 size={18} color={colors.danger} />
              </AnimatedPressable>
            ) : null}
          </View>
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
  multiPdfButton: {
    minHeight: 48,
    borderRadius: radius.lg,
    backgroundColor: colors.primary,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  multiPdfButtonText: {
    color: colors.white,
    fontSize: 13,
    fontWeight: '800',
  },
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginVertical: spacing.xs,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: colors.border,
  },
  dividerText: {
    color: colors.textMuted,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  pickerBox: {
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    padding: spacing.md,
    gap: spacing.xs,
  },
  pickerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.xs,
  },
  pickerTitle: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '700',
  },
  fileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.background,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  fileNameText: {
    flex: 1,
    color: colors.text,
    fontSize: 12,
    fontWeight: '600',
  },
  changeFileButton: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radius.sm,
    backgroundColor: colors.primarySoft,
  },
  changeFileButtonText: {
    color: colors.primary,
    fontSize: 11,
    fontWeight: '700',
  },
  removeFileButton: {
    padding: spacing.xs,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: colors.primarySoft,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.md,
  },
  statusBadgeText: {
    color: colors.primary,
    fontSize: 11,
    fontWeight: '700',
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
  setCardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: spacing.xl,
    marginBottom: spacing.md,
    gap: spacing.sm,
  },
  setCard: {
    flex: 1,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    gap: spacing.xs,
  },
  deleteSetIconButton: {
    padding: spacing.md,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
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
