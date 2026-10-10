import React, { useEffect } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import { WifiOff } from 'lucide-react-native';

import { colors, radius, spacing, typography } from '../../theme';
import { useConnectivityStore } from '../../store/connectivityStore';
import { useTestSessionStore } from '../../store/testSessionStore';

export function GlobalOfflineOverlay() {
  const isOffline = useConnectivityStore((state) => state.isOffline);
  const setOffline = useConnectivityStore((state) => state.setOffline);
  const isExamActive = useTestSessionStore((state) => Boolean(state.test && state.questions.length > 0));

  useEffect(() => {
    const applyState = (isConnected: boolean | null, isInternetReachable: boolean | null) => {
      const offline = isConnected === false || isInternetReachable === false;
      setOffline(offline);
    };

    void NetInfo.fetch().then((state) => {
      applyState(state.isConnected, state.isInternetReachable);
    });

    const unsubscribe = NetInfo.addEventListener((state) => {
      applyState(state.isConnected, state.isInternetReachable);
    });

    return () => {
      unsubscribe();
    };
  }, [setOffline]);

  if (!isOffline) {
    return null;
  }

  if (isExamActive) {
    return (
      <View style={styles.examBanner} pointerEvents="box-none">
        <View style={styles.examBannerCard}>
          <WifiOff size={16} color={colors.warning} />
          <Text style={styles.examBannerText}>
            Offline: Exam continues uninterrupted. Answers are saved locally.
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.overlay}>
      <View style={styles.card}>
        <View style={styles.badge}>
          <WifiOff size={20} color={colors.primary} />
          <Text style={styles.badgeText}>Offline</Text>
        </View>
        <Text style={styles.title}>No internet connection</Text>
        <Text style={styles.message}>
          MIITJEE Digital will reconnect automatically once your internet comes back. Please check your mobile data or Wi-Fi.
        </Text>
        <Pressable style={styles.button} onPress={() => void NetInfo.refresh()}>
          <Text style={styles.buttonText}>Retry Connection</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: colors.background,
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
    zIndex: 30,
  },
  card: {
    backgroundColor: colors.surfaceRaised,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.xxl,
    gap: spacing.lg,
  },
  badge: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.primarySoft,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  badgeText: {
    color: colors.primary,
    fontSize: 12,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  title: {
    ...typography.display,
    fontSize: 30,
    lineHeight: 36,
  },
  message: {
    color: colors.textMuted,
    fontSize: 15,
    lineHeight: 22,
  },
  button: {
    minHeight: 54,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.lg,
  },
  buttonText: {
    color: colors.white,
    fontSize: 14,
    fontWeight: '800',
  },
  examBanner: {
    position: 'absolute',
    top: 48,
    left: 16,
    right: 16,
    zIndex: 9999,
  },
  examBannerCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: '#1E293B',
    borderColor: colors.warning,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
  },
  examBannerText: {
    flex: 1,
    color: colors.text,
    fontSize: 12,
    fontWeight: '600',
  },
});
