import React, { useEffect, useState } from 'react';
import { Alert, Image, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { Eye, EyeOff, GraduationCap, Shield, UserRound, WifiOff } from 'lucide-react-native';

import miitjeeLogo from '../../assets/branding/miitjee-logo.png';
import { AnimatedPressable } from '../../components/common/AnimatedPressable';
import { Button } from '../../components/common/Button';
import { EmptyState } from '../../components/common/EmptyState';
import { GoogleIcon } from '../../components/common/GoogleIcon';
import { InputField } from '../../components/common/InputField';
import { Screen } from '../../components/common/Screen';
import { useLoader } from '../../providers/GlobalLoaderProvider';
import { colors, radius, spacing, typography } from '../../theme';
import { useAuthStore } from '../../store/authStore';

type AuthMode = 'signin' | 'signup';
type RequestedRole = 'student' | 'admin';
type AuthAttempt = 'signin' | 'signup' | 'google' | null;

export function AuthScreen() {
  const [mode, setMode] = useState<AuthMode>('signin');
  const [requestedRole, setRequestedRole] = useState<RequestedRole>('student');
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [lastAttempt, setLastAttempt] = useState<AuthAttempt>(null);
  const [fieldErrors, setFieldErrors] = useState<{ fullName?: string; email?: string; password?: string }>({});

  const { signIn, signUp, signInWithGoogle, isLoading, error, errorKind, clearError } = useAuthStore();
  const { showLoader, hideLoader } = useLoader();

  useEffect(() => {
    if (isLoading) {
      showLoader({
        title: mode === 'signin' ? 'Signing you in' : 'Creating your account',
        subtitle: 'Connecting securely to MIITJEE Digital...',
      });
      return;
    }

    hideLoader();
  }, [hideLoader, isLoading, mode, showLoader]);

  useEffect(() => () => hideLoader(), [hideLoader]);

  const handleSubmit = async () => {
    const errs: { fullName?: string; email?: string; password?: string } = {};
    if (mode === 'signup' && !fullName.trim()) {
      errs.fullName = 'Full name is required';
    }
    if (!email.trim()) {
      errs.email = 'Email address is required';
    } else if (!email.includes('@')) {
      errs.email = 'Please enter a valid email address';
    }
    if (!password) {
      errs.password = 'Password is required';
    } else if (password.length < 6) {
      errs.password = 'Password must be at least 6 characters';
    }

    if (Object.keys(errs).length > 0) {
      setFieldErrors(errs);
      return;
    }
    setFieldErrors({});

    try {
      if (mode === 'signin') {
        setLastAttempt('signin');
        await signIn({ email, password });
      } else {
        setLastAttempt('signup');
        await signUp({ fullName, email, password, requestedRole });
      }
    } catch {
      // Auth store state is bound to UI
    }
  };

  const handleGoogleSignIn = async () => {
    try {
      setLastAttempt('google');
      await signInWithGoogle();
    } catch {
      // Auth store state is bound to UI
    }
  };

  if (errorKind === 'network') {
    return (
      <Screen contentContainerStyle={styles.offlineContent}>
        <View style={styles.offlineHero}>
          <View style={styles.offlineBadge}>
            <WifiOff size={16} color={colors.primary} />
            <Text style={styles.offlineBadgeText}>Offline Mode</Text>
          </View>
          <Text style={styles.offlineTitle}>Unable to connect to MIITJEE</Text>
          <Text style={styles.offlineSubtitle}>
            Check your internet connection or try again. Offline mode will keep cached tests and results available where supported.
          </Text>
        </View>

        <View style={styles.offlineActions}>
          <Button
            variant="primary"
            onPress={() => {
              clearError();
              if (lastAttempt === 'google') {
                void handleGoogleSignIn();
              } else if (lastAttempt === 'signin' || lastAttempt === 'signup') {
                void handleSubmit();
              }
            }}>
            Retry Connection
          </Button>
          <Button variant="ghost" onPress={() => clearError()}>
            Dismiss
          </Button>
        </View>
      </Screen>
    );
  }

  return (
    <Screen contentContainerStyle={styles.content}>
      <Animated.View entering={FadeInDown.duration(400)} style={styles.hero}>
        <View style={styles.logoWrap}>
          <Image source={miitjeeLogo} style={styles.logoImage} resizeMode="contain" />
        </View>
        <Text style={styles.heroHeadline}>Digital learning for serious exam preparation</Text>
        <Text style={styles.heroEyebrow}>Batches, papers, insights, and scholarship journeys in one platform</Text>
        <Text style={styles.heroText}>
          Join MIITJEE Digital to access institute programs, weekly practice papers, scholarship tests, rank tracking, and guided admissions support.
        </Text>
      </Animated.View>

      <Animated.View entering={FadeInDown.delay(80).duration(400)} style={styles.modeRow}>
        {(['signin', 'signup'] as const).map((item) => (
          <AnimatedPressable
            key={item}
            style={[styles.modeButton, mode === item && styles.modeButtonActive]}
            onPress={() => setMode(item)}>
            <Text style={[styles.modeText, mode === item && styles.modeTextActive]}>
              {item === 'signin' ? 'Sign In' : 'Create Account'}
            </Text>
          </AnimatedPressable>
        ))}
      </Animated.View>

      <Animated.View entering={FadeInDown.delay(140).duration(400)} style={styles.formCard}>
        <Text style={styles.formTitle}>{mode === 'signin' ? 'Welcome back' : 'Create your account'}</Text>
        <Text style={styles.formSubtitle}>
          {mode === 'signin'
            ? 'Continue your preparation with your batch, papers, and performance insights.'
            : 'Students can begin right away. Teacher and admin access opens after approval.'}
        </Text>

        {mode === 'signup' ? (
          <>
            <InputField
              label="Full Name"
              placeholder="Enter your full name"
              value={fullName}
              onChangeText={(val) => {
                setFullName(val);
                if (fieldErrors.fullName) setFieldErrors((prev) => ({ ...prev, fullName: undefined }));
              }}
              error={fieldErrors.fullName}
              required
            />

            <View style={styles.roleWrap}>
              <Text style={styles.roleLabel}>Choose Account Type</Text>
              <View style={styles.roleRow}>
                <AnimatedPressable
                  style={[styles.roleCard, requestedRole === 'student' && styles.roleCardActive]}
                  onPress={() => setRequestedRole('student')}>
                  <UserRound size={22} color={requestedRole === 'student' ? colors.primary : colors.textMuted} />
                  <Text style={[styles.roleTitle, requestedRole === 'student' && styles.roleTitleActive]}>Student</Text>
                  <Text style={styles.roleDescription}>Join as learner</Text>
                </AnimatedPressable>
                <AnimatedPressable
                  style={[styles.roleCard, requestedRole === 'admin' && styles.roleCardActive]}
                  onPress={() => setRequestedRole('admin')}>
                  <Shield size={22} color={requestedRole === 'admin' ? colors.primary : colors.textMuted} />
                  <Text style={[styles.roleTitle, requestedRole === 'admin' && styles.roleTitleActive]}>Teacher / Admin</Text>
                  <Text style={styles.roleDescription}>Manage institute tools</Text>
                </AnimatedPressable>
              </View>
            </View>
          </>
        ) : null}

        <InputField
          label="Email Address"
          placeholder="name@example.com"
          autoCapitalize="none"
          keyboardType="email-address"
          value={email}
          onChangeText={(val) => {
            setEmail(val);
            if (fieldErrors.email) setFieldErrors((prev) => ({ ...prev, email: undefined }));
          }}
          error={fieldErrors.email}
          required
        />

        <InputField
          label="Password"
          placeholder="Enter password"
          secureTextEntry={!showPassword}
          value={password}
          onChangeText={(val) => {
            setPassword(val);
            if (fieldErrors.password) setFieldErrors((prev) => ({ ...prev, password: undefined }));
          }}
          error={fieldErrors.password}
          required
          rightAccessory={
            <AnimatedPressable style={styles.passwordToggle} onPress={() => setShowPassword((current) => !current)}>
              {showPassword ? <EyeOff size={18} color={colors.textMuted} /> : <Eye size={18} color={colors.textMuted} />}
              <Text style={styles.passwordToggleText}>{showPassword ? 'Hide' : 'Show'}</Text>
            </AnimatedPressable>
          }
        />

        {error ? <Text style={styles.errorText}>{error}</Text> : null}

        <Button
          onPress={() => void handleSubmit()}
          loading={isLoading}
          loadingText={mode === 'signin' ? 'Signing In...' : 'Creating Account...'}>
          {mode === 'signin' ? 'Sign In' : 'Create Account'}
        </Button>

        <AnimatedPressable style={styles.googleButton} onPress={handleGoogleSignIn} disabled={isLoading}>
          <View style={styles.googleIconWrap}>
            <GoogleIcon size={18} />
          </View>
          <Text style={styles.googleText}>Continue with Google</Text>
        </AnimatedPressable>

        <View style={styles.featureRow}>
          <View style={styles.featurePill}>
            <GraduationCap size={16} color={colors.primary} />
            <Text style={styles.featureText}>Batch Programs</Text>
          </View>
          <View style={styles.featurePill}>
            <Shield size={16} color={colors.accent} />
            <Text style={styles.featureText}>Trusted Access</Text>
          </View>
        </View>

        <Text style={styles.helperText}>
          Your batch access, scholarship entries, papers, and learning profile stay linked to your account.
        </Text>
      </Animated.View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.xl,
    gap: spacing.xl,
  },
  offlineContent: {
    flexGrow: 1,
    paddingHorizontal: spacing.xl,
    justifyContent: 'center',
    gap: spacing.xl,
  },
  offlineHero: {
    alignItems: 'center',
    gap: spacing.sm,
  },
  offlineBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    backgroundColor: colors.primarySoft,
  },
  offlineBadgeText: {
    color: colors.primary,
    fontSize: 12,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  offlineTitle: {
    ...typography.display,
    fontSize: 28,
    lineHeight: 34,
    textAlign: 'center',
  },
  offlineSubtitle: {
    color: colors.textMuted,
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
  },
  offlineActions: {
    gap: spacing.md,
  },
  hero: {
    paddingTop: spacing.sm,
    gap: spacing.sm,
  },
  logoWrap: {
    width: 244,
    height: 96,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoImage: {
    width: 236,
    height: 82,
  },
  heroHeadline: {
    ...typography.display,
    fontSize: 28,
    lineHeight: 34,
  },
  heroEyebrow: {
    color: colors.accent,
    fontSize: 12,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  heroText: {
    color: colors.textMuted,
    fontSize: 15,
    lineHeight: 22,
    maxWidth: '94%',
  },
  modeRow: {
    flexDirection: 'row',
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.pill,
    padding: spacing.xs,
    borderWidth: 1,
    borderColor: colors.border,
  },
  modeButton: {
    flex: 1,
    paddingVertical: spacing.md,
    alignItems: 'center',
    borderRadius: radius.pill,
  },
  modeButtonActive: {
    backgroundColor: colors.surfaceRaised,
  },
  modeText: {
    color: colors.textMuted,
    fontWeight: '700',
    fontSize: 14,
  },
  modeTextActive: {
    color: colors.primary,
  },
  formCard: {
    backgroundColor: colors.surfaceRaised,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.xl,
    padding: spacing.xl,
    gap: spacing.lg,
    shadowColor: colors.shadow,
    shadowOpacity: 0.08,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 3,
  },
  formTitle: {
    color: colors.text,
    fontSize: 24,
    fontWeight: '800',
  },
  formSubtitle: {
    color: colors.textMuted,
    fontSize: 14,
    lineHeight: 20,
  },
  roleWrap: {
    gap: spacing.sm,
  },
  roleLabel: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  roleRow: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  roleCard: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.xl,
    padding: spacing.lg,
    gap: spacing.xs,
    backgroundColor: colors.surface,
  },
  roleCardActive: {
    borderColor: colors.borderStrong,
    backgroundColor: colors.primarySoft,
  },
  roleTitle: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '700',
  },
  roleTitleActive: {
    color: colors.primary,
  },
  roleDescription: {
    color: colors.textMuted,
    fontSize: 11,
    lineHeight: 15,
    fontWeight: '600',
  },
  passwordToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  passwordToggleText: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '700',
  },
  googleButton: {
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: '#DADCE0',
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: spacing.md,
    paddingVertical: 13,
    backgroundColor: colors.surface,
  },
  googleIconWrap: {
    width: 18,
    height: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  googleText: {
    color: '#1F1F1F',
    fontSize: 14,
    fontWeight: '600',
  },
  featureRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    flexWrap: 'wrap',
  },
  featurePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  featureText: {
    color: colors.text,
    fontSize: 12,
    fontWeight: '700',
  },
  helperText: {
    color: colors.textSubtle,
    fontSize: 12,
    lineHeight: 18,
  },
  errorText: {
    color: colors.danger,
    fontSize: 13,
    fontWeight: '600',
  },
});
