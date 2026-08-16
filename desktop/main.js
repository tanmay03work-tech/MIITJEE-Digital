const { app, BrowserWindow, globalShortcut, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const crypto = require('crypto');
const { execSync } = require('child_process');

// Disable Chromium GPU Shader & Disk Cache to prevent Windows Access Denied (0x5) errors
app.commandLine.appendSwitch('disable-gpu-shader-disk-cache');
app.commandLine.appendSwitch('disable-http-cache');

let mainWindow = null;

function getHardwareFingerprint() {
  try {
    let machineId = '';
    if (process.platform === 'win32') {
      try {
        machineId = execSync('powershell -Command "(Get-CimInstance -ClassName Win32_ComputerSystemProduct).UUID"', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
      } catch {
        try {
          machineId = execSync('REG QUERY HKEY_LOCAL_MACHINE\\SOFTWARE\\Microsoft\\Cryptography /v MachineGuid', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
        } catch {
          machineId = os.hostname() + '-' + os.userInfo().username;
        }
      }
    } else {
      machineId = os.hostname() + '-' + os.arch() + '-' + (os.cpus()[0]?.model || 'CPU');
    }

    const rawString = `${machineId}-${os.hostname()}-${os.cpus()[0]?.model || 'GENERIC'}`;
    return 'DEV-' + crypto.createHash('sha256').update(rawString).digest('hex').substring(0, 24).toUpperCase();
  } catch (err) {
    return 'DEV-FALLBACK-' + crypto.randomBytes(8).toString('hex').toUpperCase();
  }
}

function createWindow() {
  const isDev = process.env.NODE_ENV !== 'production' && !app.isPackaged;

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    fullscreen: !isDev,
    kiosk: !isDev,
    alwaysOnTop: !isDev,
    frame: isDev,
    title: 'MIITJEE Digital',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
    }
  });

  // Set Content-Security-Policy to allow local dev backend and Supabase
  mainWindow.webContents.session.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [
          "default-src 'self' file: http://127.0.0.1:* http://localhost:* https://*.supabase.co https://*.workers.dev; " +
          "script-src 'self' file: 'unsafe-inline' 'unsafe-eval'; " +
          "style-src 'self' file: 'unsafe-inline' https://fonts.googleapis.com; " +
          "font-src 'self' file: https://fonts.gstatic.com data:; " +
          "img-src 'self' file: data: blob: http: https:; " +
          "connect-src 'self' file: http://127.0.0.1:* http://localhost:* ws://127.0.0.1:* https://*.supabase.co https://*.workers.dev wss://*.supabase.co;"
        ]
      }
    });
  });

  // Load local dist/index.html or dev server URL
  const prodIndexPath = path.join(__dirname, 'dist/index.html');
  const devIndexPath = path.join(__dirname, '../dist/index.html');
  const indexPath = fs.existsSync(prodIndexPath) ? prodIndexPath : devIndexPath;

  if (isDev && process.env.ELECTRON_START_URL) {
    mainWindow.loadURL(process.env.ELECTRON_START_URL);
  } else {
    mainWindow.loadFile(indexPath).catch(err => {
      console.error('Failed to load file:', indexPath, err);
    });
  }

  // Monitor Window Focus Loss for Anti-Cheating
  mainWindow.on('blur', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('cbt-focus-lost');
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function registerGlobalShortcuts() {
  // Block common system navigation shortcuts during exam
  const blockedShortcuts = [
    'Alt+Tab',
    'Alt+F4',
    'CommandOrControl+Shift+I',
    'F11',
    'F12',
    'PrintScreen'
  ];

  blockedShortcuts.forEach(shortcut => {
    try {
      globalShortcut.register(shortcut, () => {
        console.log(`[CBT Security] Blocked key combination: ${shortcut}`);
        if (mainWindow) {
          mainWindow.webContents.send('cbt-security-violation', { shortcut });
        }
      });
    } catch {
      // Ignored if OS restricts overriding specific shortcut
    }
  });
}

app.whenReady().then(() => {
  createWindow();
  registerGlobalShortcuts();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// IPC Handlers
ipcMain.handle('get-device-fingerprint', async () => {
  return getHardwareFingerprint();
});

ipcMain.handle('get-system-details', async () => {
  return {
    deviceName: os.hostname(),
    osVersion: `${os.type()} ${os.release()}`
  };
});

ipcMain.handle('enter-kiosk-mode', () => {
  if (mainWindow) {
    mainWindow.setKiosk(true);
    mainWindow.setAlwaysOnTop(true);
  }
});

ipcMain.handle('exit-kiosk-mode', () => {
  if (mainWindow) {
    mainWindow.setKiosk(false);
    mainWindow.setAlwaysOnTop(false);
  }
});
