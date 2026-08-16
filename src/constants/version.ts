export const CURRENT_APP_VERSION = '1.2.0';

export interface AppVersionInfo {
  latestVersion: string;
  minRequiredVersion?: string;
  downloadUrl: string;
  forceUpdate?: boolean;
  releaseNotes?: string;
  title?: string;
}

// Fallback version URL (static public version file)
export const PUBLIC_VERSION_URL = 'https://miitjee.com/version.json';
