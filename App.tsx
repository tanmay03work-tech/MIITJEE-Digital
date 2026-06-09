import React, { useEffect, useRef, useState } from 'react';
import { StatusBar } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AppErrorBoundary } from './src/components/common/AppErrorBoundary';
import { AppErrorFallback } from './src/components/common/AppErrorFallback';
import { AnimatedSplashScreen } from './src/components/common/AnimatedSplashScreen';
import { GlobalOfflineOverlay } from './src/components/common/GlobalOfflineOverlay';
import { InAppDialogHost } from './src/components/common/InAppDialogHost';
import { RootNavigator } from './src/navigation/RootNavigator';
import { GlobalLoaderProvider } from './src/providers/GlobalLoaderProvider';
import { installInAppAlertInterceptor } from './src/utils/installInAppAlertInterceptor';

installInAppAlertInterceptor();

export default function App() {
  const [showAnimatedSplash, setShowAnimatedSplash] = useState(true);
  const [fatalError, setFatalError] = useState<Error | null>(null);
  const previousGlobalHandlerRef = useRef<((error: Error, isFatal?: boolean) => void) | undefined>(undefined);

  useEffect(() => {
    const timeout = setTimeout(() => {
      setShowAnimatedSplash(false);
    }, 3000);

    return () => clearTimeout(timeout);
  }, []);

  useEffect(() => {
    const errorUtils = (globalThis as typeof globalThis & {
      ErrorUtils?: {
        getGlobalHandler?: () => (error: Error, isFatal?: boolean) => void;
        setGlobalHandler?: (handler: (error: Error, isFatal?: boolean) => void) => void;
      };
    }).ErrorUtils;

    if (!errorUtils?.setGlobalHandler) {
      return;
    }

    previousGlobalHandlerRef.current = errorUtils.getGlobalHandler?.();
    errorUtils.setGlobalHandler((error, isFatal) => {
      setFatalError(error);
      previousGlobalHandlerRef.current?.(error, isFatal);
    });

    return () => {
      if (previousGlobalHandlerRef.current) {
        errorUtils.setGlobalHandler?.(previousGlobalHandlerRef.current);
      }
    };
  }, []);

  if (fatalError) {
    return (
      <GestureHandlerRootView style={{ flex: 1 }}>
        <SafeAreaProvider>
          <StatusBar translucent backgroundColor="transparent" barStyle="dark-content" />
          <AppErrorFallback
            title="Something didn’t load correctly"
            message={fatalError.message || 'Please try again. The app switched to a safe recovery screen.'}
            onRetry={() => setFatalError(null)}
          />
        </SafeAreaProvider>
      </GestureHandlerRootView>
    );
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <StatusBar translucent backgroundColor="transparent" barStyle="dark-content" />
        <AppErrorBoundary>
          <GlobalLoaderProvider>
            <RootNavigator />
            <InAppDialogHost />
            <GlobalOfflineOverlay />
            {showAnimatedSplash ? <AnimatedSplashScreen /> : null}
          </GlobalLoaderProvider>
        </AppErrorBoundary>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
