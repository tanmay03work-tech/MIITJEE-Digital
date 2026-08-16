import { Linking, Platform } from 'react-native';
import { appEnv } from '../config/env';
import { AppVersionInfo, CURRENT_APP_VERSION } from '../constants/version';

/**
 * Compare two semver-like version strings (e.g. "1.2.0" vs "1.1.0").
 * Returns:
 *   1 if v1 > v2
 *  -1 if v1 < v2
 *   0 if v1 === v2
 */
export function compareSemver(v1: string, v2: string): number {
  const parse = (v: string) => v.replace(/^v/i, '').split('.').map((num) => parseInt(num, 10) || 0);
  const p1 = parse(v1);
  const p2 = parse(v2);
  const maxLength = Math.max(p1.length, p2.length);

  for (let i = 0; i < maxLength; i++) {
    const num1 = p1[i] ?? 0;
    const num2 = p2[i] ?? 0;
    if (num1 > num2) return 1;
    if (num1 < num2) return -1;
  }
  return 0;
}

export interface CheckUpdateResult {
  hasUpdate: boolean;
  isForceUpdate: boolean;
  versionInfo: AppVersionInfo;
}

/**
 * Check if a new version of the app is available remotely.
 */
export async function checkForAppUpdate(): Promise<CheckUpdateResult | null> {
  try {
    const timestamp = Date.now();
    // Primary & Fallback URLs for update check across Android, Web, and Desktop
    const urlsToTry = [
      `${appEnv.supabaseUrl}/rest/v1/app_versions?select=*&t=${timestamp}`,
      `./version.json?t=${timestamp}`,
      appEnv.workerBaseUrl ? `${appEnv.workerBaseUrl}/api/version?t=${timestamp}` : null,
    ].filter(Boolean) as string[];

    let remoteConfig: AppVersionInfo | null = null;

    for (const url of urlsToTry) {
      try {
        const headers: Record<string, string> = { 'Cache-Control': 'no-cache, no-store' };
        if (appEnv.supabaseAnonKey && url.includes(appEnv.supabaseUrl)) {
          headers.apikey = appEnv.supabaseAnonKey;
          headers.Authorization = `Bearer ${appEnv.supabaseAnonKey}`;
        }

        const response = await fetch(url, { headers });
        if (response.ok) {
          const rawData = await response.json();
          const data = Array.isArray(rawData) ? rawData[0] : rawData;
          if (data) {
            const latest = data.latestVersion ?? data.latest_version;
            if (typeof latest === 'string' && latest) {
              remoteConfig = {
                latestVersion: latest,
                minRequiredVersion: data.minRequiredVersion ?? data.min_required_version ?? '1.0.0',
                downloadUrl: data.downloadUrl ?? data.download_url ?? 'https://miitjee.com',
                forceUpdate: Boolean(data.forceUpdate ?? data.force_update),
                releaseNotes: data.releaseNotes ?? data.release_notes ?? 'New features and performance improvements.',
                title: data.title ?? 'New Update Available! 🚀',
              };
              break;
            }
          }
        }
      } catch (err) {
        // Continue to next fallback URL
      }
    }

    if (!remoteConfig) {
      return null;
    }

    const hasUpdate = compareSemver(remoteConfig.latestVersion, CURRENT_APP_VERSION) > 0;
    
    let isForceUpdate = Boolean(remoteConfig.forceUpdate);
    if (remoteConfig.minRequiredVersion) {
      if (compareSemver(CURRENT_APP_VERSION, remoteConfig.minRequiredVersion) < 0) {
        isForceUpdate = true;
      }
    }

    return {
      hasUpdate,
      isForceUpdate,
      versionInfo: remoteConfig,
    };
  } catch (error) {
    console.warn('[UpdateChecker] Failed to check for app update:', error);
    return null;
  }
}

/**
 * Perform app update action based on platform.
 */
export async function triggerAppUpdate(downloadUrl?: string): Promise<void> {
  const urlToOpen = downloadUrl || 'https://miitjee.com';

  if (Platform.OS === 'web') {
    if (typeof window !== 'undefined' && window.location) {
      // Force cache-busting reload on web to fetch newly deployed assets
      if (urlToOpen === 'https://miitjee.com' || urlToOpen.includes(window.location.hostname)) {
        const cleanUrl = window.location.href.split('?')[0];
        window.location.href = `${cleanUrl}?v=${Date.now()}`;
        return;
      }
    }
  }

  try {
    const supported = await Linking.canOpenURL(urlToOpen);
    if (supported) {
      await Linking.openURL(urlToOpen);
    } else if (Platform.OS === 'web' && typeof window !== 'undefined') {
      window.open(urlToOpen, '_blank');
    }
  } catch (err) {
    console.error('[UpdateChecker] Error opening update URL:', err);
  }
}
