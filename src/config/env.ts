import { supabasePublicConfig } from './supabase.public';

declare const process:
  | {
      env?: Record<string, string | undefined>;
    }
  | undefined;

function readEnv(name: string, fallback?: string) {
  const val = process?.env?.[name];
  return (val === undefined || val === '') ? fallback : val;
}

function cleanEnvValue(value: string | undefined, fallback = '') {
  const normalized = (value || fallback).trim();
  return normalized.replace(/^['"]|['"]$/g, '');
}

function normalizeBaseUrl(value: string | undefined, fallback = '') {
  return cleanEnvValue(value, fallback).replace(/\/+$/, '');
}

function isLikelyHttpsUrl(value: string) {
  return /^https:\/\/[^/\s]+(?:\/.*)?$/i.test(value);
}

export const appEnv = {
  supabaseUrl: normalizeBaseUrl(readEnv('SUPABASE_URL'), supabasePublicConfig.url),
  supabaseAnonKey: cleanEnvValue(readEnv('SUPABASE_ANON_KEY'), supabasePublicConfig.anonKey),
  workerBaseUrl: normalizeBaseUrl(readEnv(
    'MIITJEE_BACKEND_URL',
    readEnv('CLOUDFLARE_WORKER_URL', supabasePublicConfig.workerUrl),
  )),
  supabaseRedirectScheme: supabasePublicConfig.redirectScheme,
  appPlatform: supabasePublicConfig.appPlatform,
};

export function assertBackendConfig() {
  if (!appEnv.supabaseUrl || !appEnv.supabaseAnonKey) {
    throw new Error('Supabase environment is missing. Set SUPABASE_URL and SUPABASE_ANON_KEY before continuing.');
  }

  if (!isLikelyHttpsUrl(appEnv.supabaseUrl)) {
    throw new Error('SUPABASE_URL is invalid. Use your full HTTPS project URL, for example https://your-project.supabase.co.');
  }
}

export function assertWorkerConfig() {
  if (!appEnv.workerBaseUrl) {
    throw new Error('Worker environment is missing. Set MIITJEE_BACKEND_URL before continuing.');
  }

  if (!isLikelyHttpsUrl(appEnv.workerBaseUrl)) {
    throw new Error('MIITJEE_BACKEND_URL is invalid. Use a full HTTPS base URL.');
  }
}
