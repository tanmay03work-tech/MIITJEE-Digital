const net = require('net');
const fs = require('fs');
const { spawn, spawnSync } = require('child_process');
const path = require('path');
const { ensurePreferredNode, withPreferredNodeInEnv } = require('./preferred-node');
const { assertDependenciesInstalled } = require('./verify-install');

ensurePreferredNode(__filename);

const rootDir = path.resolve(__dirname, '..');
const adbCommand = process.platform === 'win32' ? 'adb.exe' : 'adb';
const npxCommand = process.platform === 'win32' ? 'npx.cmd' : 'npx';
const metroPort = 8081;
const shouldUseMetro = process.env.MIITJEE_USE_METRO === '1';
const javaHome = path.join(rootDir, 'toolchains', 'jdk-17.0.18+8');
const androidUserHome = path.join(rootDir, '.android-codex');
const lowMemoryJvmArgs =
  '-Xmx256m -Xms128m -Xss256k -XX:MaxMetaspaceSize=192m -XX:+UseSerialGC -XX:HeapBaseMinAddress=2g';
const javaEnv = withPreferredNodeInEnv({
  ...process.env,
  JAVA_HOME: javaHome,
  _JAVA_OPTIONS: process.env._JAVA_OPTIONS ?? '-XX:+UseSerialGC -Xss256k -XX:HeapBaseMinAddress=2g',
  JAVA_OPTS: process.env.JAVA_OPTS ?? lowMemoryJvmArgs,
  GRADLE_OPTS: process.env.GRADLE_OPTS ?? lowMemoryJvmArgs,
  GRADLE_USER_HOME: path.join(rootDir, '.gradle-codex'),
  ANDROID_USER_HOME: androidUserHome,
  CMAKE_BUILD_PARALLEL_LEVEL: '1',
  NINJAFLAGS: '-j1',
  // RN 0.84's DefaultReactNativeHost always boots Hermes in bridgeless mode.
  // Keep the launcher aligned with the packaged JS runtime.
  JS_RUNTIME: process.env.JS_RUNTIME ?? 'hermes',
  ORG_GRADLE_PROJECT_hermesEnabled: process.env.ORG_GRADLE_PROJECT_hermesEnabled ?? 'true',
});

fs.mkdirSync(androidUserHome, { recursive: true });

function removeIfExists(targetPath) {
  fs.rmSync(targetPath, { force: true, recursive: true });
}

function resetNativeBuildState() {
  const nativeBuildDirs = [
    path.join(rootDir, 'android', 'app', '.cxx'),
    path.join(rootDir, 'android', 'app', 'build', 'intermediates', 'cxx'),
    path.join(rootDir, 'node_modules', 'react-native-worklets', 'android', '.cxx'),
    path.join(rootDir, 'node_modules', 'react-native-worklets', 'android', 'build', 'intermediates', 'cxx'),
    path.join(rootDir, 'node_modules', 'react-native-reanimated', 'android', '.cxx'),
    path.join(rootDir, 'node_modules', 'react-native-reanimated', 'android', 'build', 'intermediates', 'cxx'),
  ];

  for (const targetPath of nativeBuildDirs) {
    removeIfExists(targetPath);
  }
}

function fail(message, error) {
  console.error(message);
  if (error) {
    console.error(error.message ?? String(error));
  }
  process.exit(1);
}

function run(command, args, options = {}) {
  const result = process.platform === 'win32'
    ? spawnSync('cmd.exe', ['/d', '/s', '/c', command, ...args], {
        cwd: rootDir,
        stdio: 'inherit',
        shell: false,
        env: javaEnv,
        ...options,
      })
    : spawnSync(command, args, {
        cwd: rootDir,
        stdio: 'inherit',
        shell: false,
        env: javaEnv,
        ...options,
      });

  if (result.error) {
    fail(`Failed to run ${command}.`, result.error);
  }

  return result;
}

function runQuiet(command, args, options = {}) {
  const result = process.platform === 'win32'
    ? spawnSync('cmd.exe', ['/d', '/s', '/c', command, ...args], {
        cwd: rootDir,
        encoding: 'utf8',
        shell: false,
        env: javaEnv,
        ...options,
      })
    : spawnSync(command, args, {
        cwd: rootDir,
        encoding: 'utf8',
        shell: false,
        env: javaEnv,
        ...options,
      });

  if (result.error) {
    fail(`Failed to run ${command}.`, result.error);
  }

  return result;
}

function spawnDetached(command, args, options = {}) {
  const child = process.platform === 'win32'
    ? spawn('cmd.exe', ['/d', '/s', '/c', command, ...args], {
        cwd: rootDir,
        detached: true,
        stdio: 'ignore',
        shell: false,
        env: javaEnv,
        ...options,
      })
    : spawn(command, args, {
        cwd: rootDir,
        detached: true,
        stdio: 'ignore',
        shell: false,
        env: javaEnv,
        ...options,
      });

  child.unref();
  return child;
}

function getConnectedDevices() {
  const result = runQuiet(adbCommand, ['devices']);

  const devices = (result.stdout ?? '')
    .split(/\r?\n/)
    .slice(1)
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => /\tdevice$/.test(line))
    .map((line) => line.split('\t')[0]);

  return {
    ok: true,
    devices,
  };
}

function isPhysicalDevice(serial) {
  return !serial.startsWith('emulator-');
}

function isMetroReachable(host = '127.0.0.1', port = metroPort, timeoutMs = 1000) {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host, port });

    const finalize = (value) => {
      socket.removeAllListeners();
      socket.destroy();
      resolve(value);
    };

    socket.setTimeout(timeoutMs);
    socket.once('connect', () => finalize(true));
    socket.once('timeout', () => finalize(false));
    socket.once('error', () => finalize(false));
  });
}

function getPidsListeningOnPort(targetPort) {
  if (process.platform !== 'win32') {
    return [];
  }

  const result = runQuiet('powershell.exe', [
    '-NoProfile',
    '-Command',
    'netstat -ano -p tcp',
  ]);
  if ((result.status ?? 1) !== 0) {
    return [];
  }

  const portSuffix = `:${targetPort}`;

  return Array.from(
    new Set(
      (result.stdout ?? '')
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line.startsWith('TCP'))
        .map((line) => line.split(/\s+/))
        .filter((parts) => parts.length >= 5)
        .filter((parts) => parts[1].endsWith(portSuffix) && parts[3] === 'LISTENING')
        .map((parts) => parts[4])
        .filter(Boolean),
    ),
  );
}

function killPids(pids) {
  for (const pid of pids) {
    let result = runQuiet('taskkill.exe', ['/PID', pid, '/F', '/T']);

    if ((result.status ?? 1) !== 0) {
      result = runQuiet('powershell.exe', [
        '-NoProfile',
        '-Command',
        `Stop-Process -Id ${pid} -Force`,
      ]);
    }

    if ((result.status ?? 1) !== 0) {
      console.warn(`Warning: could not stop stale Metro process PID ${pid}.`);
    }
  }
}

async function stopExistingMetro() {
  if (!(await isMetroReachable())) {
    return;
  }

  const pids = getPidsListeningOnPort(metroPort);
  if (pids.length === 0) {
    console.warn('Port 8081 is already busy, but no owning process was resolved.');
    return;
  }

  console.log(`Stopping stale Metro process(es) on port ${metroPort}: ${pids.join(', ')}`);
  killPids(pids);
}

async function waitForMetro(host = '127.0.0.1', port = metroPort, timeoutMs = 20000) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    if (await isMetroReachable(host, port)) {
      return true;
    }

    await new Promise((resolve) => setTimeout(resolve, 750));
  }

  return false;
}

async function ensureMetroRunning() {
  await stopExistingMetro();
  console.log('Starting a fresh Metro instance on 127.0.0.1:8081...');
  spawnDetached(process.execPath, [path.join(rootDir, 'scripts', 'start-metro.js')]);

  if (!(await waitForMetro())) {
    fail(
      'Metro did not become reachable on 127.0.0.1:8081.',
      new Error('Run `npm start` manually in a separate terminal and retry.'),
    );
  }
}

function preparePhysicalDevices(devices) {
  const physicalDevices = devices.filter(isPhysicalDevice);

  for (const serial of physicalDevices) {
    const currentMetroHostResult = runQuiet(adbCommand, ['-s', serial, 'shell', 'getprop', 'metro.host']);
    const currentMetroHost = (currentMetroHostResult.stdout ?? '').trim();

    if (currentMetroHost) {
      const resetHostResult = runQuiet(adbCommand, ['-s', serial, 'shell', 'setprop', 'metro.host', '']);
      if ((resetHostResult.status ?? 1) !== 0) {
        console.warn(`Warning: could not clear Metro host override for device ${serial}.`);
      }
    }

    if (!shouldUseMetro) {
      continue;
    }

    const reverseResult = runQuiet(adbCommand, ['-s', serial, 'reverse', `tcp:${metroPort}`, `tcp:${metroPort}`]);
    if ((reverseResult.status ?? 1) !== 0) {
      fail(
        `Failed to configure adb reverse for device ${serial}.`,
        new Error((reverseResult.stderr ?? '').trim() || 'Run `adb reverse tcp:8081 tcp:8081` manually and retry.'),
      );
    }
  }
}

async function main() {
  assertDependenciesInstalled('launching Android');
  const deviceCheck = getConnectedDevices();

  if (!deviceCheck.ok) {
    console.error(deviceCheck.reason);
    process.exit(1);
  }

  if (deviceCheck.devices.length === 0) {
    console.error('No Android emulator or phone is connected.');
    console.error('Start an emulator from Android Studio Device Manager or connect a USB-debugging-enabled phone, then retry.');
    console.error('Tip: use `npm run android:build` if you only want to build the debug APK.');
    process.exit(1);
  }

  if (shouldUseMetro) {
    await ensureMetroRunning();
  } else {
    console.log('Skipping Metro startup; the debug APK will use the bundled JS asset.');
    console.log('Set MIITJEE_USE_METRO=1 if you want live Metro debugging again.');
  }

  preparePhysicalDevices(deviceCheck.devices);
  resetNativeBuildState();

  const result = run(npxCommand, [
    'react-native',
    'run-android',
    '--no-packager',
    '--port',
    String(metroPort),
    '--active-arch-only',
  ]);
  process.exit(result.status ?? 1);
}

main().catch((error) => fail('Android launch failed.', error));
