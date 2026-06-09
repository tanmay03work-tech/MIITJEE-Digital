import React from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';

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

          <View style={styles.actions}>
            {dialog.buttons.map((button, index) => (
              <Pressable
                key={`${button.text}_${index}`}
                style={[
                  styles.button,
                  button.style === 'cancel' && styles.buttonSecondary,
                  button.style === 'destructive' && styles.buttonDanger,
                ]}
                onPress={() => handleClose(button.onPress)}>
                <Text
                  style={[
                    styles.buttonText,
                    button.style === 'cancel' && styles.buttonTextSecondary,
                    button.style === 'destructive' && styles.buttonTextDanger,
                  ]}>
                  {button.text}
                </Text>
              </Pressable>
            ))}
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
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(12,18,30,0.38)',
  },
  card: {
    backgroundColor: colors.surfaceRaised,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.xl,
    gap: spacing.lg,
  },
  title: {
    color: colors.text,
    fontSize: 22,
    fontWeight: '800',
  },
  message: {
    color: colors.textMuted,
    fontSize: 15,
    lineHeight: 22,
  },
  actions: {
    gap: spacing.sm,
  },
  button: {
    minHeight: 50,
    borderRadius: radius.md,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },
  buttonSecondary: {
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1,
    borderColor: colors.border,
  },
  buttonDanger: {
    backgroundColor: colors.dangerSoft,
    borderWidth: 1,
    borderColor: colors.danger,
  },
  buttonText: {
    color: colors.white,
    fontSize: 14,
    fontWeight: '800',
  },
  buttonTextSecondary: {
    color: colors.text,
  },
  buttonTextDanger: {
    color: colors.danger,
  },
});
