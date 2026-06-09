import { create } from 'zustand';

export interface AppDialogButton {
  text: string;
  style?: 'default' | 'cancel' | 'destructive';
  onPress?: () => void;
}

interface AppDialogState {
  title: string;
  message?: string;
  buttons: AppDialogButton[];
  cancelable: boolean;
  onDismiss?: () => void;
}

interface UIState {
  dialog: AppDialogState | null;
  showDialog: (dialog: AppDialogState) => void;
  hideDialog: () => void;
}

export const useUIStore = create<UIState>((set) => ({
  dialog: null,
  showDialog: (dialog) => set({ dialog }),
  hideDialog: () => set((state) => {
    state.dialog?.onDismiss?.();
    return { dialog: null };
  }),
}));
