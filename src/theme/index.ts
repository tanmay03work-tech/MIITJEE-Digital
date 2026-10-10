import { StyleSheet } from 'react-native';

export const colors = {
  background: '#FFFFFF',
  backgroundAlt: '#F8FAFC',
  surface: '#FFFFFF',
  surfaceMuted: '#F8FAFC',
  surfaceRaised: '#FFFFFF',
  primary: '#4F46E5',
  primaryDeep: '#3730A3',
  primarySoft: '#EEF2FF',
  success: '#059669',
  successSoft: '#ECFDF5',
  accent: '#2563EB',
  accentSoft: '#EFF6FF',
  warning: '#D97706',
  warningSoft: '#FFFBEB',
  danger: '#DC2626',
  dangerSoft: '#FEF2F2',
  info: '#0284C7',
  infoSoft: '#F0F9FF',
  border: '#E2E8F0',
  borderStrong: '#CBD5E1',
  text: '#0F172A',
  textMuted: '#475569',
  textSubtle: '#94A3B8',
  white: '#FFFFFF',
  shadow: '#0F172A',
  overlay: 'rgba(15, 23, 42, 0.45)',
  input: '#E2E8F0',
  ring: '#4F46E5',
};

export const spacing = {
  xxs: 2,
  xs: 4,
  sm: 8,
  md: 16,
  lg: 20,
  xl: 24,
  xxl: 32,
  xxxl: 40,
};

export const radius = {
  xs: 6,
  sm: 10,
  md: 14,
  lg: 18,
  xl: 24,
  pill: 999,
};

export const typography = StyleSheet.create({
  display: {
    fontSize: 30,
    lineHeight: 38,
    fontWeight: '800',
    color: colors.text,
    letterSpacing: -0.5,
  },
  title: {
    fontSize: 22,
    lineHeight: 28,
    fontWeight: '800',
    color: colors.text,
    letterSpacing: -0.3,
  },
  subtitle: {
    fontSize: 16,
    lineHeight: 24,
    fontWeight: '600',
    color: colors.text,
  },
  body: {
    fontSize: 15,
    lineHeight: 22,
    color: colors.textMuted,
  },
  bodySmall: {
    fontSize: 13,
    lineHeight: 18,
    color: colors.textMuted,
  },
  caption: {
    fontSize: 12,
    lineHeight: 16,
    color: colors.textSubtle,
    fontWeight: '500',
  },
});

export const shadows = {
  card: {
    shadowColor: colors.shadow,
    shadowOpacity: 0.06,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  soft: {
    shadowColor: colors.shadow,
    shadowOpacity: 0.04,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  raised: {
    shadowColor: colors.shadow,
    shadowOpacity: 0.1,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 8 },
    elevation: 4,
  },
};
