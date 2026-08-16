import React, { memo, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Modal,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Maximize2, X } from 'lucide-react-native';
import * as pdfjsLib from 'pdfjs-dist';
import { PdfNativeBBox } from '../../services/pdf-native/pdfNativeTypes';
import { colors, radius, spacing } from '../../theme';

interface NativeImageBlockProps {
  id: string;
  bbox?: PdfNativeBBox;
  imageUrl?: string;
  caption?: string;
  pdfDoc?: pdfjsLib.PDFDocumentProxy | null;
  pageNumber?: number;
}

function NativeImageBlockComponent({
  id,
  bbox,
  imageUrl,
  caption,
  pdfDoc,
  pageNumber = 1,
}: NativeImageBlockProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [renderedDataUrl, setRenderedDataUrl] = useState<string | null>(imageUrl || null);
  const [isLoading, setIsLoading] = useState(false);
  const [isZoomModalOpen, setIsZoomModalOpen] = useState(false);

  useEffect(() => {
    let isCancelled = false;

    async function renderPdfDiagramRegion() {
      if (!pdfDoc || !bbox || imageUrl) {
        return;
      }

      setIsLoading(true);
      try {
        const page = await pdfDoc.getPage(pageNumber);
        const scale = 2.0; // Render at 2x resolution for crisp high-DPI visuals
        const viewport = page.getViewport({ scale });

        // Calculate region in viewport canvas space
        const rx = Math.max(0, bbox.x * scale);
        const ry = Math.max(0, (bbox.y) * scale);
        const rw = Math.min(viewport.width - rx, bbox.width * scale);
        const rh = Math.min(viewport.height - ry, bbox.height * scale);

        if (rw <= 0 || rh <= 0) return;

        if (Platform.OS === 'web' && typeof document !== 'undefined') {
          // Offscreen canvas for page
          const fullCanvas = document.createElement('canvas');
          fullCanvas.width = viewport.width;
          fullCanvas.height = viewport.height;
          const fullCtx = fullCanvas.getContext('2d');

          if (fullCtx) {
            await page.render({
              canvasContext: fullCtx,
              viewport,
            }).promise;

            if (isCancelled) return;

            // Crop isolated diagram canvas
            const cropCanvas = document.createElement('canvas');
            cropCanvas.width = rw;
            cropCanvas.height = rh;
            const cropCtx = cropCanvas.getContext('2d');

            if (cropCtx) {
              cropCtx.drawImage(fullCanvas, rx, ry, rw, rh, 0, 0, rw, rh);
              const dataUrl = cropCanvas.toDataURL('image/png');
              if (!isCancelled) {
                setRenderedDataUrl(dataUrl);
              }
            }
          }
        }
      } catch (err) {
        console.warn('[NativeImageBlock] Failed to extract diagram region:', err);
      } finally {
        if (!isCancelled) setIsLoading(false);
      }
    }

    void renderPdfDiagramRegion();

    return () => {
      isCancelled = true;
    };
  }, [bbox, imageUrl, pageNumber, pdfDoc]);

  if (!renderedDataUrl && !isLoading && !bbox) {
    return null;
  }

  return (
    <View style={styles.container}>
      <View style={styles.imageCard}>
        {isLoading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="small" color={colors.primary} />
            <Text style={styles.loadingText}>Loading diagram...</Text>
          </View>
        ) : renderedDataUrl ? (
          <View style={styles.imageWrapper}>
            <Image
              source={{ uri: renderedDataUrl }}
              style={styles.image}
              resizeMode="contain"
            />
            <TouchableOpacity
              style={styles.zoomButton}
              onPress={() => setIsZoomModalOpen(true)}
              activeOpacity={0.8}
            >
              <Maximize2 size={14} color="#FFFFFF" />
            </TouchableOpacity>
          </View>
        ) : null}

        {caption ? <Text style={styles.captionText}>{caption}</Text> : null}
      </View>

      {/* Fullscreen Zoom Modal */}
      {isZoomModalOpen && renderedDataUrl ? (
        <Modal
          visible={isZoomModalOpen}
          transparent
          animationType="fade"
          onRequestClose={() => setIsZoomModalOpen(false)}
        >
          <View style={styles.modalOverlay}>
            <TouchableOpacity
              style={styles.modalCloseBtn}
              onPress={() => setIsZoomModalOpen(false)}
            >
              <X size={20} color="#FFFFFF" />
            </TouchableOpacity>
            <Image
              source={{ uri: renderedDataUrl }}
              style={styles.modalImage}
              resizeMode="contain"
            />
            {caption ? <Text style={styles.modalCaption}>{caption}</Text> : null}
          </View>
        </Modal>
      ) : null}
    </View>
  );
}

export const NativeImageBlock = memo(NativeImageBlockComponent);

const styles = StyleSheet.create({
  container: {
    marginVertical: spacing.sm,
    width: '100%',
    alignItems: 'center',
  },
  imageCard: {
    width: '100%',
    maxWidth: 600,
    backgroundColor: '#FFFFFF',
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    overflow: 'hidden',
    alignItems: 'center',
    padding: spacing.xs,
  },
  imageWrapper: {
    width: '100%',
    height: 220,
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
  },
  image: {
    width: '100%',
    height: '100%',
    maxHeight: 300,
  },
  zoomButton: {
    position: 'absolute',
    bottom: 8,
    right: 8,
    backgroundColor: 'rgba(15, 23, 42, 0.75)',
    borderRadius: radius.pill,
    padding: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  captionText: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '600',
    marginTop: spacing.xs,
    textAlign: 'center',
  },
  loadingContainer: {
    height: 140,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
  },
  loadingText: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '600',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.92)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
  },
  modalCloseBtn: {
    position: 'absolute',
    top: 40,
    right: 24,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    padding: 8,
    borderRadius: radius.pill,
    zIndex: 10,
  },
  modalImage: {
    width: '100%',
    height: '75%',
  },
  modalCaption: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
    marginTop: spacing.md,
    textAlign: 'center',
  },
});
