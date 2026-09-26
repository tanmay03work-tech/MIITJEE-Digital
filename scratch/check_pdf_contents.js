const pdfjsLib = require('pdfjs-dist/legacy/build/pdf.js');

const urls = [
  { name: 'Physics (set_1786825374013)', url: 'https://uwuzdggimbbbfgcauzho.supabase.co/storage/v1/object/public/exam-assets/pdfs/1786825371103-11th_morning_physics__1163869_1_1786701950.pdf' },
  { name: 'Chemistry (set_1786848247573)', url: 'https://uwuzdggimbbbfgcauzho.supabase.co/storage/v1/object/public/exam-assets/pdfs/1786848242187-11th_Morning_chemistry__1164158_1_1786766330.pdf' },
  { name: 'Mathematics (set_1786849674045)', url: 'https://uwuzdggimbbbfgcauzho.supabase.co/storage/v1/object/public/exam-assets/pdfs/1786849670520-11th_morning_math_test_paper__1162772_1_1786705588.pdf' },
  { name: 'Biology Genesis (set_1786851470684)', url: 'https://uwuzdggimbbbfgcauzho.supabase.co/storage/v1/object/public/exam-assets/pdfs/1786851466643-Genesis_1163932_1_1786704104--1-.pdf' },
];

async function checkPdfs() {
  for (const item of urls) {
    try {
      console.log(`\nChecking ${item.name}...`);
      const res = await fetch(item.url);
      const buf = await res.arrayBuffer();
      const doc = await pdfjsLib.getDocument({ data: new Uint8Array(buf) }).promise;
      console.log(`Pages: ${doc.numPages}`);
      const page1 = await doc.getPage(1);
      const textContent = await page1.getTextContent();
      const text = textContent.items.map(i => i.str).join(' ');
      console.log(`Page 1 text preview: ${text.slice(0, 200)}...`);
    } catch (e) {
      console.error(`Error loading ${item.name}:`, e.message);
    }
  }
}

checkPdfs();
