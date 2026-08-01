const { getEnv } = require('./env');

const originalProjectUrl = 'https://xklmcebwxkqbotqexprn.supabase.co';

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
    const error = new Error('SUPABASE_URL không đúng định dạng URL.');
    error.status = 500;
    throw error;
  }

  if (!['http:', 'https:'].includes(parsed.protocol)) {
    const error = new Error('SUPABASE_URL phải bắt đầu bằng http:// hoặc https://.');
    error.status = 500;
    throw error;
  }

  return parsed.origin;
}

const rawBaseUrl = getEnv('SUPABASE_URL');
const legacyServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

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

let baseUrl;
try {
  baseUrl = normalizeSupabaseUrl(rawBaseUrl);
} catch (error) {
  baseUrl = projectUrlFromLegacyKey(legacyServiceRoleKey) || originalProjectUrl;
}

function normalizeServerKey(rawValue) {
  const value = String(rawValue || '').trim();
  const newSecret = value.match(/sb_secret_[A-Za-z0-9._-]+/);
  if (newSecret) return newSecret[0];

  const legacyJwt = value.match(/[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/);
  return legacyJwt ? legacyJwt[0] : '';
}

const serverApiKey = normalizeServerKey(getEnv('SUPABASE_SECRET_KEY', legacyServiceRoleKey));
if (!serverApiKey) {
  const error = new Error('Supabase server key không đúng định dạng.');
  error.status = 500;
  throw error;
}
const table = getEnv('SUPABASE_STORIES_TABLE', 'stories');

function authorizationHeaders() {
  const looksLikeJwt = serverApiKey.split('.').length === 3;
  return looksLikeJwt ? { Authorization: `Bearer ${serverApiKey}` } : {};
}

async function supabase(path, options = {}) {
  const response = await fetch(`${baseUrl}/rest/v1/${path}`, {
    ...options,
    headers: {
      apikey: serverApiKey,
      ...authorizationHeaders(),
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
      ...(options.headers || {}),
    },
  });

  let payload = null;
  try { payload = await response.json(); } catch { payload = null; }

  if (!response.ok) {
    const error = new Error(payload?.message || payload?.error || 'Supabase request failed.');
    error.status = response.status;
    error.payload = payload;
    throw error;
  }

  return payload;
}

function isMissingDatabaseObject(error) {
  const status = Number(error?.status || 0);
  const payload = JSON.stringify(error?.payload || {}).toLowerCase();
  const message = String(error?.message || '').toLowerCase();
  return [400, 404].includes(status) && (
    status === 404 ||
    payload.includes('schema cache') || payload.includes('could not find') ||
    payload.includes('does not exist') || payload.includes('undefined table') ||
    message.includes('schema cache') || message.includes('does not exist')
  );
}

function storiesPath(query = 'select=*') {
  return `${table}?${query}`;
}

module.exports = {
  supabase,
  storiesPath,
  table,
  normalizeSupabaseUrl,
  projectUrlFromLegacyKey,
  normalizeServerKey,
  isMissingDatabaseObject,
};
