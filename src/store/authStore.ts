import { create } from 'zustand';

import { handleDeepLink, loginWithGoogle, restoreAuthenticatedUser, signIn, signOut, signUp } from '../services/api/auth';
import { activityLog } from '../services/api/activityLogger';
import { AppUser, SignInPayload, SignUpPayload } from '../types';
import { useAppStore } from './appStore';
import { useTestSessionStore } from './testSessionStore';

interface AuthState {
  user: AppUser | null;
  isInitialized: boolean;
  isLoading: boolean;
  error?: string;
  errorKind?: 'network' | 'generic';
  initialize: () => Promise<void>;
  signIn: (payload: SignInPayload) => Promise<AppUser>;
  signUp: (payload: SignUpPayload) => Promise<AppUser>;
  signInWithGoogle: () => Promise<void>;
  completeOAuth: (url: string) => Promise<AppUser | null>;
  setUser: (user: AppUser | null) => void;
  clearError: () => void;
  signOut: () => Promise<void>;
}

function isLikelyNetworkError(error: unknown) {
  const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();

  return (
    message.includes('network request failed') ||
    message.includes('fetch failed') ||
    message.includes('network error') ||
    message.includes('internet') ||
    message.includes('offline') ||
    message.includes('failed to fetch')
  );
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  return 'Unable to complete authentication right now.';
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isInitialized: false,
  isLoading: false,
  error: undefined,
  errorKind: undefined,
  initialize: async () => {
    set({ isLoading: true, error: undefined, errorKind: undefined });

    try {
      const user = await restoreAuthenticatedUser();
      set({ user, isLoading: false, isInitialized: true, errorKind: undefined });
    } catch (error) {
      const message = getErrorMessage(error);
      set({
        error: message,
        errorKind: isLikelyNetworkError(error) ? 'network' : 'generic',
        isLoading: false,
        isInitialized: true,
      });
    }
  },
  signIn: async (payload) => {
    set({ isLoading: true, error: undefined, errorKind: undefined });

    try {
      const user = await signIn(payload);
      set({ user, isLoading: false, errorKind: undefined });
      return user;
    } catch (error) {
      const message = getErrorMessage(error);
      set({ error: message, errorKind: isLikelyNetworkError(error) ? 'network' : 'generic', isLoading: false });
      throw error;
    }
  },
  signUp: async (payload) => {
    set({ isLoading: true, error: undefined, errorKind: undefined });

    try {
      const user = await signUp(payload);
      set({ user, isLoading: false, errorKind: undefined });
      return user;
    } catch (error) {
      const message = getErrorMessage(error);
      set({ error: message, errorKind: isLikelyNetworkError(error) ? 'network' : 'generic', isLoading: false });
      throw error;
    }
  },
  signInWithGoogle: async () => {
    set({ isLoading: true, error: undefined, errorKind: undefined });

    try {
      await loginWithGoogle();
      set({ isLoading: false, errorKind: undefined });
    } catch (error) {
      const message = getErrorMessage(error);
      set({ error: message, errorKind: isLikelyNetworkError(error) ? 'network' : 'generic', isLoading: false });
      throw error;
    }
  },
  completeOAuth: async (url) => {
    set({ isLoading: true, error: undefined, errorKind: undefined });

    try {
      const user = await handleDeepLink(url);
      set({ user: user ?? null, isLoading: false, isInitialized: true, errorKind: undefined });
      return user;
    } catch (error) {
      const message = getErrorMessage(error);
      set({
        error: message,
        errorKind: isLikelyNetworkError(error) ? 'network' : 'generic',
        isLoading: false,
        isInitialized: true,
      });
      throw error;
    }
  },
  setUser: (user) => set({ user }),
  clearError: () => set({ error: undefined, errorKind: undefined }),
  signOut: async () => {
    const currentUser = useAuthStore.getState().user;
    if (currentUser) {
      activityLog.logAuth('SIGN_OUT', {
        userId: currentUser.id,
        studentName: currentUser.fullName,
        email: currentUser.email,
        status: 'info',
      });
      await activityLog.flush();
    }
    await signOut();
    useTestSessionStore.getState().reset();
    useAppStore.getState().reset();
    set({ user: null, error: undefined, errorKind: undefined, isLoading: false });
  },
}));
