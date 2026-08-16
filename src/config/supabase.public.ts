const getInitialWorkerUrl = () => {
  if (
    typeof window !== 'undefined' &&
    window.location.protocol !== 'file:' &&
    (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
  ) {
    return 'http://127.0.0.1:8787';
  }
  return 'https://miitjee-backend.miitjee-api.workers.dev';
};

export const supabasePublicConfig = {
  url: 'https://uwuzdggimbbbfgcauzho.supabase.co',
  anonKey: 'sb_publishable_2hMbPMAYceagP86WVmzZEQ_BDkMMXLp',
  workerUrl: getInitialWorkerUrl(),
  redirectScheme: 'com.miitjee.digital',
  appPlatform: 'android',
} as const;
