import React from 'react';
import { Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { X, FileCheck2 } from 'lucide-react-native';
import * as pdfjsLib from 'pdfjs-dist';
import { PdfNativeQuestion } from '../../../services/pdf-native/pdfNativeTypes';
import { PdfNativePreview } from './PdfNativePreview';
import { colors, spacing } from '../../../theme';

interface PdfNativeTestPreviewModalProps {
  visible: boolean;
  testTitle: string;
  pdfDoc?: pdfjsLib.PDFDocumentProxy | null;
  questions: PdfNativeQuestion[];
  onClose: () => void;
}

export function PdfNativeTestPreviewModal({
  visible,
  testTitle,
  pdfDoc = null,
  questions,
  onClose,
}: PdfNativeTestPreviewModalProps) {
  return (
    <Modal visible={visible} animationType="slide" transparent={false} onRequestClose={onClose}>
      <View style={styles.container}>
        {/* Header Bar */}
        <View style={styles.header}>
          <View style={styles.headerTitleGroup}>
            <FileCheck2 size={20} color={colors.primary} />
            <Text style={styles.headerTitle}>Admin Test Preview: {testTitle || 'Untitled Test'}</Text>
          </View>
          <TouchableOpacity style={styles.closeBtn} onPress={onClose}>
            <X size={20} color={colors.text} />
          </TouchableOpacity>
        </View>

        <View style={styles.subBar}>
          <Text style={styles.subBarText}>
            Total Questions: {questions.length} • Rendered from Original PDF
          </Text>
        </View>

        {/* Scrollable Questions List */}
        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={true}>
          {questions.map((q, idx) => (
            <View key={q.id} style={styles.questionCard}>
              <View style={styles.questionCardHeader}>
                <Text style={styles.orderBadge}>Item #{idx + 1}</Text>
                <Text style={styles.qMetaText}>
                  Q{q.question_number} • Page {q.page_start} • {q.subject}
                </Text>
                <Text style={styles.ansTag}>Ans: {q.correct_answer || 'None'}</Text>
              </View>

              <View style={styles.previewWrap}>
                <PdfNativePreview pdfDoc={pdfDoc} question={q} />
              </View>
            </View>
          ))}
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  headerTitleGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: colors.text,
  },
  closeBtn: {
    padding: spacing.xs,
  },
  subBar: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    backgroundColor: colors.primarySoft || '#EFF6FF',
  },
  subBarText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.primaryDeep || colors.primary,
  },
  scrollContent: {
    padding: spacing.md,
    gap: spacing.lg,
  },
  questionCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border || '#E2E8F0',
    overflow: 'hidden',
    gap: spacing.sm,
    padding: spacing.md,
  },
  questionCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  orderBadge: {
    fontSize: 12,
    fontWeight: '800',
    color: '#FFFFFF',
    backgroundColor: colors.primary,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  qMetaText: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.text,
  },
  ansTag: {
    fontSize: 12,
    fontWeight: '800',
    color: '#15803D',
  },
  previewWrap: {
    minHeight: 280,
  },
});
