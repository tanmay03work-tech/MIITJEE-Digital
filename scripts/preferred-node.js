const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

function getPreferredNodeBinary() {
  if (process.platform !== 'win32') {
    return null;
  }

  const candidate = path.join(
    os.homedir(),
    'AppData',
    'Local',
    'nvm',
    'v22.11.0',
    'node.exe',
  );

  return fs.existsSync(candidate) ? candidate : null;
}

function ensurePreferredNode(scriptPath) {
  const preferredNode = getPreferredNodeBinary();
  const currentMajor = Number(process.versions.node.split('.')[0] || 0);

  if (
    !preferredNode ||
    process.env.MIITJEE_NODE_REEXEC === '1' ||
    process.execPath.toLowerCase() === preferredNode.toLowerCase() ||
    currentMajor === 22
  ) {
    return;
  }

  const result = spawnSync(preferredNode, [scriptPath, ...process.argv.slice(2)], {
    cwd: path.resolve(__dirname, '..'),
    stdio: 'inherit',
    env: {
      ...process.env,
      MIITJEE_NODE_REEXEC: '1',
    },
  });

  if (result.error) {
    throw result.error;
  }

  process.exit(result.status ?? 1);
}

function withPreferredNodeInEnv(env) {
  const preferredNode = getPreferredNodeBinary();

  if (!preferredNode) {
    return env;
  }

  const nodeDir = path.dirname(preferredNode);
  const existingPath = env.Path ?? env.PATH ?? '';
  const mergedPath = existingPath ? `${nodeDir};${existingPath}` : nodeDir;

  return {
    ...env,
    NODE_BINARY: preferredNode,
    Path: mergedPath,
    PATH: mergedPath,
  };
}

module.exports = {
  ensurePreferredNode,
  getPreferredNodeBinary,
  withPreferredNodeInEnv,
};
