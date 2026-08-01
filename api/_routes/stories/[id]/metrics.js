const {
  allowMethods, json, parseJson, readCookie, requireSameOrigin, getClientIp,
} = require('../../_lib/utils');
const { supabase } = require('../../_lib/supabase');
const { rateLimit } = require('../../_lib/rate-limit');

function secureCookie(req) {
  const protocol = String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim();
  return protocol === 'https' || process.env.NODE_ENV === 'production' ? '; Secure' : '';
}

module.exports = async (req, res) => {
  if (!allowMethods(req, res, ['POST'])) return;
  if (!requireSameOrigin(req, res)) return;
  const id = Number(req.query.id);
  if (!Number.isInteger(id) || id <= 0) return json(res, 400, { error: 'ID truyện không hợp lệ.' });
  try {
    const body = await parseJson(req);
    const metric = body.metric === 'youtube' ? 'youtube' : 'view';
    const cookieName = `hoiam_${metric}_${id}`;
    if (readCookie(req, cookieName)) return json(res, 200, { ok: true, counted: false });
    const limited = rateLimit(`metric:${getClientIp(req)}`, { limit: 30, windowMs: 60_000 });
    if (!limited.allowed) return json(res, 429, { error: 'Quá nhiều yêu cầu.' });

    const value = await supabase('rpc/increment_story_metric', {
      method: 'POST',
      body: JSON.stringify({ story_id: id, metric_name: metric }),
    });
    res.setHeader(
      'Set-Cookie',
      `${cookieName}=1; HttpOnly${secureCookie(req)}; SameSite=Lax; Max-Age=${metric === 'view' ? 86400 : 3600}; Path=/`
    );
    return json(res, 200, { ok: true, counted: true, value });
  } catch (error) {
    return json(res, 200, { ok: false, counted: false });
  }
};
