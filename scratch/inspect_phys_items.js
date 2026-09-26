const fs = require('fs');
const pdfjsLib = require('pdfjs-dist/legacy/build/pdf.js');

async function inspectItems() {
  const physBuf = fs.readFileSync('D:\\Downloads\\11th_morning_physics__1163869_1_1786701950.pdf');
  const doc = await pdfjsLib.getDocument({ data: new Uint8Array(physBuf) }).promise;

  for (let p = 1; p <= 3; p++) {
    const page = await doc.getPage(p);
    const tc = await page.getTextContent();
    console.log(`\n=== PAGE ${p} ===`);
    for (const it of tc.items) {
      if (it.str.includes('(') || /\d/.test(it.str)) {
        console.log(`[x=${Math.round(it.transform[4])}, y=${Math.round(it.transform[5])}] "${it.str}"`);
      }
    }
  }
}

inspectItems();
