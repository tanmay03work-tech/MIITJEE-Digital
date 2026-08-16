import React, { useCallback, useDeferredValue, useMemo, useState } from 'react';
import { Alert, FlatList, ListRenderItem, StyleSheet, Text, View } from 'react-native';
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { useFocusEffect } from '@react-navigation/native';
import { PencilLine, Play, Share2, ShieldAlert, Trash2 } from 'lucide-react-native';

import { generateExamShareLink } from '../../services/api/tests';
import { getExamShareUrl } from '../../utils/urlHelper';

import { fetchAdminTestsPage } from '../../services/api/admin';
import { AdminListSkeleton } from '../../components/admin/AdminListSkeleton';
import { AppHeader } from '../../components/common/AppHeader';
import { AnimatedPressable } from '../../components/common/AnimatedPressable';
import { Badge } from '../../components/common/Badge';
import { Card } from '../../components/common/Card';
import { EmptyState } from '../../components/common/EmptyState';
import { InputField } from '../../components/common/InputField';
import { Screen } from '../../components/common/Screen';
import { useAppStore } from '../../store/appStore';
import { useAuthStore } from '../../store/authStore';
import { colors, radius, spacing } from '../../theme';
import { ScholarshipAdmissionClass, ScholarshipTargetExam, TestItem, TestType } from '../../types';
import {
  combineScheduleInputs,
  coerceDurationMinutes,
  formatDateLabel,
  formatDateTimeLabel,
  formatDuration,
  sanitizeDurationInput,
  toDateInputValue,
  toTimeInputValue,
} from '../../utils/formatters';
import {
  scholarshipAdmissionLabels,
  scholarshipAdmissionOptions,
  scholarshipTargetLabels,
  scholarshipTargetOptions,
} from '../../constants/scholarship';
import { getTestStatusLabel, isTestActive } from '../../utils/testAvailability';

const PAGE_SIZE = 20;

interface DraftState {
  title: string;
  description: string;
  subject: string;
  durationMinutes: string;
  type: TestType;
  batchId: string;
  scheduleDate: string;
  scheduleTime: string;
  scholarshipAdmissionClass: ScholarshipAdmissionClass;
  scholarshipTargetExam: ScholarshipTargetExam;
  isOpenForAll: boolean;
  correctMarks: string;
  wrongMarks: string;
  unattemptedMarks: string;
}

function buildSchedulePickerDate(dateInput: string, timeInput: string) {
  try {
    return new Date(combineScheduleInputs(dateInput, timeInput));
  } catch {
    return new Date();
  }
}

function buildDraft(test: TestItem): DraftState {
  return {
    title: test.title,
    description: test.description,
    subject: test.subject,
    durationMinutes: String(coerceDurationMinutes(test.durationMinutes)),
    type: test.type,
    batchId: test.batchId ?? '',
    scheduleDate: toDateInputValue(test.scheduledAt),
    scheduleTime: toTimeInputValue(test.scheduledAt),
    scholarshipAdmissionClass: test.scholarshipAdmissionClass ?? '8th',
    scholarshipTargetExam: test.scholarshipTargetExam ?? 'boards',
    isOpenForAll: test.isOpenForAll ?? false,
    correctMarks: String(test.correctMarks ?? 4),
    wrongMarks: String(test.wrongMarks ?? -1),
    unattemptedMarks: String(test.unattemptedMarks ?? 0),
  };
}

export function ManageTestsScreen() {
  const user = useAuthStore((state) => state.user);
  const batches = useAppStore((state) => state.batches);
  const updateTest = useAppStore((state) => state.updateTest);
  const setTestStarted = useAppStore((state) => state.setTestStarted);
  const deleteTest = useAppStore((state) => state.deleteTest);

  const [editingTestId, setEditingTestId] = useState<string | null>(null);
  const [draft, setDraft] = useState<DraftState | null>(null);
  const [isDatePickerVisible, setIsDatePickerVisible] = useState(false);
  const [isTimePickerVisible, setIsTimePickerVisible] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [testTypeFilter, setTestTypeFilter] = useState<'all' | TestType>('all');
  const [tests, setTests] = useState<TestItem[]>([]);
  const [hasMore, setHasMore] = useState(true);
  const [loadingInitial, setLoadingInitial] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const isAdmin = user?.role === 'admin' && user.approvalStatus === 'approved';
  const deferredSearchTerm = useDeferredValue(searchTerm);

  const loadTestsPage = useCallback(
    async (reset: boolean, searchValue: string) => {
      const offset = reset ? 0 : tests.length;
      const loader = reset ? setLoadingInitial : setLoadingMore;
      loader(true);
      try {
        const rows = await fetchAdminTestsPage({
          offset,
          limit: PAGE_SIZE,
          search: searchValue,
        });
        setTests((current) => (reset ? rows : [...current, ...rows]));
        setHasMore(rows.length === PAGE_SIZE);
      } catch (error) {
        Alert.alert('Unable to load tests', error instanceof Error ? error.message : 'Please try again.');
      } finally {
        loader(false);
      }
    },
    [tests.length],
  );

  useFocusEffect(
    React.useCallback(() => {
      if (!isAdmin) {
        return undefined;
      }
      void loadTestsPage(true, deferredSearchTerm);
      return undefined;
    }, [deferredSearchTerm, isAdmin, loadTestsPage]),
  );

  const orderedTests = useMemo(
    () =>
      [...tests]
        .filter((entry) => {
          const normalizedSearch = deferredSearchTerm.trim().toLowerCase();
          if (normalizedSearch.length === 0) {
            return true;
          }
          return [entry.title, entry.subject, entry.batchId].filter(Boolean).some((value) => value?.toLowerCase().includes(normalizedSearch));
        })
        .filter((entry) => (testTypeFilter === 'all' ? true : entry.type === testTypeFilter))
        .sort((left, right) => new Date(left.scheduledAt).getTime() - new Date(right.scheduledAt).getTime()),
    [deferredSearchTerm, testTypeFilter, tests],
  );

  const handleStartEdit = useCallback((test: TestItem) => {
    setEditingTestId(test.id);
    setDraft(buildDraft(test));
  }, []);

  const handleCancelEdit = useCallback(() => {
    setEditingTestId(null);
    setDraft(null);
    setIsDatePickerVisible(false);
    setIsTimePickerVisible(false);
  }, []);

  const handleDateChange = useCallback((event: DateTimePickerEvent, selectedDate?: Date) => {
    setIsDatePickerVisible(false);
    if (event.type !== 'set' || !selectedDate) {
      return;
    }

    setDraft((current) =>
      current
        ? {
            ...current,
            scheduleDate: toDateInputValue(selectedDate.toISOString()),
          }
        : current,
    );
  }, []);

  const handleTimeChange = useCallback((event: DateTimePickerEvent, selectedDate?: Date) => {
    setIsTimePickerVisible(false);
    if (event.type !== 'set' || !selectedDate) {
      return;
    }

    setDraft((current) =>
      current
        ? {
            ...current,
            scheduleTime: toTimeInputValue(selectedDate.toISOString()),
          }
        : current,
    );
  }, []);

  const handleSave = useCallback(async () => {
    if (!editingTestId || !draft) {
      return;
    }

    if (!draft.title.trim() || !draft.description.trim() || !draft.subject.trim()) {
      Alert.alert('Missing details', 'Title, description, and subject are required.');
      return;
    }

    if (draft.type === 'weekly' && !draft.batchId && !draft.isOpenForAll) {
      Alert.alert('Batch required', 'Select a batch for restricted exams or switch Access Type to Open for All.');
      return;
    }

    try {
      const scheduledAt = combineScheduleInputs(draft.scheduleDate, draft.scheduleTime);
      const updated = await updateTest({
        testId: editingTestId,
        title: draft.title.trim(),
        description: draft.description.trim(),
        subject: draft.subject.trim(),
        durationMinutes: coerceDurationMinutes(draft.durationMinutes),
        scheduledAt,
        type: draft.type,
        batchId: draft.type === 'weekly' ? (draft.batchId || undefined) : undefined,
        isOpenForAll: draft.isOpenForAll,
        scholarshipAdmissionClass: draft.type === 'scholarship' ? draft.scholarshipAdmissionClass : undefined,
        scholarshipTargetExam: draft.type === 'scholarship' ? draft.scholarshipTargetExam : undefined,
      });
      setTests((current) => current.map((item) => (item.id === updated.id ? updated : item)));
      Alert.alert('Test updated', 'The paper details have been saved.');
      handleCancelEdit();
    } catch (error) {
      Alert.alert('Update failed', error instanceof Error ? error.message : 'Unable to update this paper.');
    }
  }, [draft, editingTestId, handleCancelEdit, updateTest]);

  const handleStartEarly = useCallback(
    async (test: TestItem) => {
      if (isTestActive(test)) {
        Alert.alert('Paper already active', 'This paper is already live for students.');
        return;
      }

      try {
        const updated = await setTestStarted(test.id, true);
        setTests((current) => current.map((item) => (item.id === updated.id ? updated : item)));
        Alert.alert('Paper started', 'Students can now enter this paper before the scheduled time.');
      } catch (error) {
        Alert.alert('Status update failed', error instanceof Error ? error.message : 'Unable to change paper status.');
      }
    },
    [setTestStarted],
  );

  const handleDelete = useCallback(
    (test: TestItem) => {
      Alert.alert('Delete test?', `${test.title} and all linked attempts will be removed.`, [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            void deleteTest(test.id)
              .then(() => {
                setTests((current) => current.filter((item) => item.id !== test.id));
              })
              .catch((error) => {
                Alert.alert('Delete failed', error instanceof Error ? error.message : 'Unable to delete this test.');
              });
          },
        },
      ]);
    },
    [deleteTest],
  );

  const handleShareLink = useCallback(async (test: TestItem) => {
    try {
      const res = await generateExamShareLink(test.id, test.isOpenForAll ?? false);
      const shareUrl = getExamShareUrl(res.shareCode);

      if (typeof navigator !== 'undefined' && navigator.clipboard && navigator.clipboard.writeText) {
        try {
          await navigator.clipboard.writeText(shareUrl);
        } catch {
          // Ignore clipboard write failure if restricted by permissions
        }
      }

      Alert.alert(
        'Shareable Exam Link Copied!',
        `Unique Exam Code: ${res.shareCode}\nAccess Mode: ${res.isOpenForAll ? 'OPEN FOR ALL' : 'RESTRICTED BATCH'}\n\nVercel Production Link:\n${shareUrl}`,
      );
    } catch {
      Alert.alert('Unable to generate link', 'Please try again.');
    }
  }, []);

  const renderTestCard = useCallback<ListRenderItem<TestItem>>(
    ({ item: test }) => {
      const isEditing = editingTestId === test.id;
      const testActive = isTestActive(test);
      const statusLabel = getTestStatusLabel(test);
      const resolvedDuration = isEditing && draft ? coerceDurationMinutes(draft.durationMinutes) : test.durationMinutes;

      return (
        <Card style={styles.testCard}>
          <View style={styles.badgeRow}>
            <Badge label={test.type} tone={test.type === 'scholarship' ? 'warning' : 'primary'} />
            <Badge label={statusLabel} tone={testActive ? 'success' : 'warning'} />
            {test.shareCode ? <Badge label={`Code: ${test.shareCode}`} tone="primary" /> : null}
          </View>

          <Text style={styles.title}>{test.title}</Text>
          <Text style={styles.description} numberOfLines={isEditing ? undefined : 3}>
            {test.description}
          </Text>
          <Text style={styles.meta}>{`Starts: ${formatDateTimeLabel(test.scheduledAt)}`}</Text>
          <Text style={styles.meta}>{`${formatDuration(test.durationMinutes)} | ${test.subject} | ${test.batchId ?? 'Open access'}`}</Text>
          <Text style={styles.meta}>
            {testActive
              ? 'Students can enter this paper now.'
              : `Students will see a lock until ${formatDateTimeLabel(test.scheduledAt)} unless you start it early.`}
          </Text>

          <View style={styles.actionRow}>
            <AnimatedPressable style={styles.secondaryButton} onPress={() => void handleShareLink(test)}>
              <Share2 size={16} color={colors.primary} />
              <Text style={styles.secondaryButtonText}>Link</Text>
            </AnimatedPressable>

            <AnimatedPressable style={styles.secondaryButton} onPress={() => handleStartEdit(test)}>
              <PencilLine size={16} color={colors.primary} />
              <Text style={styles.secondaryButtonText}>Edit</Text>
            </AnimatedPressable>
            {!testActive ? (
              <AnimatedPressable style={[styles.statusButton, styles.startButton]} onPress={() => void handleStartEarly(test)}>
                <Play size={16} color={colors.white} />
                <Text style={styles.statusButtonText}>Start</Text>
              </AnimatedPressable>
            ) : null}
            <AnimatedPressable style={styles.deleteButton} onPress={() => handleDelete(test)}>
              <Trash2 size={16} color={colors.danger} />
            </AnimatedPressable>
          </View>

          {isEditing && draft ? (
            <View style={styles.editPanel}>
              <InputField
                label="Title"
                value={draft.title}
                onChangeText={(value) => setDraft((current) => (current ? { ...current, title: value } : current))}
              />
              <InputField
                label="Description"
                value={draft.description}
                onChangeText={(value) => setDraft((current) => (current ? { ...current, description: value } : current))}
              />
              <View style={styles.twoColumnRow}>
                <View style={styles.flexItem}>
                  <InputField
                    label="Subject"
                    value={draft.subject}
                    onChangeText={(value) => setDraft((current) => (current ? { ...current, subject: value } : current))}
                  />
                </View>
                <View style={styles.flexItem}>
                  <InputField
                    label="Duration"
                    keyboardType="number-pad"
                    value={draft.durationMinutes}
                    onChangeText={(value) =>
                      setDraft((current) => (current ? { ...current, durationMinutes: sanitizeDurationInput(value) } : current))
                    }
                    rightAccessory={<Text style={styles.inputAccessory}>min</Text>}
                  />
                </View>
              </View>
              <Text style={styles.previewText}>{`Timer preview: ${formatDuration(resolvedDuration)}`}</Text>

              <Text style={styles.sectionLabel}>Test Type</Text>
              <View style={styles.choiceRow}>
                {(['weekly', 'scholarship'] as const).map((value) => (
                  <AnimatedPressable
                    key={`${test.id}_${value}`}
                    style={[styles.choiceChip, draft.type === value && styles.choiceChipActive]}
                    onPress={() => setDraft((current) => (current ? { ...current, type: value } : current))}>
                    <Text style={[styles.choiceText, draft.type === value && styles.choiceTextActive]}>{value}</Text>
                  </AnimatedPressable>
                ))}
              </View>

              <Text style={styles.sectionLabel}>Access Type</Text>
              <View style={styles.choiceRow}>
                <AnimatedPressable
                  style={[styles.choiceChip, !draft.isOpenForAll && styles.choiceChipActive]}
                  onPress={() => setDraft((current) => (current ? { ...current, isOpenForAll: false } : current))}>
                  <Text style={[styles.choiceText, !draft.isOpenForAll && styles.choiceTextActive]}>Restricted Batch</Text>
                </AnimatedPressable>
                <AnimatedPressable
                  style={[styles.choiceChip, draft.isOpenForAll && styles.choiceChipActive]}
                  onPress={() => setDraft((current) => (current ? { ...current, isOpenForAll: true } : current))}>
                  <Text style={[styles.choiceText, draft.isOpenForAll && styles.choiceTextActive]}>Open for All</Text>
                </AnimatedPressable>
              </View>

              <View style={styles.twoColumnRow}>
                <View style={styles.flexItem}>
                  <Text style={styles.sectionLabel}>Start Date</Text>
                  <AnimatedPressable style={styles.pickerField} onPress={() => setIsDatePickerVisible(true)}>
                    <Text style={styles.pickerValue}>{formatDateLabel(combineScheduleInputs(draft.scheduleDate, draft.scheduleTime))}</Text>
                  </AnimatedPressable>
                </View>
                <View style={styles.flexItem}>
                  <Text style={styles.sectionLabel}>Start Time</Text>
                  <AnimatedPressable style={styles.pickerField} onPress={() => setIsTimePickerVisible(true)}>
                    <Text style={styles.pickerValue}>{draft.scheduleTime}</Text>
                  </AnimatedPressable>
                </View>
              </View>

              {isDatePickerVisible ? (
                <DateTimePicker
                  mode="date"
                  value={buildSchedulePickerDate(draft.scheduleDate, draft.scheduleTime)}
                  onChange={handleDateChange}
                />
              ) : null}

              {isTimePickerVisible ? (
                <DateTimePicker
                  mode="time"
                  value={buildSchedulePickerDate(draft.scheduleDate, draft.scheduleTime)}
                  onChange={handleTimeChange}
                />
              ) : null}

              {draft.type === 'weekly' ? (
                <>
                  <Text style={styles.sectionLabel}>Batch {draft.isOpenForAll ? '(Optional for Open for All)' : ''}</Text>
                  <View style={styles.choiceRow}>
                    {batches.map((batch) => (
                      <AnimatedPressable
                        key={`${test.id}_${batch.id}`}
                        style={[styles.choiceChip, draft.batchId === batch.id && styles.choiceChipActive]}
                        onPress={() =>
                          setDraft((current) =>
                            current ? { ...current, batchId: current.batchId === batch.id ? '' : batch.id } : current,
                          )
                        }>
                        <Text style={[styles.choiceText, draft.batchId === batch.id && styles.choiceTextActive]}>
                          {batch.label}
                        </Text>
                      </AnimatedPressable>
                    ))}
                  </View>
                </>
              ) : (
                <>
                  <Text style={styles.sectionLabel}>Admission Class</Text>
                  <View style={styles.choiceRow}>
                    {scholarshipAdmissionOptions.map((value) => (
                      <AnimatedPressable
                        key={`${test.id}_class_${value}`}
                        style={[styles.choiceChip, draft.scholarshipAdmissionClass === value && styles.choiceChipActive]}
                        onPress={() => setDraft((current) => (current ? { ...current, scholarshipAdmissionClass: value } : current))}>
                        <Text style={[styles.choiceText, draft.scholarshipAdmissionClass === value && styles.choiceTextActive]}>
                          {scholarshipAdmissionLabels[value]}
                        </Text>
                      </AnimatedPressable>
                    ))}
                  </View>

                  <Text style={styles.sectionLabel}>Target Exam</Text>
                  <View style={styles.choiceRow}>
                    {scholarshipTargetOptions.map((value) => (
                      <AnimatedPressable
                        key={`${test.id}_target_${value}`}
                        style={[styles.choiceChip, draft.scholarshipTargetExam === value && styles.choiceChipActive]}
                        onPress={() => setDraft((current) => (current ? { ...current, scholarshipTargetExam: value } : current))}>
                        <Text style={[styles.choiceText, draft.scholarshipTargetExam === value && styles.choiceTextActive]}>
                          {scholarshipTargetLabels[value]}
                        </Text>
                      </AnimatedPressable>
                    ))}
                  </View>
                </>
              )}

              <View style={styles.actionRow}>
                <AnimatedPressable style={styles.secondaryButton} onPress={handleCancelEdit}>
                  <Text style={styles.secondaryButtonText}>Cancel</Text>
                </AnimatedPressable>
                <AnimatedPressable style={styles.saveButton} onPress={() => void handleSave()}>
                  <Text style={styles.saveButtonText}>Save Changes</Text>
                </AnimatedPressable>
              </View>
            </View>
          ) : null}
        </Card>
      );
    },
    [
      batches,
      draft,
      editingTestId,
      handleCancelEdit,
      handleDateChange,
      handleDelete,
      handleSave,
      handleStartEdit,
      handleStartEarly,
      handleTimeChange,
      isDatePickerVisible,
      isTimePickerVisible,
    ],
  );

  const handleLoadMore = useCallback(() => {
    if (loadingInitial || loadingMore || !hasMore) {
      return;
    }
    void loadTestsPage(false, deferredSearchTerm);
  }, [deferredSearchTerm, hasMore, loadTestsPage, loadingInitial, loadingMore]);

  if (!isAdmin) {
    return (
      <Screen>
        <AppHeader title="Manage Tests" subtitle="Available only for approved admins" />
        <View style={styles.emptyWrap}>
          <EmptyState
            icon={ShieldAlert}
            title="Admin access required"
            description="Only approved admins can edit, start, or delete papers."
          />
        </View>
      </Screen>
    );
  }

  return (
    <Screen useScrollView={false}>
      {loadingInitial ? (
        <>
          <AppHeader title="Manage Tests" subtitle="Edit paper details, control schedule timing, and start papers early when needed" />
          <View style={styles.searchWrap}>
            <InputField
              label="Search tests"
              value={searchTerm}
              onChangeText={setSearchTerm}
              placeholder="Search by title, subject, or batch"
            />
          </View>
          <AdminListSkeleton rows={5} />
        </>
      ) : (
        <FlatList
          data={orderedTests}
          keyExtractor={(item) => item.id}
          renderItem={renderTestCard}
          onEndReachedThreshold={0.3}
          onEndReached={handleLoadMore}
          ListHeaderComponent={
            <>
              <AppHeader title="Manage Tests" subtitle="Edit paper details, control schedule timing, and start papers early when needed" />
              <View style={styles.searchWrap}>
                <InputField
                  label="Search tests"
                  value={searchTerm}
                  onChangeText={setSearchTerm}
                  placeholder="Search by title, subject, or batch"
                />
                <View style={styles.filterRow}>
                  {(['all', 'weekly', 'scholarship'] as const).map((value) => (
                    <AnimatedPressable
                      key={`test-type-${value}`}
                      style={[styles.filterChip, testTypeFilter === value && styles.filterChipActive]}
                      onPress={() => setTestTypeFilter(value)}>
                      <Text style={[styles.filterText, testTypeFilter === value && styles.filterTextActive]}>
                        {value === 'all' ? 'All Tests' : value}
                      </Text>
                    </AnimatedPressable>
                  ))}
                </View>
              </View>
            </>
          }
          ListEmptyComponent={
            <View style={styles.emptyWrap}>
              <EmptyState
                icon={ShieldAlert}
                title="No tests found"
                description="Try changing search/filter, or create a new test."
              />
            </View>
          }
          ListFooterComponent={loadingMore ? <AdminListSkeleton rows={1} /> : <View style={styles.footerSpace} />}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          initialNumToRender={4}
          maxToRenderPerBatch={4}
          windowSize={5}
          updateCellsBatchingPeriod={50}
          removeClippedSubviews={false}
        />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  listContent: {
    paddingBottom: spacing.xl,
  },
  searchWrap: {
    paddingHorizontal: spacing.xl,
    marginBottom: spacing.lg,
    gap: spacing.md,
  },
  filterRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    flexWrap: 'wrap',
  },
  filterChip: {
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceMuted,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  filterChipActive: {
    backgroundColor: colors.primary,
  },
  filterText: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'capitalize',
  },
  filterTextActive: {
    color: colors.white,
  },
  emptyWrap: {
    paddingHorizontal: spacing.xl,
  },
  testCard: {
    marginHorizontal: spacing.xl,
    marginBottom: spacing.md,
    gap: spacing.md,
  },
  badgeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  title: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '800',
  },
  description: {
    color: colors.textMuted,
    fontSize: 14,
    lineHeight: 20,
  },
  meta: {
    color: colors.textMuted,
    fontSize: 12,
    lineHeight: 18,
  },
  actionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    minWidth: 0,
  },
  editPanel: {
    marginTop: spacing.sm,
    paddingTop: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    gap: spacing.md,
  },
  twoColumnRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
  },
  flexItem: {
    flex: 1,
    minWidth: 140,
  },
  sectionLabel: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  choiceRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  choiceChip: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceMuted,
  },
  choiceChipActive: {
    backgroundColor: colors.primary,
  },
  choiceText: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'capitalize',
  },
  choiceTextActive: {
    color: colors.white,
  },
  inputAccessory: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  previewText: {
    color: colors.accent,
    fontSize: 12,
    fontWeight: '700',
  },
  pickerField: {
    minHeight: 56,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceRaised,
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },
  pickerValue: {
    color: colors.text,
    fontSize: 15,
  },
  secondaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    backgroundColor: colors.surfaceMuted,
    minWidth: 112,
  },
  secondaryButtonText: {
    color: colors.primary,
    fontSize: 13,
    fontWeight: '800',
  },
  statusButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    minWidth: 128,
  },
  startButton: {
    backgroundColor: colors.primary,
  },
  statusButtonText: {
    color: colors.white,
    fontSize: 13,
    fontWeight: '800',
  },
  deleteButton: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.dangerSoft,
    borderWidth: 1,
    borderColor: colors.danger,
  },
  saveButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    minWidth: 148,
  },
  saveButtonText: {
    color: colors.white,
    fontSize: 13,
    fontWeight: '800',
  },
  footerSpace: {
    height: spacing.md,
  },
});
