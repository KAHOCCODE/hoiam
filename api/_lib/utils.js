function json(res, status, data, extraHeaders = {}) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  for (const [key, value] of Object.entries(extraHeaders)) {
    res.setHeader(key, value);
  }
  res.end(JSON.stringify(data));
}

function parseJson(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (chunk) => {
      raw += chunk;
      if (raw.length > 1_000_000) {
        reject(new Error('Payload too large'));
        req.destroy();
      }
    });
    req.on('end', () => {
      if (!raw) return resolve({});
      try { resolve(JSON.parse(raw)); } catch { reject(new Error('Invalid JSON body')); }
    });
    req.on('error', reject);
  });
}

function allowMethods(req, res, methods) {
  if (methods.includes(req.method)) return true;
  res.setHeader('Allow', methods.join(', '));
  json(res, 405, { error: 'Method not allowed.' });
  return false;
}

function safeText(value, { max = 300, fallback = '' } = {}) {
  if (typeof value !== 'string') return fallback;
  const normalized = value.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();
  return normalized.slice(0, max);
}

function safeUrl(value) {
  if (typeof value !== 'string' || !value.trim()) return '';
  try {
    const url = new URL(value.trim());
    if (!['http:', 'https:'].includes(url.protocol)) return '';
    return url.toString();
  } catch {
    return '';
  }
}

function normalizeStatus(value) {
  const cleaned = String(value || '')
    .normalize('NFC')
    .replace(/\u202F/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();

  if (cleaned === 'đang đọc') return 'đang đọc';
  return 'đề xuất';
}

function readCookie(req, name) {
  const cookie = req.headers.cookie || '';
  const parts = cookie.split(/;\s*/);
  for (const part of parts) {
    const [key, ...rest] = part.split('=');
    if (key === name) return decodeURIComponent(rest.join('='));
  }
  return '';
}

module.exports = { json, parseJson, allowMethods, safeText, safeUrl, normalizeStatus, readCookie };
