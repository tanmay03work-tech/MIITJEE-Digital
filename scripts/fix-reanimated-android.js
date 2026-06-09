const fs = require('fs');
const path = require('path');

const targetPath = path.join(
  __dirname,
  '..',
  'node_modules',
  'react-native-reanimated',
  'android',
  'CMakeLists.txt',
);
const gradleTargetPath = path.join(
  __dirname,
  '..',
  'node_modules',
  'react-native-reanimated',
  'android',
  'build.gradle',
);
const transformMatrix3DPath = path.join(
  __dirname,
  '..',
  'node_modules',
  'react-native-reanimated',
  'Common',
  'cpp',
  'reanimated',
  'CSS',
  'common',
  'transforms',
  'TransformMatrix3D.cpp',
);

const thinLtoFlag = '  string(APPEND CMAKE_CXX_FLAGS " -flto=thin")\n';
const safeWindowsGuard = `  if(NOT CMAKE_HOST_WIN32)\n    string(APPEND CMAKE_CXX_FLAGS " -flto=thin")\n  endif()\n`;
const windowsReleaseSymbolsPatch = `string(APPEND CMAKE_CXX_FLAGS " -fno-omit-frame-pointer -fstack-protector-all")\n\nif(CMAKE_HOST_WIN32)\n  if(\${CMAKE_BUILD_TYPE} MATCHES "Debug")\n    # Work around NDK clang crashes on Windows when generating large debug info for reanimated.\n    string(APPEND CMAKE_CXX_FLAGS " -g0")\n  elseif(\${CMAKE_BUILD_TYPE} MATCHES "RelWithDebInfo|Release")\n    # Reanimated's RelWithDebInfo native build can exhaust LLVM memory on Windows.\n    string(APPEND CMAKE_CXX_FLAGS " -g0")\n    string(APPEND CMAKE_C_FLAGS " -g0")\n    set(CMAKE_CXX_FLAGS_RELWITHDEBINFO "\${CMAKE_CXX_FLAGS_RELWITHDEBINFO} -g0")\n    set(CMAKE_C_FLAGS_RELWITHDEBINFO "\${CMAKE_C_FLAGS_RELWITHDEBINFO} -g0")\n  endif()\nendif()\n`;
const transformMatrixWindowsReleasePatch = `if(CMAKE_HOST_WIN32)\n  # NDK 27 clang on Windows crashes while optimizing this TU at Release defaults.\n  set_source_files_properties(\n    "\${COMMON_CPP_DIR}/reanimated/CSS/common/transforms/TransformMatrix3D.cpp"\n    PROPERTIES COMPILE_FLAGS "-O0 -g0 -fno-vectorize -fno-slp-vectorize")\nendif()\n\n`;

function patchFile(filePath, label, applyPatch) {
  if (!fs.existsSync(filePath)) {
    console.log(`[fix-reanimated] ${label} target not found, skipping`);
    return;
  }

  const original = fs.readFileSync(filePath, 'utf8');
  const updated = applyPatch(original);

  if (updated === original) {
    console.log(`[fix-reanimated] ${label} already applied or pattern missing`);
    return;
  }

  fs.writeFileSync(filePath, updated);
  console.log(`[fix-reanimated] applied ${label}`);
}

function patchCMake() {
  patchFile(targetPath, 'Windows Android native build patches', (original) => {
  let updated = original;

  if (!updated.includes(safeWindowsGuard)) {
    updated = updated.replace(thinLtoFlag, safeWindowsGuard);
  }

  updated = updated.replace(
    'file(GLOB_RECURSE REANIMATED_COMMON_CPP_SOURCES CONFIGURE_DEPENDS',
    'file(GLOB_RECURSE REANIMATED_COMMON_CPP_SOURCES',
  );
  updated = updated.replace(
    'file(GLOB_RECURSE REANIMATED_ANDROID_CPP_SOURCES CONFIGURE_DEPENDS',
    'file(GLOB_RECURSE REANIMATED_ANDROID_CPP_SOURCES',
  );
  if (!updated.includes('TransformMatrix3D.cpp"\n    PROPERTIES COMPILE_FLAGS')) {
    updated = updated.replace(
      'find_package(fbjni REQUIRED CONFIG)\n',
      `${transformMatrixWindowsReleasePatch}find_package(fbjni REQUIRED CONFIG)\n`,
    );
  }
  if (!updated.includes('Work around NDK clang crashes on Windows')) {
    updated = updated.replace(
      'string(APPEND CMAKE_CXX_FLAGS " -fno-omit-frame-pointer -fstack-protector-all")',
      windowsReleaseSymbolsPatch.trimEnd()
    );
  }

  return updated;
  });
}

function patchGradle() {
  patchFile(gradleTargetPath, 'Windows-safe CMake cache cleanup patch', (original) => {
    let updated = original;

    const search = `tasks.register('cleanCMakeCache') {
    def fsProvider = project.objects.newInstance(FSService)
    def cxxDir = file("\${projectDir}/.cxx")
    doFirst {
        fsProvider.fs.delete {
            delete cxxDir
        }
    }
}
`;

    const replace = `tasks.register('cleanCMakeCache') {
    def fsProvider = project.objects.newInstance(FSService)
    def cxxDir = file("\${projectDir}/.cxx")
    doFirst {
        if (System.getProperty("os.name").toLowerCase().contains("windows")) {
            try {
                delete(cxxDir)
            } catch (Exception error) {
                logger.warn("[Reanimated] Skipping locked CMake cache cleanup for \${cxxDir}: \${error.message}")
            }
        } else {
            fsProvider.fs.delete {
                delete cxxDir
            }
        }
    }
}
`;

    if (original.includes('Skipping locked CMake cache cleanup')) {
      updated = original;
    } else {
      updated = original.replace(search, replace);
    }

    if (!updated.includes('"-DCMAKE_BUILD_TYPE=Release"')) {
      updated = updated.replace(
        `                        "-DANDROID_SUPPORT_FLEXIBLE_PAGE_SIZES=ON",\n                        "-DREANIMATED_FEATURE_FLAGS=\${REANIMATED_FEATURE_FLAGS}"\n`,
        `                        "-DANDROID_SUPPORT_FLEXIBLE_PAGE_SIZES=ON",\n                        "-DREANIMATED_FEATURE_FLAGS=\${REANIMATED_FEATURE_FLAGS}"${process.platform === 'win32' ? ',\n                        "-DCMAKE_BUILD_TYPE=Release"' : ''}\n`,
      );
    }

    return updated;
  });
}

function patchTransformMatrix3D() {
  patchFile(transformMatrix3DPath, 'TransformMatrix3D Windows clang compatibility patch', (original) => {
    let updated = original;

    updated = updated.replace(
      `TransformMatrix3D::Decomposed TransformMatrix3D::Decomposed::interpolate(
    const double progress,
    const TransformMatrix3D::Decomposed &to) const {
  return {
      .scale = scale.interpolate(progress, to.scale),
      .skew = skew.interpolate(progress, to.skew),
      .quaternion = quaternion.interpolate(progress, to.quaternion),
      .translation = translation.interpolate(progress, to.translation),
      .perspective = perspective.interpolate(progress, to.perspective)};
}
`,
      `TransformMatrix3D::Decomposed TransformMatrix3D::Decomposed::interpolate(
    const double progress,
    const TransformMatrix3D::Decomposed &to) const {
  Decomposed result;
  result.scale = scale.interpolate(progress, to.scale);
  result.skew = skew.interpolate(progress, to.skew);
  result.quaternion = quaternion.interpolate(progress, to.quaternion);
  result.translation = translation.interpolate(progress, to.translation);
  result.perspective = perspective.interpolate(progress, to.perspective);
  return result;
}
`,
    );

    updated = updated.replace(
      '  auto [scale, skew] = computeScaleAndSkew(rows);\n',
      `  const auto scaleAndSkew = computeScaleAndSkew(rows);\n  auto scale = scaleAndSkew.first;\n  auto skew = scaleAndSkew.second;\n`,
    );

    updated = updated.replace(
      `  return TransformMatrix3D::Decomposed{
      .scale = scale,
      .skew = skew,
      .quaternion = rotation,
      .translation = translation,
      .perspective = perspective.value()};
}
`,
      `  Decomposed result;
  result.scale = scale;
  result.skew = skew;
  result.quaternion = rotation;
  result.translation = translation;
  result.perspective = perspective.value();
  return result;
}
`,
    );

    updated = updated.replace(
      '  return {scale, skew};\n',
      '  return std::pair<Vector3D, Vector3D>(scale, skew);\n',
    );

    return updated;
  });
}

function main() {
  patchCMake();
  patchGradle();
  patchTransformMatrix3D();
}

main();
