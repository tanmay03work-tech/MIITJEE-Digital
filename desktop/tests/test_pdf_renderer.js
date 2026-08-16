const { app } = require('electron');
const path = require('path');
const fs = require('fs');
const { renderPdfPage, renderPdfPages } = require('../services/pdf/pdfRenderer');

app.whenReady().then(async () => {
  console.log('==================================================');
  console.log('PHASE 1 — LOCAL PDF RENDERING AUTOMATED VERIFICATION');
  console.log('==================================================');

  const pdfPath = path.resolve(__dirname, '../../REF/Synchroniser__1157799_1_1786168383.pdf');
  console.log(`[Test] Input PDF path: ${pdfPath}`);

  if (!fs.existsSync(pdfPath)) {
    console.error(`[FAIL] PDF file missing at ${pdfPath}`);
    app.exit(1);
  }

  try {
    // Test 1: Render Page 2 at 150 DPI
    console.log('[Test 1] Rendering Page 2 at 150 DPI...');
    const page2Result = await renderPdfPage(pdfPath, 2, 150);

    console.log(`  - Page number: ${page2Result.pageNumber}`);
    console.log(`  - Rendered width: ${page2Result.width} px`);
    console.log(`  - Rendered height: ${page2Result.height} px`);
    console.log(`  - Buffer byte size: ${page2Result.pngBuffer.length} bytes`);
    console.log(`  - Configured DPI: ${page2Result.dpi}`);

    // Verify PNG Header Bytes: 0x89 0x50 0x4E 0x47 (137, 80, 78, 71)
    const header = page2Result.pngBuffer.subarray(0, 4);
    const isPngHeaderValid = header[0] === 137 && header[1] === 80 && header[2] === 78 && header[3] === 71;
    console.log(`  - PNG Magic Header check (0x89504E47): ${isPngHeaderValid ? 'VALID' : 'INVALID'}`);

    if (!isPngHeaderValid) {
      throw new Error('Rendered buffer does not contain valid PNG magic header bytes!');
    }

    // Verify Dimensions (~1241 x 1754 at 150 DPI for A4 page 595.28 x 841.89 pt)
    const widthValid = page2Result.width >= 1200 && page2Result.width <= 1280;
    const heightValid = page2Result.height >= 1700 && page2Result.height <= 1800;
    console.log(`  - A4 150 DPI Width Range (1200-1280px): ${widthValid ? 'PASS' : 'FAIL'} (${page2Result.width}px)`);
    console.log(`  - A4 150 DPI Height Range (1700-1800px): ${heightValid ? 'PASS' : 'FAIL'} (${page2Result.height}px)`);

    if (!widthValid || !heightValid) {
      throw new Error(`Unexpected rendered dimensions: ${page2Result.width}x${page2Result.height}`);
    }

    // Test 2: Render Page 2 at 300 DPI (high resolution mode)
    console.log('[Test 2] Rendering Page 2 at 300 DPI (High detail mode)...');
    const page2_300dpi = await renderPdfPage(pdfPath, 2, 300);
    console.log(`  - 300 DPI width: ${page2_300dpi.width} px, height: ${page2_300dpi.height} px`);
    const dpi300Valid = page2_300dpi.width >= 2400 && page2_300dpi.width <= 2560;
    console.log(`  - 300 DPI Width Range (2400-2560px): ${dpi300Valid ? 'PASS' : 'FAIL'} (${page2_300dpi.width}px)`);

    if (!dpi300Valid) {
      throw new Error(`300 DPI scale test failed! Width: ${page2_300dpi.width}`);
    }

    // Test 3: Batch Render Pages 1 and 2 using renderPdfPages()
    console.log('[Test 3] Batch rendering Pages [1, 2] at 150 DPI using renderPdfPages()...');
    const batchResult = await renderPdfPages(pdfPath, [1, 2], 150);
    console.log(`  - Batch items count: ${batchResult.length}`);
    if (batchResult.length !== 2) {
      throw new Error(`Batch rendering returned ${batchResult.length} pages instead of 2!`);
    }

    console.log('--------------------------------------------------');
    console.log('PHASE 1 VERIFICATION RESULT: ALL TESTS PASSED SUCCESSFULLY!');
    console.log('--------------------------------------------------');

    app.exit(0);
  } catch (err) {
    console.error(`[FAIL] Verification error: ${err.message}`);
    app.exit(1);
  }
});
