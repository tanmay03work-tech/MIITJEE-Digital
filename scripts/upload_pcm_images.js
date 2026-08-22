const fs = require('fs');
const path = require('path');
const https = require('https');

const SUPABASE_URL = 'https://uwuzdggimbbbfgcauzho.supabase.co';
const SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV3dXpkZ2dpbWJiYmZnY2F1emhvIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NTM5MTMxNSwiZXhwIjoyMDkwOTY3MzE1fQ.WCCXL2twdvI0BCW2OPR2NeNaV5mnzvDTJa2Fwfqx18o';

function uploadFileToStorage(localFilePath, storagePath, contentType = 'image/png') {
  return new Promise((resolve, reject) => {
    const fileBuffer = fs.readFileSync(localFilePath);
    const url = new URL(`${SUPABASE_URL}/storage/v1/object/exam-assets/${storagePath}`);

    const options = {
      hostname: url.hostname,
      port: 443,
      path: url.pathname,
      method: 'POST',
      headers: {
        'apikey': SERVICE_ROLE_KEY,
        'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
        'Content-Type': contentType,
        'Content-Length': fileBuffer.length,
        'x-upsert': 'true',
      },
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          const publicUrl = `${SUPABASE_URL}/storage/v1/object/public/exam-assets/${storagePath}`;
          resolve(publicUrl);
        } else {
          reject(new Error(`Upload failed ${res.statusCode}: ${data}`));
        }
      });
    });

    req.on('error', reject);
    req.write(fileBuffer);
    req.end();
  });
}

async function main() {
  const imagesDir = path.join(__dirname, '..', 'question paper', 'extracted_images');
  const imageMap = {
    'image1.png': 'pcm_q07_flux_cube.png',
    'image2.png': 'pcm_q08_charges_line.png',
    'image3.png': 'pcm_q10_electric_plates.png',
    'image4.png': 'pcm_q18_electric_dipole.png',
    'image5.png': 'pcm_q20_capacitors_circuit.png',
    'image6.png': 'pcm_q29_alkene_structure.png',
    'image7.png': 'pcm_q31_clf3_structures.png',
    'image8.png': 'pcm_q38_alkenyne_structure.png',
  };

  const uploadedUrls = {};

  for (const [sourceImg, targetName] of Object.entries(imageMap)) {
    const localPath = path.join(imagesDir, sourceImg);
    if (!fs.existsSync(localPath)) {
      console.warn(`Local file not found: ${localPath}`);
      continue;
    }
    const storagePath = `images/${targetName}`;
    console.log(`Uploading ${sourceImg} -> ${storagePath}...`);
    try {
      const publicUrl = await uploadFileToStorage(localPath, storagePath);
      uploadedUrls[sourceImg] = publicUrl;
      console.log(`✓ Uploaded: ${publicUrl}`);
    } catch (err) {
      console.error(`✗ Error uploading ${sourceImg}:`, err.message);
    }
  }

  fs.writeFileSync(
    path.join(__dirname, '..', 'question paper', 'uploaded_images_map.json'),
    JSON.stringify(uploadedUrls, null, 2),
    'utf-8'
  );
  console.log('Saved uploaded_images_map.json');
}

main();
