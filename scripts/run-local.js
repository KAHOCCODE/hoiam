const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const originalProjectUrl = 'https://xklmcebwxkqbotqexprn.supabase.co';

const allowedNames = new Set([
  'SUPABASE_URL',
  'SUPABASE_SECRET_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
  'SUPABASE_STORIES_TABLE',
  'SUPABASE_INCREMENT_VOTES_RPC',
  'SUPABASE_DONATIONS_TABLE',
  'SUPABASE_SETTINGS_TABLE',
  'SUPABASE_ANNOUNCEMENTS_TABLE',
  'SUPABASE_SOURCE_REPLACEMENTS_TABLE',
  'SUPABASE_AUDIT_TABLE',
  'ADMIN_PASSWORD',
  'ADMIN_SESSION_SECRET',
  'DONATION_SENDER_EMAIL',
  'SMTP_HOST',
  'SMTP_PORT',
  'SMTP_SECURE',
  'SMTP_USER',
  'SMTP_APP_PASSWORD',
]);

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

function parseAllowedEnv(contents) {
  const variables = {};

  for (const line of contents.replace(/^\uFEFF/, '').split(/\r?\n/)) {
    const match = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!match || !allowedNames.has(match[1])) continue;
    variables[match[1]] = decodeEnvValue(match[2]);
  }

  return variables;
}

function normalizeSupabaseUrl(rawValue) {
  const value = String(rawValue || '')
    .trim()
    .replace(/\\[rnt]/g, '')
    .trim();

  const cloudUrl = value.match(/https?:\/\/[a-z0-9-]+\.supabase\.co/i);
  if (cloudUrl) return cloudUrl[0].replace(/\/$/, '');

  let parsed;
  try {
    parsed = new URL(value.replace(/^[\\]*["']+|[\\]*["']+$/g, '').trim());
  } catch {
    throw new Error('SUPABASE_URL is not a valid URL.');
  }

  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error('SUPABASE_URL must start with http:// or https://.');
  }

  return parsed.origin;
}

function projectUrlFromLegacyKey(key) {
  try {
    const parts = String(key || '').split('.');
    if (parts.length !== 3) return '';
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
    const projectRef = String(payload?.ref || '').trim().toLowerCase();
    return /^[a-z0-9-]+$/.test(projectRef) ? `https://${projectRef}.supabase.co` : '';
  } catch {
    return '';
  }
}

function normalizeServerKey(rawValue) {
  const value = String(rawValue || '').trim();
  const newSecret = value.match(/sb_secret_[A-Za-z0-9._-]+/);
  if (newSecret) return newSecret[0];

  const legacyJwt = value.match(/[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/);
  return legacyJwt ? legacyJwt[0] : '';
}

function resolveSupabaseUrl(rawUrl, legacyKey) {
  try {
    return {
      url: normalizeSupabaseUrl(rawUrl),
      source: 'environment',
    };
  } catch {
    const recoveredUrl = projectUrlFromLegacyKey(legacyKey);
    return {
      url: recoveredUrl || originalProjectUrl,
      source: recoveredUrl ? 'server-key' : 'original-site',
    };
  }
}

function fail(message) {
  process.stderr.write(`[Hoi Am] ${message}\n`);
  process.exit(1);
}

function main() {
  const projectRoot = path.resolve(__dirname, '..');
  const envPath = path.join(projectRoot, '.env.local');

  if (!fs.existsSync(envPath)) {
    fail('.env.local was not found. Run setup-local.cmd or refresh-env.cmd first.');
  }

  const variables = parseAllowedEnv(fs.readFileSync(envPath, 'utf8'));
  const missing = [];

  if (!variables.SUPABASE_SECRET_KEY && !variables.SUPABASE_SERVICE_ROLE_KEY) {
    missing.push('SUPABASE_SECRET_KEY or SUPABASE_SERVICE_ROLE_KEY');
  }

  if (missing.length) {
    fail(`Missing from .env.local: ${missing.join(', ')}`);
  }

  const secretKey = normalizeServerKey(variables.SUPABASE_SECRET_KEY);
  const legacyKey = normalizeServerKey(variables.SUPABASE_SERVICE_ROLE_KEY);

  if (!secretKey && !legacyKey) {
    fail('The Supabase server key in .env.local is not usable. Pull or copy the real key, then try again.');
  }

  if (secretKey) variables.SUPABASE_SECRET_KEY = secretKey;
  else delete variables.SUPABASE_SECRET_KEY;

  if (legacyKey) variables.SUPABASE_SERVICE_ROLE_KEY = legacyKey;
  else delete variables.SUPABASE_SERVICE_ROLE_KEY;

  const resolvedUrl = resolveSupabaseUrl(variables.SUPABASE_URL, legacyKey);
  variables.SUPABASE_URL = resolvedUrl.url;

  if (resolvedUrl.source !== 'environment') {
    process.stdout.write(
      resolvedUrl.source === 'server-key'
        ? '[Hoi Am] Recovered SUPABASE_URL from the project reference in the server key.\n'
        : '[Hoi Am] Using the Supabase URL from the original Hoi Am site.\n'
    );
  }

  process.stdout.write('[Hoi Am] Loaded into the local server:\n');
  Object.keys(variables).sort().forEach((name) => process.stdout.write(`  - ${name}\n`));
  process.stdout.write('[Hoi Am] Secret values were not displayed.\n');
  process.stdout.write('[Hoi Am] Starting http://localhost:3000 - press Ctrl+C to stop.\n\n');

  const isWindows = process.platform === 'win32';
  const command = isWindows ? (process.env.ComSpec || 'cmd.exe') : 'npx';
  const args = isWindows
    ? ['/d', '/s', '/c', 'npx.cmd vercel@latest dev']
    : ['vercel@latest', 'dev'];

  const childEnv = { ...process.env, ...variables };
  if (!variables.SUPABASE_SECRET_KEY) delete childEnv.SUPABASE_SECRET_KEY;
  if (!variables.SUPABASE_SERVICE_ROLE_KEY) delete childEnv.SUPABASE_SERVICE_ROLE_KEY;

  const result = spawnSync(command, args, {
    cwd: projectRoot,
    env: childEnv,
    stdio: 'inherit',
  });

  if (result.error) {
    fail(`Could not start Vercel CLI: ${result.error.message}`);
  }

  process.exit(Number.isInteger(result.status) ? result.status : 1);
}

if (require.main === module) main();

module.exports = {
  decodeEnvValue,
  parseAllowedEnv,
  normalizeSupabaseUrl,
  projectUrlFromLegacyKey,
  normalizeServerKey,
  resolveSupabaseUrl,
};
