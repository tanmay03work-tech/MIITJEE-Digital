import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View, Image, Platform, TouchableOpacity, Alert } from 'react-native';
import { UploadCloud, FileText, RefreshCw } from 'lucide-react-native';
import * as pdfjsLib from 'pdfjs-dist';
import { PdfNativeQuestion } from '../../../services/pdf-native/pdfNativeTypes';
import { renderPdfQuestionCompositeToCanvas } from '../../../services/pdf-native/pdfRegionRenderer';
import { getPdfDocument, attachPdfBinary } from '../../../services/pdf-native/pdfDocumentCache';
import { pickSingle } from '../../../components/common/DocumentPickerWeb';
import { colors, radius, spacing } from '../../../theme';

export interface PdfNativePreviewProps {
  question: PdfNativeQuestion | null;
  pdfDoc?: pdfjsLib.PDFDocumentProxy | null;
  pdfUrl?: string | null;
  showAdminDebug?: boolean;
  style?: any;
  onPdfAttached?: (doc: pdfjsLib.PDFDocumentProxy) => void;
}

// Global in-memory render cache to prevent re-rendering and layout flicker
const previewImageCache = new Map<string, string>();

export function PdfNativePreviewComponent({
  question,
  pdfDoc: externalPdfDoc,
  pdfUrl,
  showAdminDebug = false,
  style,
  onPdfAttached,
}: PdfNativePreviewProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Primitive properties for cache lookup
  const qId = question?.id ?? '';
  const qPdfId = question?.pdf_id ?? '';
  const qPdfUrl = question?.pdf_url || pdfUrl || '';
  const qPage = question?.page_start || 1;
  const bboxX = question?.bbox?.x ?? 0;
  const bboxY = question?.bbox?.y ?? 0;
  const bboxW = question?.bbox?.width ?? 0;
  const bboxH = question?.bbox?.height ?? 0;

  const regionsKey = question?.regions && question.regions.length > 0
    ? question.regions.map((r) => `${r.pageNumber}_${r.bbox.x}_${r.bbox.y}_${r.bbox.width}_${r.bbox.height}_${r.orderIndex}`).join('__')
    : `${qPage}_${bboxX}_${bboxY}_${bboxW}_${bboxH}`;

  const cacheKey = question && (bboxW > 0 || (question.regions && question.regions.length > 0))
    ? `${qPdfId}_${qId}_${regionsKey}`
    : '';

  const [dataUrl, setDataUrl] = useState<string | null>(() => {
    if (cacheKey && previewImageCache.has(cacheKey)) {
      return previewImageCache.get(cacheKey)!;
    }
    return null;
  });
  const [isLoading, setIsLoading] = useState<boolean>(() => {
    return !!(cacheKey && !previewImageCache.has(cacheKey));
  });
  const [error, setError] = useState<string | null>(null);
  const [isAttaching, setIsAttaching] = useState<boolean>(false);
  const [renderVersion, setRenderVersion] = useState<number>(0);

  useEffect(() => {
    if (!question) {
      setDataUrl(null);
      setError(null);
      setIsLoading(false);
      return;
    }

    const hasValidRegions = question.regions && question.regions.length > 0;
    if (bboxW <= 0 && !hasValidRegions) {
      setError(`Invalid Bounding Box: [w=${bboxW}, h=${bboxH}]`);
      setDataUrl(null);
      setIsLoading(false);
      return;
    }

    // Check in-memory cache first to avoid re-rendering flicker
    if (cacheKey && previewImageCache.has(cacheKey)) {
      setDataUrl(previewImageCache.get(cacheKey)!);
      setError(null);
      setIsLoading(false);
      return;
    }

    let isMounted = true;
    setIsLoading(true);
    setError(null);

    const renderTask = async () => {
      try {
        // 1. Resolve PDF Document Proxy
        let activeDoc = externalPdfDoc;
        if (!activeDoc) {
          activeDoc = await getPdfDocument({
            pdfId: qPdfId,
            pdfUrl: qPdfUrl,
          });
        }

        if (!isMounted) return;

        // 2. Render region/composite to canvas
        const canvas =
          canvasRef.current ||
          (typeof document !== 'undefined' ? document.createElement('canvas') : null);

        if (!canvas) {
          throw new Error('Canvas element unavailable for offscreen PDF rendering');
        }

        const renderedUrl = await renderPdfQuestionCompositeToCanvas(
          activeDoc,
          question,
          canvas,
          2.5
        );

        if (cacheKey && renderedUrl) {
          previewImageCache.set(cacheKey, renderedUrl);
        }

        if (isMounted) {
          setDataUrl(renderedUrl);
          setIsLoading(false);
        }
      } catch (err) {
        if (isMounted) {
          console.warn('[PdfNativePreview] Render failure for question:', question.question_number, err);
          setError(err instanceof Error ? err.message : 'Error rendering PDF question region');
          setIsLoading(false);
        }
      }
    };

    void renderTask();

    return () => {
      isMounted = false;
    };
  }, [
    externalPdfDoc,
    qPdfUrl,
    qPdfId,
    qId,
    qPage,
    bboxX,
    bboxY,
    bboxW,
    bboxH,
    regionsKey,
    cacheKey,
    renderVersion,
  ]);

  // Handler to attach source PDF file directly from the preview card
  const handleAttachSourcePdf = async () => {
    if (!question) return;
    try {
      setIsAttaching(true);
      const picked = (await pickSingle({ type: ['application/pdf'] })) as {
        name?: string;
        uri?: string;
        file?: File;
      } | null;

      if (!picked) {
        setIsAttaching(false);
        return;
      }

      let buffer: ArrayBuffer;
      if (picked.file) {
        buffer = await picked.file.arrayBuffer();
      } else if (picked.uri) {
        const res = await fetch(picked.uri);
        buffer = await res.arrayBuffer();
      } else {
        setIsAttaching(false);
        return;
      }

      await attachPdfBinary(
        [question.pdf_id, question.pdf_url, pdfUrl, picked.name],
        buffer,
        picked.name
      );

      const doc = await getPdfDocument({ buffer, pdfId: question.pdf_id });
      if (onPdfAttached) {
        onPdfAttached(doc);
      }

      setRenderVersion((v) => v + 1);
      setIsAttaching(false);
    } catch (attachErr) {
      setIsAttaching(false);
      Alert.alert(
        'PDF Attachment Error',
        attachErr instanceof Error ? attachErr.message : 'Failed to read the selected PDF file.'
      );
    }
  };

  if (!question) {
    return (
      <View style={[styles.placeholderContainer, style]}>
        <Text style={styles.placeholderTitle}>Original PDF Question Preview</Text>
        <Text style={styles.placeholderSubtitle}>
          Select a detected question from the list to preview its exact original PDF region.
        </Text>
      </View>
    );
  }

  const aspectRatio =
    question && question.bbox && question.bbox.height > 0
      ? Math.max(0.2, Math.min(10, question.bbox.width / question.bbox.height))
      : 16 / 9;

  const isSourceMissing = error && error.includes('PDF_SOURCE_MISSING');

  return (
    <View style={[styles.container, !showAdminDebug && styles.studentContainer, style]}>
      {showAdminDebug ? (
        <View style={styles.header}>
          <View style={styles.titleRow}>
            <Text style={styles.questionTitle}>Question {question.question_number}</Text>
            <Text style={styles.badgeText}>
              Page {question.page_start} • {question.review_status}
            </Text>
          </View>
          <Text style={styles.metaSub}>
            Original PDF Bounding Box: X={Math.round(question.bbox.x)}, Y={Math.round(question.bbox.y)}, W={Math.round(question.bbox.width)}, H={Math.round(question.bbox.height)}
          </Text>
        </View>
      ) : null}

      <View style={[styles.previewBox, !showAdminDebug && styles.studentPreviewBox]}>
        {isLoading ? (
          <View style={styles.loadingWrap}>
            <ActivityIndicator size="small" color={colors.primary} />
            <Text style={styles.loadingText}>Rendering crisp original question...</Text>
          </View>
        ) : error ? (
          showAdminDebug ? (
            <View style={styles.errorWrap}>
              <Text style={styles.errorTitle}>
                {isSourceMissing ? 'Source PDF Not Loaded' : 'Question Region Render Error'}
              </Text>
              <Text style={styles.errorText}>
                {isSourceMissing
                  ? 'The original PDF for this Set is not in browser memory. Please attach your original PDF file.'
                  : error}
              </Text>
              <TouchableOpacity
                style={styles.attachBtn}
                onPress={handleAttachSourcePdf}
                disabled={isAttaching}
                activeOpacity={0.7}
              >
                {isAttaching ? (
                  <ActivityIndicator size="small" color={colors.white} />
                ) : (
                  <UploadCloud size={16} color={colors.white} />
                )}
                <Text style={styles.attachBtnText}>
                  {isAttaching ? 'Attaching PDF...' : 'Attach Original PDF File 📄'}
                </Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.loadingWrap}>
              <ActivityIndicator size="small" color={colors.primary} />
              <Text style={styles.loadingText}>Loading question visual...</Text>
            </View>
          )
        ) : dataUrl ? (
          <View style={[styles.imageWrap, { aspectRatio }]}>
            <Image
              source={{ uri: dataUrl }}
              style={[styles.renderedImage, { aspectRatio }]}
              resizeMode="contain"
            />
          </View>
        ) : null}

        {/* Hidden HTML Canvas used for high-res offscreen rendering */}
        {Platform.OS === 'web' && typeof document !== 'undefined' ? (
          <canvas ref={canvasRef} style={{ display: 'none' }} />
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    backgroundColor: '#FFFFFF',
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  studentContainer: {
    borderWidth: 0,
    borderRadius: radius.sm,
    backgroundColor: '#FFFFFF',
  },
  placeholderContainer: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
  },
  placeholderTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.text,
    marginBottom: spacing.xs,
  },
  placeholderSubtitle: {
    fontSize: 13,
    color: colors.textMuted,
    textAlign: 'center',
    maxWidth: 340,
    lineHeight: 18,
  },
  header: {
    padding: spacing.md,
    backgroundColor: colors.surfaceMuted,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    gap: spacing.xs,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  questionTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: colors.text,
  },
  badgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.primary,
  },
  metaSub: {
    fontSize: 11,
    color: colors.textMuted,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
  previewBox: {
    width: '100%',
    minHeight: 140,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.sm,
  },
  studentPreviewBox: {
    minHeight: 80,
    padding: 0,
    backgroundColor: '#FFFFFF',
  },
  loadingWrap: {
    paddingVertical: spacing.xl,
    alignItems: 'center',
    gap: spacing.xs,
  },
  loadingText: {
    fontSize: 12,
    color: colors.textMuted,
  },
  errorWrap: {
    margin: spacing.md,
    padding: spacing.md,
    backgroundColor: '#FEF2F2',
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: '#FECACA',
    alignItems: 'center',
    gap: spacing.xs,
    width: '90%',
  },
  errorTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#991B1B',
  },
  errorText: {
    fontSize: 11,
    color: '#7F1D1D',
    textAlign: 'center',
    lineHeight: 16,
  },
  attachBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: colors.primary,
    paddingVertical: spacing.xs + 2,
    paddingHorizontal: spacing.md,
    borderRadius: radius.sm,
    marginTop: spacing.xs,
  },
  attachBtnText: {
    color: colors.white,
    fontSize: 12,
    fontWeight: '700',
  },
  imageWrap: {
    width: '100%',
    maxWidth: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  renderedImage: {
    width: '100%',
    maxWidth: '100%',
    height: '100%',
  },
});

export const PdfNativePreview = React.memo(PdfNativePreviewComponent);
