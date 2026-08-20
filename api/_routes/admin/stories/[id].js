const {
  allowMethods, json, parseJson, normalizeStatus, safeText, safeMultilineText,
  safeUrl, safeDate, requireSameOrigin,
} = require('../../_lib/utils');
const { requireAdmin } = require('../../_lib/auth');
const { supabase, table } = require('../../_lib/supabase');
const { audit } = require('../../_lib/audit');
const { discoverCoverImage } = require('../../_lib/cover-image');

const sourceStatuses = new Set(['normal', 'suspected', 'confirmed', 'replaced']);

module.exports = async (req, res) => {
  if (!allowMethods(req, res, ['PATCH', 'DELETE'])) return;
  if (!requireSameOrigin(req, res)) return;
  if (!requireAdmin(req, res)) return;

  const id = Number(req.query.id);
  if (!Number.isInteger(id) || id <= 0) return json(res, 400, { error: 'ID truyện không hợp lệ.' });

  try {
    if (req.method === 'DELETE') {
      const updated = await supabase(`${table}?id=eq.${id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          visible: false,
          deletedat: new Date().toISOString(),
          updatedat: new Date().toISOString(),
        }),
      });
      if (!Array.isArray(updated) || !updated.length) return json(res, 404, { error: 'Không tìm thấy truyện.' });
      await audit('story.move_to_trash', 'story', id);
      return json(res, 200, { ok: true, story: updated[0] });
    }

    const body = await parseJson(req);
    const payload = { updatedat: new Date().toISOString() };

    if ('title' in body) payload.title = safeText(body.title, { max: 220 });
    if ('linkstory' in body) payload.linkstory = safeUrl(body.linkstory) || null;
    if ('youtubelink' in body) payload.youtubelink = safeUrl(body.youtubelink) || null;
    if ('thumbnail_url' in body) payload.thumbnail_url = safeUrl(body.thumbnail_url) || null;
    if ('status' in body) payload.status = normalizeStatus(body.status);
    if ('note' in body) payload.note = safeMultilineText(body.note, { max: 5000 });
    if ('version' in body) payload.version = body.version === 'Edit' ? 'Edit' : 'Convert';
    if ('votes' in body) payload.votes = Math.max(0, Math.floor(Number(body.votes || 0)));
    if ('visible' in body) payload.visible = body.visible !== false;
    if ('deletedat' in body) payload.deletedat = safeDate(body.deletedat);
    if ('completedat' in body) payload.completedat = safeDate(body.completedat);
    if ('source_status' in body) {
      payload.source_status = sourceStatuses.has(body.source_status) ? body.source_status : 'normal';
    }
    if ('source_reason' in body) payload.source_reason = safeMultilineText(body.source_reason, { max: 1000 });
    if ('source_deadline' in body) payload.source_deadline = safeDate(body.source_deadline);
    if ('source_warning_public' in body) payload.source_warning_public = body.source_warning_public === true;
    if (body.auto_thumbnail === true && !payload.thumbnail_url && payload.linkstory) {
      try { payload.thumbnail_url = await discoverCoverImage(payload.linkstory) || null; }
      catch { /* vẫn cho phép lưu khi website nguồn không đọc được ảnh */ }
    }
    if (payload.status === 'đã hoàn thành' && !('completedat' in body)) {
      payload.completedat = new Date().toISOString();
    }

    if ('title' in payload && payload.title.length < 2) return json(res, 400, { error: 'Tên truyện quá ngắn.' });
    for (const [key, label] of [['linkstory', 'Link truyện'], ['youtubelink', 'Link YouTube'], ['thumbnail_url', 'Link ảnh']]) {
      if (key in body && String(body[key] || '').trim() && !payload[key]) {
        return json(res, 400, { error: `${label} không hợp lệ.` });
      }
    }

    const updated = await supabase(`${table}?id=eq.${id}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    });
    if (!Array.isArray(updated) || !updated.length) return json(res, 404, { error: 'Không tìm thấy truyện.' });
    await audit('story.update', 'story', id, { fields: Object.keys(payload) });
    return json(res, 200, { story: updated[0] });
  } catch (error) {
    return json(res, error.status || 500, {
      error: error.status === 400
        ? 'Hãy chạy supabase.sql của V06 trước khi lưu trường dữ liệu mới.'
        : error.message || 'Không cập nhật được truyện.',
    });
  }
};
