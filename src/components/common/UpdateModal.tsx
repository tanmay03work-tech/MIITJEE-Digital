import React, { useEffect, useState } from 'react';
import { AppState, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Download, RefreshCw, Sparkles, X } from 'lucide-react-native';

import { colors, radius, spacing } from '../../theme';
import { AppVersionInfo, CURRENT_APP_VERSION } from '../../constants/version';
import { checkForAppUpdate, triggerAppUpdate } from '../../services/updateChecker';

const DISMISSED_UPDATE_KEY = 'miitjee:dismissed_update_version';

interface UpdateModalProps {
  /** Override config for testing or forced preview */
  forcedVersionInfo?: AppVersionInfo;
  /** Callback when user dismisses the non-forced modal */
  onDismiss?: () => void;
}

export function UpdateModal({ forcedVersionInfo, onDismiss }: UpdateModalProps) {
  const [visible, setVisible] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [versionInfo, setVersionInfo] = useState<AppVersionInfo | null>(forcedVersionInfo || null);
  const [isForceUpdate, setIsForceUpdate] = useState(false);

  useEffect(() => {
    if (forcedVersionInfo) {
      setVersionInfo(forcedVersionInfo);
      setIsForceUpdate(Boolean(forcedVersionInfo.forceUpdate));
      setVisible(true);
      return;
    }

    let isMounted = true;
    async function checkVersion() {
      const result = await checkForAppUpdate();
      if (isMounted && result && result.hasUpdate) {
        if (!result.isForceUpdate) {
          const dismissedVer = await AsyncStorage.getItem(DISMISSED_UPDATE_KEY);
          if (dismissedVer === result.versionInfo.latestVersion) {
            return; // User already dismissed this update version
          }
        }
        setVersionInfo(result.versionInfo);
        setIsForceUpdate(result.isForceUpdate);
        setVisible(true);
      }
    }

    checkVersion();

    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') {
        checkVersion();
      }
    });

    return () => {
      isMounted = false;
      subscription.remove();
    };
  }, [forcedVersionInfo]);

  if (!visible || !versionInfo) {
    return null;
  }

  const handleUpdatePress = async () => {
    setUpdating(true);
    try {
      await triggerAppUpdate(versionInfo.downloadUrl);
    } finally {
      setTimeout(() => setUpdating(false), 2000);
    }
  };

  const handleClose = async () => {
    if (isForceUpdate) return;
    if (versionInfo?.latestVersion) {
      await AsyncStorage.setItem(DISMISSED_UPDATE_KEY, versionInfo.latestVersion);
    }
    setVisible(false);
    onDismiss?.();
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={handleClose}>
      <View style={styles.overlay}>
        <Pressable style={styles.backdrop} onPress={handleClose} disabled={isForceUpdate} />
        <View style={styles.card}>
          {/* Header Badge & Close Button */}
          <View style={styles.header}>
            <View style={styles.badge}>
              <Sparkles size={14} color={colors.primary} />
              <Text style={styles.badgeText}>UPDATE AVAILABLE</Text>
            </View>
            {!isForceUpdate ? (
              <Pressable style={styles.closeBtn} onPress={handleClose} hitSlop={8}>
                <X size={18} color={colors.textMuted} />
              </Pressable>
            ) : null}
          </View>

          {/* Title & Version comparison */}
          <View style={styles.titleSection}>
            <Text style={styles.title}>{versionInfo.title || 'A New Version is Available! 🚀'}</Text>
            <View style={styles.versionRow}>
              <View style={styles.versionPillOld}>
                <Text style={styles.versionOldText}>Current: v{CURRENT_APP_VERSION}</Text>
              </View>
              <Text style={styles.arrowText}>→</Text>
              <View style={styles.versionPillNew}>
                <Text style={styles.versionNewText}>New: v{versionInfo.latestVersion}</Text>
              </View>
            </View>
          </View>

          {/* Release Notes */}
          {versionInfo.releaseNotes ? (
            <View style={styles.notesContainer}>
              <Text style={styles.notesTitle}>What’s New:</Text>
              <Text style={styles.notesBody}>{versionInfo.releaseNotes}</Text>
            </View>
          ) : null}

          {/* Action Buttons */}
          <View style={styles.actions}>
            <Pressable
              style={[styles.primaryButton, updating && styles.primaryButtonDisabled]}
              onPress={handleUpdatePress}
              disabled={updating}>
              {updating ? (
                <RefreshCw size={18} color={colors.white} style={styles.spinner} />
              ) : (
                <Download size={18} color={colors.white} />
              )}
              <Text style={styles.primaryButtonText}>
                {updating ? 'Opening Update...' : 'Update App Now'}
              </Text>
            </Pressable>

            {!isForceUpdate ? (
              <Pressable style={styles.secondaryButton} onPress={handleClose}>
                <Text style={styles.secondaryButtonText}>Remind Me Later</Text>
              </Pressable>
            ) : (
              <Text style={styles.forcedNoticeText}>
                * This is a required update to keep using MIITJEE Classes safely.
              </Text>
            )}
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
    backgroundColor: 'rgba(12, 18, 30, 0.65)',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  card: {
    backgroundColor: colors.surfaceRaised,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.xl,
    gap: spacing.lg,
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 12,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: colors.primarySoft,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.primary,
  },
  badgeText: {
    color: colors.primary,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  closeBtn: {
    padding: spacing.xs,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceMuted,
  },
  titleSection: {
    gap: spacing.xs,
  },
  title: {
    color: colors.text,
    fontSize: 20,
    fontWeight: '800',
    lineHeight: 26,
  },
  versionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  versionPillOld: {
    backgroundColor: colors.surfaceMuted,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.sm,
  },
  versionOldText: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '600',
  },
  arrowText: {
    color: colors.textMuted,
    fontSize: 14,
    fontWeight: '700',
  },
  versionPillNew: {
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.sm,
  },
  versionNewText: {
    color: colors.white,
    fontSize: 12,
    fontWeight: '700',
  },
  notesContainer: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.lg,
    padding: spacing.md,
    gap: spacing.xs,
    borderWidth: 1,
    borderColor: colors.border,
  },
  notesTitle: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '700',
  },
  notesBody: {
    color: colors.textMuted,
    fontSize: 13,
    lineHeight: 18,
  },
  actions: {
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  primaryButton: {
    minHeight: 48,
    borderRadius: radius.md,
    backgroundColor: colors.primary,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
  },
  primaryButtonDisabled: {
    opacity: 0.7,
  },
  primaryButtonText: {
    color: colors.white,
    fontSize: 15,
    fontWeight: '800',
  },
  secondaryButton: {
    minHeight: 42,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryButtonText: {
    color: colors.textMuted,
    fontSize: 14,
    fontWeight: '600',
  },
  forcedNoticeText: {
    color: colors.textMuted,
    fontSize: 11,
    textAlign: 'center',
    fontStyle: 'italic',
    marginTop: spacing.xs,
  },
  spinner: {
    transform: [{ rotate: '0deg' }],
  },
});
