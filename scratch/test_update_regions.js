const https = require('https');

const SUPABASE_URL = 'https://uwuzdggimbbbfgcauzho.supabase.co';
const ANON_KEY = 'sb_publishable_2hMbPMAYceagP86WVmzZEQ_BDkMMXLp';

async function testUpdateWithRegions() {
  const phyQ14Id = 'pdf_q_pdf_1786824456756_14';
  
  // Try update with regions in body
  const bodyWithRegions = JSON.stringify({
    page_start: 2,
    page_end: 2,
    bbox: { x: 10, y: 150, width: 293, height: 85 },
    regions: [{ id: 'reg1', pageNumber: 2, bbox: { x: 10, y: 150, width: 293, height: 85 }, role: 'stem', orderIndex: 0, label: 'Region 1' }]
  });

  const url = new URL(`/rest/v1/pdf_native_questions?id=eq.${phyQ14Id}`, SUPABASE_URL);
  
  const req = https.request(url, {
    method: 'PATCH',
    headers: {
      'apikey': ANON_KEY,
      'Authorization': `Bearer ${ANON_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=representation',
      'Content-Length': Buffer.byteLength(bodyWithRegions)
    }
  }, (res) => {
    let data = '';
    res.on('data', chunk => data += chunk);
    res.on('end', () => {
      console.log('Update status WITH regions column in body:', res.statusCode);
      console.log('Update response:', data);
    });
  });

  req.on('error', console.error);
  req.write(bodyWithRegions);
  req.end();
}

testUpdateWithRegions();
