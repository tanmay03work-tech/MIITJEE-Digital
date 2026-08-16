// Web polyfill for @react-native-community/netinfo
import { useEffect, useState } from 'react';

interface NetInfoState {
  type: string;
  isConnected: boolean | null;
  isInternetReachable: boolean | null;
  details: any;
}

function getCurrentState(): NetInfoState {
  return {
    type: typeof navigator !== 'undefined' && navigator.onLine ? 'wifi' : 'none',
    isConnected: typeof navigator !== 'undefined' ? navigator.onLine : true,
    isInternetReachable: typeof navigator !== 'undefined' ? navigator.onLine : true,
    details: null,
  };
}

function addEventListener(callback: (state: NetInfoState) => void) {
  const handleOnline = () => callback(getCurrentState());
  const handleOffline = () => callback(getCurrentState());

  if (typeof window !== 'undefined') {
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
  }

  return () => {
    if (typeof window !== 'undefined') {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    }
  };
}

function fetch(): Promise<NetInfoState> {
  return Promise.resolve(getCurrentState());
}

export function useNetInfo(): NetInfoState {
  const [state, setState] = useState(getCurrentState());

  useEffect(() => {
    return addEventListener(setState);
  }, []);

  return state;
}

export default {
  addEventListener,
  fetch,
  useNetInfo,
};
