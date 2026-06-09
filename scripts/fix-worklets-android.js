const fs = require('fs');
const path = require('path');

const androidDir = path.join(
  __dirname,
  '..',
  'node_modules',
  'react-native-worklets',
  'android',
);

const cmakeTargetPath = path.join(androidDir, 'CMakeLists.txt');
const gradleTargetPath = path.join(androidDir, 'build.gradle');
const reactNativeJscRuntimeTargetPath = path.join(
  __dirname,
  '..',
  'node_modules',
  'react-native',
  'ReactCommon',
  'jsc',
  'JSCRuntime.cpp',
);

function patchFile(targetPath, patchName, applyPatch) {
  if (!fs.existsSync(targetPath)) {
    console.log(`[fix-worklets] ${patchName} target not found, skipping`);
    return;
  }

  const original = fs.readFileSync(targetPath, 'utf8');
  const updated = applyPatch(original);

  if (updated === original) {
    console.log(`[fix-worklets] ${patchName} already applied or pattern missing`);
    return;
  }

  fs.writeFileSync(targetPath, updated);
  console.log(`[fix-worklets] applied ${patchName}`);
}

function patchCMake() {
  patchFile(cmakeTargetPath, 'Android JSC compatibility patch', (original) => {
    let updated = original;

    const jsRuntimePackageSearch = `if(\${JS_RUNTIME} STREQUAL "hermes")
  find_package(hermes-engine REQUIRED CONFIG)
endif()
`;

    const jsRuntimePackageReplace = `if(\${JS_RUNTIME} STREQUAL "hermes")
  find_package(hermes-engine REQUIRED CONFIG)
elseif(\${JS_RUNTIME} STREQUAL "jsc")
  find_package(jsc-android REQUIRED CONFIG)
endif()
`;

    if (updated.includes('find_package(jsc REQUIRED CONFIG)')) {
      updated = updated.replace(
        'find_package(jsc REQUIRED CONFIG)',
        'find_package(jsc-android REQUIRED CONFIG)',
      );
    } else if (!updated.includes('find_package(jsc-android REQUIRED CONFIG)')) {
      updated = updated.replace(jsRuntimePackageSearch, jsRuntimePackageReplace);
    }

    const jscRuntimeSource = `if(\${JS_RUNTIME} STREQUAL "jsc")
  list(APPEND WORKLETS_COMMON_CPP_SOURCES
       "\${REACT_NATIVE_DIR}/ReactCommon/jsc/JSCRuntime.cpp")
endif()

`;

    if (!updated.includes('ReactCommon/jsc/JSCRuntime.cpp')) {
      updated = updated.replace(
        'add_library(worklets SHARED ${WORKLETS_COMMON_CPP_SOURCES}\n                            ${WORKLETS_ANDROID_CPP_SOURCES})\n',
        `${jscRuntimeSource}add_library(worklets SHARED \${WORKLETS_COMMON_CPP_SOURCES}\n                            \${WORKLETS_ANDROID_CPP_SOURCES})\n`,
      );
    }

    const jscSearch = `elseif(\${JS_RUNTIME} STREQUAL "jsc")
  if(TARGET ReactAndroid::jsctooling)
    target_link_libraries(worklets ReactAndroid::jsctooling)
  endif()
endif()
`;

    const jscReplace = `elseif(\${JS_RUNTIME} STREQUAL "jsc")
  if(TARGET jsc-android::jsc)
    target_link_libraries(worklets jsc-android::jsc)
  elseif(TARGET jsc::jsc)
    target_link_libraries(worklets jsc::jsc)
  elseif(TARGET jsc)
    target_link_libraries(worklets jsc)
  else()
    message(FATAL_ERROR "Unable to find the JSC prefab target for react-native-worklets.")
  endif()

  if(TARGET ReactAndroid::jsctooling)
    target_link_libraries(worklets ReactAndroid::jsctooling)
  endif()
endif()
`;

    if (updated.includes('target_link_libraries(worklets jsc::jsc)')) {
      updated = updated.replace(
        `elseif(\${JS_RUNTIME} STREQUAL "jsc")
  if(TARGET jsc::jsc)
    target_link_libraries(worklets jsc::jsc)
  elseif(TARGET jsc)
    target_link_libraries(worklets jsc)
  else()
    message(FATAL_ERROR "Unable to find the JSC prefab target for react-native-worklets.")
  endif()

  if(TARGET ReactAndroid::jsctooling)
    target_link_libraries(worklets ReactAndroid::jsctooling)
  endif()
endif()
`,
        jscReplace,
      );
    } else if (!updated.includes('target_link_libraries(worklets jsc-android::jsc)')) {
      updated = updated.replace(jscSearch, jscReplace);
    }

    updated = updated.replace(
      'file(GLOB_RECURSE WORKLETS_COMMON_CPP_SOURCES CONFIGURE_DEPENDS',
      'file(GLOB_RECURSE WORKLETS_COMMON_CPP_SOURCES',
    );
    updated = updated.replace(
      'file(GLOB_RECURSE WORKLETS_ANDROID_CPP_SOURCES CONFIGURE_DEPENDS',
      'file(GLOB_RECURSE WORKLETS_ANDROID_CPP_SOURCES',
    );
    if (!updated.includes('Work around NDK clang crashes on Windows when generating large debug info for worklets.')) {
      updated = updated.replace(
        'string(APPEND CMAKE_CXX_FLAGS " -fno-omit-frame-pointer -fstack-protector-all")\n',
        `string(APPEND CMAKE_CXX_FLAGS " -fno-omit-frame-pointer -fstack-protector-all")\n\nif(CMAKE_HOST_WIN32 AND \${CMAKE_BUILD_TYPE} MATCHES "Debug")\n  # Work around NDK clang crashes on Windows when generating large debug info for worklets.\n  string(APPEND CMAKE_CXX_FLAGS " -g0")\nendif()\n`,
      );
    }

    updated = updated.replace(
      /(?:if\(CMAKE_HOST_WIN32 AND \$\{CMAKE_BUILD_TYPE\} MATCHES "Debug"\)\n  # Work around NDK clang crashes on Windows when generating large debug info for worklets\.\n  string\(APPEND CMAKE_CXX_FLAGS " -g0"\)\nendif\(\)\n){2,}/g,
      `if(CMAKE_HOST_WIN32 AND \${CMAKE_BUILD_TYPE} MATCHES "Debug")\n  # Work around NDK clang crashes on Windows when generating large debug info for worklets.\n  string(APPEND CMAKE_CXX_FLAGS " -g0")\nendif()\n`,
    );

    return updated;
  });
}

function patchGradle() {
  patchFile(gradleTargetPath, 'Gradle 8.14 closure compatibility patch', (original) => {
    let updated = original;

    const search = `def JS_RUNTIME = {
    // Override JS runtime with environment variable
    if (System.getenv("JS_RUNTIME")) {
        return System.getenv("JS_RUNTIME")
    }

    // Check if Hermes is enabled in app setup
    def appProject = rootProject.allprojects.find { it.plugins.hasPlugin('com.android.application') }
    if (appProject?.hermesEnabled?.toBoolean() || appProject?.ext?.react?.enableHermes?.toBoolean()) {
        return "hermes"
    }

    // Use JavaScriptCore (JSC) by default
    return "jsc"
}.call()
`;

    const replace = `def getJsRuntime() {
    // Override JS runtime with environment variable
    if (System.getenv("JS_RUNTIME")) {
        return System.getenv("JS_RUNTIME")
    }

    // Check if Hermes is enabled in app setup
    def appProject = rootProject.allprojects.find { it.plugins.hasPlugin('com.android.application') }
    if (appProject?.hermesEnabled?.toBoolean() || appProject?.ext?.react?.enableHermes?.toBoolean()) {
        return "hermes"
    }

    // Use JavaScriptCore (JSC) by default
    return "jsc"
}

def JS_RUNTIME = getJsRuntime()
`;

    if (!updated.includes('def getJsRuntime() {')) {
      updated = updated.replace(search, replace);
    }

    if (!updated.includes('implementation "io.github.react-native-community:jsc-android:2026004.+"')) {
      updated = updated.replace(
        `    if (JS_RUNTIME == "hermes") {
        implementation "com.facebook.react:hermes-android" // version substituted by RNGP
    }
`,
        `    if (JS_RUNTIME == "hermes") {
        implementation "com.facebook.react:hermes-android" // version substituted by RNGP
    } else if (JS_RUNTIME == "jsc") {
        implementation "io.github.react-native-community:jsc-android:2026004.+"
    }
`,
      );
    }

    if (!updated.includes('"**/libjsc.so",')) {
      updated = updated.replace(
        '                    "**/libhermestooling.so",\n',
        '                    "**/libhermestooling.so",\n                    "**/libjsc.so",\n',
      );
    }

    const cleanTaskSearch = `tasks.register('cleanCMakeCache') {
    def fsProvider = project.objects.newInstance(FSService)
    def cxxDir = file("\${projectDir}/.cxx")
    doFirst {
        fsProvider.fs.delete {
            delete cxxDir
        }
    }
}
`;

    const cleanTaskReplace = `tasks.register('cleanCMakeCache') {
    def fsProvider = project.objects.newInstance(FSService)
    def cxxDir = file("\${projectDir}/.cxx")
    doFirst {
        if (System.getProperty("os.name").toLowerCase().contains("windows")) {
            try {
                delete(cxxDir)
            } catch (Exception error) {
                logger.warn("[Worklets] Skipping locked CMake cache cleanup for \${cxxDir}: \${error.message}")
            }
        } else {
            fsProvider.fs.delete {
                delete cxxDir
            }
        }
    }
}
`;

    if (!updated.includes('Skipping locked CMake cache cleanup')) {
      updated = updated.replace(cleanTaskSearch, cleanTaskReplace);
    }

    return updated;
  });
}

function patchReactNativeJscRuntime() {
  patchFile(
    reactNativeJscRuntimeTargetPath,
    'React Native JSC Android BigInt compatibility patch',
    (original) => {
      if (original.includes('#if !defined(__ANDROID__)')) {
        return original;
      }

      const search = `    case kJSTypeSymbol:
      return jsi::Value(createSymbol(value));
    case kJSTypeBigInt:
    default:
`;

      const replace = `    case kJSTypeSymbol:
      return jsi::Value(createSymbol(value));
#if !defined(__ANDROID__)
    case kJSTypeBigInt:
#endif
    default:
`;

      return original.replace(search, replace);
    },
  );
}

function main() {
  patchCMake();
  patchGradle();
  patchReactNativeJscRuntime();
}

main();
