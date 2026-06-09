import { Alert, AlertButton, AlertOptions } from 'react-native';

import { useUIStore } from '../store/uiStore';

let isInstalled = false;

function normalizeButtons(buttons?: AlertButton[]) {
  if (!buttons || buttons.length === 0) {
    return [{ text: 'OK' }];
  }

  return buttons.map((button) => ({
    text: button.text ?? 'OK',
    style: button.style,
    onPress: button.onPress,
  }));
}

export function installInAppAlertInterceptor() {
  if (isInstalled) {
    return;
  }

  const interceptor = (title: string, message?: string, buttons?: AlertButton[], options?: AlertOptions) => {
    useUIStore.getState().showDialog({
      title,
      message,
      buttons: normalizeButtons(buttons),
      cancelable: options?.cancelable ?? false,
      onDismiss: options?.onDismiss,
    });
  };

  Alert.alert = interceptor;
  isInstalled = true;
}
