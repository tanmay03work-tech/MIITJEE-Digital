const fs = require('fs');
const path = require('path');

const targetPath = path.join(
  __dirname,
  '..',
  'node_modules',
  'react-native-document-picker',
  'android',
  'src',
  'main',
  'java',
  'com',
  'reactnativedocumentpicker',
  'RNDocumentPickerModule.java',
);

function replaceOnce(source, searchValue, replaceValue) {
  if (!source.includes(searchValue)) {
    return source;
  }

  return source.replace(searchValue, replaceValue);
}

function main() {
  if (!fs.existsSync(targetPath)) {
    console.log('[fix-document-picker] target file not found, skipping');
    return;
  }

  const original = fs.readFileSync(targetPath, 'utf8');

  if (original.includes('extends AsyncTask<Void, Void, ReadableArray>')) {
    console.log('[fix-document-picker] patch already applied');
    return;
  }

  let updated = original;
  updated = replaceOnce(updated, "import android.net.Uri;\n", "import android.net.Uri;\nimport android.os.AsyncTask;\n");
  updated = updated.replace("import com.facebook.react.bridge.GuardedResultAsyncTask;\n", '');
  updated = updated.replace("import com.facebook.react.bridge.ReactContext;\n", '');
  updated = updated.replace(
    'private static class ProcessDataTask extends GuardedResultAsyncTask<ReadableArray> {',
    'private static class ProcessDataTask extends AsyncTask<Void, Void, ReadableArray> {',
  );
  updated = updated.replace(
    '    private final Promise promise;\n',
    '    private final Promise promise;\n    private Exception backgroundException;\n',
  );
  updated = updated.replace(
    '    protected ProcessDataTask(ReactContext reactContext, List<Uri> uris, String copyTo, Promise promise) {\n' +
      '      super(reactContext.getExceptionHandler());\n' +
      '      this.weakContext = new WeakReference<>(reactContext.getApplicationContext());\n',
    '    protected ProcessDataTask(ReactApplicationContext reactContext, List<Uri> uris, String copyTo, Promise promise) {\n' +
      '      this.weakContext = new WeakReference<>(reactContext.getApplicationContext());\n',
  );
  updated = updated.replace(
    '    protected ReadableArray doInBackgroundGuarded() {\n' +
      '      WritableArray results = Arguments.createArray();\n' +
      '      for (Uri uri : uris) {\n' +
      '        results.pushMap(getMetadata(uri));\n' +
      '      }\n' +
      '      return results;\n' +
      '    }\n',
    '    protected ReadableArray doInBackground(Void... params) {\n' +
      '      try {\n' +
      '        WritableArray results = Arguments.createArray();\n' +
      '        for (Uri uri : uris) {\n' +
      '          results.pushMap(getMetadata(uri));\n' +
      '        }\n' +
      '        return results;\n' +
      '      } catch (Exception exception) {\n' +
      '        backgroundException = exception;\n' +
      '        return null;\n' +
      '      }\n' +
      '    }\n',
  );
  updated = updated.replace(
    '    protected void onPostExecuteGuarded(ReadableArray readableArray) {\n' +
      '      promise.resolve(readableArray);\n' +
      '    }\n',
    '    protected void onPostExecute(ReadableArray readableArray) {\n' +
      '      if (backgroundException != null) {\n' +
      '        promise.reject(E_UNEXPECTED_EXCEPTION, backgroundException.getLocalizedMessage(), backgroundException);\n' +
      '        return;\n' +
      '      }\n' +
      '      promise.resolve(readableArray);\n' +
      '    }\n',
  );

  if (updated === original) {
    console.log('[fix-document-picker] expected patterns not found, skipping');
    return;
  }

  fs.writeFileSync(targetPath, updated);
  console.log('[fix-document-picker] applied Android compatibility patch');
}

main();
