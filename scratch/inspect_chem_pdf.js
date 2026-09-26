const pdfjsLib = require('pdfjs-dist/legacy/build/pdf.js');

const chemUrl = 'https://uwuzdggimbbbfgcauzho.supabase.co/storage/v1/object/public/exam-assets/pdfs/1786848242187-11th_Morning_chemistry__1164158_1_1786766330.pdf';

async function inspectChem() {
  console.log('Downloading Chemistry PDF from Supabase Storage...');
  const res = await fetch(chemUrl);
  const buf = await res.arrayBuffer();
  console.log(`Buffer size: ${buf.byteLength} bytes`);

  const doc = await pdfjsLib.getDocument({ data: new Uint8Array(buf) }).promise;
  console.log(`Total Pages: ${doc.numPages}`);

  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const tc = await page.getTextContent();
    const text = tc.items.map(i => i.str).join(' ');
    console.log(`\n--- Page ${p} (Viewport: ${page.view[2]}x${page.view[3]}) ---`);
    console.log(text.slice(0, 300));
  }
}

inspectChem();
