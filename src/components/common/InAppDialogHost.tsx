import React from 'react';
import { Modal, Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, radius, spacing } from '../../theme';
import { useUIStore } from '../../store/uiStore';

export function InAppDialogHost() {
  const dialog = useUIStore((state) => state.dialog);
  const hideDialog = useUIStore((state) => state.hideDialog);

  if (!dialog) {
    return null;
  }

  const handleClose = (onPress?: () => void) => {
    hideDialog();
    if (onPress) {
      requestAnimationFrame(() => {
        onPress();
      });
    }
  };

  const isTwoButtons = dialog.buttons.length === 2;

  return (
    <Modal visible transparent animationType="fade" statusBarTranslucent onRequestClose={hideDialog}>
      <View style={styles.overlay}>
        <Pressable
          style={styles.backdrop}
          onPress={() => {
            if (dialog.cancelable) {
              hideDialog();
            }
          }}
        />
        <View style={styles.card}>
          <Text style={styles.title}>{dialog.title}</Text>
          {dialog.message ? <Text style={styles.message}>{dialog.message}</Text> : null}

          <View style={[styles.actions, isTwoButtons && styles.actionsRow]}>
            {dialog.buttons.map((button, index) => {
              const isCancel = button.style === 'cancel';
              const isDestructive = button.style === 'destructive';

              return (
                <Pressable
                  key={`${button.text}_${index}`}
                  accessibilityRole="button"
                  style={[
                    styles.button,
                    isTwoButtons && styles.buttonFlex,
                    isCancel && styles.buttonSecondary,
                    isDestructive && styles.buttonDanger,
                  ]}
                  onPress={() => handleClose(button.onPress)}>
                  <Text
                    style={[
                      styles.buttonText,
                      isCancel && styles.buttonTextSecondary,
                      isDestructive && styles.buttonTextDanger,
                    ]}>
                    {button.text}
                  </Text>
                </Pressable>
              );
            })}
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
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: colors.overlay,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.xl,
    gap: spacing.md,
    width: '100%',
    maxWidth: 440,
    ...Platform.select({
      web: {
        boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1)',
      },
    }),
  },
  title: {
    color: colors.text,
    fontSize: 19,
    fontWeight: '800',
  },
  message: {
    color: colors.textMuted,
    fontSize: 14,
    lineHeight: 21,
  },
  actions: {
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  actionsRow: {
    flexDirection: 'row',
  },
  button: {
    minHeight: 46,
    borderRadius: radius.md,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },
  buttonFlex: {
    flex: 1,
  },
  buttonSecondary: {
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1,
    borderColor: colors.border,
  },
  buttonDanger: {
    backgroundColor: colors.danger,
  },
  buttonText: {
    color: colors.white,
    fontSize: 14,
    fontWeight: '700',
  },
  buttonTextSecondary: {
    color: colors.text,
  },
  buttonTextDanger: {
    color: colors.white,
  },
});
