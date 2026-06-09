import { create } from 'zustand';

interface ConnectivityState {
  isOffline: boolean;
  setOffline: (value: boolean) => void;
}

export const useConnectivityStore = create<ConnectivityState>((set) => ({
  isOffline: false,
  setOffline: (value) => set({ isOffline: value }),
}));
