const crypto = require('node:crypto');
const { getEnv } = require('./env');
const { json, readCookie } = require('./utils');

const COOKIE_NAME = 'hoiam_admin';
const secret = getEnv('ADMIN_SESSION_SECRET');
const adminPassword = getEnv('ADMIN_PASSWORD');

function base64url(input) {
  return Buffer.from(input).toString('base64url');
}

function sign(data) {
  return crypto.createHmac('sha256', secret).update(data).digest('base64url');
}

function encode(payload) {
  const serialized = base64url(JSON.stringify(payload));
  return `${serialized}.${sign(serialized)}`;
}

function decode(token) {
  if (!token || !token.includes('.')) return null;
  const [encoded, signature] = token.split('.');
  const expected = sign(encoded);
  try {
    if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return null;
  } catch {
    return null;
  }
  try {
    const payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'));
    if (!payload?.exp || Date.now() > payload.exp) return null;
    return payload;
  } catch {
    return null;
  }
}

function verifyPassword(value) {
  const a = Buffer.from(String(value || ''));
  const b = Buffer.from(adminPassword);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

function setSession(res) {
  const token = encode({ role: 'admin', exp: Date.now() + 1000 * 60 * 60 * 8 });
  res.setHeader('Set-Cookie', `${COOKIE_NAME}=${encodeURIComponent(token)}; HttpOnly; Secure; SameSite=Strict; Max-Age=${60 * 60 * 8}; Path=/`);
}

function clearSession(res) {
  res.setHeader('Set-Cookie', `${COOKIE_NAME}=; HttpOnly; Secure; SameSite=Strict; Max-Age=0; Path=/`);
}

function requireAdmin(req, res) {
  const token = readCookie(req, COOKIE_NAME);
  const payload = decode(token);
  if (payload?.role === 'admin') return payload;
  json(res, 401, { error: 'Bạn chưa đăng nhập admin.' });
  return null;
}

module.exports = { verifyPassword, setSession, clearSession, requireAdmin };
