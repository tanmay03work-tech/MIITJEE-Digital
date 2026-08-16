import React, { memo, useMemo, useState } from 'react';
import {
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Monitor, Smartphone, X, Eye } from 'lucide-react-native';
import * as pdfjsLib from 'pdfjs-dist';
import { NativeQuestionStructure } from '../../services/pdf-native/nativeQuestionTypes';
import { PdfNativeQuestion } from '../../services/pdf-native/pdfNativeTypes';
import { NativeQuestionRenderer } from './NativeQuestionRenderer';
import { PdfNativePreview } from '../../screens/admin/PdfNativeTestBuilder/PdfNativePreview';
import { colors, radius, spacing } from '../../theme';

interface NativeQuestionPreviewModalProps {
  visible: boolean;
  onClose: () => void;
  structure: NativeQuestionStructure;
  rawQuestion?: PdfNativeQuestion;
  pdfDoc?: pdfjsLib.PDFDocumentProxy | null;
}

type ViewportMode = 'desktop' | 'mobile_320' | 'mobile_390' | 'mobile_430';

function NativeQuestionPreviewModalComponent({
  visible,
  onClose,
  structure,
  rawQuestion,
  pdfDoc,
}: NativeQuestionPreviewModalProps) {
  const [viewportMode, setViewportMode] = useState<ViewportMode>('desktop');
  const [activeTab, setActiveTab] = useState<'native' | 'pdf_original'>('native');
  const [simulatedAnswer, setSimulatedAnswer] = useState<string | null>(null);

  const containerWidth = useMemo(() => {
    switch (viewportMode) {
      case 'mobile_320':
        return 320;
      case 'mobile_390':
        return 390;
      case 'mobile_430':
        return 430;
      case 'desktop':
      default:
        return '100%';
    }
  }, [viewportMode]);

  if (!visible) return null;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <View style={styles.modalCard}>
          {/* Header */}
          <View style={styles.modalHeader}>
            <View style={styles.headerLeft}>
              <Text style={styles.modalTitle}>
                Question {structure.questionNumber} Preview
              </Text>
              <Text style={styles.modalSubtitle}>
                {structure.subject} • {structure.questionType} • {structure.status}
              </Text>
            </View>

            {/* Viewport Selector */}
            <View style={styles.viewportControls}>
              <TouchableOpacity
                style={[
                  styles.controlBtn,
                  viewportMode === 'desktop' && styles.controlBtnActive,
                ]}
                onPress={() => setViewportMode('desktop')}
              >
                <Monitor size={14} color={viewportMode === 'desktop' ? colors.primary : colors.textMuted} />
                <Text
                  style={[
                    styles.controlBtnText,
                    viewportMode === 'desktop' && styles.controlBtnTextActive,
                  ]}
                >
                  Desktop
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.controlBtn,
                  viewportMode === 'mobile_390' && styles.controlBtnActive,
                ]}
                onPress={() => setViewportMode('mobile_390')}
              >
                <Smartphone size={14} color={viewportMode === 'mobile_390' ? colors.primary : colors.textMuted} />
                <Text
                  style={[
                    styles.controlBtnText,
                    viewportMode === 'mobile_390' && styles.controlBtnTextActive,
                  ]}
                >
                  390px
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.controlBtn,
                  viewportMode === 'mobile_320' && styles.controlBtnActive,
                ]}
                onPress={() => setViewportMode('mobile_320')}
              >
                <Smartphone size={14} color={viewportMode === 'mobile_320' ? colors.primary : colors.textMuted} />
                <Text
                  style={[
                    styles.controlBtnText,
                    viewportMode === 'mobile_320' && styles.controlBtnTextActive,
                  ]}
                >
                  320px
                </Text>
              </TouchableOpacity>
            </View>

            {/* Close Button */}
            <TouchableOpacity style={styles.closeBtn} onPress={onClose}>
              <X size={18} color={colors.text} />
            </TouchableOpacity>
          </View>

          {/* Mode Switcher Tabs */}
          <View style={styles.tabStrip}>
            <TouchableOpacity
              style={[styles.tabBtn, activeTab === 'native' && styles.tabBtnActive]}
              onPress={() => setActiveTab('native')}
            >
              <Text style={[styles.tabText, activeTab === 'native' && styles.tabTextActive]}>
                ✨ Native Structured CBT Question
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.tabBtn, activeTab === 'pdf_original' && styles.tabBtnActive]}
              onPress={() => setActiveTab('pdf_original')}
            >
              <Eye size={14} color={activeTab === 'pdf_original' ? colors.primary : colors.textMuted} />
              <Text style={[styles.tabText, activeTab === 'pdf_original' && styles.tabTextActive]}>
                Original PDF Region
              </Text>
            </TouchableOpacity>
          </View>

          {/* Preview Viewport Container */}
          <ScrollView style={styles.scrollArea} contentContainerStyle={styles.scrollContent}>
            <View style={[styles.previewFrame, { width: containerWidth, maxWidth: '100%' }]}>
              {activeTab === 'native' ? (
                <NativeQuestionRenderer
                  structure={structure}
                  selectedAnswer={simulatedAnswer}
                  onSelectOption={(opt) =>
                    setSimulatedAnswer((prev) => (prev === opt ? null : opt))
                  }
                  onClearResponse={() => setSimulatedAnswer(null)}
                  onIntegerChange={(val) => setSimulatedAnswer(val)}
                  pdfDoc={pdfDoc ?? null}
                  showAdminBadge={true}
                />
              ) : rawQuestion ? (
                <View style={styles.originalPdfContainer}>
                  <PdfNativePreview pdfDoc={pdfDoc ?? null} question={rawQuestion} />
                </View>
              ) : (
                <Text style={styles.emptyText}>Original PDF question unavailable</Text>
              )}
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

export const NativeQuestionPreviewModal = memo(NativeQuestionPreviewModalComponent);

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.md,
  },
  modalCard: {
    width: '100%',
    maxWidth: 960,
    height: '90%',
    backgroundColor: '#FFFFFF',
    borderRadius: radius.xl,
    overflow: 'hidden',
    shadowColor: '#000000',
    shadowOpacity: 0.2,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 10 },
    elevation: 10,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
    gap: spacing.md,
  },
  headerLeft: {
    flex: 1,
  },
  modalTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '800',
  },
  modalSubtitle: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '600',
  },
  viewportControls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: '#F1F5F9',
    padding: 3,
    borderRadius: radius.md,
  },
  controlBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: radius.sm,
  },
  controlBtnActive: {
    backgroundColor: '#FFFFFF',
    shadowColor: '#000000',
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  controlBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.textMuted,
  },
  controlBtnTextActive: {
    color: colors.primary,
  },
  closeBtn: {
    padding: 6,
    borderRadius: radius.pill,
    backgroundColor: '#F1F5F9',
  },
  tabStrip: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
    backgroundColor: '#F8FAFC',
    paddingHorizontal: spacing.lg,
    gap: spacing.md,
  },
  tabBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 12,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabBtnActive: {
    borderBottomColor: colors.primary,
  },
  tabText: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.textMuted,
  },
  tabTextActive: {
    color: colors.primary,
  },
  scrollArea: {
    flex: 1,
    backgroundColor: '#F1F5F9',
  },
  scrollContent: {
    alignItems: 'center',
    paddingVertical: spacing.xl,
    paddingHorizontal: spacing.md,
  },
  previewFrame: {
    backgroundColor: '#FFFFFF',
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    padding: spacing.lg,
    shadowColor: '#000000',
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
  },
  originalPdfContainer: {
    width: '100%',
    minHeight: 280,
  },
  emptyText: {
    color: colors.textMuted,
    textAlign: 'center',
    padding: spacing.xl,
  },
});
