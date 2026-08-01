const {
  allowMethods,
  json,
  parseJson,
  getClientIp,
  requireSameOrigin,
} = require('../_lib/utils');
const { verifyPassword, setSession } = require('../_lib/auth');

const attempts = new Map();
const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 5;

function getAttemptState(ip) {
  const now = Date.now();

  if (attempts.size > 500) {
    for (const [key, value] of attempts) {
      if (now - value.startedAt > WINDOW_MS) attempts.delete(key);
    }
  }

  const current = attempts.get(ip);

  if (!current || now - current.startedAt > WINDOW_MS) {
    const fresh = { count: 0, startedAt: now };
    attempts.set(ip, fresh);
    return fresh;
  }

  return current;
}

module.exports = async (req, res) => {
  if (!allowMethods(req, res, ['POST'])) return;
  if (!requireSameOrigin(req, res)) return;

  const ip = getClientIp(req);
  const attemptState = getAttemptState(ip);

  if (attemptState.count >= MAX_ATTEMPTS) {
    const retryAfter = Math.max(1, Math.ceil((WINDOW_MS - (Date.now() - attemptState.startedAt)) / 1000));
    return json(
      res,
      429,
      { error: 'Bạn đã thử quá nhiều lần. Vui lòng quay lại sau.' },
      { 'Retry-After': String(retryAfter) }
    );
  }

  try {
    const body = await parseJson(req);
    if (!verifyPassword(body.password || '')) {
      attemptState.count += 1;
      return json(res, 401, { error: 'Mật khẩu không đúng.' });
    }

    attempts.delete(ip);
    setSession(req, res);
    json(res, 200, { ok: true });
  } catch (error) {
    const status = error.message === 'Payload too large' ? 413 : 400;
    json(res, status, { error: 'Dữ liệu đăng nhập không hợp lệ.' });
  }
};
