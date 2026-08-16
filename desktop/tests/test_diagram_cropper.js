const { app } = require('electron');
const path = require('path');
const fs = require('fs');
const { renderPdfPage } = require('../services/pdf/pdfRenderer');
const { bboxToPixelRect, cropDiagramFromPage } = require('../services/pdf/diagramCropper');

app.whenReady().then(async () => {
  console.log('==================================================');
  console.log('PHASE 3 — EXACT DIAGRAM CROPPING AUTOMATED VERIFICATION');
  console.log('==================================================');

  const pdfPath = path.resolve(__dirname, '../../REF/Synchroniser__1157799_1_1786168383.pdf');
  const scratchCropsDir = path.resolve(__dirname, '../../scratch/crops');

  if (!fs.existsSync(scratchCropsDir)) {
    fs.mkdirSync(scratchCropsDir, { recursive: true });
  }

  try {
    // Test 1: Bbox to Pixel Conversion & Validation Unit Tests
    console.log('[Test 1] Testing bboxToPixelRect conversion & boundary clamping...');
    
    // Normal bbox
    const rect1 = bboxToPixelRect([17, 551, 248, 777], 1240, 1753, 5);
    console.log(`  - Q113 Normalized [17, 551, 248, 777] -> Pixel rect: x=${rect1.x}, y=${rect1.y}, w=${rect1.width}, h=${rect1.height}`);
    if (!rect1.isValid || rect1.width <= 0 || rect1.height <= 0) {
      throw new Error('Valid bbox conversion failed!');
    }

    // Invalid bbox (ymin >= ymax)
    const invalidRect = bboxToPixelRect([300, 100, 200, 400], 1240, 1753, 5);
    console.log(`  - Invalid bbox [300, 100, 200, 400] rejection: ${!invalidRect.isValid ? 'PASS (Rejected)' : 'FAIL'}`);
    if (invalidRect.isValid) {
      throw new Error('Failed to reject invalid ymin >= ymax bounding box!');
    }

    // Test 2: Reference Diagram Cropping Suite (Q113, Q132, Q138, Q139)
    const testCases = [
      { q: 'Q113', page: 2, bbox: [17, 551, 248, 777], desc: 'Human left hindlimb diagram' },
      { q: 'Q132', page: 3, bbox: [50, 520, 310, 890], desc: 'Cross-bridge cycle diagram' },
      { q: 'Q138', page: 4, bbox: [120, 100, 380, 480], desc: 'Axon terminal & synapse diagram' },
      { q: 'Q139', page: 4, bbox: [410, 100, 680, 480], desc: 'Synapse diagram' }
    ];

    for (const test of testCases) {
      console.log(`\n[Test 2] Cropping ${test.q} (${test.desc}) from Page ${test.page}...`);
      const pageRender = await renderPdfPage(pdfPath, test.page, 150);

      const cropResult = await cropDiagramFromPage({
        pagePngBuffer: pageRender.pngBuffer,
        bbox: test.bbox,
        imageWidth: pageRender.width,
        imageHeight: pageRender.height
      });

      console.log(`  - Crop dimensions: ${cropResult.cropRect.width} x ${cropResult.cropRect.height} px`);
      console.log(`  - Crop byte size: ${cropResult.croppedBuffer.length} bytes`);

      // Verify PNG magic header
      const header = cropResult.croppedBuffer.subarray(0, 4);
      const isPngValid = header[0] === 137 && header[1] === 80 && header[2] === 78 && header[3] === 71;
      console.log(`  - PNG Magic Header check: ${isPngValid ? 'VALID' : 'INVALID'}`);

      if (!isPngValid) {
        throw new Error(`Cropped buffer for ${test.q} does not contain valid PNG magic header!`);
      }

      // Save cropped PNG locally for visual inspection
      const savePath = path.join(scratchCropsDir, `${test.q.toLowerCase()}_crop.png`);
      fs.writeFileSync(savePath, cropResult.croppedBuffer);
      console.log(`  - Saved local visual crop: ${savePath}`);
    }

    console.log('\n--------------------------------------------------');
    console.log('PHASE 3 VERIFICATION RESULT: ALL DIAGRAM CROPS PASSED SUCCESSFULLY!');
    console.log('--------------------------------------------------');

    app.exit(0);
  } catch (err) {
    console.error(`\n[FAIL] Phase 3 Verification Error: ${err.message}`);
    app.exit(1);
  }
});
