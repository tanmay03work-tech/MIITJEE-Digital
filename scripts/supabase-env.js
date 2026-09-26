const fs = require('fs');
const path = require('path');

function readEnvFile(filePath) {
  if (!fs.existsSync(filePath)) {
    return {};
  }

  return fs.readFileSync(filePath, 'utf8').split(/\r?\n/).reduce((values, line) => {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (!match || match[1].startsWith('#')) {
      return values;
    }

    values[match[1]] = match[2].replace(/^["']|["']$/g, '');
    return values;
  }, {});
}

const root = path.resolve(__dirname, '..');
const privateValues = {
  ...readEnvFile(path.join(root, '.env')),
  ...readEnvFile(path.join(root, 'miitjee-backend', '.dev.vars')),
};

function required(name) {
  const value = process.env[name] || privateValues[name];
  if (!value) {
    throw new Error(`Missing ${name}. Set it in the environment or miitjee-backend/.dev.vars.`);
  }
  return value;
}

module.exports = {
  SUPABASE_URL: process.env.SUPABASE_URL || privateValues.SUPABASE_URL || 'https://uwuzdggimbbbfgcauzho.supabase.co',
  SUPABASE_SERVICE_KEY: required('SUPABASE_SERVICE_KEY'),
  SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY || privateValues.SUPABASE_ANON_KEY || '',
};
