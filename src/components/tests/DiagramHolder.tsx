import React, { useState } from 'react';
import {
  Image,
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  ViewStyle,
} from 'react-native';
import { FileImage, Maximize2, X } from 'lucide-react-native';
import { colors, radius, spacing } from '../../theme';

interface DiagramHolderProps {
  imageUrl: string;
  caption?: string;
  style?: ViewStyle;
}

export function DiagramHolder({ imageUrl, caption, style }: DiagramHolderProps) {
  const [isZoomOpen, setIsZoomOpen] = useState(false);

  if (!imageUrl) return null;

  return (
    <View style={[styles.container, style]}>
      <View style={styles.card}>
        {/* Header Ribbon */}
        <View style={styles.cardHeader}>
          <View style={styles.badgeRow}>
            <FileImage size={14} color="#4F46E5" />
            <Text style={styles.badgeText}>Figure / Chemical Structure</Text>
          </View>
          <TouchableOpacity
            style={styles.zoomPill}
            onPress={() => setIsZoomOpen(true)}
            activeOpacity={0.7}
            accessibilityLabel="Zoom diagram"
          >
            <Maximize2 size={12} color="#475569" />
            <Text style={styles.zoomPillText}>Tap to Zoom</Text>
          </TouchableOpacity>
        </View>

        {/* Image Display Holder */}
        <TouchableOpacity
          style={styles.imageHolder}
          onPress={() => setIsZoomOpen(true)}
          activeOpacity={0.9}
        >
          <Image
            source={{ uri: imageUrl }}
            style={styles.image}
            resizeMode="contain"
          />
        </TouchableOpacity>

        {caption ? <Text style={styles.captionText}>{caption}</Text> : null}
      </View>

      {/* Interactive Fullscreen Zoom Modal */}
      <Modal
        visible={isZoomOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setIsZoomOpen(false)}
      >
        <View style={styles.modalOverlay}>
          <TouchableOpacity
            style={styles.modalCloseBtn}
            onPress={() => setIsZoomOpen(false)}
            activeOpacity={0.8}
          >
            <X size={20} color="#FFFFFF" />
          </TouchableOpacity>
          <View style={styles.modalContentCard}>
            <Image
              source={{ uri: imageUrl }}
              style={styles.modalImage}
              resizeMode="contain"
            />
            {caption ? <Text style={styles.modalCaption}>{caption}</Text> : null}
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    marginVertical: spacing.sm,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    overflow: 'hidden',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    backgroundColor: '#F8FAFC',
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#4F46E5',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  zoomPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.pill,
  },
  zoomPillText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#475569',
  },
  imageHolder: {
    width: '100%',
    minHeight: 140,
    maxHeight: 260,
    padding: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
  },
  image: {
    width: '100%',
    height: 180,
  },
  captionText: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '500',
    textAlign: 'center',
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.sm,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.9)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  modalCloseBtn: {
    position: 'absolute',
    top: 40,
    right: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    padding: 8,
    borderRadius: radius.pill,
    zIndex: 10,
  },
  modalContentCard: {
    width: '100%',
    maxWidth: 700,
    backgroundColor: '#FFFFFF',
    borderRadius: radius.xl,
    padding: spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalImage: {
    width: '100%',
    height: 350,
  },
  modalCaption: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '600',
    marginTop: spacing.md,
    textAlign: 'center',
  },
});
