const { PDFDocument, PDFName, PDFDict, PDFRawStream, PDFStream, PDFRef, PDFNumber, PDFArray } = require('pdf-lib');
const fs = require('fs');

async function test() {
  const buf = fs.readFileSync('D:/Downloads/miitjee-mobile/REF/Synchroniser__1157799_1_1786168383.pdf');
  const doc = await PDFDocument.load(buf, { ignoreEncryption: true });
  console.log('Pages:', doc.getPageCount());

  for (let pi = 0; pi < Math.min(5, doc.getPageCount()); pi++) {
    const page = doc.getPage(pi);
    const resources = page.node.Resources();
    if (!resources) {
      console.log('Page ' + pi + ': no resources');
      continue;
    }
    const xObjDict = resources.lookup(PDFName.of('XObject'));
    if (!(xObjDict instanceof PDFDict)) {
      console.log('Page ' + pi + ': no XObject dict');
      continue;
    }
    const entries = xObjDict.entries();
    console.log('Page ' + pi + ': ' + entries.length + ' XObjects');
    for (const [name, ref] of entries) {
      const obj = doc.context.lookup(ref);
      const isStream = obj instanceof PDFStream || obj instanceof PDFRawStream;
      if (!isStream) { console.log('  ' + name.toString() + ': not a stream'); continue; }
      const subtype = obj.dict.lookup(PDFName.of('Subtype'));
      const isImage = subtype instanceof PDFName && subtype.toString() === '/Image';
      if (!isImage) { console.log('  ' + name.toString() + ': not an Image (subtype=' + subtype + ')'); continue; }
      const width = obj.dict.lookup(PDFName.of('Width'));
      const height = obj.dict.lookup(PDFName.of('Height'));
      const filter = obj.dict.lookup(PDFName.of('Filter'));
      const bpc = obj.dict.lookup(PDFName.of('BitsPerComponent'));
      const cs = obj.dict.lookup(PDFName.of('ColorSpace'));
      const contentsLen = obj.contents ? obj.contents.length : 'N/A';
      console.log('  ' + name.toString() + ': IMAGE ' + width + 'x' + height + ' filter=' + filter + ' bpc=' + bpc + ' cs=' + cs + ' bytes=' + contentsLen);
    }
  }
}

test().catch(console.error);
