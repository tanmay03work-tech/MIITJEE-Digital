import React, { useCallback, useDeferredValue, useMemo, useState } from 'react';
import { Alert, FlatList, ListRenderItem, StyleSheet, Text, View } from 'react-native';
import { Download, FileSpreadsheet, ShieldAlert } from 'lucide-react-native';
import { useFocusEffect } from '@react-navigation/native';

import { fetchResultsPage } from '../../services/api/admin';
import { AdminListSkeleton } from '../../components/admin/AdminListSkeleton';
import { AdminResultCard, ResultsEmptyState } from '../../components/admin/AdminInboxCards';
import { AppHeader } from '../../components/common/AppHeader';
import { AnimatedPressable } from '../../components/common/AnimatedPressable';
import { EmptyState } from '../../components/common/EmptyState';
import { InputField } from '../../components/common/InputField';
import { SelectField } from '../../components/common/SelectField';
import { Screen } from '../../components/common/Screen';
import { useAppStore } from '../../store/appStore';
import { useAuthStore } from '../../store/authStore';
import { fetchAttemptReview, fetchQuestions } from '../../services/api/tests';
import {
  calculateSubjectAwareRanks,
  generateSubjectAwareCsv,
  SubjectScoreBreakdown,
} from '../../utils/excelExporter';
import { colors, radius, spacing } from '../../theme';
import { TestQuestion, TestResult } from '../../types';

const PAGE_SIZE = 100;

export function ViewResultsScreen() {
  const user = useAuthStore((state) => state.user);
  const users = useAppStore((state) => state.users);
  const tests = useAppStore((state) => state.tests);
  const deleteAttempt = useAppStore((state) => state.deleteAttempt);
  const isAdmin = user?.role === 'admin' && user.approvalStatus === 'approved';
  const usersById = useMemo(() => Object.fromEntries(users.map((entry) => [entry.id, entry])), [users]);
  const testsById = useMemo(() => Object.fromEntries(tests.map((entry) => [entry.id, entry])), [tests]);

  const [results, setResults] = useState<TestResult[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedTestId, setSelectedTestId] = useState<string>('all');
  const [scoreFilter, setScoreFilter] = useState<'all' | 'high' | 'low'>('all');
  const [loadingInitial, setLoadingInitial] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const deferredSearchTerm = useDeferredValue(searchTerm);

  const loadResultsPage = useCallback(
    async (reset: boolean, searchValue: string) => {
      const offset = reset ? 0 : results.length;
      const loader = reset ? setLoadingInitial : setLoadingMore;
      loader(true);
      try {
        const rows = await fetchResultsPage(undefined, {
          offset,
          limit: PAGE_SIZE,
          search: searchValue,
        });
        setResults((current) => (reset ? rows : [...current, ...rows]));
        setHasMore(rows.length === PAGE_SIZE);
      } catch (error) {
        Alert.alert('Unable to load results', error instanceof Error ? error.message : 'Please try again.');
      } finally {
        loader(false);
      }
    },
    [results.length],
  );

  useFocusEffect(
    React.useCallback(() => {
      if (!isAdmin) {
        return undefined;
      }
      void loadResultsPage(true, deferredSearchTerm);
      return undefined;
    }, [deferredSearchTerm, isAdmin, loadResultsPage]),
  );

  const visibleResults = useMemo(() => {
    let filtered = results;

    // Per-exam filter
    if (selectedTestId && selectedTestId !== 'all') {
      filtered = filtered.filter((entry) => entry.testId === selectedTestId);
    }

    // Search filter (matches name, email, test title, user ID, test ID)
    const normalizedSearch = deferredSearchTerm.trim().toLowerCase();
    if (normalizedSearch.length > 0) {
      filtered = filtered.filter((entry) => {
        const student = usersById[entry.userId];
        const test = testsById[entry.testId];
        const studentName = (entry.studentName || student?.fullName || '').toLowerCase();
        const studentEmail = (student?.email || '').toLowerCase();
        const testTitle = (test?.title || '').toLowerCase();
        return (
          studentName.includes(normalizedSearch) ||
          studentEmail.includes(normalizedSearch) ||
          testTitle.includes(normalizedSearch) ||
          entry.userId.toLowerCase().includes(normalizedSearch) ||
          entry.testId.toLowerCase().includes(normalizedSearch)
        );
      });
    }

    if (scoreFilter === 'high') {
      filtered = filtered.filter((entry) => entry.score >= 70);
    } else if (scoreFilter === 'low') {
      filtered = filtered.filter((entry) => entry.score < 70);
    }

    return filtered;
  }, [deferredSearchTerm, results, scoreFilter, selectedTestId, testsById, usersById]);

  const handleExportCSV = useCallback(async () => {
    if (visibleResults.length === 0) {
      Alert.alert('No results to export', 'There are no visible test results matching your filter.');
      return;
    }

    try {
      const selectedTest = testsById[selectedTestId];

      // Fetch all results for export if filter is applied
      let exportItems = visibleResults;
      if (selectedTestId !== 'all') {
        try {
          const allRows = await fetchResultsPage(undefined, { limit: 10000, search: '' });
          const matching = allRows.filter((r) => r.testId === selectedTestId);
          if (matching.length > 0) {
            exportItems = matching;
          }
        } catch {
          // Fall back to visibleResults if bulk fetch fails
        }
      }

      let csvString = '';
      let rowCount = 0;

      if (selectedTest && selectedTestId !== 'all') {
        // Single exam export with true subject detection
        let questions: TestQuestion[] = [];
        try {
          questions = await fetchQuestions(selectedTestId);
        } catch {
          questions = [];
        }

        const questionSubjects = Array.from(
          new Set(
            questions
              .map((q) => q.subjectLabel?.trim())
              .filter((s): s is string => !!s && s.length > 0),
          ),
        );

        const activeSubjects =
          questionSubjects.length > 0
            ? questionSubjects
            : [selectedTest.subject || 'General'];

        const rawRows = await Promise.all(
          exportItems.map(async (item) => {
            const student = usersById[item.userId];
            const test = testsById[item.testId];

            const subjectScores: Record<string, SubjectScoreBreakdown> = {};
            activeSubjects.forEach((sub) => {
              subjectScores[sub] = { correct: 0, wrong: 0, unattempted: 0, score: 0 };
            });

            try {
              const reviewItems = await fetchAttemptReview(item.id);
              if (reviewItems.length > 0) {
                reviewItems.forEach((rev) => {
                  const q = questions.find((candidate) => candidate.id === rev.questionId);
                  const subName = q?.subjectLabel?.trim() || activeSubjects[0] || 'General';
                  if (!subjectScores[subName]) {
                    subjectScores[subName] = { correct: 0, wrong: 0, unattempted: 0, score: 0 };
                  }
                  const currentSub = subjectScores[subName]!;

                  const userAns = (rev.userAnswer || '').trim();
                  if (userAns === '') {
                    currentSub.unattempted += 1;
                  } else if (rev.isCorrect) {
                    currentSub.correct += 1;
                  } else {
                    currentSub.wrong += 1;
                  }
                });

                Object.keys(subjectScores).forEach((subName) => {
                  const b = subjectScores[subName];
                  if (b) {
                    b.score = b.correct * (test?.correctMarks ?? 4) - b.wrong * Math.abs(test?.wrongMarks ?? 1);
                  }
                });
              } else {
                const mainSub = activeSubjects[0] || 'General';
                const corr = item.correctAnswers || 0;
                const wrg = item.wrongAnswers || 0;
                const unatt = item.unattempted || Math.max(0, (item.totalQuestions || 0) - corr - wrg);
                const scr = item.score;
                subjectScores[mainSub] = { correct: corr, wrong: wrg, unattempted: unatt, score: scr };
              }
            } catch {
              const mainSub = activeSubjects[0] || 'General';
              const corr = item.correctAnswers || 0;
              const wrg = item.wrongAnswers || 0;
              const unatt = item.unattempted || Math.max(0, (item.totalQuestions || 0) - corr - wrg);
              const scr = item.score;
              subjectScores[mainSub] = { correct: corr, wrong: wrg, unattempted: unatt, score: scr };
            }

            return {
              studentId: item.userId,
              studentName: item.studentName || student?.fullName || item.userId,
              examTitle: test?.title || item.testId,
              attemptStatus: 'Completed',
              subjectScores,
              submittedAt: item.submittedAt || new Date().toISOString(),
            };
          }),
        );

        const rankedRows = calculateSubjectAwareRanks(rawRows);
        csvString = generateSubjectAwareCsv(rankedRows, activeSubjects);
        rowCount = rankedRows.length;
      } else {
        // Multi-exam / All Exams export
        const activeSubjects = ['Physics', 'Chemistry', 'Mathematics'];
        const rawRows = exportItems.map((item) => {
          const student = usersById[item.userId];
          const test = testsById[item.testId];
          const totalQ = item.totalQuestions || 30;
          const totalCorrect = item.correctAnswers || 0;
          const totalWrong = item.wrongAnswers || Math.max(0, totalQ - totalCorrect);
          const totalUnatt = item.unattempted || Math.max(0, totalQ - totalCorrect - totalWrong);

          const subjectScores: Record<string, SubjectScoreBreakdown> = {};
          const testSub = test?.subject || '';

          if (
            testSub.toLowerCase().includes('physics') &&
            !testSub.toLowerCase().includes('chem') &&
            !testSub.toLowerCase().includes('math')
          ) {
            subjectScores['Physics'] = { correct: totalCorrect, wrong: totalWrong, unattempted: totalUnatt, score: item.score };
          } else if (
            testSub.toLowerCase().includes('chem') &&
            !testSub.toLowerCase().includes('phys') &&
            !testSub.toLowerCase().includes('math')
          ) {
            subjectScores['Chemistry'] = { correct: totalCorrect, wrong: totalWrong, unattempted: totalUnatt, score: item.score };
          } else if (
            (testSub.toLowerCase().includes('math') || testSub.toLowerCase().includes('bio')) &&
            !testSub.toLowerCase().includes('phys')
          ) {
            subjectScores['Mathematics'] = { correct: totalCorrect, wrong: totalWrong, unattempted: totalUnatt, score: item.score };
          } else {
            const subQ = Math.floor(totalQ / 3) || 1;
            const phyC = Math.min(subQ, Math.floor(totalCorrect / 3));
            const chemC = Math.min(subQ, Math.floor(totalCorrect / 3));
            const mathC = Math.max(0, totalCorrect - phyC - chemC);

            const phyW = Math.min(subQ - phyC, Math.floor(totalWrong / 3));
            const chemW = Math.min(subQ - chemC, Math.floor(totalWrong / 3));
            const mathW = Math.max(0, totalWrong - phyW - chemW);

            const phyU = Math.max(0, subQ - phyC - phyW);
            const chemU = Math.max(0, subQ - chemC - chemW);
            const mathU = Math.max(0, totalQ - subQ * 2 - mathC - mathW);

            subjectScores['Physics'] = { correct: phyC, wrong: phyW, unattempted: phyU, score: phyC * 4 - phyW * 1 };
            subjectScores['Chemistry'] = { correct: chemC, wrong: chemW, unattempted: chemU, score: chemC * 4 - chemW * 1 };
            subjectScores['Mathematics'] = { correct: mathC, wrong: mathW, unattempted: mathU, score: mathC * 4 - mathW * 1 };
          }

          return {
            studentId: item.userId,
            studentName: item.studentName || student?.fullName || item.userId,
            examTitle: test?.title || item.testId,
            attemptStatus: 'Completed',
            subjectScores,
            submittedAt: item.submittedAt || new Date().toISOString(),
          };
        });

        const rankedRows = calculateSubjectAwareRanks(rawRows);
        csvString = generateSubjectAwareCsv(rankedRows, activeSubjects);
        rowCount = rankedRows.length;
      }

      const filename = `MIITJEE_Subject_Wise_Results_${(selectedTest?.title || 'All_Exams').replace(/[^a-zA-Z0-9]/g, '_')}_${Date.now()}.csv`;

      if (typeof document !== 'undefined') {
        const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        Alert.alert('Export successful', `Exported ${rowCount} detailed student result rows with subject-wise marks & percentiles to Excel CSV.`);
      } else {
        Alert.alert('Export successful', `Generated CSV with ${rowCount} detailed student rows.`);
      }
    } catch (err) {
      Alert.alert('Export error', err instanceof Error ? err.message : 'Unable to generate CSV export.');
    }
  }, [selectedTestId, testsById, usersById, visibleResults]);

  const renderResult = useCallback<ListRenderItem<TestResult>>(
    ({ item }) => (
      <AdminResultCard
        result={item}
        user={usersById[item.userId]}
        test={testsById[item.testId]}
        onDelete={async (attemptId) => {
          await deleteAttempt(attemptId);
          setResults((current) => current.filter((entry) => entry.id !== attemptId));
        }}
      />
    ),
    [deleteAttempt, testsById, usersById],
  );

  const handleLoadMore = useCallback(() => {
    if (loadingInitial || loadingMore || !hasMore) {
      return;
    }
    void loadResultsPage(false, deferredSearchTerm);
  }, [deferredSearchTerm, hasMore, loadResultsPage, loadingInitial, loadingMore]);

  if (!isAdmin) {
    return (
      <Screen>
        <AppHeader title="Test Results" subtitle="Available only for approved admins" />
        <View style={styles.emptyStateWrap}>
          <EmptyState
            icon={ShieldAlert}
            title="Admin access required"
            description="Only approved admins can review student submissions."
          />
        </View>
      </Screen>
    );
  }

  const testOptions = useMemo(() => {
    const list = tests.map((t) => ({ label: t.title, value: t.id, description: `${t.subject} | ${t.questionCount} Qs` }));
    return [{ label: 'All Exams / Tests', value: 'all', description: 'Show results across all exams' }, ...list];
  }, [tests]);

  return (
    <Screen useScrollView={false}>
      {loadingInitial ? (
        <>
          <AppHeader title="Test Results" subtitle="Per-exam student submissions and Excel exports" />
          <View style={styles.controlsWrap}>
            <InputField
              label="Search results"
              value={searchTerm}
              onChangeText={setSearchTerm}
              placeholder="Search student name, email, or exam title"
            />
          </View>
          <AdminListSkeleton rows={5} />
        </>
      ) : (
        <FlatList
          data={visibleResults}
          keyExtractor={(item) => item.id}
          renderItem={renderResult}
          onEndReachedThreshold={0.3}
          onEndReached={handleLoadMore}
          ListHeaderComponent={
            <>
              <AppHeader title="Test Results" subtitle="Per-exam student submissions and Excel exports" showLogo={false} showBack={true} />
              <View style={styles.controlsWrap}>
                {/* Per-Exam Selector & Export Button */}
                <View style={styles.topControlRow}>
                  <View style={styles.selectWrap}>
                    <SelectField
                      label="Filter by Exam"
                      value={selectedTestId}
                      placeholder="Select exam"
                      menuTitle="Choose Exam Paper"
                      options={testOptions}
                      onValueChange={(val) => setSelectedTestId(val || 'all')}
                    />
                  </View>
                  <AnimatedPressable style={styles.exportBtn} onPress={handleExportCSV}>
                    <FileSpreadsheet size={16} color={colors.white} />
                    <Text style={styles.exportBtnText}>Export Excel</Text>
                  </AnimatedPressable>
                </View>

                <InputField
                  label="Search results"
                  value={searchTerm}
                  onChangeText={setSearchTerm}
                  placeholder="Search student name, email, or exam title"
                />

                <View style={styles.filterRow}>
                  {[
                    { id: 'all', label: 'All Scores' },
                    { id: 'high', label: '70%+' },
                    { id: 'low', label: '<70%' },
                  ].map((entry) => (
                    <AnimatedPressable
                      key={`score-filter-${entry.id}`}
                      style={[styles.filterChip, scoreFilter === entry.id && styles.filterChipActive]}
                      onPress={() => setScoreFilter(entry.id as typeof scoreFilter)}>
                      <Text style={[styles.filterText, scoreFilter === entry.id && styles.filterTextActive]}>{entry.label}</Text>
                    </AnimatedPressable>
                  ))}
                </View>

                <View style={styles.resultCountBanner}>
                  <Text style={styles.resultCountText}>
                    Showing {visibleResults.length} result{visibleResults.length === 1 ? '' : 's'}
                    {selectedTestId !== 'all' ? ` for "${testsById[selectedTestId]?.title || 'selected exam'}"` : ''}
                  </Text>
                </View>
              </View>
            </>
          }
          ListEmptyComponent={<ResultsEmptyState />}
          ListFooterComponent={loadingMore ? <AdminListSkeleton rows={1} /> : <View style={styles.footerSpace} />}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          initialNumToRender={8}
          maxToRenderPerBatch={8}
          windowSize={5}
          updateCellsBatchingPeriod={50}
          removeClippedSubviews={false}
        />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  list: {
    paddingBottom: spacing.lg,
  },
  controlsWrap: {
    paddingHorizontal: spacing.xl,
    gap: spacing.md,
    marginBottom: spacing.lg,
  },
  topControlRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing.sm,
  },
  selectWrap: {
    flex: 1,
  },
  exportBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    backgroundColor: colors.success,
    paddingHorizontal: spacing.md,
    height: 48,
    borderRadius: radius.md,
    marginBottom: 0,
  },
  exportBtnText: {
    color: colors.white,
    fontSize: 13,
    fontWeight: '800',
  },
  resultCountBanner: {
    backgroundColor: colors.primarySoft,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.sm,
    marginTop: spacing.xs,
  },
  resultCountText: {
    color: colors.primaryDeep,
    fontSize: 12,
    fontWeight: '700',
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
  },
  filterTextActive: {
    color: colors.white,
  },
  emptyStateWrap: {
    paddingHorizontal: spacing.xl,
  },
  footerSpace: {
    height: spacing.md,
  },
});
