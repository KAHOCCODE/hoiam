const {
  allowMethods,
  json,
  readCookie,
  requireSameOrigin,
  getClientIp,
} = require('../../_lib/utils');
const { incrementStoryVotes } = require('../../_lib/stories');
const { supabase, table } = require('../../_lib/supabase');
const { rateLimit } = require('../../_lib/rate-limit');

function secureCookie(req) {
  const protocol = String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim();
  return protocol === 'https' || process.env.NODE_ENV === 'production' ? '; Secure' : '';
}

function isProposed(status) {
  return String(status || '').normalize('NFC').trim().toLowerCase() === 'đề xuất';
}

module.exports = async (req, res) => {
  if (!allowMethods(req, res, ['POST', 'DELETE'])) return;
  if (!requireSameOrigin(req, res)) return;

  const id = Number(req.query.id);
  if (!Number.isInteger(id) || id <= 0) {
    return json(res, 400, { error: 'ID truyện không hợp lệ.' });
  }

  const limited = rateLimit(`vote:${getClientIp(req)}:${id}`, { limit: 10, windowMs: 60_000 });
  if (!limited.allowed) {
    return json(res, 429, { error: 'Bạn thao tác quá nhanh.' }, { 'Retry-After': String(limited.retryAfter) });
  }

  const cookieName = `hoiam_vote_${id}`;
  const voted = Boolean(readCookie(req, cookieName));

  if (req.method === 'POST' && voted) {
    return json(res, 409, { error: 'Bạn đã vote truyện này rồi.', voted: true });
  }
  if (req.method === 'DELETE' && !voted) {
    return json(res, 409, { error: 'Thiết bị này chưa vote truyện.', voted: false });
  }

  try {
    const found = await supabase(`${table}?id=eq.${id}&select=id,status&limit=1`);
    const story = Array.isArray(found) ? found[0] : null;
    if (!story) return json(res, 404, { error: 'Không tìm thấy truyện.' });
    if (!isProposed(story.status)) {
      return json(res, 409, { error: 'Truyện đã được admin chọn nên đã đóng vote.' });
    }

    const delta = req.method === 'DELETE' ? -1 : 1;
    const votes = await incrementStoryVotes(id, delta);
    res.setHeader(
      'Set-Cookie',
      req.method === 'DELETE'
        ? `${cookieName}=; HttpOnly${secureCookie(req)}; SameSite=Lax; Max-Age=0; Path=/`
        : `${cookieName}=1; HttpOnly${secureCookie(req)}; SameSite=Lax; Max-Age=${60 * 60 * 24 * 365}; Path=/`
    );

    return json(res, 200, { ok: true, votes, voted: req.method === 'POST' });
  } catch (error) {
    const status = error.status === 404 ? 404 : error.status || 500;
    return json(res, status, {
      error: status === 404 ? 'Không tìm thấy truyện.' : 'Không thể cập nhật lượt vote.',
    });
  }
};
