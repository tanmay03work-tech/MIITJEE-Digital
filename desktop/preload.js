const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  getDeviceFingerprint: () => ipcRenderer.invoke('get-device-fingerprint'),
  getSystemDetails: () => ipcRenderer.invoke('get-system-details'),
  logAuditEvent: (eventType, details) => ipcRenderer.invoke('log-audit-event', { eventType, details }),
  enterKioskMode: () => ipcRenderer.invoke('enter-kiosk-mode'),
  exitKioskMode: () => ipcRenderer.invoke('exit-kiosk-mode')
});
