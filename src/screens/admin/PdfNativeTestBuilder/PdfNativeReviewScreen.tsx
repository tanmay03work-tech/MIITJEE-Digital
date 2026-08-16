import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { CheckCircle, ChevronLeft, ChevronRight, MinusCircle, XCircle, FileText, Check, X, Minus } from 'lucide-react-native';
import { PDFDocumentProxy } from 'pdfjs-dist';

import { AppHeader } from '../../../components/common/AppHeader';
import { Card } from '../../../components/common/Card';
import { Screen } from '../../../components/common/Screen';
import { fetchPdfNativeReview } from '../../../services/pdf-native/pdfNativeReviewService';
import { extractPdfPagesMetadata } from '../../../services/pdf-native/pdfNativeParser';
import { getPdfDocument } from '../../../services/pdf-native/pdfDocumentCache';
import { PdfNativeReviewPayload, PdfNativeReviewQuestion, QuestionSubmissionStatus } from '../../../services/pdf-native/pdfNativeTypes';
import { PdfNativePreview } from './PdfNativePreview';
import { colors, spacing } from '../../../theme';
import { RootStackScreenProps } from '../../../navigation/types';

export function PdfNativeReviewScreen({ route, navigation }: RootStackScreenProps<'PdfNativeReview'>) {
  const { attemptId } = route.params;
  const [reviewPayload, setReviewPayload] = useState<PdfNativeReviewPayload | null>(null);
  const [pdfDoc, setPdfDoc] = useState<PDFDocumentProxy | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const [statusFilter, setStatusFilter] = useState<'ALL' | QuestionSubmissionStatus>('ALL');
  const [subjectFilter, setSubjectFilter] = useState<string>('ALL');
  const [selectedIndex, setSelectedIndex] = useState<number>(0);

  useEffect(() => {
    let isMounted = true;
    setIsLoading(true);

    fetchPdfNativeReview(attemptId)
      .then(async (data) => {
        if (!isMounted) return;
        setReviewPayload(data);

        // Load PDF document for crisp region crops
        const firstQ = data.questions[0];
        if (firstQ) {
          try {
            const doc = await getPdfDocument({
              pdfId: firstQ.pdf_id,
              pdfUrl: firstQ.pdf_url,
            });
            if (isMounted) setPdfDoc(doc);
          } catch {
            // PDF load error fallback handled by PdfNativePreview
          }
        }
        if (isMounted) setIsLoading(false);
      })
      .catch((err) => {
        if (isMounted) {
          setError(err instanceof Error ? err.message : 'Failed to load question review');
          setIsLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [attemptId]);

  // Derived filter calculations
  const statusCounts = useMemo(() => {
    if (!reviewPayload) return { ALL: 0, CORRECT: 0, WRONG: 0, UNATTEMPTED: 0 };
    const qs = reviewPayload.questions;
    return {
      ALL: qs.length,
      CORRECT: qs.filter((q) => q.status === 'CORRECT').length,
      WRONG: qs.filter((q) => q.status === 'WRONG').length,
      UNATTEMPTED: qs.filter((q) => q.status === 'UNATTEMPTED').length,
    };
  }, [reviewPayload]);

  const availableSubjects = useMemo(() => {
    if (!reviewPayload) return ['ALL'];
    const subs = Array.from(new Set(reviewPayload.questions.map((q) => q.subject))).filter(Boolean);
    return ['ALL', ...subs];
  }, [reviewPayload]);

  const filteredQuestions = useMemo(() => {
    if (!reviewPayload) return [];
    return reviewPayload.questions.filter((q) => {
      const matchStatus = statusFilter === 'ALL' || q.status === statusFilter;
      const matchSubject = subjectFilter === 'ALL' || q.subject === subjectFilter;
      return matchStatus && matchSubject;
    });
  }, [reviewPayload, statusFilter, subjectFilter]);

  // Safely clamp selected index when filter changes
  useEffect(() => {
    setSelectedIndex(0);
  }, [statusFilter, subjectFilter]);

  if (isLoading) {
    return (
      <Screen contentContainerStyle={styles.centerContainer}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.loadingText}>Loading question-wise answer review...</Text>
      </Screen>
    );
  }

  if (error || !reviewPayload) {
    return (
      <Screen contentContainerStyle={styles.centerContainer}>
        <Text style={styles.errorText}>Error: {error || 'Review dataset not found'}</Text>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <Text style={styles.backBtnText}>Go Back</Text>
        </TouchableOpacity>
      </Screen>
    );
  }

  const currentQuestion: PdfNativeReviewQuestion | undefined = filteredQuestions[selectedIndex];

  return (
    <Screen useScrollView={false}>
      <AppHeader
        title="PDF-Native Answer Review"
        subtitle={`Student: ${reviewPayload.student_name}`}
        showLogo={false}
        showBack={true}
        onBack={() => navigation.goBack()}
      />

      <View style={styles.mainContainer}>
        {/* Status Filter Pill Row */}
        <View style={styles.filterRow}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterScroll}>
            {(['ALL', 'CORRECT', 'WRONG', 'UNATTEMPTED'] as const).map((st) => {
              const isSelected = statusFilter === st;
              const count = statusCounts[st];
              return (
                <TouchableOpacity
                  key={st}
                  style={[styles.filterPill, isSelected && styles.filterPillSelected]}
                  onPress={() => setStatusFilter(st)}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.filterPillText, isSelected && styles.filterPillTextSelected]}>
                    {st === 'ALL' ? 'All' : st} ({count})
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>

        {/* Multi-Subject Filter Pill Row (if multi-subject test) */}
        {!reviewPayload.is_single_subject && availableSubjects.length > 2 ? (
          <View style={styles.subjectFilterRow}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterScroll}>
              {availableSubjects.map((sub) => {
                const isSelected = subjectFilter === sub;
                return (
                  <TouchableOpacity
                    key={sub}
                    style={[styles.subPill, isSelected && styles.subPillSelected]}
                    onPress={() => setSubjectFilter(sub)}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.subPillText, isSelected && styles.subPillTextSelected]}>
                      {sub}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        ) : null}

        {/* Master Question Jump List Carousel */}
        <View style={styles.jumpRow}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.jumpScroll}>
            {filteredQuestions.map((q, idx) => {
              const isSelected = idx === selectedIndex;
              const statusColor =
                q.status === 'CORRECT' ? '#15803D' : q.status === 'WRONG' ? '#B91C1C' : '#475569';
              const statusBg =
                q.status === 'CORRECT' ? '#DCFCE7' : q.status === 'WRONG' ? '#FEE2E2' : '#F1F5F9';

              return (
                <TouchableOpacity
                  key={q.question_id}
                  style={[
                    styles.jumpItem,
                    { backgroundColor: statusBg, borderColor: isSelected ? colors.primary : statusColor },
                    isSelected && styles.jumpItemSelected,
                  ]}
                  onPress={() => setSelectedIndex(idx)}
                >
                  <Text style={[styles.jumpText, { color: statusColor }]}>Q{q.question_number}</Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>

        {/* Main Question Review Detail Area */}
        {currentQuestion ? (
          <ScrollView contentContainerStyle={styles.detailScroll} showsVerticalScrollIndicator={true}>
            <Card style={styles.questionCard}>
              {/* Question Header Metadata */}
              <View style={styles.cardHeader}>
                <View style={styles.headerLeft}>
                  <Text style={styles.qNumText}>Question {currentQuestion.question_number}</Text>
                  <View style={styles.subBadge}>
                    <Text style={styles.subBadgeText}>{currentQuestion.subject}</Text>
                  </View>
                </View>

                {/* Status Badge */}
                <View style={styles.headerRight}>
                  <View
                    style={[
                      styles.statusBadge,
                      currentQuestion.status === 'CORRECT' && { backgroundColor: '#DCFCE7' },
                      currentQuestion.status === 'WRONG' && { backgroundColor: '#FEE2E2' },
                      currentQuestion.status === 'UNATTEMPTED' && { backgroundColor: '#F1F5F9' },
                    ]}
                  >
                    {currentQuestion.status === 'CORRECT' && <CheckCircle size={14} color="#15803D" />}
                    {currentQuestion.status === 'WRONG' && <XCircle size={14} color="#B91C1C" />}
                    {currentQuestion.status === 'UNATTEMPTED' && <MinusCircle size={14} color="#475569" />}
                    <Text
                      style={[
                        styles.statusBadgeText,
                        currentQuestion.status === 'CORRECT' && { color: '#15803D' },
                        currentQuestion.status === 'WRONG' && { color: '#B91C1C' },
                        currentQuestion.status === 'UNATTEMPTED' && { color: '#475569' },
                      ]}
                    >
                      {currentQuestion.status}
                    </Text>
                  </View>
                  <Text style={styles.marksText}>
                    {currentQuestion.awarded_marks >= 0 ? `+${currentQuestion.awarded_marks}` : currentQuestion.awarded_marks} Marks
                  </Text>
                </View>
              </View>

              {/* Original PDF Question Region Crop */}
              <View style={styles.pdfCropContainer}>
                <PdfNativePreview
                  pdfDoc={pdfDoc}
                  question={{
                    id: currentQuestion.question_id,
                    pdf_id: currentQuestion.pdf_id,
                    question_number: currentQuestion.question_number,
                    page_start: currentQuestion.page_start,
                    page_end: currentQuestion.page_end,
                    bbox: currentQuestion.bbox,
                    subject: currentQuestion.subject as any,
                    question_type: 'MCQ',
                    correct_answer: currentQuestion.correct_answer,
                    marks: 4,
                    negative_marks: 1,
                    review_status: 'APPROVED',
                  }}
                />
              </View>

              {/* Authoritative Answer & Marks Response Banner */}
              <View style={styles.responseCard}>
                <View style={styles.responseGrid}>
                  <View style={styles.responseCol}>
                    <Text style={styles.responseLabel}>Your Answer</Text>
                    <Text style={[styles.responseVal, !currentQuestion.selected_answer && { color: colors.textMuted }]}>
                      {currentQuestion.selected_answer || 'Not Attempted'}
                    </Text>
                  </View>

                  <View style={styles.responseCol}>
                    <Text style={styles.responseLabel}>Correct Answer</Text>
                    <Text style={[styles.responseVal, { color: '#15803D' }]}>
                      {currentQuestion.correct_answer || 'Correct answer is unavailable.'}
                    </Text>
                  </View>

                  <View style={styles.responseCol}>
                    <Text style={styles.responseLabel}>Marks Awarded</Text>
                    <Text
                      style={[
                        styles.responseVal,
                        currentQuestion.awarded_marks > 0 && { color: '#15803D' },
                        currentQuestion.awarded_marks < 0 && { color: '#B91C1C' },
                      ]}
                    >
                      {currentQuestion.awarded_marks >= 0 ? `+${currentQuestion.awarded_marks}` : currentQuestion.awarded_marks}
                    </Text>
                  </View>
                </View>
              </View>
            </Card>

            {/* Previous / Next Navigation Bar */}
            <View style={styles.navBar}>
              <TouchableOpacity
                style={[styles.navBtn, selectedIndex === 0 && styles.navBtnDisabled]}
                disabled={selectedIndex === 0}
                onPress={() => setSelectedIndex((i) => Math.max(0, i - 1))}
              >
                <ChevronLeft size={18} color={selectedIndex === 0 ? colors.textSubtle : colors.text} />
                <Text style={[styles.navBtnText, selectedIndex === 0 && styles.navBtnTextDisabled]}>Previous</Text>
              </TouchableOpacity>

              <Text style={styles.navCounter}>
                Question {selectedIndex + 1} of {filteredQuestions.length}
              </Text>

              <TouchableOpacity
                style={[styles.navBtn, selectedIndex === filteredQuestions.length - 1 && styles.navBtnDisabled]}
                disabled={selectedIndex === filteredQuestions.length - 1}
                onPress={() => setSelectedIndex((i) => Math.min(filteredQuestions.length - 1, i + 1))}
              >
                <Text style={[styles.navBtnText, selectedIndex === filteredQuestions.length - 1 && styles.navBtnTextDisabled]}>Next</Text>
                <ChevronRight size={18} color={selectedIndex === filteredQuestions.length - 1 ? colors.textSubtle : colors.text} />
              </TouchableOpacity>
            </View>
          </ScrollView>
        ) : (
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>No questions match the selected filter.</Text>
          </View>
        )}
      </View>
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
  mainContainer: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  filterRow: {
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderColor: '#E2E8F0',
    paddingVertical: spacing.xs,
  },
  subjectFilterRow: {
    backgroundColor: '#F1F5F9',
    borderBottomWidth: 1,
    borderColor: '#CBD5E1',
    paddingVertical: 4,
  },
  filterScroll: {
    paddingHorizontal: spacing.md,
    gap: spacing.xs,
  },
  filterPill: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: '#F1F5F9',
  },
  filterPillSelected: {
    backgroundColor: colors.primary,
  },
  filterPillText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textMuted,
  },
  filterPillTextSelected: {
    color: '#FFFFFF',
  },
  subPill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
  },
  subPillSelected: {
    backgroundColor: '#1E293B',
  },
  subPillText: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.textMuted,
  },
  subPillTextSelected: {
    color: '#FFFFFF',
  },
  jumpRow: {
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderColor: '#E2E8F0',
    paddingVertical: spacing.xs,
  },
  jumpScroll: {
    paddingHorizontal: spacing.md,
    gap: 6,
  },
  jumpItem: {
    width: 44,
    height: 36,
    borderRadius: 8,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  jumpItemSelected: {
    borderWidth: 3,
  },
  jumpText: {
    fontSize: 12,
    fontWeight: '800',
  },
  detailScroll: {
    padding: spacing.md,
    gap: spacing.md,
  },
  questionCard: {
    padding: spacing.md,
    gap: spacing.md,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  qNumText: {
    fontSize: 18,
    fontWeight: '900',
    color: colors.text,
  },
  subBadge: {
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  subBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.textMuted,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  statusBadgeText: {
    fontSize: 12,
    fontWeight: '800',
  },
  marksText: {
    fontSize: 13,
    fontWeight: '800',
    color: colors.text,
  },
  pdfCropContainer: {
    minHeight: 240,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: '#FFFFFF',
  },
  responseCard: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 8,
    padding: spacing.md,
  },
  responseGrid: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  responseCol: {
    flex: 1,
    alignItems: 'center',
    gap: 2,
  },
  responseLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.textMuted,
    textTransform: 'uppercase',
  },
  responseVal: {
    fontSize: 16,
    fontWeight: '800',
    color: colors.text,
  },
  navBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFFFFF',
    padding: spacing.md,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  navBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 6,
    backgroundColor: '#F1F5F9',
  },
  navBtnDisabled: {
    opacity: 0.4,
  },
  navBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.text,
  },
  navBtnTextDisabled: {
    color: colors.textSubtle,
  },
  navCounter: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.textMuted,
  },
  emptyContainer: {
    padding: spacing.xl,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 14,
    color: colors.textMuted,
  },
});
