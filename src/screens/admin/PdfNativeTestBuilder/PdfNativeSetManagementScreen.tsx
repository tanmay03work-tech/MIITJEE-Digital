import React, { useCallback, useMemo, useState } from 'react';
import {
  Alert,
  FlatList,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import {
  AlertCircle,
  Archive,
  ArrowRight,
  CheckCircle2,
  ChevronRight,
  Edit3,
  Eye,
  FilePlus,
  FileText,
  FolderOpen,
  Layers,
  Plus,
  RotateCcw,
  Search,
  Sliders,
  Trash2,
  UploadCloud,
  X,
} from 'lucide-react-native';
import * as pdfjsLib from 'pdfjs-dist';

import { AppHeader } from '../../../components/common/AppHeader';
import { Badge } from '../../../components/common/Badge';
import { Card } from '../../../components/common/Card';
import { EmptyState } from '../../../components/common/EmptyState';
import { InputField } from '../../../components/common/InputField';
import { Screen } from '../../../components/common/Screen';
import { pickSingle } from '../../../components/common/DocumentPickerWeb';
import { colors, radius, spacing } from '../../../theme';
import { RootStackScreenProps } from '../../../navigation/types';
import {
  PdfNativeQuestion,
  PdfNativeSet,
  PdfNativeSetStatus,
  QuestionSubject,
} from '../../../services/pdf-native/pdfNativeTypes';
import {
  deletePdfNativeSet,
  getPdfNativeSetQuestions,
  listPdfNativeSets,
} from '../../../services/pdf-native/pdfNativeSetService';
import { updatePdfNativeQuestion, deletePdfNativeQuestion } from '../../../services/pdf-native/pdfNativeBankService';
import { extractPdfPagesMetadata } from '../../../services/pdf-native/pdfNativeParser';
import { getPdfDocument, attachPdfBinary } from '../../../services/pdf-native/pdfDocumentCache';
import { PdfNativePreview } from './PdfNativePreview';
import { PdfNativeMetadataForm } from './PdfNativeMetadataForm';
import { PdfNativeBoundaryEditor } from './PdfNativeBoundaryEditor';

type StatusTab = 'ALL' | 'READY' | 'DRAFT' | 'ARCHIVED';

export function PdfNativeSetManagementScreen({
  navigation,
  route,
}: RootStackScreenProps<'PdfNativeSetManagement'>) {
  const [sets, setSets] = useState<PdfNativeSet[]>([]);
  const [activeTab, setActiveTab] = useState<StatusTab>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [subjectFilter, setSubjectFilter] = useState<string>('All');
  const [isLoading, setIsLoading] = useState(true);

  // Set Question Inspection Modal State
  const [inspectingSet, setInspectingSet] = useState<PdfNativeSet | null>(null);
  const [inspectingQuestions, setInspectingQuestions] = useState<PdfNativeQuestion[]>([]);
  const [selectedInspectQuestion, setSelectedInspectQuestion] = useState<PdfNativeQuestion | null>(null);
  const [inspectModalVisible, setInspectModalVisible] = useState(false);
  const [pdfDoc, setPdfDoc] = useState<pdfjsLib.PDFDocumentProxy | null>(null);
  const [isLoadingQuestions, setIsLoadingQuestions] = useState(false);
  const [isEditingQuestion, setIsEditingQuestion] = useState(false);
  const [editSubTab, setEditSubTab] = useState<'METADATA' | 'BOUNDARY'>('METADATA');

  const loadData = useCallback(async () => {
    setIsLoading(true);
    try {
      const fetchedSets = await listPdfNativeSets();
      setSets(fetchedSets);
    } catch (err) {
      console.warn('[PdfNativeSetManagement] Error loading sets:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void loadData();
    }, [loadData])
  );

  const counts = useMemo(() => {
    let ready = 0;
    let draft = 0;
    let archived = 0;
    for (const s of sets) {
      if (!s) continue;
      if (s.status === 'READY') ready++;
      else if (s.status === 'DRAFT') draft++;
      else if (s.status === 'ARCHIVED') archived++;
    }
    return { all: sets.length, ready, draft, archived };
  }, [sets]);

  const filteredSets = useMemo(() => {
    return sets
      .filter((s) => {
        if (!s) return false;
        if (activeTab === 'ALL') return true;
        return s.status === activeTab;
      })
      .filter((s) => {
        if (!s) return false;
        if (subjectFilter !== 'All' && (s.subject || 'Physics') !== subjectFilter) return false;
        if (searchQuery.trim().length > 0) {
          const q = searchQuery.toLowerCase().trim();
          const matchName = (s.set_name || '').toLowerCase().includes(q);
          const matchSub = (s.subject || '').toLowerCase().includes(q);
          const matchDesc = s.description ? s.description.toLowerCase().includes(q) : false;
          return matchName || matchSub || matchDesc;
        }
        return true;
      });
  }, [activeTab, searchQuery, sets, subjectFilter]);

  // Inspect questions inside a Set
  const handleInspectSet = useCallback(async (set: PdfNativeSet) => {
    setInspectingSet(set);
    setInspectModalVisible(true);
    setIsLoadingQuestions(true);
    setPdfDoc(null);

    try {
      const qList = await getPdfNativeSetQuestions(set.id);
      setInspectingQuestions(qList);
      if (qList.length > 0) {
        setSelectedInspectQuestion(qList[0] ?? null);
      }

      // Load PDF for visual preview if available in storage or network
      if (set.source_pdf_id || set.pdf_url) {
        try {
          const doc = await getPdfDocument({
            pdfId: set.source_pdf_id,
            pdfUrl: set.pdf_url,
          });
          setPdfDoc(doc);
        } catch {
          // Keep pdfDoc as null to allow user to attach their original PDF
          setPdfDoc(null);
        }
      }
    } catch (err) {
      Alert.alert('Error', 'Failed to load questions inside this Set.');
    } finally {
      setIsLoadingQuestions(false);
    }
  }, []);

  // Re-attach or upload source PDF directly from the Set inspect screen
  const handleAttachSetSourcePdf = useCallback(async () => {
    if (!inspectingSet) return;
    try {
      const picked = (await pickSingle({ type: ['application/pdf'] })) as {
        name?: string;
        uri?: string;
        file?: File;
      } | null;

      if (!picked) return;

      let buffer: ArrayBuffer;
      if (picked.file) {
        buffer = await picked.file.arrayBuffer();
      } else if (picked.uri) {
        const res = await fetch(picked.uri);
        buffer = await res.arrayBuffer();
      } else {
        return;
      }

      await attachPdfBinary(
        [
          inspectingSet.source_pdf_id,
          inspectingSet.pdf_url,
          inspectingSet.id,
          picked.name,
        ],
        buffer,
        picked.name
      );

      const doc = await getPdfDocument({ buffer, pdfId: inspectingSet.source_pdf_id });
      setPdfDoc(doc);
      Alert.alert(
        'Source PDF Linked! 📄',
        `Successfully linked "${picked.name || 'original PDF'}" to Set "${inspectingSet.set_name}".`
      );
    } catch (attachErr) {
      Alert.alert(
        'PDF Attachment Error',
        attachErr instanceof Error ? attachErr.message : 'Failed to attach PDF file.'
      );
    }
  }, [inspectingSet]);

  // Save edits to question metadata or boundary box
  const handleSaveQuestionEdit = useCallback(async (updatedQ: PdfNativeQuestion) => {
    try {
      const res = await updatePdfNativeQuestion(updatedQ);
      if (!res.success) {
        Alert.alert('Validation Error', res.error || 'Failed to update question.');
        return;
      }

      setSelectedInspectQuestion(updatedQ);
      setInspectingQuestions((prev) =>
        prev.map((q) => (q.id === updatedQ.id ? updatedQ : q))
      );
      setIsEditingQuestion(false);
      Alert.alert(
        'Question Updated! 🎉',
        `Question Q${updatedQ.question_number} has been updated successfully.`
      );
    } catch (err) {
      Alert.alert('Error', err instanceof Error ? err.message : 'Failed to save question edits.');
    }
  }, []);

  // Delete individual question from Question Bank & Set
  const handleDeleteQuestion = useCallback(
    (question: PdfNativeQuestion) => {
      Alert.alert(
        'Delete Question?',
        `Are you sure you want to permanently delete Q${question.question_number} from this Question Bank?\n\nThis action cannot be undone.`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Delete Question',
            style: 'destructive',
            onPress: async () => {
              try {
                const res = await deletePdfNativeQuestion(question.id);
                if (!res.success) {
                  Alert.alert('Cannot Delete Question', res.error || 'Unable to delete question. Please try again.');
                  return;
                }

                // Update UI state immediately
                setInspectingQuestions((prev) => {
                  const nextList = prev.filter((q) => q.id !== question.id);
                  if (selectedInspectQuestion?.id === question.id) {
                    setSelectedInspectQuestion(nextList[0] || null);
                    setIsEditingQuestion(false);
                  }
                  return nextList;
                });

                // Update set counts in sets list
                setSets((prev) =>
                  prev.map((s) =>
                    s.id === inspectingSet?.id
                      ? { ...s, total_questions: Math.max(0, s.total_questions - 1) }
                      : s
                  )
                );

                Alert.alert('Question Deleted', `Question Q${question.question_number} has been permanently deleted.`);
              } catch (err) {
                Alert.alert('Error', err instanceof Error ? err.message : 'Unable to delete question. Please try again.');
              }
            },
          },
        ]
      );
    },
    [inspectingSet, selectedInspectQuestion]
  );

  // Delete Set with strict safety semantics
  const handleDeleteSet = useCallback(
    (set: PdfNativeSet) => {
      Alert.alert(
        'Delete Question Set?',
        `Are you sure you want to delete "${set.set_name}"?\n\nNote: This will delete the Set definition only. It will NOT delete the underlying questions or original PDF.`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Delete Set',
            style: 'destructive',
            onPress: async () => {
              try {
                await deletePdfNativeSet(set.id);
                await loadData();
                Alert.alert('Set Deleted', `"${set.set_name}" has been safely deleted.`);
              } catch (err) {
                Alert.alert('Error', err instanceof Error ? err.message : 'Failed to delete Set.');
              }
            },
          },
        ]
      );
    },
    [loadData]
  );

  // Navigate to Create Test directly from Set
  const handleCreateTestFromSet = useCallback(
    (set: PdfNativeSet) => {
      navigation.navigate('PdfNativeTestCreator', { setId: set.id });
    },
    [navigation]
  );

  return (
    <Screen useScrollView={false}>
      <AppHeader
        title="PDF Question Sets"
        subtitle="Organize reviewed question-bank packages and create tests directly from Sets"
        showBack={true}
        onBack={() => navigation.navigate('AdminDashboard')}
        rightSlot={
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <TouchableOpacity
              style={styles.refreshBtn}
              onPress={loadData}
              activeOpacity={0.7}
            >
              <RotateCcw size={15} color={colors.text} />
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.headerBtn}
              onPress={() => navigation.navigate('PdfNativeTestBuilder')}
              activeOpacity={0.7}
            >
              <Plus size={16} color={colors.white} />
              <Text style={styles.headerBtnText}>+ New Set from PDF</Text>
            </TouchableOpacity>
          </View>
        }
      />

      {/* Status Filter Tabs */}
      <View style={styles.tabBar}>
        {(['ALL', 'READY', 'DRAFT', 'ARCHIVED'] as const).map((tab) => {
          const isSelected = activeTab === tab;
          const count =
            tab === 'ALL'
              ? counts.all
              : tab === 'READY'
              ? counts.ready
              : tab === 'DRAFT'
              ? counts.draft
              : counts.archived;
          return (
            <TouchableOpacity
              key={tab}
              style={[styles.tabItem, isSelected && styles.tabItemActive]}
              onPress={() => setActiveTab(tab)}
              activeOpacity={0.7}
            >
              <Text style={[styles.tabText, isSelected && styles.tabTextActive]}>
                {tab === 'ALL' ? 'All Sets' : tab} ({count})
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Search & Subject Chips */}
      <View style={styles.filterSection}>
        <View style={styles.searchRow}>
          <Search size={16} color={colors.textMuted} style={styles.searchIcon} />
          <InputField
            label=""
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder="Search sets by name or topic..."
            style={styles.searchInput}
          />
        </View>

        <View style={styles.chipRow}>
          {['All', 'Physics', 'Chemistry', 'Mathematics', 'Biology', 'Other'].map((sub) => (
            <TouchableOpacity
              key={sub}
              style={[styles.filterChip, subjectFilter === sub && styles.filterChipActive]}
              onPress={() => setSubjectFilter(sub)}
              activeOpacity={0.7}
            >
              <Text
                style={[
                  styles.filterChipText,
                  subjectFilter === sub && styles.filterChipTextActive,
                ]}
              >
                {sub}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* Sets List */}
      <FlatList
        data={filteredSets}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        refreshing={isLoading}
        onRefresh={loadData}
        ListEmptyComponent={
          <View style={styles.emptyWrap}>
            <EmptyState
              icon={FolderOpen}
              title="No Question Sets Found"
              description="Upload a PDF in PDF-Native Builder, detect and review questions, then save as a Set."
            />
          </View>
        }
        renderItem={({ item: setItem }) => {
          const isReady = setItem.status === 'READY';
          const isDraft = setItem.status === 'DRAFT';

          return (
            <Card style={styles.setCard}>
              <View style={styles.cardHeader}>
                <View style={styles.badgeGroup}>
                  <Badge
                    label={isReady ? 'READY' : isDraft ? 'DRAFT' : 'ARCHIVED'}
                    tone={isReady ? 'success' : isDraft ? 'warning' : 'neutral'}
                  />
                  <Badge label={setItem.subject || 'Physics'} tone="primary" />
                  <Badge label={`${setItem.total_questions} Questions`} tone="primary" />
                </View>
                <Text style={styles.dateText}>
                  {setItem.created_at
                    ? new Date(setItem.created_at).toLocaleDateString(undefined, {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric',
                      })
                    : ''}
                </Text>
              </View>

              <Text style={styles.setTitle}>{setItem.set_name}</Text>
              {setItem.description ? (
                <Text style={styles.setDescription} numberOfLines={2}>
                  {setItem.description}
                </Text>
              ) : null}

              <View style={styles.cardActions}>
                <TouchableOpacity
                  style={styles.inspectBtn}
                  onPress={() => handleInspectSet(setItem)}
                  activeOpacity={0.7}
                >
                  <Eye size={15} color={colors.primary} />
                  <Text style={styles.inspectBtnText}>Inspect Questions ({setItem.total_questions})</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.createTestBtn}
                  onPress={() => handleCreateTestFromSet(setItem)}
                  activeOpacity={0.7}
                >
                  <FilePlus size={15} color={colors.white} />
                  <Text style={styles.createTestBtnText}>Create Test 🚀</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.deleteBtn}
                  onPress={() => handleDeleteSet(setItem)}
                  activeOpacity={0.7}
                >
                  <Trash2 size={15} color={colors.danger} />
                </TouchableOpacity>
              </View>
            </Card>
          );
        }}
      />

      {/* Set Inspection Modal */}
      <Modal
        visible={inspectModalVisible}
        animationType="slide"
        onRequestClose={() => setInspectModalVisible(false)}
      >
        <Screen useScrollView={false}>
          <AppHeader
            title={inspectingSet ? inspectingSet.set_name : 'Set Details'}
            subtitle={`${inspectingQuestions.length} Questions • Subject: ${inspectingSet?.subject || 'Physics'}`}
            showBack={true}
            onBack={() => setInspectModalVisible(false)}
            rightSlot={
              inspectingSet ? (
                <TouchableOpacity
                  style={styles.modalHeaderCreateBtn}
                  onPress={() => {
                    setInspectModalVisible(false);
                    handleCreateTestFromSet(inspectingSet);
                  }}
                  activeOpacity={0.7}
                >
                  <FilePlus size={15} color={colors.white} />
                  <Text style={styles.modalHeaderCreateBtnText}>Create Test</Text>
                </TouchableOpacity>
              ) : null
            }
          />

          <View style={styles.inspectBody}>
            {inspectingSet ? (
              <View style={styles.sourcePdfBar}>
                <View style={styles.sourcePdfLeft}>
                  <FileText size={15} color={colors.primary} />
                  <Text style={styles.sourcePdfText}>
                    Source PDF:{' '}
                    <Text style={styles.sourcePdfName}>
                      {inspectingSet.set_name.replace(/\s*—\s*Set\s*\d+$/i, '')}.pdf
                    </Text>
                  </Text>
                </View>
                <TouchableOpacity
                  style={styles.attachSourceBtn}
                  onPress={handleAttachSetSourcePdf}
                  activeOpacity={0.7}
                >
                  <UploadCloud size={14} color={colors.primary} />
                  <Text style={styles.attachSourceBtnText}>Attach / Re-upload Source PDF 📄</Text>
                </TouchableOpacity>
              </View>
            ) : null}

            {isLoadingQuestions ? (
              <View style={styles.loadingWrap}>
                <Text style={styles.loadingText}>Loading Set questions...</Text>
              </View>
            ) : inspectingQuestions.length === 0 ? (
              <View style={styles.emptyWrap}>
                <Text style={styles.emptyText}>No questions found in this set.</Text>
              </View>
            ) : (
              <View style={styles.splitLayout}>
                {/* Left: Ordered Question List */}
                <View style={styles.leftPane}>
                  <Text style={styles.paneTitle}>Ordered Questions</Text>
                  <ScrollView style={styles.questionListScroll} showsVerticalScrollIndicator={false}>
                    {inspectingQuestions.map((q, idx) => {
                      const isSelected = selectedInspectQuestion?.id === q.id;
                      const hasAnswer = !!q.correct_answer;
                      return (
                        <TouchableOpacity
                          key={q.id}
                          style={[styles.qListItem, isSelected && styles.qListItemSelected]}
                          onPress={() => setSelectedInspectQuestion(q)}
                          activeOpacity={0.7}
                        >
                          <View style={styles.qListTop}>
                            <Text style={[styles.qNumText, isSelected && styles.qNumTextSelected]}>
                              Q{q.question_number}
                            </Text>
                            <Badge
                              label={q.review_status}
                              tone={q.review_status === 'APPROVED' ? 'success' : 'warning'}
                            />
                          </View>
                          <View style={styles.qListBottom}>
                            <Text style={styles.qSubText}>
                              {q.subject} • {q.question_type}
                            </Text>
                            <Text style={[styles.keyText, !hasAnswer && styles.keyTextMissing]}>
                              Key: {q.correct_answer || 'MISSING'}
                            </Text>
                          </View>
                        </TouchableOpacity>
                      );
                    })}
                  </ScrollView>
                </View>

                {/* Right: Selected Question Visual Preview, Metadata & In-Place Editor */}
                <View style={styles.rightPane}>
                  {selectedInspectQuestion ? (
                    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.detailScroll}>
                      <Card style={styles.detailCard}>
                        <View style={styles.detailHeader}>
                          <View style={styles.detailTitleGroup}>
                            <Text style={styles.detailTitle}>
                              Question {selectedInspectQuestion.question_number}{' '}
                              {isEditingQuestion ? 'Editor' : 'Metadata'}
                            </Text>
                            <Badge
                              label={selectedInspectQuestion.review_status}
                              tone={selectedInspectQuestion.review_status === 'APPROVED' ? 'success' : 'warning'}
                            />
                          </View>

                          <View style={styles.detailHeaderActions}>
                            <TouchableOpacity
                              style={[
                                styles.editToggleBtn,
                                isEditingQuestion && styles.editToggleBtnActive,
                              ]}
                              onPress={() => setIsEditingQuestion((v) => !v)}
                              activeOpacity={0.7}
                            >
                              {isEditingQuestion ? (
                                <>
                                  <Eye size={14} color={colors.primary} />
                                  <Text style={styles.editToggleBtnText}>View Mode 👁️</Text>
                                </>
                              ) : (
                                <>
                                  <Edit3 size={14} color={colors.white} />
                                  <Text style={styles.editToggleBtnTextActive}>Edit Question ✏️</Text>
                                </>
                              )}
                            </TouchableOpacity>

                            <TouchableOpacity
                              style={styles.deleteQuestionBtn}
                              onPress={() => handleDeleteQuestion(selectedInspectQuestion)}
                              activeOpacity={0.7}
                            >
                              <Trash2 size={14} color="#DC2626" />
                              <Text style={styles.deleteQuestionBtnText}>Delete Question</Text>
                            </TouchableOpacity>
                          </View>
                        </View>

                        {/* ============= VIEW MODE ============= */}
                        {!isEditingQuestion ? (
                          <>
                            {(!selectedInspectQuestion.correct_answer ||
                              selectedInspectQuestion.review_status === 'NEEDS_REVIEW') ? (
                              <View style={styles.reviewAlertBanner}>
                                <AlertCircle size={18} color="#B45309" />
                                <View style={{ flex: 1 }}>
                                  <Text style={styles.reviewAlertTitle}>Review Action Required</Text>
                                  <Text style={styles.reviewAlertSub}>
                                    Subject is '{selectedInspectQuestion.subject}' and Answer Key is{' '}
                                    {selectedInspectQuestion.correct_answer ? `'${selectedInspectQuestion.correct_answer}'` : 'Missing'}.
                                  </Text>
                                </View>
                                <TouchableOpacity
                                  style={styles.reviewAlertBtn}
                                  onPress={() => setIsEditingQuestion(true)}
                                  activeOpacity={0.7}
                                >
                                  <Text style={styles.reviewAlertBtnText}>Edit Now ✏️</Text>
                                </TouchableOpacity>
                              </View>
                            ) : null}

                            <View style={styles.metaGrid}>
                              <View style={styles.metaCol}>
                                <Text style={styles.metaLabel}>Subject:</Text>
                                <Text style={styles.metaVal}>{selectedInspectQuestion.subject}</Text>
                              </View>
                              <View style={styles.metaCol}>
                                <Text style={styles.metaLabel}>Type:</Text>
                                <Text style={styles.metaVal}>{selectedInspectQuestion.question_type}</Text>
                              </View>
                              <View style={styles.metaCol}>
                                <Text style={styles.metaLabel}>Answer Key:</Text>
                                <Text
                                  style={[
                                    styles.metaVal,
                                    !selectedInspectQuestion.correct_answer && styles.keyTextMissing,
                                  ]}
                                >
                                  {selectedInspectQuestion.correct_answer || 'Missing'}
                                </Text>
                              </View>
                              <View style={styles.metaCol}>
                                <Text style={styles.metaLabel}>Marks / Neg:</Text>
                                <Text style={styles.metaVal}>
                                  +{selectedInspectQuestion.marks} / -{selectedInspectQuestion.negative_marks}
                                </Text>
                              </View>
                            </View>

                            <View style={styles.previewWrap}>
                              <Text style={styles.previewLabel}>Original PDF Region Crop:</Text>
                              <PdfNativePreview
                                pdfDoc={pdfDoc}
                                question={selectedInspectQuestion}
                                showAdminDebug={true}
                                onPdfAttached={(doc) => setPdfDoc(doc)}
                              />
                            </View>
                          </>
                        ) : (
                          /* ============= EDIT MODE ============= */
                          <View style={styles.editModeWrap}>
                            <View style={styles.editorTabsRow}>
                              <TouchableOpacity
                                style={[
                                  styles.editorTab,
                                  editSubTab === 'METADATA' && styles.editorTabActive,
                                ]}
                                onPress={() => setEditSubTab('METADATA')}
                                activeOpacity={0.7}
                              >
                                <Sliders
                                  size={14}
                                  color={
                                    editSubTab === 'METADATA' ? colors.primary : colors.textMuted
                                  }
                                />
                                <Text
                                  style={[
                                    styles.editorTabText,
                                    editSubTab === 'METADATA' && styles.editorTabTextActive,
                                  ]}
                                >
                                  Metadata & Answer Key
                                </Text>
                              </TouchableOpacity>

                              <TouchableOpacity
                                style={[
                                  styles.editorTab,
                                  editSubTab === 'BOUNDARY' && styles.editorTabActive,
                                ]}
                                onPress={() => setEditSubTab('BOUNDARY')}
                                activeOpacity={0.7}
                              >
                                <Layers
                                  size={14}
                                  color={
                                    editSubTab === 'BOUNDARY' ? colors.primary : colors.textMuted
                                  }
                                />
                                <Text
                                  style={[
                                    styles.editorTabText,
                                    editSubTab === 'BOUNDARY' && styles.editorTabTextActive,
                                  ]}
                                >
                                  Boundary Correction
                                </Text>
                              </TouchableOpacity>
                            </View>

                            {/* Live PDF Crop Preview */}
                            <View style={styles.previewWrap}>
                              <Text style={styles.previewLabel}>Live PDF Region Crop:</Text>
                              <PdfNativePreview
                                pdfDoc={pdfDoc}
                                question={selectedInspectQuestion}
                                showAdminDebug={true}
                                onPdfAttached={(doc) => setPdfDoc(doc)}
                              />
                            </View>

                            {/* Form or Boundary Editor */}
                            {editSubTab === 'METADATA' ? (
                              <PdfNativeMetadataForm
                                question={selectedInspectQuestion}
                                onSaveMetadata={handleSaveQuestionEdit}
                              />
                            ) : (
                              <PdfNativeBoundaryEditor
                                question={selectedInspectQuestion}
                                onUpdateQuestion={handleSaveQuestionEdit}
                              />
                            )}
                          </View>
                        )}
                      </Card>
                    </ScrollView>
                  ) : (
                    <View style={styles.emptyWrap}>
                      <Text style={styles.emptyText}>Select a question to inspect.</Text>
                    </View>
                  )}
                </View>
              </View>
            )}
          </View>
        </Screen>
      </Modal>
    </Screen>
  );
}

const styles = StyleSheet.create({
  refreshBtn: {
    padding: spacing.xs + 2,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.md,
  },
  headerBtnText: {
    color: colors.white,
    fontWeight: '700',
    fontSize: 13,
  },
  tabBar: {
    flexDirection: 'row',
    backgroundColor: colors.surfaceRaised,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingHorizontal: spacing.lg,
  },
  tabItem: {
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabItemActive: {
    borderBottomColor: colors.primary,
  },
  tabText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textMuted,
  },
  tabTextActive: {
    color: colors.primary,
    fontWeight: '700',
  },
  filterSection: {
    padding: spacing.md,
    backgroundColor: colors.surfaceMuted,
    gap: spacing.xs,
  },
  searchRow: {
    position: 'relative',
    justifyContent: 'center',
  },
  searchIcon: {
    position: 'absolute',
    left: 12,
    zIndex: 1,
  },
  searchInput: {
    paddingLeft: 36,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  filterChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: colors.surfaceRaised,
    borderWidth: 1,
    borderColor: colors.border,
  },
  filterChipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  filterChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textMuted,
  },
  filterChipTextActive: {
    color: colors.white,
    fontWeight: '700',
  },
  listContent: {
    padding: spacing.md,
    gap: spacing.md,
  },
  emptyWrap: {
    paddingVertical: spacing.xxl,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: {
    color: colors.textMuted,
    fontSize: 14,
  },
  setCard: {
    gap: spacing.sm,
    padding: spacing.lg,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  badgeGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    flexWrap: 'wrap',
  },
  dateText: {
    fontSize: 12,
    color: colors.textMuted,
  },
  setTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: colors.text,
  },
  setDescription: {
    fontSize: 13,
    color: colors.textMuted,
    lineHeight: 18,
  },
  cardActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.xs,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  inspectBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: radius.md,
    backgroundColor: colors.primarySoft,
    borderWidth: 1,
    borderColor: '#93C5FD',
  },
  inspectBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.primary,
  },
  createTestBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: radius.md,
    backgroundColor: '#15803D',
  },
  createTestBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.white,
  },
  deleteBtn: {
    padding: 10,
    borderRadius: radius.md,
    backgroundColor: '#FEE2E2',
    borderWidth: 1,
    borderColor: '#FECACA',
    alignItems: 'center',
    justifyContent: 'center',
  },
  inspectBody: {
    flex: 1,
    backgroundColor: colors.background,
  },
  loadingWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    fontSize: 14,
    color: colors.textMuted,
  },
  sourcePdfBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
    backgroundColor: '#EEF2F6',
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  sourcePdfLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  sourcePdfText: {
    fontSize: 12,
    color: colors.textMuted,
  },
  sourcePdfName: {
    fontWeight: '700',
    color: colors.text,
  },
  attachSourceBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.white,
    paddingVertical: 4,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.primary,
  },
  attachSourceBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.primary,
  },
  splitLayout: {
    flex: 1,
    flexDirection: 'row',
  },
  leftPane: {
    width: '38%',
    borderRightWidth: 1,
    borderRightColor: colors.border,
    backgroundColor: colors.surfaceMuted,
    padding: spacing.sm,
  },
  paneTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: colors.textMuted,
    textTransform: 'uppercase',
    marginBottom: spacing.xs,
  },
  questionListScroll: {
    flex: 1,
  },
  qListItem: {
    padding: spacing.sm,
    backgroundColor: colors.surfaceRaised,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.xs,
    gap: 4,
  },
  qListItemSelected: {
    borderColor: colors.primary,
    backgroundColor: colors.primarySoft,
  },
  qListTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  qNumText: {
    fontSize: 14,
    fontWeight: '800',
    color: colors.text,
  },
  qNumTextSelected: {
    color: colors.primary,
  },
  qListBottom: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  qSubText: {
    fontSize: 11,
    color: colors.textMuted,
  },
  keyText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#15803D',
  },
  keyTextMissing: {
    color: colors.danger,
  },
  rightPane: {
    flex: 1,
    padding: spacing.md,
    backgroundColor: colors.background,
  },
  detailScroll: {
    gap: spacing.md,
  },
  detailCard: {
    gap: spacing.md,
    padding: spacing.md,
  },
  detailHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  detailTitleGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  detailTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: colors.text,
  },
  detailHeaderActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  deleteQuestionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
    paddingVertical: 6,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.sm,
  },
  deleteQuestionBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#DC2626',
  },
  editToggleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.primary,
    paddingVertical: 6,
    paddingHorizontal: spacing.md,
    borderRadius: radius.sm,
  },
  editToggleBtnActive: {
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1,
    borderColor: colors.border,
  },
  editToggleBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.primary,
  },
  editToggleBtnTextActive: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.white,
  },
  reviewAlertBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: '#FEF3C7',
    borderWidth: 1,
    borderColor: '#FDE68A',
    padding: spacing.md,
    borderRadius: radius.md,
  },
  reviewAlertTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#92400E',
  },
  reviewAlertSub: {
    fontSize: 11,
    color: '#B45309',
    marginTop: 2,
  },
  reviewAlertBtn: {
    backgroundColor: '#D97706',
    paddingVertical: 6,
    paddingHorizontal: spacing.md,
    borderRadius: radius.sm,
  },
  reviewAlertBtnText: {
    fontSize: 11,
    fontWeight: '800',
    color: colors.white,
  },
  editModeWrap: {
    gap: spacing.md,
  },
  editorTabsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingBottom: spacing.xs,
  },
  editorTab: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 6,
    paddingHorizontal: spacing.md,
    borderRadius: radius.sm,
    backgroundColor: colors.surfaceMuted,
  },
  editorTabActive: {
    backgroundColor: colors.primarySoft,
  },
  editorTabText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textMuted,
  },
  editorTabTextActive: {
    color: colors.primary,
  },
  metaGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
    backgroundColor: colors.surfaceMuted,
    padding: spacing.md,
    borderRadius: radius.md,
  },
  metaCol: {
    minWidth: '40%',
    gap: 2,
  },
  metaLabel: {
    fontSize: 11,
    color: colors.textMuted,
    fontWeight: '600',
  },
  metaVal: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.text,
  },
  previewWrap: {
    gap: spacing.xs,
  },
  previewLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.text,
  },
  modalHeaderCreateBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#15803D',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.md,
  },
  modalHeaderCreateBtnText: {
    color: colors.white,
    fontSize: 13,
    fontWeight: '700',
  },
});
