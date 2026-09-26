const fs = require('fs');
const pdfjsLib = require('pdfjs-dist/legacy/build/pdf.js');

async function inspectLocalPhysics() {
  const filePath = 'D:\\Downloads\\11th_morning_physics__1163869_1_1786701950.pdf';
  console.log('Reading local file:', filePath);
  const buf = fs.readFileSync(filePath);
  console.log(`Size: ${buf.byteLength} bytes`);

  const doc = await pdfjsLib.getDocument({ data: new Uint8Array(buf) }).promise;
  console.log(`Total Pages: ${doc.numPages}`);

  for (let p = 1; p <= Math.min(doc.numPages, 3); p++) {
    const page = await doc.getPage(p);
    const tc = await page.getTextContent();
    const text = tc.items.map(i => i.str).join(' ');
    console.log(`\n--- Page ${p} ---`);
    console.log(text.slice(0, 300));
  }
}

inspectLocalPhysics();
