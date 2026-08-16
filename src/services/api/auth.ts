import { AppUser, SignInPayload, SignUpPayload } from '../../types';
import { logError, logInfo } from '../../utils/logger';
import { activityLog } from './activityLogger';
import { fetchProfileById } from './client';
import {
  getAuthRedirectUrl,
  getSession,
  hydrateSessionFromUrl,
  initializeSession,
  signInWithOAuth as startGoogleAuth,
  signInWithPassword,
  signOutSession,
  signUpWithPassword,
} from '../supabase/client';

function getAuthFailureDetails(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  const lower = message.toLowerCase();

  if (lower.includes('invalid login credentials') || lower.includes('wrong password') || lower.includes('invalid password')) {
    return {
      reason: 'Incorrect email or password entered.',
      suggestedFix: 'Verify your credentials and try again. Use Forgot Password if needed.',
    };
  }

  if (lower.includes('user not found') || lower.includes('email not found') || lower.includes('no profile row')) {
    return {
      reason: 'No account registered with this email address.',
      suggestedFix: 'Check for typos in your email or register a new account.',
    };
  }

  if (lower.includes('network') || lower.includes('fetch failed')) {
    return {
      reason: 'Network connection failed while attempting to authenticate.',
      suggestedFix: 'Check internet connectivity on your device and retry.',
    };
  }

  return {
    reason: message,
    suggestedFix: 'Contact support if this error persists.',
  };
}

export async function signIn(payload: SignInPayload): Promise<AppUser> {
  try {
    const session = await signInWithPassword(payload.email, payload.password);
    if (!session) {
      throw new Error('Unable to restore your session after sign in.');
    }
    const user = await fetchProfileById(session.user.id);

    if (!user) {
      throw new Error('Your account exists in Supabase Auth but no profile row was found.');
    }

    activityLog.logAuth('LOGIN_SUCCESS', {
      userId: user.id,
      studentName: user.fullName,
      email: user.email,
      status: 'success',
    });

    logInfo('Authentication succeeded.', {
      flow: 'password_sign_in',
      userId: user.id,
      role: user.role,
    });
    return user;
  } catch (error) {
    const details = getAuthFailureDetails(error);

    activityLog.logAuth('LOGIN_FAILED', {
      email: payload.email,
      status: 'failed',
      reason: details.reason,
      suggestedFix: details.suggestedFix,
    });

    logError('Authentication failed.', error, {
      flow: 'password_sign_in',
      email: payload.email,
    });
    throw error;
  }
}

export async function signUp(payload: SignUpPayload): Promise<AppUser> {
  try {
    const session = await signUpWithPassword({
      email: payload.email,
      password: payload.password,
      fullName: payload.fullName,
      requestedRole: payload.requestedRole,
    });

    if (!session) {
      throw new Error('Account created. Confirm your email and sign in again to finish onboarding.');
    }

    const user = await fetchProfileById(session.user.id);
    if (!user) {
      throw new Error('Account created, but your MIITJEE profile is still being provisioned. Please retry in a moment.');
    }

    activityLog.logAuth('LOGIN_SUCCESS', {
      userId: user.id,
      studentName: user.fullName,
      email: user.email,
      status: 'success',
    });

    logInfo('Authentication succeeded.', {
      flow: 'password_sign_up',
      userId: user.id,
      role: user.role,
    });
    return user;
  } catch (error) {
    const details = getAuthFailureDetails(error);

    activityLog.logAuth('LOGIN_FAILED', {
      email: payload.email,
      status: 'failed',
      reason: details.reason,
      suggestedFix: details.suggestedFix,
    });

    logError('Authentication failed.', error, {
      flow: 'password_sign_up',
      email: payload.email,
      requestedRole: payload.requestedRole,
    });
    throw error;
  }
}

export async function restoreAuthenticatedUser() {
  const session = await initializeSession();
  if (!session) {
    return null;
  }

  return fetchProfileById(session.user.id);
}

export async function completeOAuthSignIn(url: string) {
  const session = await hydrateSessionFromUrl(url);
  if (!session) {
    throw new Error('Missing authorization code in OAuth redirect.');
  }

  return fetchProfileById(session.user.id);
}

export async function loginWithGoogle() {
  await startGoogleAuth();
}

export async function handleDeepLink(url: string) {
  if (!url.includes(`${getAuthRedirectUrl()}`)) {
    return null;
  }

  return completeOAuthSignIn(url);
}

export async function signOut() {
  await signOutSession();
}

export function hasActiveSession() {
  return Boolean(getSession());
}
