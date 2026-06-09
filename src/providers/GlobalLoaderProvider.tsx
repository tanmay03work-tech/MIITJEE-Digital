import React, { createContext, useContext, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { BrandLoadingState } from '../components/common/BrandLoadingState';

type LoaderConfig = {
  title?: string;
  subtitle?: string;
};

type LoaderContextValue = {
  loading: boolean;
  showLoader: (config?: LoaderConfig) => void;
  hideLoader: () => void;
};

const defaultLoaderConfig: Required<LoaderConfig> = {
  title: 'Loading MIITJEE Digital',
  subtitle: 'Please wait while we prepare the latest data for this screen.',
};

const LoaderContext = createContext<LoaderContextValue | undefined>(undefined);

export function useLoader() {
  const context = useContext(LoaderContext);

  if (!context) {
    throw new Error('useLoader must be used within GlobalLoaderProvider');
  }

  return context;
}

interface GlobalLoaderProviderProps {
  children: React.ReactNode;
}

export function GlobalLoaderProvider({ children }: GlobalLoaderProviderProps) {
  const [loading, setLoading] = useState(false);
  const [config, setConfig] = useState<Required<LoaderConfig>>(defaultLoaderConfig);

  const value = useMemo<LoaderContextValue>(
    () => ({
      loading,
      showLoader: (nextConfig) => {
        setConfig({
          title: nextConfig?.title ?? defaultLoaderConfig.title,
          subtitle: nextConfig?.subtitle ?? defaultLoaderConfig.subtitle,
        });
        setLoading(true);
      },
      hideLoader: () => {
        setLoading(false);
      },
    }),
    [loading],
  );

  return (
    <LoaderContext.Provider value={value}>
      {children}
      {loading ? (
        <View style={styles.overlay} pointerEvents="auto">
          <BrandLoadingState title={config.title} subtitle={config.subtitle} variant="overlay" />
        </View>
      ) : null}
    </LoaderContext.Provider>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(9, 15, 28, 0.32)',
    padding: 24,
  },
});
