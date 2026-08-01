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
    let settled = false;

    req.on('data', (chunk) => {
      if (settled) return;
      raw += chunk;
      if (raw.length > 1_000_000) {
        settled = true;
        reject(new Error('Payload too large'));
        req.destroy();
      }
    });
    req.on('end', () => {
      if (settled) return;
      if (!raw) return resolve({});
      try { resolve(JSON.parse(raw)); } catch { reject(new Error('Invalid JSON body')); }
    });
    req.on('error', (error) => {
      if (!settled) reject(error);
    });
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

function safeMultilineText(value, { max = 5000, fallback = '' } = {}) {
  if (typeof value !== 'string') return fallback;

  return value
    .replace(/\r\n?/g, '\n')
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, ' ')
    .split('\n')
    .map((line) => line.replace(/[ \t]+/g, ' ').trimEnd())
    .join('\n')
    .trim()
    .slice(0, max);
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

  if (['đang đọc', 'đang lên sóng'].includes(cleaned)) return 'đang lên sóng';
  if (cleaned === 'đã chọn') return 'đã chọn';
  if (cleaned === 'đã hoàn thành') return 'đã hoàn thành';
  return 'đề xuất';
}

function safeEmail(value) {
  const email = safeText(value, { max: 254 }).toLowerCase();
  if (!email) return '';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return '';
  return email;
}

function safeDate(value) {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
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

function getClientIp(req) {
  const forwarded = String(req.headers['x-forwarded-for'] || '')
    .split(',')[0]
    .trim();

  return forwarded || req.socket?.remoteAddress || 'unknown';
}

function requireSameOrigin(req, res) {
  const origin = req.headers.origin;
  if (!origin) return true;

  try {
    const originUrl = new URL(origin);
    const host = String(req.headers['x-forwarded-host'] || req.headers.host || '').toLowerCase();

    if (originUrl.host.toLowerCase() === host) return true;
  } catch {
    // Origin không hợp lệ được xử lý như một yêu cầu khác nguồn.
  }

  json(res, 403, { error: 'Yêu cầu không hợp lệ.' });
  return false;
}

function logServerError(scope, error) {
  const message = String(error?.message || 'Unknown server error').slice(0, 300);
  const status = Number.isInteger(error?.status) ? error.status : 500;
  const code = String(error?.payload?.code || '').slice(0, 80);

  console.error(`[${scope}]`, { message, status, code });
}

module.exports = {
  json,
  parseJson,
  allowMethods,
  safeText,
  safeMultilineText,
  safeUrl,
  safeEmail,
  safeDate,
  normalizeStatus,
  readCookie,
  getClientIp,
  requireSameOrigin,
  logServerError,
};
