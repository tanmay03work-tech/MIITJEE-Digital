import AsyncStorage from '@react-native-async-storage/async-storage';
import { Linking, Platform } from 'react-native';

import { appEnv, assertBackendConfig } from '../../config/env';
import { logError, logWarn } from '../../utils/logger';
import { SupabaseSession } from './types';

type HttpMethod = 'GET' | 'POST' | 'PATCH' | 'DELETE';

let currentSession: SupabaseSession | null = null;
const PKCE_VERIFIER_KEY = 'miitjee:auth:pkce_verifier';
const SESSION_STORAGE_KEY = 'miitjee:auth:session';
const DEFAULT_REQUEST_TIMEOUT_MS = 15_000;
const DEFAULT_FUNCTION_TIMEOUT_MS = 45_000;

interface CryptoLike {
  getRandomValues?: (array: Uint8Array) => Uint8Array;
}

function getCrypto() {
  return (globalThis as typeof globalThis & { crypto?: CryptoLike }).crypto;
}

function toBase64Url(bytes: Uint8Array) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  let output = '';

  for (let index = 0; index < bytes.length; index += 3) {
    const byte1 = bytes[index] ?? 0;
    const byte2 = bytes[index + 1] ?? 0;
    const byte3 = bytes[index + 2] ?? 0;
    const combined = (byte1 << 16) | (byte2 << 8) | byte3;

    output += alphabet[(combined >> 18) & 63];
    output += alphabet[(combined >> 12) & 63];
    output += index + 1 < bytes.length ? alphabet[(combined >> 6) & 63] : '=';
    output += index + 2 < bytes.length ? alphabet[combined & 63] : '=';
  }

  return output.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function normalizeSession(session: SupabaseSession) {
  return {
    ...session,
    expires_at:
      session.expires_at ??
      Math.floor(Date.now() / 1000) + Math.max(0, Number(session.expires_in ?? 0)),
  };
}

async function persistSession(session: SupabaseSession | null) {
  if (!session) {
    await AsyncStorage.removeItem(SESSION_STORAGE_KEY);
    return;
  }

  await AsyncStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
}

async function setCurrentSession(session: SupabaseSession | null) {
  currentSession = session ? normalizeSession(session) : null;
  await persistSession(currentSession);
  return currentSession;
}

async function loadStoredSession() {
  if (currentSession) {
    return currentSession;
  }

  const stored = await AsyncStorage.getItem(SESSION_STORAGE_KEY);
  if (!stored) {
    return null;
  }

  try {
    const parsed = JSON.parse(stored) as SupabaseSession;
    currentSession = normalizeSession(parsed);
    return currentSession;
  } catch {
    await AsyncStorage.removeItem(SESSION_STORAGE_KEY);
    currentSession = null;
    return null;
  }
}

function isSessionExpiring(session: SupabaseSession, bufferSeconds = 90) {
  if (!session.expires_at) {
    return false;
  }

  return session.expires_at <= Math.floor(Date.now() / 1000) + bufferSeconds;
}

async function refreshSession(refreshToken: string) {
  const session = await request<SupabaseSession>('/auth/v1/token', {
    method: 'POST',
    query: { grant_type: 'refresh_token' },
    body: {
      refresh_token: refreshToken,
    },
  });

  return setCurrentSession(session);
}

async function ensureAuthenticatedSession() {
  const session = await loadStoredSession();
  if (!session) {
    return null;
  }

  if (!isSessionExpiring(session)) {
    return session;
  }

  try {
    return await refreshSession(session.refresh_token);
  } catch {
    await setCurrentSession(null);
    throw new Error('Your session has expired. Please sign in again.');
  }
}

function toUtf8Bytes(input: string) {
  const encoded = encodeURIComponent(input);
  const bytes: number[] = [];

  for (let index = 0; index < encoded.length; index += 1) {
    const character = encoded[index];

    if (!character) {
      continue;
    }

    if (character === '%') {
      bytes.push(parseInt(encoded.slice(index + 1, index + 3), 16));
      index += 2;
      continue;
    }

    bytes.push(character.charCodeAt(0));
  }

  return new Uint8Array(bytes);
}

function rightRotate(value: number, amount: number) {
  return (value >>> amount) | (value << (32 - amount));
}

function sha256(input: Uint8Array) {
  const constants = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
  ];

  const hash = [
    0x6a09e667,
    0xbb67ae85,
    0x3c6ef372,
    0xa54ff53a,
    0x510e527f,
    0x9b05688c,
    0x1f83d9ab,
    0x5be0cd19,
  ];

  const bitLength = input.length * 8;
  const paddedLength = (((input.length + 9 + 63) >> 6) << 6);
  const padded = new Uint8Array(paddedLength);
  padded.set(input);
  padded[input.length] = 0x80;

  const dataView = new DataView(padded.buffer);
  dataView.setUint32(paddedLength - 4, bitLength >>> 0, false);
  dataView.setUint32(paddedLength - 8, Math.floor(bitLength / 0x100000000), false);

  const words = new Uint32Array(64);

  for (let offset = 0; offset < padded.length; offset += 64) {
    for (let index = 0; index < 16; index += 1) {
      words[index] = dataView.getUint32(offset + index * 4, false);
    }

    for (let index = 16; index < 64; index += 1) {
      const word15 = words[index - 15] ?? 0;
      const word2 = words[index - 2] ?? 0;
      const word16 = words[index - 16] ?? 0;
      const word7 = words[index - 7] ?? 0;
      const s0 = rightRotate(word15, 7) ^ rightRotate(word15, 18) ^ (word15 >>> 3);
      const s1 = rightRotate(word2, 17) ^ rightRotate(word2, 19) ^ (word2 >>> 10);
      words[index] = (((word16 + s0) >>> 0) + ((word7 + s1) >>> 0)) >>> 0;
    }

    let a = hash[0] ?? 0;
    let b = hash[1] ?? 0;
    let c = hash[2] ?? 0;
    let d = hash[3] ?? 0;
    let e = hash[4] ?? 0;
    let f = hash[5] ?? 0;
    let g = hash[6] ?? 0;
    let h = hash[7] ?? 0;

    for (let index = 0; index < 64; index += 1) {
      const currentConstant = constants[index] ?? 0;
      const currentWord = words[index] ?? 0;
      const s1 = rightRotate(e, 6) ^ rightRotate(e, 11) ^ rightRotate(e, 25);
      const ch = (e & f) ^ (~e & g);
      const temp1 = (((((h + s1) >>> 0) + ch) >>> 0) + currentConstant + currentWord) >>> 0;
      const s0 = rightRotate(a, 2) ^ rightRotate(a, 13) ^ rightRotate(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (s0 + maj) >>> 0;

      h = g;
      g = f;
      f = e;
      e = (d + temp1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (temp1 + temp2) >>> 0;
    }

    hash[0] = ((hash[0] ?? 0) + a) >>> 0;
    hash[1] = ((hash[1] ?? 0) + b) >>> 0;
    hash[2] = ((hash[2] ?? 0) + c) >>> 0;
    hash[3] = ((hash[3] ?? 0) + d) >>> 0;
    hash[4] = ((hash[4] ?? 0) + e) >>> 0;
    hash[5] = ((hash[5] ?? 0) + f) >>> 0;
    hash[6] = ((hash[6] ?? 0) + g) >>> 0;
    hash[7] = ((hash[7] ?? 0) + h) >>> 0;
  }

  const output = new Uint8Array(32);
  const outputView = new DataView(output.buffer);
  hash.forEach((value, index) => {
    outputView.setUint32(index * 4, value, false);
  });

  return output;
}

function getRandomBytes(length: number) {
  const bytes = new Uint8Array(length);
  const crypto = getCrypto();

  if (crypto?.getRandomValues) {
    return crypto.getRandomValues(bytes);
  }

  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = Math.floor(Math.random() * 256);
  }

  return bytes;
}

async function createPkceVerifier() {
  return toBase64Url(getRandomBytes(32));
}

async function createPkceChallenge(verifier: string) {
  return toBase64Url(sha256(toUtf8Bytes(verifier)));
}

function toUrl(path: string) {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${appEnv.supabaseUrl}${normalizedPath}`;
}

function wait(ms: number) {
  return new Promise<void>((resolve) => setTimeout(() => resolve(), ms));
}

function isAbortError(error: unknown) {
  return error instanceof Error && error.name === 'AbortError';
}

function isTransientNetworkError(error: unknown) {
  if (!(error instanceof Error)) {
    return false;
  }

  const message = error.message.toLowerCase();
  return (
    isAbortError(error) ||
    message.includes('network request failed') ||
    message.includes('network error') ||
    message.includes('failed to fetch') ||
    message.includes('fetch failed') ||
    message.includes('timed out')
  );
}

function shouldRetryStatus(status: number) {
  return status === 408 || status === 429 || status >= 500;
}

async function fetchWithTimeout(input: string, init: RequestInit, timeoutMs: number) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(input, {
      ...init,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
}

function withQuery(path: string, query?: Record<string, string | number | boolean | undefined>) {
  const url = new URL(toUrl(path));
  Object.entries(query ?? {}).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      url.searchParams.set(key, String(value));
    }
  });
  return url.toString();
}

async function request<T>(path: string, options?: {
  method?: HttpMethod;
  body?: unknown;
  headers?: Record<string, string>;
  query?: Record<string, string | number | boolean | undefined>;
  auth?: boolean;
  retryable?: boolean;
  timeoutMs?: number;
}): Promise<T> {
  assertBackendConfig();

  const requiresAuth = options?.auth === true;
  let authSession = requiresAuth ? await ensureAuthenticatedSession() : currentSession;
  if (requiresAuth && !authSession) {
    throw new Error('Please sign in again to continue.');
  }
  const method = options?.method ?? 'GET';
  const retryable = options?.retryable ?? method === 'GET';
  const maxAttempts = (retryable ? 2 : 1) + (requiresAuth ? 1 : 0);
  const timeoutMs = options?.timeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS;
  const url = withQuery(path, options?.query);
  let authRefreshAttempted = false;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    let response: Response;

    try {
      response = await fetchWithTimeout(url, {
        method,
        headers: {
          apikey: appEnv.supabaseAnonKey,
          'Content-Type': 'application/json',
          ...(options?.auth && authSession ? { Authorization: `Bearer ${authSession.access_token}` } : {}),
          ...options?.headers,
        },
        body: options?.body ? JSON.stringify(options.body) : undefined,
      }, timeoutMs);
    } catch (error) {
      if (attempt < maxAttempts && isTransientNetworkError(error)) {
        logWarn('Retrying Supabase request after transient network failure.', {
          path,
          method,
          attempt,
        });
        await wait(300 * attempt);
        continue;
      }

      logError('Supabase request failed before receiving a response.', error, {
        path,
        method,
      });

      if (isAbortError(error)) {
        throw new Error('The request took too long. Please try again.');
      }

      throw error;
    }

    if (!response.ok) {
      let message = 'Supabase request failed.';
      try {
        const errorBody = (await response.json()) as { msg?: string; error_description?: string; message?: string };
        message = errorBody.message ?? errorBody.error_description ?? errorBody.msg ?? message;
      } catch {
        message = response.statusText || message;
      }

      const normalizedMessage = message.toLowerCase();
      const isAuthFailure =
        requiresAuth &&
        (response.status === 401 ||
          normalizedMessage.includes('authentication required') ||
          normalizedMessage.includes('invalid jwt') ||
          normalizedMessage.includes('jwt'));

      if (isAuthFailure && authSession?.refresh_token && !authRefreshAttempted) {
        authRefreshAttempted = true;
        logWarn('Refreshing Supabase session after an authentication failure.', {
          path,
          method,
          status: response.status,
        });

        try {
          authSession = await refreshSession(authSession.refresh_token);
          continue;
        } catch {
          await setCurrentSession(null);
          throw new Error('Your session has expired. Please sign in again.');
        }
      }

      if (isAuthFailure) {
        const expiredUserId = authSession?.user?.id;
        await setCurrentSession(null);
        throw new Error('Your session has expired. Please sign in again.');
      }

      if (attempt < maxAttempts && shouldRetryStatus(response.status)) {
        logWarn('Retrying Supabase request after transient HTTP failure.', {
          path,
          method,
          attempt,
          status: response.status,
        });
        await wait(300 * attempt);
        continue;
      }

      logError('Supabase request returned an error response.', undefined, {
        path,
        method,
        status: response.status,
        message,
      });
      throw new Error(message);
    }

    if (response.status === 204) {
      return undefined as T;
    }

    return (await response.json()) as T;
  }

  throw new Error('Supabase request failed.');
}

export function getSession() {
  return currentSession;
}

export function getAuthRedirectUrl() {
  return `${appEnv.supabaseRedirectScheme}://auth/callback`;
}

export async function exchangeCodeForSession(code: string) {
  const codeVerifier = await AsyncStorage.getItem(PKCE_VERIFIER_KEY);

  if (!codeVerifier) {
    throw new Error('Missing PKCE verifier. Please try Google sign-in again.');
  }

  try {
    const session = await request<SupabaseSession>('/auth/v1/token', {
      method: 'POST',
      query: { grant_type: 'pkce' },
      body: {
        auth_code: code,
        code_verifier: codeVerifier,
      },
    });

    return setCurrentSession(session);
  } finally {
    await AsyncStorage.removeItem(PKCE_VERIFIER_KEY);
  }
}

export async function hydrateSessionFromUrl(url: string) {
  const normalized = url.includes('#') ? url.replace('#', '?') : url;
  const parsed = new URL(normalized);
  const code = parsed.searchParams.get('code');
  const accessToken = parsed.searchParams.get('access_token');
  const refreshToken = parsed.searchParams.get('refresh_token');
  const expiresIn = parsed.searchParams.get('expires_in');
  const errorDescription = parsed.searchParams.get('error_description') ?? parsed.searchParams.get('error');

  if (errorDescription) {
    throw new Error(decodeURIComponent(errorDescription));
  }

  if (code) {
    return exchangeCodeForSession(code);
  }

  if (!accessToken || !refreshToken || !expiresIn) {
    throw new Error('Missing authorization code in OAuth redirect.');
  }

  const session = await request<SupabaseSession['user']>('/auth/v1/user', {
    auth: false,
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  }).then((user) => ({
    access_token: accessToken,
    refresh_token: refreshToken,
    expires_in: Number(expiresIn),
    token_type: 'bearer',
    user,
  } as SupabaseSession));

  return setCurrentSession(session);
}

export async function initializeSession() {
  return ensureAuthenticatedSession();
}

export async function getAuthenticatedAccessToken() {
  const session = await ensureAuthenticatedSession();
  return session?.access_token ?? null;
}

export async function signInWithPassword(email: string, password: string) {
  const session = await request<SupabaseSession>('/auth/v1/token', {
    method: 'POST',
    query: { grant_type: 'password' },
    body: { email, password },
  });
  return setCurrentSession(session);
}

export async function signUpWithPassword(payload: {
  email: string;
  password: string;
  fullName: string;
  requestedRole: 'student' | 'admin';
}) {
  const session = await request<SupabaseSession | { user: SupabaseSession['user']; session: SupabaseSession | null }>(
    '/auth/v1/signup',
    {
      method: 'POST',
      query: {
        redirect_to: getAuthRedirectUrl(),
      },
      body: {
        email: payload.email,
        password: payload.password,
        data: {
          full_name: payload.fullName,
          requested_role: payload.requestedRole,
        },
      },
    },
  );

  const normalized = 'access_token' in session ? session : session.session;
  if (!normalized) {
    await setCurrentSession(null);
    return null;
  }

  return setCurrentSession(normalized);
}

export async function signInWithOAuth() {
  assertBackendConfig();

  const codeVerifier = await createPkceVerifier();
  const codeChallenge = await createPkceChallenge(codeVerifier);
  await AsyncStorage.setItem(PKCE_VERIFIER_KEY, codeVerifier);

  const oauthUrl = withQuery('/auth/v1/authorize', {
    provider: 'google',
    redirect_to: getAuthRedirectUrl(),
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
  });
  await Linking.openURL(oauthUrl);
}

export async function signOutSession() {
  const session = await loadStoredSession();
  if (!session) {
    return;
  }

  try {
    await request('/auth/v1/logout', {
      method: 'POST',
      auth: true,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
    if (
      !message.includes('session_id claim in jwt does not exist') &&
      !message.includes('invalid session') &&
      !message.includes('session not found')
    ) {
      throw error;
    }
  } finally {
    await setCurrentSession(null);
  }
}

export async function selectRows<T>(from: string, select: string, query?: Record<string, string | number | boolean | undefined>) {
  return request<T[]>(`/rest/v1/${from}`, {
    auth: true,
    headers: {
      Prefer: 'return=representation',
    },
    query: {
      select,
      ...query,
    },
  });
}

export async function maybeSingleRow<T>(from: string, select: string, query?: Record<string, string | number | boolean | undefined>) {
  const rows = await selectRows<T>(from, select, query);
  return rows[0] ?? null;
}

export async function insertRow<T>(from: string, body: unknown) {
  const rows = await request<T[]>(`/rest/v1/${from}`, {
    method: 'POST',
    auth: true,
    headers: {
      Prefer: 'return=representation',
    },
    body,
  });
  return rows[0];
}

export async function insertRows<T>(from: string, body: unknown[]) {
  return request<T[]>(`/rest/v1/${from}`, {
    method: 'POST',
    auth: true,
    headers: {
      Prefer: 'return=representation',
    },
    body,
  });
}

export async function upsertRows<T>(from: string, body: unknown, onConflict?: string) {
  const query = onConflict ? { on_conflict: onConflict } : undefined;
  return request<T[]>(`/rest/v1/${from}`, {
    method: 'POST',
    auth: true,
    headers: {
      Prefer: 'resolution=merge-duplicates,return=representation',
    },
    query,
    body,
  });
}

export async function deleteRows(from: string, query?: Record<string, string | number | boolean | undefined>) {
  return request<void>(`/rest/v1/${from}`, {
    method: 'DELETE',
    auth: true,
    query,
  });
}

export async function updateRows<T>(from: string, body: unknown, query?: Record<string, string | number | boolean | undefined>) {
  return request<T[]>(`/rest/v1/${from}`, {
    method: 'PATCH',
    auth: true,
    headers: {
      Prefer: 'return=representation',
    },
    body,
    query,
  });
}

export async function rpc<T>(name: string, body?: Record<string, unknown>, options?: { retryable?: boolean; timeoutMs?: number }) {
  return request<T>(`/rest/v1/rpc/${name}`, {
    method: 'POST',
    auth: true,
    body,
    retryable: options?.retryable ?? false,
    timeoutMs: options?.timeoutMs,
  });
}

export async function invokeEdgeFunction<T>(
  name: string,
  body?: Record<string, unknown>,
  options?: {
    retryable?: boolean;
    timeoutMs?: number;
    errorLogLevel?: 'error' | 'warn' | 'silent';
  },
) {
  assertBackendConfig();
  const retryable = options?.retryable ?? false;
  const maxAttempts = retryable ? 2 : 1;
  const timeoutMs = options?.timeoutMs ?? DEFAULT_FUNCTION_TIMEOUT_MS;
  const errorLogLevel = options?.errorLogLevel ?? 'error';
  const logFunctionError = (message: string, error?: unknown, context?: Record<string, unknown>) => {
    if (errorLogLevel === 'silent') {
      return;
    }

    if (errorLogLevel === 'warn') {
      logWarn(message, {
        ...context,
        ...(error ? { error } : {}),
      });
      return;
    }

    logError(message, error, context);
  };
  const callFunction = async (session: SupabaseSession | null) =>
    fetchWithTimeout(`${appEnv.supabaseUrl}/functions/v1/${name}`, {
      method: 'POST',
      headers: {
        apikey: appEnv.supabaseAnonKey,
        'Content-Type': 'application/json',
        ...(session ? { Authorization: `Bearer ${session.access_token}` } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    }, timeoutMs);

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    let session = await ensureAuthenticatedSession();
    let response: Response;

    try {
      response = await callFunction(session);
    } catch (error) {
      if (attempt < maxAttempts && isTransientNetworkError(error)) {
        logWarn('Retrying edge function after transient network failure.', {
          name,
          attempt,
        });
        await wait(500 * attempt);
        continue;
      }

      logFunctionError('Edge function call failed before receiving a response.', error, { name });

      if (isAbortError(error)) {
        throw new Error('The request took too long. Please try again.');
      }

      throw error;
    }

    if (response.status === 401 && session?.refresh_token) {
      session = await refreshSession(session.refresh_token);
      response = await callFunction(session);
    }

    if (!response.ok) {
      if (attempt < maxAttempts && shouldRetryStatus(response.status)) {
        logWarn('Retrying edge function after transient HTTP failure.', {
          name,
          attempt,
          status: response.status,
        });
        await wait(500 * attempt);
        continue;
      }

      let message = 'Supabase function call failed.';
      try {
        const errorBody = (await response.json()) as { error?: string; message?: string };
        message = errorBody.error ?? errorBody.message ?? message;
      } catch {
        message = response.statusText || message;
      }

      logFunctionError('Edge function returned an error response.', undefined, {
        name,
        status: response.status,
        message,
      });
      throw new Error(message);
    }

    return (await response.json()) as T;
  }

  throw new Error('Supabase function call failed.');
}

function sanitizePathSegment(value: string) {
  return value
    .trim()
    .replace(/\\/g, '/')
    .replace(/^\/+|\/+$/g, '')
    .replace(/\/{2,}/g, '/')
    .replace(/[^a-zA-Z0-9._/-]/g, '-');
}

function encodeStorageObjectPath(value: string) {
  return value
    .split('/')
    .filter(Boolean)
    .map((segment) => encodeURIComponent(segment))
    .join('/');
}

function normalizeLocalUri(uri: string) {
  if (
    uri.startsWith('blob:') ||
    uri.startsWith('data:') ||
    uri.startsWith('content://') ||
    uri.startsWith('file://') ||
    uri.startsWith('http://') ||
    uri.startsWith('https://')
  ) {
    return uri;
  }

  return `file://${uri}`;
}

export async function uploadFileToStorage(params: {
  bucket: string;
  folder: string;
  uri: string;
  name?: string;
  mimeType?: string;
  file?: Blob | File;
}) {
  assertBackendConfig();
  const session = await ensureAuthenticatedSession();

  if (!session) {
    throw new Error('Please sign in before uploading files.');
  }

  const sourceUri = params.uri;
  const extension =
    params.name?.includes('.') ? params.name.slice(params.name.lastIndexOf('.')) : params.mimeType === 'application/pdf' ? '.pdf' : '';
  const fileName = sanitizePathSegment(params.name ?? `${Date.now()}${extension}`);
  const folder = sanitizePathSegment(params.folder);
  const objectPath = `${folder}/${Date.now()}-${fileName}`;
  const encodedObjectPath = encodeStorageObjectPath(objectPath);
  const encodedBucket = encodeURIComponent(sanitizePathSegment(params.bucket));
  const normalizedUri = normalizeLocalUri(sourceUri);

  if (!folder || !fileName) {
    throw new Error('The selected file could not be mapped to a valid storage path.');
  }

  const requestHeaders: Record<string, string> = {
    apikey: appEnv.supabaseAnonKey,
    Authorization: `Bearer ${session.access_token}`,
    'x-upsert': 'true',
  };

  let requestBody: Blob | FormData;

  if (Platform.OS === 'android' || Platform.OS === 'ios') {
    const formData = new FormData();
    formData.append('file', {
      uri: normalizedUri,
      name: fileName,
      type: params.mimeType ?? 'application/octet-stream',
    } as never);
    requestBody = formData;
  } else if (params.file) {
    requestBody = params.file;
    requestHeaders['Content-Type'] = params.mimeType ?? params.file.type ?? 'application/octet-stream';
  } else {
    const fileResponse = await fetch(normalizedUri);
    if (!fileResponse.ok) {
      throw new Error('Unable to read the selected file from your device.');
    }
    requestBody = await fileResponse.blob();
    requestHeaders['Content-Type'] = params.mimeType ?? requestBody.type ?? 'application/octet-stream';
  }

  const response = await fetch(
    `${appEnv.supabaseUrl}/storage/v1/object/${encodedBucket}/${encodedObjectPath}`,
    {
      method: 'POST',
      headers: requestHeaders,
      body: requestBody,
    },
  );

  if (!response.ok) {
    let message = 'File upload failed.';
    try {
      const errorBody = (await response.json()) as { message?: string; error?: string };
      message = errorBody.message ?? errorBody.error ?? message;
    } catch {
      message = response.statusText || message;
    }
    throw new Error(message);
  }

  return {
    path: objectPath,
    publicUrl: `${appEnv.supabaseUrl}/storage/v1/object/public/${encodedBucket}/${encodedObjectPath}`,
  };
}
