const fs = require('fs');
const path = require('path');

let localEnvChecked = false;

function decodeEnvValue(rawValue) {
  const value = rawValue.trim();

  if (value.startsWith('"') && value.endsWith('"')) {
    try {
      return JSON.parse(value);
    } catch {
      return value.slice(1, -1);
    }
  }

  if (value.startsWith("'") && value.endsWith("'")) {
    return value.slice(1, -1);
  }

  return value;
}

function loadLocalEnv() {
  if (localEnvChecked) return;
  localEnvChecked = true;

  const roots = [process.cwd(), path.resolve(__dirname, '../..')];
  const names = ['.env.local', '.env.development.local', '.env'];
  const checked = new Set();

  for (const root of roots) {
    for (const name of names) {
      const filePath = path.resolve(root, name);
      if (checked.has(filePath)) continue;
      checked.add(filePath);
      if (!fs.existsSync(filePath)) continue;

      const contents = fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, '');

      for (const line of contents.split(/\r?\n/)) {
        const match = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
        if (!match) continue;

        const [, key, rawValue] = match;
        if (typeof process.env[key] !== 'string' || process.env[key].length === 0) {
          process.env[key] = decodeEnvValue(rawValue);
        }
      }
    }
  }
}

function getEnv(name, fallback = '') {
  loadLocalEnv();
  const value = process.env[name];
  if (typeof value === 'string' && value.length > 0) return value;
  if (fallback) return fallback;
  throw new Error(`Missing environment variable: ${name}`);
}

module.exports = { getEnv, loadLocalEnv };
