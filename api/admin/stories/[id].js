const {
  allowMethods,
  json,
  parseJson,
  normalizeStatus,
  safeText,
  safeUrl
} = require('../../_lib/utils');
const { requireAdmin } = require('../../_lib/auth');
const { supabase, table } = require('../../_lib/supabase');

module.exports = async (req, res) => {
  if (!allowMethods(req, res, ['PATCH', 'DELETE'])) return;
  if (!requireAdmin(req, res)) return;

  const id = Number(req.query.id);
  if (!Number.isInteger(id) || id <= 0) {
    return json(res, 400, { error: 'ID truyện không hợp lệ.' });
  }

  try {
    if (req.method === 'DELETE') {
      await supabase(`${table}?id=eq.${id}`, {
        method: 'DELETE',
        headers: { Prefer: 'return=minimal' }
      });
      return json(res, 200, { ok: true });
    }

    const body = await parseJson(req);
    const payload = {};

    if ('title' in body) payload.title = safeText(body.title, { max: 120 });
    if ('linkstory' in body) payload.linkstory = safeUrl(body.linkstory);
    if ('youtubelink' in body) payload.youtubelink = safeUrl(body.youtubelink);
    if ('status' in body) payload.status = normalizeStatus(body.status);
    if ('note' in body) payload.note = safeText(body.note, { max: 300 });
    if ('version' in body) payload.version = body.version === 'Convert' ? 'Convert' : 'Edit';
    if ('votes' in body) {
      payload.votes = Math.max(0, Number.isFinite(Number(body.votes)) ? Number(body.votes) : 0);
    }

    if ('title' in payload && payload.title.length < 2) {
      return json(res, 400, { error: 'Tên truyện quá ngắn.' });
    }

    const updated = await supabase(`${table}?id=eq.${id}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    });

    json(res, 200, { story: updated?.[0] || payload });
  } catch (error) {
    json(res, error.status || 500, {
      error: error.message || 'Không cập nhật được truyện.',
    });
  }
};
