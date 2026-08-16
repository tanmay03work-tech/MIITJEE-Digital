import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  base: '/',
  plugins: [react()],
  define: {
    'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV || 'development'),
    'process.env.SUPABASE_URL': JSON.stringify(process.env.SUPABASE_URL || 'https://uwuzdggimbbbfgcauzho.supabase.co'),
    'process.env.SUPABASE_ANON_KEY': JSON.stringify(process.env.SUPABASE_ANON_KEY || 'sb_publishable_2hMbPMAYceagP86WVmzZEQ_BDkMMXLp'),
    'process.env.MIITJEE_BACKEND_URL': JSON.stringify(
      (process.env.NODE_ENV === 'production' || process.env.VITE_USER_NODE_ENV === 'production')
        ? (process.env.MIITJEE_BACKEND_URL && !process.env.MIITJEE_BACKEND_URL.includes('127.0.0.1') && !process.env.MIITJEE_BACKEND_URL.includes('localhost')
            ? process.env.MIITJEE_BACKEND_URL
            : 'https://miitjee-backend.miitjee-api.workers.dev')
        : (process.env.MIITJEE_BACKEND_URL || 'http://127.0.0.1:8787')
    ),
    'process.env': '{}',
    global: 'window',
    __DEV__: JSON.stringify(process.env.NODE_ENV !== 'production'),
  },
  resolve: {
    alias: [
      // Core React Native -> React Native Web
      { find: /^react-native$/, replacement: 'react-native-web' },

      // Navigation (these packages have built-in web support, no alias needed)
      // But react-native-screens needs a polyfill
      { find: 'react-native-screens', replacement: path.resolve(__dirname, 'src/polyfills/screens-web.ts') },

      // Native module polyfills
      { find: 'react-native-gesture-handler', replacement: path.resolve(__dirname, 'src/polyfills/gesture-handler-web.tsx') },
      { find: 'react-native-safe-area-context', replacement: path.resolve(__dirname, 'src/polyfills/safe-area-context-web.tsx') },
      { find: 'react-native-reanimated', replacement: path.resolve(__dirname, 'src/polyfills/reanimated-web.tsx') },
      { find: 'react-native-svg', replacement: path.resolve(__dirname, 'src/polyfills/svg-web.tsx') },
      { find: 'react-native-worklets', replacement: path.resolve(__dirname, 'src/polyfills/worklets-web.ts') },

      // Community module polyfills
      { find: '@react-native-community/netinfo', replacement: path.resolve(__dirname, 'src/polyfills/netinfo-web.ts') },
      { find: '@react-native-async-storage/async-storage', replacement: path.resolve(__dirname, 'src/polyfills/async-storage-web.ts') },
      { find: '@react-native-community/datetimepicker', replacement: path.resolve(__dirname, 'src/components/common/DateTimePickerWeb.tsx') },

      // Other native module polyfills
      { find: 'react-native-document-picker', replacement: path.resolve(__dirname, 'src/components/common/DocumentPickerWeb.ts') },
      { find: 'react-native-splash-screen', replacement: path.resolve(__dirname, 'src/components/common/SplashScreenWeb.ts') },
      { find: 'react-native-linear-gradient', replacement: path.resolve(__dirname, 'src/components/common/LinearGradientWeb.tsx') },

      // Icon library
      { find: 'lucide-react-native', replacement: 'lucide-react' },
    ],
    extensions: ['.web.tsx', '.web.ts', '.web.js', '.tsx', '.ts', '.js'],
    dedupe: ['react', 'react-dom', 'react/jsx-runtime', 'react/jsx-dev-runtime'],
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
  server: {
    port: 3000,
  },
});
