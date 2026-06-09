const { spawn, spawnSync } = require('child_process');
const net = require('net');
const path = require('path');
const { ensurePreferredNode } = require('./preferred-node');
const { assertDependenciesInstalled } = require('./verify-install');

ensurePreferredNode(__filename);

const rootDir = path.resolve(__dirname, '..');
const npxCommand = process.platform === 'win32' ? 'npx.cmd' : 'npx';
const port = 8081;

function isPortReachable(host = '127.0.0.1', targetPort = port, timeoutMs = 1000) {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host, port: targetPort });

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

function run(command, args, options = {}) {
  return spawnSync(command, args, {
    cwd: rootDir,
    encoding: 'utf8',
    shell: false,
    ...options,
  });
}

function getPidsListeningOnPort(targetPort) {
  if (process.platform !== 'win32') {
    return [];
  }

  const result = run('powershell.exe', [
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
  if (pids.length === 0) {
    return;
  }

  for (const pid of pids) {
    let result = run('taskkill.exe', ['/PID', pid, '/F', '/T']);

    if ((result.status ?? 1) !== 0) {
      result = run('powershell.exe', [
        '-NoProfile',
        '-Command',
        `Stop-Process -Id ${pid} -Force`,
      ]);
    }

    if ((result.status ?? 1) !== 0) {
      console.warn(`[metro-start] Could not stop PID ${pid}.`);
    }
  }
}

async function ensurePortIsFree() {
  if (!(await isPortReachable())) {
    return;
  }

  const pids = getPidsListeningOnPort(port);
  if (pids.length === 0) {
    console.warn('[metro-start] Port 8081 is busy, but no owning PID was resolved.');
    return;
  }

  console.log(`[metro-start] Stopping stale process(es) on port ${port}: ${pids.join(', ')}`);
  killPids(pids);
}

async function main() {
  assertDependenciesInstalled('starting Metro');
  await ensurePortIsFree();

  const metroArgs = [
    'react-native',
    'start',
    '--host',
    '127.0.0.1',
    '--port',
    String(port),
    '--reset-cache',
    '--max-workers',
    '1',
  ];
  const child = process.platform === 'win32'
    ? spawn('cmd.exe', ['/d', '/s', '/c', npxCommand, ...metroArgs], {
        cwd: rootDir,
        stdio: 'inherit',
        shell: false,
      })
    : spawn(npxCommand, metroArgs, {
        cwd: rootDir,
        stdio: 'inherit',
        shell: false,
      });

  child.on('exit', (code) => {
    process.exit(code ?? 0);
  });
}

main().catch((error) => {
  console.error('[metro-start] Failed to start Metro.');
  console.error(error.message ?? String(error));
  process.exit(1);
});
