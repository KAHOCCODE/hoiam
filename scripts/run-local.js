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

function normalizeTableName(rawValue) {
  const value = String(rawValue || 'stories')
    .trim()
    .replace(/^[\\]*["']+|[\\]*["']+$/g, '')
    .trim();
  const match = value.match(/^(?:public\.)?([A-Za-z_][A-Za-z0-9_]*)$/);
  if (!match) throw new Error('SUPABASE_STORIES_TABLE must be a table name such as stories.');
  return match[1];
}

async function verifySupabaseTable({ url, key, tableName }) {
  let response;

  try {
    response = await fetch(`${url}/rest/v1/${tableName}?select=id&limit=1`, {
      headers: {
        apikey: key,
        ...(key.split('.').length === 3 ? { Authorization: `Bearer ${key}` } : {}),
      },
      signal: AbortSignal.timeout(8000),
    });
  } catch (error) {
    throw new Error(`Could not reach Supabase (${error.message}).`);
  }

  let payload = null;
  try { payload = await response.json(); } catch { payload = null; }
  if (response.ok) return;

  const code = String(payload?.code || '');
  if (response.status === 404 || code === 'PGRST205') {
    const project = new URL(url).hostname.split('.')[0];
    throw new Error(`Supabase project ${project} does not contain table "${tableName}". Check SUPABASE_STORIES_TABLE in .env.local.`);
  }
  if ([401, 403].includes(response.status)) {
    throw new Error('Supabase rejected the server key. Pull the Production environment variables again.');
  }

  throw new Error(payload?.message || `Supabase returned HTTP ${response.status}.`);
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

async function main() {
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
  variables.SUPABASE_STORIES_TABLE = normalizeTableName(variables.SUPABASE_STORIES_TABLE);

  if (resolvedUrl.source !== 'environment') {
    process.stdout.write(
      resolvedUrl.source === 'server-key'
        ? '[Hoi Am] Recovered SUPABASE_URL from the project reference in the server key.\n'
        : '[Hoi Am] Using the Supabase URL from the original Hoi Am site.\n'
    );
  }

  await verifySupabaseTable({
    url: variables.SUPABASE_URL,
    key: secretKey || legacyKey,
    tableName: variables.SUPABASE_STORIES_TABLE,
  });
  process.stdout.write(`[Hoi Am] Supabase table "${variables.SUPABASE_STORIES_TABLE}" is ready.\n`);

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

if (require.main === module) {
  main().catch((error) => fail(error.message));
}

module.exports = {
  decodeEnvValue,
  parseAllowedEnv,
  normalizeSupabaseUrl,
  projectUrlFromLegacyKey,
  normalizeServerKey,
  normalizeTableName,
  verifySupabaseTable,
  resolveSupabaseUrl,
};
