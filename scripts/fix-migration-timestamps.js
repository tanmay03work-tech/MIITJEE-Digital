const fs = require('fs');
const path = require('path');

const migrationsDir = path.join(__dirname, '..', 'supabase', 'migrations');
const files = fs.readdirSync(migrationsDir).filter(f => f.endsWith('.sql')).sort();

console.log(`Found ${files.length} migration files.`);

const dateGroups = {};

files.forEach((file) => {
  const match = file.match(/^(\d{8})_(.+)$/);
  if (match) {
    const dateStr = match[1];
    const rest = match[2];
    if (!dateGroups[dateStr]) {
      dateGroups[dateStr] = [];
    }
    dateGroups[dateStr].push({ file, rest });
  } else {
    console.log(`Skipping non-matching file: ${file}`);
  }
});

let renamedCount = 0;

Object.keys(dateGroups).sort().forEach((dateStr) => {
  const items = dateGroups[dateStr];
  items.forEach((item, index) => {
    const seq = String(index + 1).padStart(2, '0');
    const newTimestamp = `${dateStr}${seq}0000`;
    const newFileName = `${newTimestamp}_${item.rest}`;
    
    if (item.file !== newFileName) {
      const oldPath = path.join(migrationsDir, item.file);
      const newPath = path.join(migrationsDir, newFileName);
      fs.renameSync(oldPath, newPath);
      console.log(`Renamed: ${item.file} -> ${newFileName}`);
      renamedCount++;
    }
  });
});

console.log(`Successfully renamed ${renamedCount} migration files to unique 14-digit timestamps.`);
