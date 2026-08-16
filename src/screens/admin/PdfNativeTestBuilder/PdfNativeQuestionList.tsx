import React from 'react';
import { FlatList, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { CheckCircle2, AlertTriangle, ChevronRight, CheckSquare, Square, XCircle, FileEdit } from 'lucide-react-native';
import { PdfNativeQuestion } from '../../../services/pdf-native/pdfNativeTypes';
import { colors, spacing } from '../../../theme';

interface PdfNativeQuestionListProps {
  questions: PdfNativeQuestion[];
  selectedQuestionId: string | null;
  batchSelectedIds: Set<string>;
  onSelectQuestion: (question: PdfNativeQuestion) => void;
  onToggleBatchSelect: (id: string) => void;
  onSelectAll: () => void;
  onClearAll: () => void;
}

export function PdfNativeQuestionList({
  questions,
  selectedQuestionId,
  batchSelectedIds,
  onSelectQuestion,
  onToggleBatchSelect,
  onSelectAll,
  onClearAll,
}: PdfNativeQuestionListProps) {
  if (questions.length === 0) {
    return (
      <View style={styles.emptyState}>
        <Text style={styles.emptyText}>No questions detected yet.</Text>
      </View>
    );
  }

  const allSelected = batchSelectedIds.size === questions.length && questions.length > 0;

  return (
    <View style={styles.container}>
      {/* Batch Select Controls */}
      <View style={styles.batchControlHeader}>
        <TouchableOpacity style={styles.batchBtn} onPress={allSelected ? onClearAll : onSelectAll}>
          {allSelected ? <CheckSquare size={16} color={colors.primary} /> : <Square size={16} color={colors.textMuted} />}
          <Text style={styles.batchBtnText}>{allSelected ? 'Clear All' : 'Select All'}</Text>
        </TouchableOpacity>
        <Text style={styles.selectedCountText}>
          Selected: {batchSelectedIds.size} / {questions.length}
        </Text>
      </View>

      <FlatList
        data={questions}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={true}
        renderItem={({ item }) => {
          const isSelected = item.id === selectedQuestionId;
          const isBatchChecked = batchSelectedIds.has(item.id);
          const status = item.review_status;

          return (
            <TouchableOpacity
              style={[styles.card, isSelected && styles.selectedCard]}
              onPress={() => onSelectQuestion(item)}
              activeOpacity={0.7}
            >
              <View style={styles.headerRow}>
                <TouchableOpacity
                  style={styles.checkboxTouch}
                  onPress={() => onToggleBatchSelect(item.id)}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                >
                  {isBatchChecked ? (
                    <CheckSquare size={18} color={colors.primary} />
                  ) : (
                    <Square size={18} color={colors.textMuted} />
                  )}
                </TouchableOpacity>

                <View style={styles.titleGroup}>
                  <Text style={[styles.questionTitle, isSelected && styles.selectedText]}>
                    Q{item.question_number}
                  </Text>
                  <Text style={styles.subtext}>
                    Page {item.page_start} • {item.subject || 'Physics'}
                  </Text>
                </View>

                {/* Status Badges */}
                <View style={[styles.badge, getBadgeStyle(status)]}>
                  {status === 'APPROVED' ? (
                    <>
                      <CheckCircle2 size={12} color="#15803D" />
                      <Text style={[styles.badgeText, { color: '#15803D' }]}>APPROVED</Text>
                    </>
                  ) : status === 'NEEDS_REVIEW' ? (
                    <>
                      <AlertTriangle size={12} color="#B45309" />
                      <Text style={[styles.badgeText, { color: '#B45309' }]}>NEEDS REVIEW</Text>
                    </>
                  ) : status === 'REJECTED' ? (
                    <>
                      <XCircle size={12} color="#B91C1C" />
                      <Text style={[styles.badgeText, { color: '#B91C1C' }]}>REJECTED</Text>
                    </>
                  ) : (
                    <>
                      <FileEdit size={12} color="#475569" />
                      <Text style={[styles.badgeText, { color: '#475569' }]}>DRAFT</Text>
                    </>
                  )}
                </View>
              </View>

              <View style={styles.metaRow}>
                <Text style={styles.ansText}>Ans: {item.correct_answer || 'None'}</Text>
                <Text style={styles.coordText}>
                  Marks: +{item.marks} / -{item.negative_marks}
                </Text>
              </View>

              {item.notes ? (
                <Text style={styles.notesText} numberOfLines={2}>
                  {item.notes}
                </Text>
              ) : null}

              <View style={styles.footerRow}>
                <Text style={styles.coordText}>
                  Box: [{item.bbox.x}, {item.bbox.y}, {item.bbox.width}x{item.bbox.height}]
                </Text>
                <ChevronRight size={16} color={isSelected ? colors.primary : colors.textMuted} />
              </View>
            </TouchableOpacity>
          );
        }}
      />
    </View>
  );
}

function getBadgeStyle(status: string) {
  switch (status) {
    case 'APPROVED':
      return { backgroundColor: '#DCFCE7' };
    case 'NEEDS_REVIEW':
      return { backgroundColor: '#FEF3C7' };
    case 'REJECTED':
      return { backgroundColor: '#FEE2E2' };
    default:
      return { backgroundColor: '#F1F5F9' };
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  batchControlHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: '#F8FAFC',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  batchBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  batchBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.text,
  },
  selectedCountText: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.textMuted,
  },
  listContent: {
    padding: spacing.md,
    gap: spacing.sm,
  },
  emptyState: {
    padding: spacing.xl,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: {
    color: colors.textMuted,
    fontSize: 14,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border || '#E2E8F0',
    gap: spacing.xs,
  },
  selectedCard: {
    borderColor: colors.primary,
    backgroundColor: colors.primarySoft || '#EFF6FF',
    borderWidth: 2,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  checkboxTouch: {
    paddingRight: 4,
  },
  titleGroup: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: spacing.xs,
  },
  questionTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: colors.text,
  },
  selectedText: {
    color: colors.primaryDeep || colors.primary,
  },
  subtext: {
    fontSize: 12,
    color: colors.textMuted,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '800',
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingLeft: 26,
  },
  ansText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.primaryDeep || colors.primary,
  },
  notesText: {
    fontSize: 11,
    color: '#D97706',
    fontStyle: 'italic',
    paddingLeft: 26,
  },
  footerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingLeft: 26,
    marginTop: 2,
  },
  coordText: {
    fontSize: 11,
    color: colors.textMuted,
    fontFamily: 'monospace',
  },
});
