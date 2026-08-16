/**
 * Hardware Fingerprint & Device Binding Service for CBT Desktop & Mobile
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { supabasePublicConfig } from '../../config/supabase.public';

const DEVICE_FINGERPRINT_CACHE_KEY = 'miitjee:cbt:device_fingerprint';

declare global {
  interface Window {
    electronAPI?: {
      getDeviceFingerprint: () => Promise<string>;
      getSystemDetails: () => Promise<{ deviceName: string; osVersion: string }>;
    };
  }
}

/**
 * Generates or retrieves a unique hardware fingerprint for device binding.
 */
export async function getOrGenerateDeviceFingerprint(): Promise<{
  fingerprint: string;
  deviceName: string;
  osVersion: string;
}> {
  // 1. Electron Desktop Hardware API
  const globalWin = globalThis as typeof globalThis & { window?: Window };
  if (typeof globalWin.window !== 'undefined' && globalWin.window.electronAPI?.getDeviceFingerprint) {
    try {
      const fingerprint = await globalWin.window.electronAPI.getDeviceFingerprint();
      const details = await globalWin.window.electronAPI.getSystemDetails();
      return {
        fingerprint,
        deviceName: details.deviceName || 'Windows PC',
        osVersion: details.osVersion || 'Windows 10/11'
      };
    } catch {
      // Fallback below
    }
  }

  // 2. Local Storage Cache Check
  const cached = await AsyncStorage.getItem(DEVICE_FINGERPRINT_CACHE_KEY);
  if (cached) {
    try {
      return JSON.parse(cached);
    } catch {
      // Re-generate below
    }
  }

  // 3. Fallback UUID Generation
  const randomUUID = 'DEV-' + Math.random().toString(36).substring(2, 10).toUpperCase() + '-' + Date.now().toString(36).toUpperCase();
  const payload = {
    fingerprint: randomUUID,
    deviceName: `${Platform.OS.toUpperCase()}-Device`,
    osVersion: `${Platform.OS} ${Platform.Version}`
  };

  await AsyncStorage.setItem(DEVICE_FINGERPRINT_CACHE_KEY, JSON.stringify(payload));
  return payload;
}

/**
 * Verifies and registers device binding with Cloudflare Workers Gateway.
 */
export async function registerDeviceBinding(userId: string): Promise<{
  success: boolean;
  status: 'NEWLY_BOUND' | 'RE_VERIFIED' | 'DEVICE_MISMATCH';
  message?: string;
}> {
  const { fingerprint, deviceName, osVersion } = await getOrGenerateDeviceFingerprint();
  const workerUrl = supabasePublicConfig.workerUrl;

  let lastErrorMsg = 'Device binding error';

  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const response = await fetch(`${workerUrl}/cbt/device/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: userId,
          device_fingerprint: fingerprint,
          device_name: deviceName,
          os_version: osVersion
        })
      });

      const resData = await response.json() as {
        error?: string;
        message?: string;
        status?: 'NEWLY_BOUND' | 'RE_VERIFIED';
      };

      if (!response.ok) {
        if (resData.error === 'DEVICE_MISMATCH') {
          return {
            success: false,
            status: 'DEVICE_MISMATCH',
            message: resData.message || 'Account bound to another computer.'
          };
        }

        // Retry on server-side HTTP errors (500, 502, 503, 429)
        if (response.status >= 500 || response.status === 429 || response.status === 408) {
          lastErrorMsg = resData.error || resData.message || `Server busy (${response.status})`;
          const jitter = Math.floor(Math.random() * 400);
          await new Promise((res) => setTimeout(res, attempt * 500 + jitter));
          continue;
        }

        return { success: false, status: 'DEVICE_MISMATCH', message: resData.error || 'Binding error' };
      }

      return {
        success: true,
        status: resData.status || 'RE_VERIFIED'
      };
    } catch (err: unknown) {
      lastErrorMsg = err instanceof Error ? err.message : String(err);
      if (attempt < 3) {
        const jitter = Math.floor(Math.random() * 400);
        await new Promise((res) => setTimeout(res, attempt * 500 + jitter));
      }
    }
  }

  return { success: false, status: 'DEVICE_MISMATCH', message: lastErrorMsg };
}
