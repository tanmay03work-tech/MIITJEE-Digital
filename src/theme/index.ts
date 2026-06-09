import { StyleSheet } from 'react-native';

export const colors = {
  background: '#FFFFFF',
  backgroundAlt: '#F7F9FC',
  surface: '#FFFFFF',
  surfaceMuted: '#F4F7FB',
  surfaceRaised: '#FFFFFF',
  primary: '#5B61F6',
  primaryDeep: '#3941D8',
  primarySoft: '#EEF0FF',
  success: '#14804A',
  successSoft: '#E6F6ED',
  accent: '#2F80ED',
  accentSoft: '#EAF3FF',
  warning: '#F59E0B',
  warningSoft: '#FFF5DE',
  danger: '#E35D5B',
  dangerSoft: '#FDEBEC',
  info: '#2D9CDB',
  infoSoft: '#E8F6FE',
  border: '#E7ECF3',
  borderStrong: '#D6DDE8',
  text: '#162033',
  textMuted: '#667085',
  textSubtle: '#98A2B3',
  white: '#FFFFFF',
  shadow: '#90A0B8',
  overlay: 'rgba(91, 97, 246, 0.08)',
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 20,
  xl: 24,
  xxl: 32,
  xxxl: 40,
};

export const radius = {
  sm: 12,
  md: 18,
  lg: 24,
  xl: 30,
  pill: 999,
};

export const typography = StyleSheet.create({
  display: {
    fontSize: 30,
    lineHeight: 36,
    fontWeight: '900',
    color: colors.text,
  },
  title: {
    fontSize: 24,
    lineHeight: 30,
    fontWeight: '900',
    color: colors.text,
  },
  subtitle: {
    fontSize: 16,
    lineHeight: 24,
    fontWeight: '700',
    color: colors.text,
  },
  body: {
    fontSize: 15,
    lineHeight: 22,
    color: colors.textMuted,
  },
  caption: {
    fontSize: 12,
    lineHeight: 16,
    color: colors.textSubtle,
  },
});

export const shadows = {
  card: {
    shadowColor: colors.shadow,
    shadowOpacity: 0.08,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 3,
  },
  soft: {
    shadowColor: colors.shadow,
    shadowOpacity: 0.05,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
};
