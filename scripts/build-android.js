const fs = require('fs');
const { spawnSync } = require('child_process');
const path = require('path');
const { ensurePreferredNode, withPreferredNodeInEnv } = require('./preferred-node');

ensurePreferredNode(__filename);

const rootDir = path.resolve(__dirname, '..');
const androidDir = path.join(rootDir, 'android');
const gradleCommand = process.platform === 'win32'
  ? path.join(androidDir, 'gradlew.bat')
  : path.join(androidDir, 'gradlew');
const arg = process.argv[2];
const buildTarget = arg === 'release' || arg === 'bundle'
  ? ':app:bundleRelease'
  : (arg === 'apk' || arg === 'assembleRelease' ? ':app:assembleRelease' : ':app:assembleDebug');
const javaHome = path.join(rootDir, 'toolchains', 'jdk-17.0.18+8');
const androidUserHome = path.join(rootDir, '.android-codex');
const gradleJvmArgs =
  '-Xmx4096m -Xms1024m -XX:MaxMetaspaceSize=1024m -Dfile.encoding=UTF-8';
const sharedEnv = withPreferredNodeInEnv({
  ...process.env,
  JAVA_HOME: javaHome,
  JAVA_OPTS: process.env.JAVA_OPTS ?? gradleJvmArgs,
  GRADLE_OPTS: process.env.GRADLE_OPTS ?? gradleJvmArgs,
  GRADLE_USER_HOME: path.join(rootDir, '.gradle-codex'),
  ANDROID_USER_HOME: androidUserHome,
  CMAKE_BUILD_PARALLEL_LEVEL: '1',
  NINJAFLAGS: '-j1',
  // RN 0.84's DefaultReactNativeHost always boots Hermes in bridgeless mode.
  // Keep the build scripts aligned so we package the Hermes DSOs the app needs.
  JS_RUNTIME: process.env.JS_RUNTIME ?? 'hermes',
  ORG_GRADLE_PROJECT_hermesEnabled: process.env.ORG_GRADLE_PROJECT_hermesEnabled ?? 'true',
});

fs.mkdirSync(androidUserHome, { recursive: true });

function removeIfExists(targetPath) {
  fs.rmSync(targetPath, { force: true, recursive: true });
}

function resetNativeBuildState() {
  const nativeBuildDirs = [
    path.join(androidDir, 'app', '.cxx'),
    path.join(androidDir, 'app', 'build', 'intermediates', 'cxx'),
    path.join(rootDir, 'node_modules', 'react-native-worklets', 'android', '.cxx'),
    path.join(rootDir, 'node_modules', 'react-native-worklets', 'android', 'build', 'intermediates', 'cxx'),
    path.join(rootDir, 'node_modules', 'react-native-reanimated', 'android', '.cxx'),
    path.join(rootDir, 'node_modules', 'react-native-reanimated', 'android', 'build', 'intermediates', 'cxx'),
  ];

  for (const targetPath of nativeBuildDirs) {
    removeIfExists(targetPath);
  }
}

resetNativeBuildState();

const result = process.platform === 'win32'
  ? spawnSync('powershell.exe', ['-NoProfile', '-Command', `& '${gradleCommand}' ${buildTarget} --no-daemon --console=plain`], {
      cwd: androidDir,
      stdio: 'inherit',
      shell: false,
      env: sharedEnv,
    })
  : spawnSync(gradleCommand, [buildTarget, '--no-daemon', '--console=plain'], {
      cwd: androidDir,
      stdio: 'inherit',
      shell: false,
      env: sharedEnv,
    });

if (result.error) {
  console.error(`Failed to run ${gradleCommand}.`);
  console.error(result.error.message ?? String(result.error));
  process.exit(1);
}

process.exit(result.status ?? 1);
