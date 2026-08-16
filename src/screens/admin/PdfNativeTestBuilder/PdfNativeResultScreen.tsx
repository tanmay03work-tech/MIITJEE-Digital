import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Award, Download, CheckCircle, XCircle, MinusCircle, User, FileText } from 'lucide-react-native';

import { AppHeader } from '../../../components/common/AppHeader';
import { Card } from '../../../components/common/Card';
import { Screen } from '../../../components/common/Screen';
import { fetchPdfNativeResult } from '../../../services/pdf-native/pdfNativeResultService';
import { downloadPdfNativeExcel } from '../../../services/pdf-native/pdfNativeExporter';
import { PdfNativeResultPayload } from '../../../services/pdf-native/pdfNativeTypes';
import { colors, spacing } from '../../../theme';
import { RootStackScreenProps } from '../../../navigation/types';

export function PdfNativeResultScreen({ route, navigation }: RootStackScreenProps<'PdfNativeResult'>) {
  const { attemptId } = route.params;
  const [result, setResult] = useState<PdfNativeResultPayload | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    setIsLoading(true);

    fetchPdfNativeResult(attemptId)
      .then((data) => {
        if (isMounted) {
          setResult(data);
          setIsLoading(false);
        }
      })
      .catch((err) => {
        if (isMounted) {
          setError(err instanceof Error ? err.message : 'Failed to load test result');
          setIsLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [attemptId]);

  const handleExport = () => {
    if (!result) return;
    try {
      downloadPdfNativeExcel(result);
      Alert.alert('Excel Exported', 'The result CSV file has been generated and downloaded.');
    } catch (err) {
      Alert.alert('Export Error', err instanceof Error ? err.message : 'Unable to generate Excel export.');
    }
  };

  if (isLoading) {
    return (
      <Screen contentContainerStyle={styles.centerContainer}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.loadingText}>Fetching authoritative PDF-Native result...</Text>
      </Screen>
    );
  }

  if (error || !result) {
    return (
      <Screen contentContainerStyle={styles.centerContainer}>
        <Text style={styles.errorText}>Error: {error || 'Result not found'}</Text>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <Text style={styles.backBtnText}>Go Back</Text>
        </TouchableOpacity>
      </Screen>
    );
  }

  return (
    <Screen useScrollView={false}>
      <AppHeader
        title="PDF-Native Test Result"
        subtitle={`Student: ${result.student_name}`}
        showLogo={false}
        showBack={true}
        onBack={() => navigation.goBack()}
        rightSlot={
          <TouchableOpacity style={styles.exportHeaderBtn} onPress={handleExport}>
            <Download size={16} color="#FFFFFF" />
            <Text style={styles.exportHeaderBtnText}>Export Excel</Text>
          </TouchableOpacity>
        }
      />

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={true}>
        {/* Header Overview Card */}
        <Card style={styles.overviewCard}>
          <View style={styles.metaRow}>
            <View style={styles.userBox}>
              <User size={18} color={colors.primary} />
              <Text style={styles.userName}>{result.student_name}</Text>
            </View>
            <View style={styles.testBox}>
              <FileText size={16} color={colors.textMuted} />
              <Text style={styles.testTitle}>{result.test_title}</Text>
            </View>
          </View>

          {/* Overall Score Header */}
          <View style={styles.scoreBanner}>
            <View style={styles.scoreGroup}>
              <Text style={styles.scoreVal}>{result.total.score}</Text>
              <Text style={styles.scoreMax}> / {result.total.max_marks} Marks</Text>
            </View>
            <View style={styles.percentageBadge}>
              <Text style={styles.percentageText}>{result.total.percentage}% Score</Text>
            </View>
          </View>

          {/* Percentile Status Banner */}
          <View style={styles.percentileBanner}>
            <Award size={16} color="#B45309" />
            <Text style={styles.percentileText}>
              {result.percentile !== null
                ? `Rank Percentile: ${result.percentile}%`
                : result.percentile_message || 'Percentile will be available after the comparison population is established.'}
            </Text>
          </View>
        </Card>

        {/* Subject Breakdowns */}
        {result.subjects.map((sub) => (
          <Card key={sub.subject} style={styles.subjectCard}>
            <Text style={styles.subjectTitle}>{sub.subject.toUpperCase()}</Text>

            <View style={styles.metricsGrid}>
              <View style={[styles.metricBox, { backgroundColor: '#DCFCE7' }]}>
                <CheckCircle size={16} color="#15803D" />
                <Text style={[styles.metricVal, { color: '#15803D' }]}>{sub.correct_count}</Text>
                <Text style={styles.metricLabel}>Correct (+4)</Text>
              </View>

              <View style={[styles.metricBox, { backgroundColor: '#FEE2E2' }]}>
                <XCircle size={16} color="#B91C1C" />
                <Text style={[styles.metricVal, { color: '#B91C1C' }]}>{sub.wrong_count}</Text>
                <Text style={styles.metricLabel}>Wrong (-1)</Text>
              </View>

              <View style={[styles.metricBox, { backgroundColor: '#F1F5F9' }]}>
                <MinusCircle size={16} color="#475569" />
                <Text style={[styles.metricVal, { color: '#475569' }]}>{sub.unattempted_count}</Text>
                <Text style={styles.metricLabel}>Unattempted (0)</Text>
              </View>

              <View style={[styles.metricBox, { backgroundColor: colors.primarySoft || '#EFF6FF' }]}>
                <Text style={[styles.metricVal, { color: colors.primaryDeep || colors.primary }]}>
                  {sub.score} / {sub.max_marks}
                </Text>
                <Text style={styles.metricLabel}>Subject Score</Text>
              </View>
            </View>
          </Card>
        ))}

        {/* Total Summary Card (For Multi-Subject Tests) */}
        {!result.is_single_subject ? (
          <Card style={styles.totalSummaryCard}>
            <Text style={styles.subjectTitle}>TOTAL OVERALL</Text>
            <View style={styles.metricsGrid}>
              <View style={styles.summaryCol}>
                <Text style={styles.summaryLabel}>Correct:</Text>
                <Text style={styles.summaryVal}>{result.total.correct_count}</Text>
              </View>
              <View style={styles.summaryCol}>
                <Text style={styles.summaryLabel}>Wrong:</Text>
                <Text style={styles.summaryVal}>{result.total.wrong_count}</Text>
              </View>
              <View style={styles.summaryCol}>
                <Text style={styles.summaryLabel}>Unattempted:</Text>
                <Text style={styles.summaryVal}>{result.total.unattempted_count}</Text>
              </View>
              <View style={styles.summaryCol}>
                <Text style={styles.summaryLabel}>Attempted:</Text>
                <Text style={styles.summaryVal}>{result.total.attempted_count}</Text>
              </View>
            </View>
          </Card>
        ) : null}

        {/* Action Buttons */}
        <View style={styles.actionBtnRow}>
          <TouchableOpacity
            style={styles.reviewFullBtn}
            onPress={() => navigation.navigate('PdfNativeReview', { attemptId: result.attempt_id, testId: result.test_id })}
          >
            <FileText size={18} color="#FFFFFF" />
            <Text style={styles.actionBtnText}>Review Answers</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.exportFullBtn} onPress={handleExport}>
            <Download size={18} color="#FFFFFF" />
            <Text style={styles.actionBtnText}>Download Excel (CSV)</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  centerContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
    gap: spacing.md,
  },
  loadingText: {
    fontSize: 14,
    color: colors.textMuted,
  },
  errorText: {
    fontSize: 14,
    color: '#B91C1C',
    fontWeight: '700',
  },
  backBtn: {
    backgroundColor: colors.primary,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  backBtnText: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  exportHeaderBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#15803D',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  exportHeaderBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
  scrollContent: {
    padding: spacing.md,
    gap: spacing.md,
  },
  overviewCard: {
    padding: spacing.md,
    gap: spacing.md,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  userBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  userName: {
    fontSize: 16,
    fontWeight: '800',
    color: colors.text,
  },
  testBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  testTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textMuted,
  },
  scoreBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.primarySoft || '#EFF6FF',
    padding: spacing.md,
    borderRadius: 10,
  },
  scoreGroup: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  scoreVal: {
    fontSize: 28,
    fontWeight: '900',
    color: colors.primaryDeep || colors.primary,
  },
  scoreMax: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.textMuted,
  },
  percentageBadge: {
    backgroundColor: colors.primary,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  percentageText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '800',
  },
  percentileBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: '#FEF3C7',
    padding: spacing.sm,
    borderRadius: 8,
  },
  percentileText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#B45309',
  },
  subjectCard: {
    padding: spacing.md,
    gap: spacing.sm,
  },
  subjectTitle: {
    fontSize: 14,
    fontWeight: '900',
    color: colors.text,
    letterSpacing: 0.5,
  },
  metricsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  metricBox: {
    flex: 1,
    minWidth: 120,
    padding: spacing.sm,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  metricVal: {
    fontSize: 18,
    fontWeight: '800',
  },
  metricLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.textMuted,
  },
  totalSummaryCard: {
    padding: spacing.md,
    gap: spacing.sm,
    backgroundColor: '#F8FAFC',
  },
  summaryCol: {
    flex: 1,
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    padding: spacing.xs,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  summaryLabel: {
    fontSize: 11,
    color: colors.textMuted,
  },
  summaryVal: {
    fontSize: 15,
    fontWeight: '800',
    color: colors.text,
  },
  actionBtnRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  reviewFullBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: colors.primary,
    paddingVertical: 14,
    borderRadius: 10,
  },
  exportFullBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#15803D',
    paddingVertical: 14,
    borderRadius: 10,
  },
  actionBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
  },
});
