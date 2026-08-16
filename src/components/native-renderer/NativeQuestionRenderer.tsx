import React, { memo } from 'react';
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import * as pdfjsLib from 'pdfjs-dist';
import { NativeQuestionStructure } from '../../services/pdf-native/nativeQuestionTypes';
import { NativeTextBlock } from './NativeTextBlock';
import { NativeFormulaBlock } from './NativeFormulaBlock';
import { NativeImageBlock } from './NativeImageBlock';
import { NativeOptionList } from './NativeOptionList';
import { colors, radius, spacing } from '../../theme';
import { AlertTriangle, CheckCircle2, X } from 'lucide-react-native';

interface NativeQuestionRendererProps {
  structure: NativeQuestionStructure;
  selectedAnswer: string | null;
  onSelectOption: (optionLabel: string) => void;
  onClearResponse?: () => void;
  onIntegerChange?: (value: string) => void;
  pdfDoc?: pdfjsLib.PDFDocumentProxy | null;
  showAdminBadge?: boolean;
}

function NativeQuestionRendererComponent({
  structure,
  selectedAnswer,
  onSelectOption,
  onClearResponse,
  onIntegerChange,
  pdfDoc,
  showAdminBadge = false,
}: NativeQuestionRendererProps) {
  const isNumerical =
    structure.questionType === 'Numerical' ||
    structure.questionType === 'INTEGER' ||
    (structure.questionType as string) === 'integer';

  return (
    <View style={styles.container}>
      {/* Admin / Review Status Header */}
      {showAdminBadge ? (
        <View style={styles.statusHeader}>
          {structure.status === 'NATIVE_READY' ? (
            <View style={styles.readyBadge}>
              <CheckCircle2 size={13} color="#15803D" />
              <Text style={styles.readyBadgeText}>NATIVE READY</Text>
            </View>
          ) : (
            <View style={styles.needsReviewBadge}>
              <AlertTriangle size={13} color="#D97706" />
              <Text style={styles.needsReviewBadgeText}>
                NEEDS REVIEW: {structure.reviewReason || 'Check question structure'}
              </Text>
            </View>
          )}
        </View>
      ) : null}

      {/* 1. Render Question Blocks (Text, Formula, Diagrams) */}
      <View style={styles.blocksContainer}>
        {structure.blocks.map((block, idx) => {
          if (block.type === 'TEXT') {
            return <NativeTextBlock key={`text_${idx}`} content={block.content} />;
          }

          if (block.type === 'FORMULA') {
            return (
              <NativeFormulaBlock
                key={`formula_${idx}`}
                rawText={block.rawText}
                latex={block.latex}
                isBlockMath={block.isBlockMath}
              />
            );
          }

          if (block.type === 'IMAGE') {
            return (
              <NativeImageBlock
                key={`img_${idx}`}
                id={block.id}
                bbox={block.bbox}
                imageUrl={block.imageUrl}
                caption={block.caption}
                pdfDoc={pdfDoc}
                pageNumber={structure.pageNumber}
              />
            );
          }

          return null;
        })}
      </View>

      {/* 2. Render Answer Interaction: Clickable Options or Integer Input */}
      {isNumerical ? (
        <View style={styles.integerCard}>
          <View style={styles.integerHeaderRow}>
            <Text style={styles.integerLabel}>Enter numerical answer:</Text>
            {selectedAnswer && onClearResponse ? (
              <TouchableOpacity onPress={onClearResponse} style={styles.clearMiniBtn}>
                <X size={13} color={colors.danger} />
                <Text style={styles.clearMiniText}>Clear</Text>
              </TouchableOpacity>
            ) : null}
          </View>
          <TextInput
            keyboardType="numeric"
            value={selectedAnswer ?? ''}
            onChangeText={onIntegerChange}
            placeholder="Type your numerical answer"
            placeholderTextColor={colors.textSubtle}
            style={styles.integerInput}
          />
        </View>
      ) : (
        <NativeOptionList
          options={structure.options}
          selectedAnswer={selectedAnswer}
          onSelectOption={onSelectOption}
          onClearResponse={onClearResponse}
          showClearButton={true}
        />
      )}
    </View>
  );
}

export const NativeQuestionRenderer = memo(NativeQuestionRendererComponent);

const styles = StyleSheet.create({
  container: {
    width: '100%',
    gap: spacing.md,
  },
  statusHeader: {
    marginBottom: spacing.xs,
  },
  readyBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.pill,
    backgroundColor: '#DCFCE7',
    alignSelf: 'flex-start',
  },
  readyBadgeText: {
    color: '#15803D',
    fontSize: 11,
    fontWeight: '800',
  },
  needsReviewBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.pill,
    backgroundColor: '#FEF3C7',
    alignSelf: 'flex-start',
  },
  needsReviewBadgeText: {
    color: '#B45309',
    fontSize: 11,
    fontWeight: '800',
  },
  blocksContainer: {
    gap: spacing.md,
    width: '100%',
  },
  integerCard: {
    backgroundColor: '#F8FAFC',
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: spacing.md,
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  integerHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  integerLabel: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  clearMiniBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: radius.sm,
    backgroundColor: '#FEE2E2',
  },
  clearMiniText: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.danger,
  },
  integerInput: {
    backgroundColor: '#FFFFFF',
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    color: colors.text,
    fontSize: 18,
    fontWeight: '700',
  },
});
