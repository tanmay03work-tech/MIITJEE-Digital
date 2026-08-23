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
  const files = fs.readdirSync(imagesDir).filter(f => f.startsWith('booster_'));

  console.log(`Found ${files.length} booster images to upload...`);
  const uploadedMap = {};

  for (const filename of files) {
    const localPath = path.join(imagesDir, filename);
    const storagePath = `images/${filename}`;
    console.log(`Uploading ${filename} -> ${storagePath}...`);
    try {
      const publicUrl = await uploadFileToStorage(localPath, storagePath);
      uploadedMap[filename] = publicUrl;
      console.log(`✓ Uploaded: ${publicUrl}`);
    } catch (err) {
      console.error(`✗ Error uploading ${filename}:`, err.message);
    }
  }

  const outMapPath = path.join(__dirname, '..', 'question paper', 'uploaded_booster_images_map.json');
  fs.writeFileSync(outMapPath, JSON.stringify(uploadedMap, null, 2), 'utf-8');
  console.log(`Saved uploaded_booster_images_map.json with ${Object.keys(uploadedMap).length} URLs.`);
}

main();
