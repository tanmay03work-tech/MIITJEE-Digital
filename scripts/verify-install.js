const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');

const requiredPackages = [
  'react-native',
  'metro',
  '@react-native/metro-config',
];

function getMissingPackages() {
  return requiredPackages.filter((packageName) => {
    const packageJsonPath = path.join(
      rootDir,
      'node_modules',
      ...packageName.split('/'),
      'package.json',
    );

    return !fs.existsSync(packageJsonPath);
  });
}

function assertDependenciesInstalled(context) {
  const missingPackages = getMissingPackages();

  if (missingPackages.length === 0) {
    return;
  }

  const label = context ? ` before ${context}` : '';

  console.error(`Dependency install looks incomplete${label}.`);
  console.error(`Missing package(s): ${missingPackages.join(', ')}`);
  console.error(
    'Stop any running Metro/Node process, run `npm install`, then retry.',
  );
  process.exit(1);
}

module.exports = {
  assertDependenciesInstalled,
};
