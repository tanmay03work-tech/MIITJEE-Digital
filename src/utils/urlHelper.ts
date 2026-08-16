declare const process: { env: Record<string, string | undefined> };

export function getBaseAppUrl(): string {
  // 1. Web browser window origin (if running in web browser)
  if (typeof window !== 'undefined' && window.location && window.location.origin) {
    return window.location.origin;
  }
  // 2. Configured env variable EXPO_PUBLIC_APP_URL
  if (process.env.EXPO_PUBLIC_APP_URL) {
    return process.env.EXPO_PUBLIC_APP_URL.replace(/\/$/, '');
  }
  // 3. Vercel deployment URL
  if (process.env.EXPO_PUBLIC_VERCEL_URL) {
    const vercelUrl = process.env.EXPO_PUBLIC_VERCEL_URL.replace(/\/$/, '');
    return vercelUrl.startsWith('http') ? vercelUrl : `https://${vercelUrl}`;
  }
  // 4. Deployed Vercel project default fallback
  return 'https://miitjee-digital.vercel.app';
}

export function getExamShareUrl(shareCode: string): string {
  const baseUrl = getBaseAppUrl();
  return `${baseUrl}/exam/${shareCode}`;
}
