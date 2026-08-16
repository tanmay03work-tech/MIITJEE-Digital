const { app } = require('electron');
const path = require('path');
const fs = require('fs');
const { renderPdfPage } = require('../services/pdf/pdfRenderer');
const { cropDiagramFromPage } = require('../services/pdf/diagramCropper');
const { uploadDiagramToR2, verifyDiagramAccess } = require('../services/r2/r2Uploader');

const LOCAL_BACKEND_URL = 'http://127.0.0.1:8787';

function log(msg) {
  process.stdout.write(msg + '\n');
}

// Prevent Electron from exiting when hidden render windows close
app.on('window-all-closed', (e) => {
  e.preventDefault();
});

app.whenReady().then(async () => {
  log('==================================================');
  log('PHASE 4 — R2 UPLOAD & ACCESS VERIFICATION');
  log('==================================================');

  const pdfPath = path.resolve(__dirname, '../../REF/Synchroniser__1157799_1_1786168383.pdf');

  try {
    // 1. Security Audit
    log('[Test 1] Security Audit: Checking desktop client source code for hardcoded secrets...');
    const r2ClientSource = fs.readFileSync(path.join(__dirname, '../services/r2/r2Uploader.js'), 'utf8');
    const hasSecretKey = /aws_secret_access_key|r2_secret|secret_key|SERVICE_ROLE/i.test(r2ClientSource);
    log(`  - Hardcoded R2 Secrets check: ${hasSecretKey ? 'FAIL (Exposed!)' : 'PASS (Secure)'}`);
    if (hasSecretKey) {
      throw new Error('SECURITY VIOLATION: R2 secret key or service role detected in Desktop client!');
    }

    // 2. Prepare Q113 crop
    log('\n[Test 2] Preparing Q113 cropped diagram from Page 2...');
    const page2Render = await renderPdfPage(pdfPath, 2, 150);
    const cropResult = await cropDiagramFromPage({
      pagePngBuffer: page2Render.pngBuffer,
      bbox: [17, 551, 248, 777],
      imageWidth: page2Render.width,
      imageHeight: page2Render.height
    });
    log(`  - Q113 crop ready (${cropResult.cropRect.width}x${cropResult.cropRect.height} px, ${cropResult.croppedBuffer.length} bytes)`);

    // 3. Upload to R2 via Backend Proxy
    log('\n[Test 3] Uploading Q113 cropped diagram to R2 via backend proxy...');
    const uploadResult = await uploadDiagramToR2({
      setId: 'synchroniser_test_set',
      questionNumber: '113',
      pageNumber: 2,
      croppedBuffer: cropResult.croppedBuffer,
      backendUrl: LOCAL_BACKEND_URL
    });

    log('  - Upload HTTP Response: SUCCESS');
    log(`  - Deterministic R2 Object Key: ${uploadResult.key}`);
    log(`  - Accessible Image Reference URL: ${uploadResult.imageUrl}`);
    log(`  - Stored Byte Size: ${uploadResult.byteSize} bytes`);

    const expectedKey = 'diagrams/synchroniser_test_set/q_113_p2.png';
    if (uploadResult.key !== expectedKey) {
      throw new Error(`Deterministic key mismatch! Expected ${expectedKey}, got ${uploadResult.key}`);
    }

    // 4. Verify Diagram Accessibility & PNG Magic Header from R2 Storage
    log('\n[Test 4] Retrieving diagram from R2 and verifying headers & content...');
    const accessResult = await verifyDiagramAccess(uploadResult.imageUrl, LOCAL_BACKEND_URL);

    log(`  - HTTP Status Code: ${accessResult.status} ${accessResult.isAccessible ? '(200 OK)' : 'FAIL'}`);
    log(`  - Content-Type: "${accessResult.contentType}"`);
    log(`  - PNG Magic Header check (0x89504E47): ${accessResult.isPngValid ? 'VALID' : 'INVALID'}`);

    if (!accessResult.isAccessible || accessResult.status !== 200) {
      throw new Error(`Diagram retrieval from R2 failed with status ${accessResult.status}`);
    }

    if (!accessResult.isPngValid) {
      throw new Error('Retrieved R2 object is not a valid PNG image!');
    }

    // 5. Idempotency Retest
    log('\n[Test 5] Retesting upload idempotency for Q113...');
    const retryResult = await uploadDiagramToR2({
      setId: 'synchroniser_test_set',
      questionNumber: '113',
      pageNumber: 2,
      croppedBuffer: cropResult.croppedBuffer,
      backendUrl: LOCAL_BACKEND_URL
    });
    log(`  - Idempotency check: ${retryResult.key === expectedKey ? 'PASS (Same deterministic key)' : 'FAIL'}`);

    log('\n--------------------------------------------------');
    log('PHASE 4 VERIFICATION RESULT: R2 UPLOAD & ACCESS PASSED SUCCESSFULLY!');
    log('--------------------------------------------------');

    setTimeout(() => app.exit(0), 100);
  } catch (err) {
    log(`\n[FAIL] Phase 4 Verification Error: ${err.message}`);
    setTimeout(() => app.exit(1), 100);
  }
});
