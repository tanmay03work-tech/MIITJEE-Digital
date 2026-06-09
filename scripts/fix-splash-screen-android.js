const fs = require('fs');
const path = require('path');

const targetPath = path.join(__dirname, '..', 'node_modules', 'react-native-splash-screen', 'android', 'build.gradle');

function main() {
  if (!fs.existsSync(targetPath)) {
    console.log('[fix-splash-screen] target file not found, skipping');
    return;
  }

  const original = fs.readFileSync(targetPath, 'utf8');

  if (original.includes('androidx.appcompat:appcompat')) {
    console.log('[fix-splash-screen] patch already applied');
    return;
  }

  const updated = original.replace(
    '    implementation "com.android.support:appcompat-v7:$supportLibVersion"\n',
    '    implementation "androidx.appcompat:appcompat:1.7.0"\n',
  );

  if (updated === original) {
    console.log('[fix-splash-screen] expected pattern not found, skipping');
    return;
  }

  fs.writeFileSync(targetPath, updated);
  console.log('[fix-splash-screen] applied AndroidX compatibility patch');
}

main();
