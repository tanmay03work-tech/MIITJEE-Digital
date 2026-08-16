import React, { PropsWithChildren } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleProp,
  StyleSheet,
  View,
  ViewStyle,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '../../theme';

interface ScreenProps extends PropsWithChildren {
  contentContainerStyle?: StyleProp<ViewStyle>;
  safeAreaStyle?: StyleProp<ViewStyle>;
  useScrollView?: boolean;
}

export function Screen({
  children,
  contentContainerStyle,
  safeAreaStyle,
  useScrollView = true,
}: ScreenProps) {
  const insets = useSafeAreaInsets();
  const bottomSpacing = 16 + Math.max(insets.bottom, 8);
  const resolvedScrollContentStyle = [styles.contentContainer, { paddingBottom: bottomSpacing }, contentContainerStyle];

  return (
    <SafeAreaView style={[styles.safeArea, safeAreaStyle]} edges={['top', 'left', 'right']}>
      <View pointerEvents="none" style={styles.backgroundLayer}>
        <View style={styles.topWash} />
        <View style={styles.orbPrimary} />
        <View style={styles.orbAccent} />
      </View>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : Platform.OS === 'android' ? 'height' : undefined}
        keyboardVerticalOffset={Platform.OS === 'web' ? 0 : Math.max(insets.top, 12)}>
        {useScrollView ? (
          <ScrollView
            style={styles.flex}
            contentContainerStyle={resolvedScrollContentStyle}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}>
            {children}
          </ScrollView>
        ) : (
          <View style={[styles.flex, contentContainerStyle]}>{children}</View>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },
  flex: {
    flex: 1,
  },
  backgroundLayer: {
    ...StyleSheet.absoluteFillObject,
  },
  topWash: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    height: 220,
    backgroundColor: colors.backgroundAlt,
  },
  orbPrimary: {
    position: 'absolute',
    width: 220,
    height: 220,
    borderRadius: 110,
    backgroundColor: 'rgba(91,97,246,0.06)',
    right: -92,
    top: -48,
  },
  orbAccent: {
    position: 'absolute',
    width: 140,
    height: 140,
    borderRadius: 70,
    backgroundColor: 'rgba(47,128,237,0.05)',
    left: -36,
    top: 280,
  },
  contentContainer: {
    flexGrow: 1,
  },
});
