import { AppUser, SignInPayload, SignUpPayload } from '../../types';
import { logError, logInfo } from '../../utils/logger';
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

    logInfo('Authentication succeeded.', {
      flow: 'password_sign_in',
      userId: user.id,
      role: user.role,
    });
    return user;
  } catch (error) {
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

    logInfo('Authentication succeeded.', {
      flow: 'password_sign_up',
      userId: user.id,
      role: user.role,
    });
    return user;
  } catch (error) {
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
