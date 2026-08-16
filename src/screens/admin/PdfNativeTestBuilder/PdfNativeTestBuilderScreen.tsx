import React, { useState } from 'react';
import { ActivityIndicator, Alert, Modal, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Upload, FileText, CheckCircle, Save, Sliders, Database, Layers, FolderPlus, FolderOpen, X } from 'lucide-react-native';
import * as pdfjsLib from 'pdfjs-dist';

declare const process: { env: Record<string, string> };

import { AppHeader } from '../../../components/common/AppHeader';
import { Badge } from '../../../components/common/Badge';
import { Card } from '../../../components/common/Card';
import { Screen } from '../../../components/common/Screen';
import { pickSingle } from '../../../components/common/DocumentPickerWeb';
import { uploadExamAsset } from '../../../services/api/storage';
import { extractPdfPagesMetadata } from '../../../services/pdf-native/pdfNativeParser';
import { detectQuestionsFromPdf } from '../../../services/pdf-native/pdfQuestionDetector';
import { savePdfNativeQuestionBankBatch, updatePdfNativeQuestion } from '../../../services/pdf-native/pdfNativeBankService';
import { createPdfNativeSet } from '../../../services/pdf-native/pdfNativeSetService';
import { savePdfBinary, attachPdfBinary, computeCanonicalPdfId } from '../../../services/pdf-native/pdfDocumentCache';
import { PdfNativeQuestion, PdfPageMetadata, QuestionSubject } from '../../../services/pdf-native/pdfNativeTypes';
import { PdfNativeQuestionList } from './PdfNativeQuestionList';
import { PdfNativePreview } from './PdfNativePreview';
import { PdfNativeBoundaryEditor } from './PdfNativeBoundaryEditor';
import { PdfNativeMetadataForm } from './PdfNativeMetadataForm';
import { colors, radius, spacing } from '../../../theme';
import { RootStackScreenProps } from '../../../navigation/types';

export function PdfNativeTestBuilderScreen({ navigation }: RootStackScreenProps<'PdfNativeTestBuilder'>) {
  const [pdfDoc, setPdfDoc] = useState<pdfjsLib.PDFDocumentProxy | null>(null);
  const [pdfFile, setPdfFile] = useState<{ name: string; uri: string; buffer?: ArrayBuffer } | null>(null);
  const [pdfId, setPdfId] = useState<string>('');
  const [pagesMetadata, setPagesMetadata] = useState<PdfPageMetadata[]>([]);
  const [questions, setQuestions] = useState<PdfNativeQuestion[]>([]);
  const [selectedQuestion, setSelectedQuestion] = useState<PdfNativeQuestion | null>(null);
  const [batchSelectedIds, setBatchSelectedIds] = useState<Set<string>>(new Set());
  const [activeTab, setActiveTab] = useState<'metadata' | 'boundary'>('metadata');

  // Create Set Modal State
  const [isSetModalVisible, setIsSetModalVisible] = useState(false);
  const [setName, setSetName] = useState('');
  const [setSubject, setSetSubject] = useState<QuestionSubject>('Physics');
  const [setDescription, setSetDescription] = useState('');
  const [setStatus, setSetStatus] = useState<'READY' | 'DRAFT'>('READY');
  const [isCreatingSet, setIsCreatingSet] = useState(false);

  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [statusMessage, setStatusMessage] = useState<string>('');
  const [isSavingBank, setIsSavingBank] = useState<boolean>(false);

  // Pick PDF file from user device
  const handlePickPdf = async () => {
    try {
      const picked = (await pickSingle({ type: ['application/pdf'] })) as { name?: string; uri?: string; file?: File } | null;
      if (!picked || !picked.uri) return;

      setIsProcessing(true);
      setStatusMessage('Reading PDF file...');

      let buffer: ArrayBuffer;
      if (picked.file) {
        buffer = await picked.file.arrayBuffer();
      } else {
        const response = await fetch(picked.uri);
        buffer = await response.arrayBuffer();
      }

      const canonicalId = await computeCanonicalPdfId(buffer);
      setPdfId(canonicalId);
      setPdfFile({ name: picked.name ?? 'test_paper.pdf', uri: picked.uri, buffer });

      await attachPdfBinary([canonicalId, picked.uri, picked.name], buffer, picked.name);

      setStatusMessage('Parsing PDF pages and layout...');
      const { pdfDoc: doc, pagesMetadata: meta } = await extractPdfPagesMetadata(buffer);
      setPdfDoc(doc);
      setPagesMetadata(meta);

      setStatusMessage('Detecting question boundaries (deterministic mode)...');
      const detected = detectQuestionsFromPdf(canonicalId, meta);
      setQuestions(detected);
      setBatchSelectedIds(new Set(detected.map((q) => q.id)));

      if (detected.length > 0) {
        setSelectedQuestion(detected[0] ?? null);
      }

      setIsProcessing(false);
      setStatusMessage('');
    } catch (err) {
      setIsProcessing(false);
      setStatusMessage('');
      Alert.alert('PDF Loading Error', err instanceof Error ? err.message : 'Failed to parse selected PDF file.');
    }
  };

  // Batch selection handlers
  const handleToggleBatchSelect = (id: string) => {
    setBatchSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSelectAll = () => {
    setBatchSelectedIds(new Set(questions.map((q) => q.id)));
  };

  const handleClearAll = () => {
    setBatchSelectedIds(new Set());
  };

  const handleUpdateQuestion = async (updated: PdfNativeQuestion) => {
    setQuestions((prev) => prev.map((q) => (q.id === updated.id ? updated : q)));
    setSelectedQuestion(updated);

    try {
      await updatePdfNativeQuestion(updated);
    } catch (err) {
      console.warn('[handleUpdateQuestion] Persistence error:', err);
    }

    Alert.alert('Saved', `Metadata and boundary for Question Q${updated.question_number} updated.`);
  };

  // Save selected questions to PDF-Native Question Bank
  const handleSaveSelectedToBank = async () => {
    if (!pdfFile || batchSelectedIds.size === 0) {
      Alert.alert('No Selection', 'Please select at least one question to save to the PDF-Native Question Bank.');
      return;
    }

    try {
      setIsSavingBank(true);
      let publicPdfUrl = pdfFile.uri;

      if (pdfFile.buffer) {
        try {
          const uploadRes = await uploadExamAsset({
            uri: pdfFile.uri,
            name: pdfFile.name,
            mimeType: 'application/pdf',
            folder: 'pdfs',
            file: new Blob([pdfFile.buffer], { type: 'application/pdf' }),
          });
          publicPdfUrl = uploadRes.publicUrl;
        } catch (uploadErr) {
          console.warn('[handleSaveSelectedToBank] Storage upload fallback warning:', uploadErr);
        }
      }

      const selectedList = questions.filter((q) => batchSelectedIds.has(q.id));
      const res = await savePdfNativeQuestionBankBatch(pdfId, publicPdfUrl, selectedList);

      setIsSavingBank(false);

      if (!res.success && res.errors && res.errors.length > 0) {
        Alert.alert('Validation Error', `Unable to save selected questions:\n\n${res.errors.join('\n')}`);
        return;
      }

      Alert.alert(
        'Saved to PDF-Native Question Bank! 🎉',
        `Successfully saved/updated ${res.savedCount} question(s) in the PDF-Native Question Bank dataset with duplicate protection.`,
        [
          { text: 'Stay Here', style: 'cancel' },
          {
            text: 'Create Test Now 🚀',
            onPress: () => navigation.navigate('PdfNativeTestCreator'),
          },
        ]
      );
    } catch (err) {
      setIsSavingBank(false);
      Alert.alert('Question Bank Error', err instanceof Error ? err.message : 'Failed to save to Question Bank.');
    }
  };

  // Open Create Set Modal
  const handleOpenCreateSetModal = () => {
    if (!pdfFile || batchSelectedIds.size === 0) {
      Alert.alert('No Selection', 'Please select at least one question to include in the Set.');
      return;
    }
    const defaultName = `${pdfFile.name.replace(/\.pdf$/i, '')} — Set 01`;
    setSetName(defaultName);
    setSetSubject(selectedQuestion?.subject || 'Physics');
    setSetDescription('');
    setSetStatus('READY');
    setIsSetModalVisible(true);
  };

  // Confirm Create Set & Save Questions
  const handleConfirmCreateSet = async () => {
    if (!setName.trim()) {
      Alert.alert('Validation Error', 'Please enter a name for the Set.');
      return;
    }

    try {
      setIsCreatingSet(true);
      let publicPdfUrl = pdfFile?.uri || '';

      if (pdfFile && pdfFile.buffer) {
        try {
          const uploadRes = await uploadExamAsset({
            uri: pdfFile.uri,
            name: pdfFile.name,
            mimeType: 'application/pdf',
            folder: 'pdfs',
            file: new Blob([pdfFile.buffer], { type: 'application/pdf' }),
          });
          publicPdfUrl = uploadRes.publicUrl;
          if (pdfFile.buffer) {
            void savePdfBinary(publicPdfUrl, pdfFile.buffer, pdfFile.name);
          }
        } catch (uploadErr) {
          console.warn('[handleConfirmCreateSet] Storage upload fallback warning:', uploadErr);
        }
      }

      if (pdfFile && pdfFile.buffer) {
        void savePdfBinary(pdfId, pdfFile.buffer, pdfFile.name);
        if (publicPdfUrl) void savePdfBinary(publicPdfUrl, pdfFile.buffer, pdfFile.name);
      }

      const selectedList = questions.filter((q) => batchSelectedIds.has(q.id));

      // 1. Save questions to question bank
      const bankRes = await savePdfNativeQuestionBankBatch(pdfId, publicPdfUrl, selectedList);
      if (!bankRes.success && bankRes.errors && bankRes.errors.length > 0) {
        setIsCreatingSet(false);
        Alert.alert('Validation Error', `Unable to save questions:\n\n${bankRes.errors.join('\n')}`);
        return;
      }

      // 2. Create the Set
      const setRes = await createPdfNativeSet({
        set_name: setName.trim(),
        source_pdf_id: pdfId,
        pdf_url: publicPdfUrl,
        subject: setSubject,
        description: setDescription.trim() || null,
        status: setStatus,
        question_ids: selectedList.map((q) => q.id),
      });

      setIsCreatingSet(false);
      setIsSetModalVisible(false);

      Alert.alert(
        'Question Set Created! 🎉',
        `Set "${setRes.set.set_name}" with ${setRes.set.total_questions} questions has been successfully created.`,
        [
          { text: 'Stay Here', style: 'cancel' },
          {
            text: 'View Sets 📁',
            onPress: () => navigation.navigate('PdfNativeSetManagement'),
          },
          {
            text: 'Create Test from Set 🚀',
            onPress: () => navigation.navigate('PdfNativeTestCreator', { setId: setRes.set.id }),
          },
        ]
      );
    } catch (err) {
      setIsCreatingSet(false);
      Alert.alert('Set Creation Error', err instanceof Error ? err.message : 'Failed to create Set.');
    }
  };

  const approvedCount = questions.filter((q) => q.review_status === 'APPROVED').length;
  const reviewCount = questions.filter((q) => q.review_status === 'NEEDS_REVIEW').length;

  return (
    <Screen useScrollView={false}>
      <AppHeader
        title="PDF-Native Question Bank Builder"
        subtitle="Review question regions, assign answer keys & build Question Sets"
        showLogo={false}
        showBack={true}
        onBack={() => navigation.navigate('AdminDashboard')}
        rightSlot={
          <TouchableOpacity
            style={styles.headerSetsBtn}
            onPress={() => navigation.navigate('PdfNativeSetManagement')}
            activeOpacity={0.7}
          >
            <FolderOpen size={16} color={colors.white} />
            <Text style={styles.headerSetsBtnText}>View Sets</Text>
          </TouchableOpacity>
        }
      />

      <View style={styles.container}>
        {/* Control Bar */}
        <Card style={styles.topCard}>
          <View style={styles.actionHeader}>
            <View style={styles.infoGroup}>
              <Text style={styles.stepTitle}>
                PDF Document & Question Bank Controls
              </Text>
              <Text style={styles.stepSub}>
                {pdfFile ? `File: ${pdfFile.name} (${pagesMetadata.length} Pages)` : 'Select a PDF to run analysis and save to PDF-Native Question Bank'}
              </Text>
            </View>

            <View style={styles.btnRow}>
              <TouchableOpacity style={styles.uploadBtn} onPress={handlePickPdf} disabled={isProcessing}>
                <Upload size={16} color="#FFFFFF" />
                <Text style={styles.btnText}>Upload PDF</Text>
              </TouchableOpacity>
            </View>
          </View>

          {isProcessing ? (
            <View style={styles.loadingBanner}>
              <ActivityIndicator size="small" color={colors.primary} />
              <Text style={styles.loadingBannerText}>{statusMessage}</Text>
            </View>
          ) : null}

          {questions.length > 0 ? (
            <View style={styles.statsRow}>
              <View style={styles.statBadge}>
                <Text style={styles.statLabel}>Detected:</Text>
                <Text style={styles.statValue}>{questions.length}</Text>
              </View>
              <View style={[styles.statBadge, { backgroundColor: '#DCFCE7' }]}>
                <CheckCircle size={14} color="#15803D" />
                <Text style={[styles.statValue, { color: '#15803D' }]}>{approvedCount} APPROVED</Text>
              </View>
              <View style={[styles.statBadge, { backgroundColor: '#FEF3C7' }]}>
                <Text style={[styles.statValue, { color: '#B45309' }]}>{reviewCount} NEEDS REVIEW</Text>
              </View>
            </View>
          ) : null}
        </Card>

        {/* Workspace */}
        {questions.length > 0 ? (
          <View style={styles.workspace}>
            {/* Left Panel: Question List with Checkboxes */}
            <View style={styles.leftPanel}>
              <Text style={styles.panelTitle}>Detected Questions</Text>
              <PdfNativeQuestionList
                questions={questions}
                selectedQuestionId={selectedQuestion?.id ?? null}
                batchSelectedIds={batchSelectedIds}
                onSelectQuestion={(q) => setSelectedQuestion(q)}
                onToggleBatchSelect={handleToggleBatchSelect}
                onSelectAll={handleSelectAll}
                onClearAll={handleClearAll}
              />
            </View>

            {/* Right Panel: Preview & Metadata Editor */}
            <View style={styles.rightPanel}>
              <View style={styles.tabHeader}>
                <TouchableOpacity
                  style={[styles.tabBtn, activeTab === 'metadata' && styles.activeTabBtn]}
                  onPress={() => setActiveTab('metadata')}
                >
                  <Layers size={15} color={activeTab === 'metadata' ? colors.primary : colors.textMuted} />
                  <Text style={[styles.tabBtnText, activeTab === 'metadata' && styles.activeTabBtnText]}>
                    Question Metadata & Answer Key
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.tabBtn, activeTab === 'boundary' && styles.activeTabBtn]}
                  onPress={() => setActiveTab('boundary')}
                >
                  <Sliders size={15} color={activeTab === 'boundary' ? colors.primary : colors.textMuted} />
                  <Text style={[styles.tabBtnText, activeTab === 'boundary' && styles.activeTabBtnText]}>
                    Boundary Adjuster
                  </Text>
                </TouchableOpacity>
              </View>

              <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={true}>
                <PdfNativePreview pdfDoc={pdfDoc} question={selectedQuestion} />
                
                {selectedQuestion ? (
                  activeTab === 'metadata' ? (
                    <PdfNativeMetadataForm
                      question={selectedQuestion}
                      onSaveMetadata={handleUpdateQuestion}
                    />
                  ) : (
                    <PdfNativeBoundaryEditor
                      question={selectedQuestion}
                      onUpdateQuestion={handleUpdateQuestion}
                    />
                  )
                ) : null}
              </ScrollView>

              {/* Bottom Batch Save Action Bar */}
              <View style={styles.bottomBar}>
                <TouchableOpacity
                  style={styles.createSetBtn}
                  onPress={handleOpenCreateSetModal}
                  disabled={batchSelectedIds.size === 0}
                  activeOpacity={0.7}
                >
                  <FolderPlus size={18} color="#FFFFFF" />
                  <Text style={styles.createSetBtnText}>
                    Create Question Set ({batchSelectedIds.size} Selected)
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.saveBankBtn}
                  onPress={handleSaveSelectedToBank}
                  disabled={isSavingBank || batchSelectedIds.size === 0}
                  activeOpacity={0.7}
                >
                  {isSavingBank ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <Database size={18} color="#FFFFFF" />
                  )}
                  <Text style={styles.saveBankBtnText}>
                    Save {batchSelectedIds.size} Questions to Question Bank
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        ) : (
          <View style={styles.emptyWorkspace}>
            <FileText size={48} color={colors.textMuted} />
            <Text style={styles.emptyTitle}>No PDF Loaded</Text>
            <Text style={styles.emptyDesc}>
              Click "Upload PDF" above to upload your question paper PDF, review questions, set answer keys, and save to Question Sets.
            </Text>
          </View>
        )}

        {/* Create Set Modal */}
        <Modal
          visible={isSetModalVisible}
          transparent={true}
          animationType="fade"
          onRequestClose={() => setIsSetModalVisible(false)}
        >
          <View style={styles.modalOverlay}>
            <Card style={styles.modalCard}>
              <View style={styles.modalHeader}>
                <View style={styles.modalHeaderTitleRow}>
                  <FolderPlus size={20} color={colors.primary} />
                  <Text style={styles.modalTitle}>Create PDF-Native Question Set</Text>
                </View>
                <TouchableOpacity onPress={() => setIsSetModalVisible(false)}>
                  <X size={20} color={colors.textMuted} />
                </TouchableOpacity>
              </View>

              <ScrollView style={styles.modalBody} showsVerticalScrollIndicator={false}>
                <View style={styles.formGroup}>
                  <Text style={styles.formLabel}>Set Name *</Text>
                  <TextInput
                    style={styles.formInput}
                    value={setName}
                    onChangeText={setSetName}
                    placeholder="e.g. Physics — Rotational Motion — Set 01"
                    placeholderTextColor={colors.textMuted}
                  />
                </View>

                <View style={styles.formGroup}>
                  <Text style={styles.formLabel}>Subject</Text>
                  <View style={styles.subjectRow}>
                    {(['Physics', 'Chemistry', 'Mathematics', 'Biology', 'Other'] as const).map((sub) => (
                      <TouchableOpacity
                        key={sub}
                        style={[styles.subPill, setSubject === sub && styles.subPillActive]}
                        onPress={() => setSetSubject(sub)}
                        activeOpacity={0.7}
                      >
                        <Text style={[styles.subPillText, setSubject === sub && styles.subPillTextActive]}>
                          {sub}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>

                <View style={styles.formGroup}>
                  <Text style={styles.formLabel}>Description (Optional)</Text>
                  <TextInput
                    style={[styles.formInput, styles.formInputMulti]}
                    value={setDescription}
                    onChangeText={setSetDescription}
                    placeholder="e.g. Contains complete PYQ questions with faculty verified answer keys."
                    placeholderTextColor={colors.textMuted}
                    multiline
                  />
                </View>

                <View style={styles.setSummaryBox}>
                  <Text style={styles.setSummaryTitle}>Set Summary:</Text>
                  <Text style={styles.setSummaryText}>
                    • {batchSelectedIds.size} Question(s) will be added in sequence.
                  </Text>
                  <Text style={styles.setSummaryText}>
                    • Authoritative Answer Keys and bounding boxes will be locked into this Set.
                  </Text>
                </View>
              </ScrollView>

              <View style={styles.modalFooter}>
                <TouchableOpacity
                  style={styles.cancelBtn}
                  onPress={() => setIsSetModalVisible(false)}
                  disabled={isCreatingSet}
                >
                  <Text style={styles.cancelBtnText}>Cancel</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.confirmSetBtn}
                  onPress={handleConfirmCreateSet}
                  disabled={isCreatingSet}
                  activeOpacity={0.7}
                >
                  {isCreatingSet ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <FolderPlus size={16} color="#FFFFFF" />
                  )}
                  <Text style={styles.confirmSetBtnText}>
                    {isCreatingSet ? 'Creating Set...' : 'Save & Create Set'}
                  </Text>
                </TouchableOpacity>
              </View>
            </Card>
          </View>
        </Modal>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.md,
    gap: spacing.md,
  },
  topCard: {
    padding: spacing.md,
    gap: spacing.sm,
  },
  actionHeader: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  infoGroup: {
    gap: 2,
  },
  stepTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: colors.text,
  },
  stepSub: {
    fontSize: 13,
    color: colors.textMuted,
  },
  btnRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    flexWrap: 'wrap',
  },
  uploadBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.primary,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
  },
  refBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.primarySoft || '#EFF6FF',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.primary,
  },
  btnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
  refBtnText: {
    color: colors.primary,
    fontSize: 13,
    fontWeight: '700',
  },
  loadingBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.primarySoft || '#EFF6FF',
    padding: spacing.sm,
    borderRadius: 6,
  },
  loadingBannerText: {
    fontSize: 13,
    color: colors.primaryDeep || colors.primary,
    fontWeight: '600',
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: 4,
  },
  statBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statLabel: {
    fontSize: 12,
    color: colors.textMuted,
  },
  statValue: {
    fontSize: 12,
    fontWeight: '800',
    color: colors.text,
  },
  workspace: {
    flex: 1,
    flexDirection: 'row',
    gap: spacing.md,
  },
  leftPanel: {
    width: 320,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border || '#E2E8F0',
    overflow: 'hidden',
  },
  panelTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: colors.text,
    padding: spacing.md,
    backgroundColor: '#F8FAFC',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  rightPanel: {
    flex: 1,
  },
  tabHeader: {
    flexDirection: 'row',
    gap: spacing.xs,
    marginBottom: spacing.xs,
  },
  tabBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#F1F5F9',
  },
  activeTabBtn: {
    backgroundColor: colors.primarySoft || '#EFF6FF',
    borderWidth: 1,
    borderColor: colors.primary,
  },
  tabBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textMuted,
  },
  activeTabBtnText: {
    color: colors.primaryDeep || colors.primary,
    fontWeight: '800',
  },
  scrollContent: {
    paddingBottom: spacing.xl,
  },
  bottomBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingTop: spacing.xs,
  },
  createSetBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#2563EB',
    paddingVertical: 12,
    borderRadius: 10,
  },
  createSetBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
  },
  saveBankBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#15803D',
    paddingVertical: 12,
    borderRadius: 10,
  },
  saveBankBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
  },
  headerSetsBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#2563EB',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
  },
  headerSetsBtnText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.md,
  },
  modalCard: {
    width: '100%',
    maxWidth: 540,
    maxHeight: '90%',
    padding: spacing.lg,
    gap: spacing.md,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  modalHeaderTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: colors.text,
  },
  modalBody: {
    gap: spacing.md,
  },
  formGroup: {
    gap: spacing.xs,
    marginBottom: spacing.sm,
  },
  formLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.text,
  },
  formInput: {
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: 14,
    color: colors.text,
  },
  formInputMulti: {
    minHeight: 64,
    textAlignVertical: 'top',
  },
  subjectRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  subPill: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1,
    borderColor: colors.border,
  },
  subPillActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  subPillText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textMuted,
  },
  subPillTextActive: {
    color: colors.white,
    fontWeight: '700',
  },
  setSummaryBox: {
    backgroundColor: colors.primarySoft,
    padding: spacing.md,
    borderRadius: radius.md,
    gap: 4,
    marginTop: spacing.xs,
  },
  setSummaryTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: colors.primaryDeep || colors.primary,
  },
  setSummaryText: {
    fontSize: 12,
    color: colors.textMuted,
    lineHeight: 16,
  },
  modalFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: spacing.sm,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  cancelBtn: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceMuted,
  },
  cancelBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.textMuted,
  },
  confirmSetBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: '#2563EB',
  },
  confirmSetBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.white,
  },
  emptyWorkspace: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xxl,
    gap: spacing.md,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: colors.text,
  },
  emptyDesc: {
    fontSize: 14,
    color: colors.textMuted,
    textAlign: 'center',
    maxWidth: 420,
    lineHeight: 20,
  },
});
