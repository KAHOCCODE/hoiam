const {
  allowMethods,
  json,
  parseJson,
  safeText,
  safeMultilineText,
  safeUrl,
  readCookie,
  requireSameOrigin,
} = require('../_lib/utils');
const { supabase, table } = require('../_lib/supabase');

function secureCookie(req) {
  const protocol = String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim();
  return protocol === 'https' || process.env.NODE_ENV === 'production' ? '; Secure' : '';
}

function missingVisibleColumn(error) {
  const details = JSON.stringify(error?.payload || {}).toLowerCase();
  return error?.status === 400 && details.includes('visible');
}

async function insertSuggestion(payload) {
  try {
    return await supabase(table, {
      method: 'POST',
      body: JSON.stringify({ ...payload, visible: true }),
    });
  } catch (error) {
    if (!missingVisibleColumn(error)) throw error;

    return supabase(table, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }
}

module.exports = async (req, res) => {
  if (!allowMethods(req, res, ['POST'])) return;
  if (!requireSameOrigin(req, res)) return;

  if (readCookie(req, 'hoiam_suggested')) {
    return json(
      res,
      429,
      { error: 'Bạn vừa gửi đề xuất. Vui lòng chờ một phút rồi thử lại.' },
      { 'Retry-After': '60' }
    );
  }

  try {
    const body = await parseJson(req);

    if (safeText(body.website, { max: 40 })) {
      return json(res, 200, { ok: true });
    }

    const title = safeText(body.title, { max: 220 });
    const linkstory = safeUrl(body.linkstory);
    const version = body.version === 'Edit' ? 'Edit' : 'Convert';
    const note = safeMultilineText(body.note, { max: 5000 });

    if (title.length < 2) {
      return json(res, 400, { error: 'Tên truyện quá ngắn.' });
    }

    if (!linkstory) {
      return json(res, 400, { error: 'Link truyện không hợp lệ.' });
    }

    const existed = await supabase(
      `${table}?linkstory=eq.${encodeURIComponent(linkstory)}&select=id&limit=1`
    );

    if (Array.isArray(existed) && existed.length) {
      return json(res, 409, { error: 'Truyện này đã có trong kho đề xuất.' });
    }

    const inserted = await insertSuggestion({
      title,
      linkstory,
      version,
      note,
      status: 'đề xuất',
      votes: 0,
    });

    res.setHeader(
      'Set-Cookie',
      `hoiam_suggested=1; HttpOnly${secureCookie(req)}; SameSite=Lax; Max-Age=60; Path=/`
    );

    const story = Array.isArray(inserted) ? inserted[0] : inserted;
    return json(res, 201, {
      ok: true,
      story: story ? { id: story.id, title: story.title } : null,
    });
  } catch (error) {
    const status = error.message === 'Payload too large' ? 413 : error.status || 500;
    return json(res, status, {
      error: status === 413 ? 'Nội dung gửi lên quá lớn.' : 'Không thể lưu đề xuất lúc này.',
    });
  }
};
