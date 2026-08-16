import React, { useCallback, useMemo, useState } from 'react';
import {
  Alert,
  FlatList,
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import {
  Archive,
  BarChart3,
  CheckCircle2,
  Clock,
  ExternalLink,
  Eye,
  FileCheck,
  FileEdit,
  FilePlus,
  FileText,
  FolderOpen,
  Layers,
  ListFilter,
  Play,
  RotateCcw,
  Search,
  Trash2,
  Undo2,
} from 'lucide-react-native';

import { AppHeader } from '../../../components/common/AppHeader';
import { Badge } from '../../../components/common/Badge';
import { Card } from '../../../components/common/Card';
import { EmptyState } from '../../../components/common/EmptyState';
import { InputField } from '../../../components/common/InputField';
import { Screen } from '../../../components/common/Screen';
import { colors, radius, spacing } from '../../../theme';
import { RootStackScreenProps } from '../../../navigation/types';
import { useAppStore } from '../../../store/appStore';
import {
  PdfNativeQuestion,
  PdfNativeTest,
  PdfNativeTestSection,
  PdfNativeTestStatus,
} from '../../../services/pdf-native/pdfNativeTypes';
import {
  archivePdfNativeTest,
  deletePdfNativeTest,
  listPdfNativeTests,
  publishPdfNativeTest,
  restorePdfNativeTestDraft,
  validateTestForPublish,
} from '../../../services/pdf-native/pdfNativeTestService';
import { listPdfNativeBankQuestions } from '../../../services/pdf-native/pdfNativeBankService';
import { getLocalPdfNativeSections } from '../../../services/pdf-native/pdfNativeLocalStorage';
import { PdfNativeTestPreviewModal } from './PdfNativeTestPreviewModal';

type TabType = 'DRAFT' | 'READY' | 'ARCHIVED';

export function PdfNativeTestManagementScreen({
  navigation,
}: RootStackScreenProps<'PdfNativeTestManagement'>) {
  const [activeTab, setActiveTab] = useState<TabType>('DRAFT');
  const [tests, setTests] = useState<PdfNativeTest[]>([]);
  const [allQuestions, setAllQuestions] = useState<PdfNativeQuestion[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [subjectFilter, setSubjectFilter] = useState<string>('All');
  const [isLoading, setIsLoading] = useState(true);

  // Preview Modal
  const [previewTest, setPreviewTest] = useState<PdfNativeTest | null>(null);
  const [previewQuestions, setPreviewQuestions] = useState<PdfNativeQuestion[]>([]);
  const [isPreviewModalVisible, setIsPreviewModalVisible] = useState(false);

  // Publish confirmation modal
  const [publishTarget, setPublishTarget] = useState<PdfNativeTest | null>(null);
  const [publishValidationIssues, setPublishValidationIssues] = useState<string[]>([]);
  const [isPublishModalVisible, setIsPublishModalVisible] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);

  const loadData = useCallback(async () => {
    setIsLoading(true);
    try {
      const [fetchedTests, fetchedQuestions] = await Promise.all([
        listPdfNativeTests(),
        listPdfNativeBankQuestions(),
      ]);

      // Enrich tests with sections if available
      const enrichedTests = await Promise.all(
        fetchedTests.map(async (t) => {
          if (!t.sections || t.sections.length === 0) {
            const sec = await getLocalPdfNativeSections(t.id);
            return { ...t, sections: sec };
          }
          return t;
        })
      );

      setTests(enrichedTests);
      setAllQuestions(fetchedQuestions);
    } catch (err) {
      console.warn('[PdfNativeTestManagement] Error loading tests:', err);
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
    let drafts = 0;
    let ready = 0;
    let archived = 0;
    for (const t of tests) {
      if (t.status === 'READY' || t.status === 'LIVE') ready++;
      else if (t.status === 'ARCHIVED') archived++;
      else drafts++;
    }
    return { drafts, ready, archived };
  }, [tests]);

  const filteredTests = useMemo(() => {
    return tests
      .filter((t) => {
        if (activeTab === 'DRAFT') {
          return t.status === 'DRAFT' || !t.status;
        }
        if (activeTab === 'READY') {
          return t.status === 'READY' || t.status === 'LIVE';
        }
        if (activeTab === 'ARCHIVED') {
          return t.status === 'ARCHIVED';
        }
        return true;
      })
      .filter((t) => {
        if (subjectFilter !== 'All') {
          if (t.subject !== subjectFilter) return false;
        }
        if (searchQuery.trim().length > 0) {
          const q = searchQuery.toLowerCase().trim();
          const matchTitle = t.title.toLowerCase().includes(q);
          const matchSub = t.subject.toLowerCase().includes(q);
          const matchDesc = t.description ? t.description.toLowerCase().includes(q) : false;
          return matchTitle || matchSub || matchDesc;
        }
        return true;
      });
  }, [activeTab, searchQuery, subjectFilter, tests]);

  // Open Preview Modal
  const handleOpenPreview = useCallback(
    (test: PdfNativeTest) => {
      // Find questions corresponding to this test
      const qList = allQuestions.filter((q) => q.review_status === 'APPROVED');
      setPreviewTest(test);
      setPreviewQuestions(qList.slice(0, test.total_questions || 30));
      setIsPreviewModalVisible(true);
    },
    [allQuestions]
  );

  // Prepare Publish
  const handleInitiatePublish = useCallback(
    (test: PdfNativeTest) => {
      const qList = allQuestions.filter((q) => q.review_status === 'APPROVED');
      const testQs = qList.slice(0, test.total_questions || 30);
      const val = validateTestForPublish(test, testQs, test.sections);

      setPublishTarget(test);
      setPublishValidationIssues(val.errors);
      setIsPublishModalVisible(true);
    },
    [allQuestions]
  );

  // Confirm Publish
  const handleConfirmPublish = useCallback(async () => {
    if (!publishTarget) return;
    setIsPublishing(true);
    try {
      const success = await publishPdfNativeTest(publishTarget.id);
      if (success) {
        setIsPublishModalVisible(false);
        setPublishTarget(null);
        await loadData();
        void useAppStore.getState().bootstrap();
        Alert.alert(
          'Test Published! 🎉',
          `"${publishTarget.title}" is now LIVE and accessible to students in CBT test lists.`
        );
      } else {
        Alert.alert('Publish Error', 'Could not update test status. Please try again.');
      }
    } catch (err) {
      Alert.alert('Error', err instanceof Error ? err.message : 'Publish failed');
    } finally {
      setIsPublishing(false);
    }
  }, [loadData, publishTarget]);

  // Archive Test
  const handleArchive = useCallback(
    (test: PdfNativeTest) => {
      Alert.alert(
        'Unpublish & Archive Test?',
        `"${test.title}" will be moved to Archive and will no longer be visible to students in CBT.`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Archive',
            style: 'destructive',
            onPress: async () => {
              await archivePdfNativeTest(test.id);
              await loadData();
              void useAppStore.getState().bootstrap();
            },
          },
        ]
      );
    },
    [loadData]
  );

  // Restore Draft
  const handleRestore = useCallback(
    async (test: PdfNativeTest) => {
      await restorePdfNativeTestDraft(test.id);
      await loadData();
      void useAppStore.getState().bootstrap();
      Alert.alert('Restored to Drafts', `"${test.title}" is now in Drafts for editing.`);
    },
    [loadData]
  );

  // Delete Test
  const handleDelete = useCallback(
    (test: PdfNativeTest) => {
      Alert.alert(
        'Delete Test?',
        `Are you sure you want to permanently delete "${test.title}"? This action cannot be undone.`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Delete',
            style: 'destructive',
            onPress: async () => {
              await deletePdfNativeTest(test.id);
              await loadData();
              void useAppStore.getState().bootstrap();
            },
          },
        ]
      );
    },
    [loadData]
  );

  return (
    <Screen useScrollView={false}>
      <AppHeader
        title="Test Management"
        subtitle="Manage drafts, configure sections, and publish PDF-Native CBT papers"
        showBack={true}
        onBack={() => navigation.navigate('AdminDashboard')}
        rightSlot={
          <TouchableOpacity
            style={styles.headerBtn}
            onPress={() => navigation.navigate('PdfNativeTestCreator')}
            activeOpacity={0.7}
          >
            <FilePlus size={16} color={colors.white} />
            <Text style={styles.headerBtnText}>+ New Test</Text>
          </TouchableOpacity>
        }
      />

      {/* Tabs */}
      <View style={styles.tabBar}>
        <TouchableOpacity
          style={[styles.tabItem, activeTab === 'DRAFT' && styles.tabItemActive]}
          onPress={() => setActiveTab('DRAFT')}
          activeOpacity={0.7}
        >
          <FileEdit size={16} color={activeTab === 'DRAFT' ? colors.primary : colors.textMuted} />
          <Text style={[styles.tabText, activeTab === 'DRAFT' && styles.tabTextActive]}>
            Drafts ({counts.drafts})
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tabItem, activeTab === 'READY' && styles.tabItemActive]}
          onPress={() => setActiveTab('READY')}
          activeOpacity={0.7}
        >
          <FileCheck size={16} color={activeTab === 'READY' ? colors.primary : colors.textMuted} />
          <Text style={[styles.tabText, activeTab === 'READY' && styles.tabTextActive]}>
            Ready / Live ({counts.ready})
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tabItem, activeTab === 'ARCHIVED' && styles.tabItemActive]}
          onPress={() => setActiveTab('ARCHIVED')}
          activeOpacity={0.7}
        >
          <Archive size={16} color={activeTab === 'ARCHIVED' ? colors.primary : colors.textMuted} />
          <Text style={[styles.tabText, activeTab === 'ARCHIVED' && styles.tabTextActive]}>
            Archived ({counts.archived})
          </Text>
        </TouchableOpacity>
      </View>

      {/* Search and Filters */}
      <View style={styles.filterSection}>
        <View style={styles.searchRow}>
          <Search size={16} color={colors.textMuted} style={styles.searchIcon} />
          <InputField
            label=""
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder="Search tests by title or description..."
            style={styles.searchInput}
          />
        </View>

        <View style={styles.chipRow}>
          {['All', 'Physics', 'Chemistry', 'Mathematics', 'Biology', 'Multi-Subject'].map((sub) => (
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

      {/* Tests List */}
      <FlatList
        data={filteredTests}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          <View style={styles.emptyWrap}>
            <EmptyState
              icon={activeTab === 'DRAFT' ? FileEdit : activeTab === 'READY' ? FileCheck : Archive}
              title={`No ${activeTab.toLowerCase()} tests found`}
              description={
                activeTab === 'DRAFT'
                  ? 'Click "+ New Test" above or create a test from the Question Bank to start a new draft.'
                  : activeTab === 'READY'
                  ? 'No published tests yet. Complete and publish a draft test to make it live for students.'
                  : 'No archived tests.'
              }
            />
          </View>
        }
        renderItem={({ item: test }) => {
          const isDraft = test.status === 'DRAFT' || !test.status;
          const isLive = test.status === 'READY' || test.status === 'LIVE';
          const isArchived = test.status === 'ARCHIVED';

          const sectionDesc =
            test.sections && test.sections.length > 0
              ? test.sections
                  .map((s) => `${s.subject} (Q${s.question_start}–${s.question_end})`)
                  .join(' • ')
              : null;

          return (
            <Card style={styles.testCard}>
              {/* Header Badges */}
              <View style={styles.cardHeader}>
                <View style={styles.badgeGroup}>
                  <Badge
                    label={isDraft ? 'DRAFT' : isLive ? 'READY / LIVE' : 'ARCHIVED'}
                    tone={isDraft ? 'warning' : isLive ? 'success' : 'neutral'}
                  />
                  <Badge label={test.subject || 'Physics'} tone="primary" />
                  <Badge label="PDF-Native" tone="primary" />
                </View>
                <Text style={styles.dateText}>
                  {test.created_at
                    ? new Date(test.created_at).toLocaleDateString(undefined, {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric',
                      })
                    : ''}
                </Text>
              </View>

              {/* Title & Description */}
              <Text style={styles.testTitle}>{test.title}</Text>
              {test.description ? (
                <Text style={styles.testDescription} numberOfLines={2}>
                  {test.description}
                </Text>
              ) : null}

              {/* Meta information */}
              <View style={styles.metaRow}>
                <View style={styles.metaItem}>
                  <Clock size={14} color={colors.textMuted} />
                  <Text style={styles.metaText}>{test.duration_minutes || 60} mins</Text>
                </View>
                <View style={styles.metaItem}>
                  <Layers size={14} color={colors.textMuted} />
                  <Text style={styles.metaText}>{test.total_questions || 0} Questions</Text>
                </View>
                {test.exam_type ? (
                  <View style={styles.metaItem}>
                    <Text style={styles.metaText}>
                      Type: {test.exam_type === 'multi' ? 'Multi-Subject' : 'Single Subject'}
                    </Text>
                  </View>
                ) : null}
              </View>

              {/* Sections summary if present */}
              {sectionDesc ? (
                <View style={styles.sectionSummaryWrap}>
                  <Text style={styles.sectionSummaryLabel}>Sections:</Text>
                  <Text style={styles.sectionSummaryText}>{sectionDesc}</Text>
                </View>
              ) : null}

              {/* Actions Footer */}
              <View style={styles.cardActions}>
                {isDraft && (
                  <>
                    <TouchableOpacity
                      style={styles.actionBtnPrimary}
                      onPress={() =>
                        navigation.navigate('PdfNativeTestCreator', { testId: test.id })
                      }
                      activeOpacity={0.7}
                    >
                      <FileEdit size={14} color={colors.white} />
                      <Text style={styles.actionBtnPrimaryText}>Open / Edit</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={styles.actionBtnOutline}
                      onPress={() => handleOpenPreview(test)}
                      activeOpacity={0.7}
                    >
                      <Eye size={14} color={colors.primary} />
                      <Text style={styles.actionBtnOutlineText}>Preview</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={styles.actionBtnPublish}
                      onPress={() => handleInitiatePublish(test)}
                      activeOpacity={0.7}
                    >
                      <CheckCircle2 size={14} color={colors.white} />
                      <Text style={styles.actionBtnPublishText}>Publish</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={styles.actionBtnDanger}
                      onPress={() => handleDelete(test)}
                      activeOpacity={0.7}
                    >
                      <Trash2 size={14} color={colors.danger} />
                    </TouchableOpacity>
                  </>
                )}

                {isLive && (
                  <>
                    <TouchableOpacity
                      style={styles.actionBtnOutline}
                      onPress={() =>
                        navigation.navigate('PdfNativeTestCreator', { testId: test.id })
                      }
                      activeOpacity={0.7}
                    >
                      <FileEdit size={14} color={colors.primary} />
                      <Text style={styles.actionBtnOutlineText}>Edit</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={styles.actionBtnOutline}
                      onPress={() => handleOpenPreview(test)}
                      activeOpacity={0.7}
                    >
                      <Eye size={14} color={colors.primary} />
                      <Text style={styles.actionBtnOutlineText}>Preview CBT</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={styles.actionBtnPrimary}
                      onPress={() => navigation.navigate('ViewResults')}
                      activeOpacity={0.7}
                    >
                      <BarChart3 size={14} color={colors.white} />
                      <Text style={styles.actionBtnPrimaryText}>Results</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={styles.actionBtnArchive}
                      onPress={() => handleArchive(test)}
                      activeOpacity={0.7}
                    >
                      <Archive size={14} color={colors.warning} />
                      <Text style={styles.actionBtnArchiveText}>Unpublish</Text>
                    </TouchableOpacity>
                  </>
                )}

                {isArchived && (
                  <>
                    <TouchableOpacity
                      style={styles.actionBtnPrimary}
                      onPress={() => handleRestore(test)}
                      activeOpacity={0.7}
                    >
                      <RotateCcw size={14} color={colors.white} />
                      <Text style={styles.actionBtnPrimaryText}>Restore as Draft</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={styles.actionBtnDanger}
                      onPress={() => handleDelete(test)}
                      activeOpacity={0.7}
                    >
                      <Trash2 size={14} color={colors.danger} />
                      <Text style={styles.actionBtnDangerText}>Delete</Text>
                    </TouchableOpacity>
                  </>
                )}
              </View>
            </Card>
          );
        }}
      />

      {/* Visual Preview Modal */}
      {previewTest ? (
        <PdfNativeTestPreviewModal
          visible={isPreviewModalVisible}
          onClose={() => {
            setIsPreviewModalVisible(false);
            setPreviewTest(null);
          }}
          testTitle={previewTest.title}
          questions={previewQuestions}
        />
      ) : null}

      {/* Publish Confirmation Modal */}
      <Modal
        visible={isPublishModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setIsPublishModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <Card style={styles.publishModalCard}>
            <Text style={styles.publishModalTitle}>Publish Test</Text>

            {publishTarget ? (
              <>
                <Text style={styles.publishTargetName}>{publishTarget.title}</Text>
                <View style={styles.publishSummaryBox}>
                  <Text style={styles.publishSummaryItem}>
                    • Total Questions: {publishTarget.total_questions}
                  </Text>
                  <Text style={styles.publishSummaryItem}>
                    • Subject / Exam: {publishTarget.subject}
                  </Text>
                  <Text style={styles.publishSummaryItem}>
                    • Duration: {publishTarget.duration_minutes} minutes
                  </Text>
                </View>

                {/* Validation Status */}
                {publishValidationIssues.length > 0 ? (
                  <View style={styles.validationErrorBox}>
                    <Text style={styles.validationErrorTitle}>
                      Cannot publish test ({publishValidationIssues.length} issue(s) found):
                    </Text>
                    {publishValidationIssues.map((err, i) => (
                      <Text key={i} style={styles.validationErrorText}>
                        • {err}
                      </Text>
                    ))}
                  </View>
                ) : (
                  <View style={styles.validationSuccessBox}>
                    <CheckCircle2 size={16} color="#15803D" />
                    <Text style={styles.validationSuccessText}>
                      All validation checks passed! Ready to go LIVE.
                    </Text>
                  </View>
                )}

                <Text style={styles.publishWarningText}>
                  ⚠️ Warning: Once published, this test will become immediately available to students in CBT exams.
                </Text>

                <View style={styles.publishModalActions}>
                  <TouchableOpacity
                    style={styles.modalCancelBtn}
                    onPress={() => setIsPublishModalVisible(false)}
                    disabled={isPublishing}
                  >
                    <Text style={styles.modalCancelText}>Cancel</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[
                      styles.modalPublishBtn,
                      publishValidationIssues.length > 0 && styles.modalPublishBtnDisabled,
                    ]}
                    onPress={handleConfirmPublish}
                    disabled={publishValidationIssues.length > 0 || isPublishing}
                  >
                    <Text style={styles.modalPublishText}>
                      {isPublishing ? 'Publishing...' : 'Publish Test Now'}
                    </Text>
                  </TouchableOpacity>
                </View>
              </>
            ) : null}
          </Card>
        </View>
      </Modal>
    </Screen>
  );
}

const styles = StyleSheet.create({
  headerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
  },
  headerBtnText: {
    color: colors.white,
    fontWeight: '800',
    fontSize: 12,
  },
  tabBar: {
    flexDirection: 'row',
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.sm,
    gap: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.surface,
  },
  tabItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceMuted,
  },
  tabItemActive: {
    backgroundColor: colors.primarySoft,
    borderWidth: 1,
    borderColor: colors.primary,
  },
  tabText: {
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: '700',
  },
  tabTextActive: {
    color: colors.primary,
    fontWeight: '800',
  },
  filterSection: {
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    gap: spacing.sm,
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  searchIcon: {
    position: 'absolute',
    left: 12,
    zIndex: 1,
  },
  searchInput: {
    flex: 1,
    paddingLeft: 36,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  filterChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceMuted,
  },
  filterChipActive: {
    backgroundColor: colors.primary,
  },
  filterChipText: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '700',
  },
  filterChipTextActive: {
    color: colors.white,
  },
  listContent: {
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.xxxl,
    gap: spacing.md,
  },
  emptyWrap: {
    paddingVertical: spacing.xxl,
  },
  testCard: {
    padding: spacing.lg,
    gap: spacing.md,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  badgeGroup: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  dateText: {
    color: colors.textSubtle,
    fontSize: 11,
    fontWeight: '600',
  },
  testTitle: {
    color: colors.text,
    fontSize: 17,
    fontWeight: '800',
  },
  testDescription: {
    color: colors.textMuted,
    fontSize: 13,
    lineHeight: 18,
  },
  metaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
    backgroundColor: colors.surfaceMuted,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  metaText: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '700',
  },
  sectionSummaryWrap: {
    backgroundColor: colors.primarySoft,
    padding: spacing.sm,
    borderRadius: radius.sm,
    gap: 2,
  },
  sectionSummaryLabel: {
    color: colors.primaryDeep,
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  sectionSummaryText: {
    color: colors.primaryDeep,
    fontSize: 12,
    fontWeight: '600',
  },
  cardActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    paddingTop: spacing.xs,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  actionBtnPrimary: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
  },
  actionBtnPrimaryText: {
    color: colors.white,
    fontSize: 12,
    fontWeight: '800',
  },
  actionBtnOutline: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: colors.surfaceRaised,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
  },
  actionBtnOutlineText: {
    color: colors.primary,
    fontSize: 12,
    fontWeight: '800',
  },
  actionBtnPublish: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: '#15803D',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
  },
  actionBtnPublishText: {
    color: colors.white,
    fontSize: 12,
    fontWeight: '800',
  },
  actionBtnArchive: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: colors.warningSoft || '#FEF3C7',
    borderWidth: 1,
    borderColor: colors.warning,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
  },
  actionBtnArchiveText: {
    color: colors.warning,
    fontSize: 12,
    fontWeight: '800',
  },
  actionBtnDanger: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: colors.dangerSoft,
    borderWidth: 1,
    borderColor: colors.danger,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
  },
  actionBtnDangerText: {
    color: colors.danger,
    fontSize: 12,
    fontWeight: '800',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.xl,
  },
  publishModalCard: {
    width: '100%',
    maxWidth: 500,
    padding: spacing.xl,
    gap: spacing.md,
  },
  publishModalTitle: {
    color: colors.text,
    fontSize: 20,
    fontWeight: '800',
  },
  publishTargetName: {
    color: colors.primary,
    fontSize: 16,
    fontWeight: '700',
  },
  publishSummaryBox: {
    backgroundColor: colors.surfaceMuted,
    padding: spacing.md,
    borderRadius: radius.md,
    gap: spacing.xs,
  },
  publishSummaryItem: {
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: '600',
  },
  validationErrorBox: {
    backgroundColor: colors.dangerSoft,
    borderColor: colors.danger,
    borderWidth: 1,
    padding: spacing.md,
    borderRadius: radius.md,
    gap: spacing.xs,
  },
  validationErrorTitle: {
    color: colors.danger,
    fontSize: 13,
    fontWeight: '800',
  },
  validationErrorText: {
    color: colors.danger,
    fontSize: 12,
    lineHeight: 16,
  },
  validationSuccessBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: '#DCFCE7',
    padding: spacing.md,
    borderRadius: radius.md,
  },
  validationSuccessText: {
    color: '#15803D',
    fontSize: 13,
    fontWeight: '700',
  },
  publishWarningText: {
    color: colors.textMuted,
    fontSize: 12,
    lineHeight: 18,
  },
  publishModalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  modalCancelBtn: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceMuted,
  },
  modalCancelText: {
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: '700',
  },
  modalPublishBtn: {
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    backgroundColor: '#15803D',
  },
  modalPublishBtnDisabled: {
    backgroundColor: colors.surfaceMuted,
    opacity: 0.5,
  },
  modalPublishText: {
    color: colors.white,
    fontSize: 13,
    fontWeight: '800',
  },
});
