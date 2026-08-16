import { supabasePublicConfig } from './supabase.public';

declare const process:
  | {
      env?: Record<string, string | undefined>;
    }
  | undefined;

function readEnv(name: string, fallback?: string) {
  let metaEnv: Record<string, string> | undefined;
  try {
    metaEnv = new Function('return typeof import.meta !== "undefined" ? import.meta.env : undefined')() as Record<string, string> | undefined;
  } catch {
    metaEnv = undefined;
  }
  const metaVal = metaEnv?.[name] || metaEnv?.[`VITE_${name}`];
  const procVal = process?.env?.[name] || process?.env?.[`VITE_${name}`];
  const val = metaVal || procVal;
  return (val === undefined || val === '') ? fallback : val;
}

function cleanEnvValue(value: string | undefined, fallback = '') {
  const normalized = (value || fallback).trim();
  return normalized.replace(/^['"]|['"]$/g, '');
}

function normalizeBaseUrl(value: string | undefined, fallback = '') {
  return cleanEnvValue(value, fallback).replace(/\/+$/, '');
}

function isLikelyHttpOrHttpsUrl(value: string) {
  return /^https?:\/\/[^/\s]+(?:\/.*)?$/i.test(value);
}

const rawWorkerUrl =
  (typeof process !== 'undefined' && process.env?.MIITJEE_BACKEND_URL) ||
  (typeof process !== 'undefined' && process.env?.CLOUDFLARE_WORKER_URL) ||
  readEnv('MIITJEE_BACKEND_URL') ||
  readEnv('CLOUDFLARE_WORKER_URL') ||
  supabasePublicConfig.workerUrl;

const rawSupabaseUrl =
  (typeof process !== 'undefined' && process.env?.SUPABASE_URL) ||
  readEnv('SUPABASE_URL') ||
  supabasePublicConfig.url;

const rawSupabaseAnonKey =
  (typeof process !== 'undefined' && process.env?.SUPABASE_ANON_KEY) ||
  readEnv('SUPABASE_ANON_KEY') ||
  supabasePublicConfig.anonKey;

export const appEnv = {
  supabaseUrl: normalizeBaseUrl(rawSupabaseUrl, supabasePublicConfig.url),
  supabaseAnonKey: cleanEnvValue(rawSupabaseAnonKey, supabasePublicConfig.anonKey),
  workerBaseUrl: normalizeBaseUrl(rawWorkerUrl, supabasePublicConfig.workerUrl),
  supabaseRedirectScheme: supabasePublicConfig.redirectScheme,
  appPlatform: supabasePublicConfig.appPlatform,
};

export function assertBackendConfig() {
  if (!appEnv.supabaseUrl || !appEnv.supabaseAnonKey) {
    throw new Error('Supabase environment is missing. Set SUPABASE_URL and SUPABASE_ANON_KEY before continuing.');
  }

  if (!isLikelyHttpOrHttpsUrl(appEnv.supabaseUrl)) {
    throw new Error('SUPABASE_URL is invalid. Use your full HTTPS project URL, for example https://your-project.supabase.co.');
  }
}

export function assertWorkerConfig() {
  if (!appEnv.workerBaseUrl) {
    throw new Error('Worker environment is missing. Set MIITJEE_BACKEND_URL before continuing.');
  }

  if (!isLikelyHttpOrHttpsUrl(appEnv.workerBaseUrl)) {
    throw new Error('MIITJEE_BACKEND_URL is invalid. Use a full HTTP or HTTPS base URL.');
  }
}
