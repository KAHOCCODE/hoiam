const {
  allowMethods, json, parseJson, safeText, safeMultilineText, safeUrl,
  requireSameOrigin, getClientIp,
} = require('../_lib/utils');
const { supabase, table } = require('../_lib/supabase');
const { replacementsTable } = require('../_lib/config');
const { rateLimit } = require('../_lib/rate-limit');

module.exports = async (req, res) => {
  if (!allowMethods(req, res, ['POST'])) return;
  if (!requireSameOrigin(req, res)) return;
  const limited = rateLimit(`replacement:${getClientIp(req)}`, { limit: 4, windowMs: 10 * 60_000 });
  if (!limited.allowed) return json(res, 429, { error: 'Bạn gửi quá nhanh. Vui lòng thử lại sau.' });

  try {
    const body = await parseJson(req);
    if (safeText(body.website, { max: 40 })) return json(res, 201, { ok: true });
    const storyId = Number(body.story_id);
    const replacementUrl = safeUrl(body.replacement_url);
    if (!Number.isInteger(storyId) || storyId <= 0) return json(res, 400, { error: 'Truyện không hợp lệ.' });
    if (!replacementUrl) return json(res, 400, { error: 'Nguồn thay thế không hợp lệ.' });

    const stories = await supabase(`${table}?id=eq.${storyId}&select=id,title&limit=1`);
    if (!stories?.[0]) return json(res, 404, { error: 'Không tìm thấy truyện.' });

    const inserted = await supabase(replacementsTable, {
      method: 'POST',
      body: JSON.stringify({
        story_id: storyId,
        replacement_url: replacementUrl,
        sender_name: safeText(body.sender_name, { max: 120 }) || null,
        note: safeMultilineText(body.note, { max: 1500 }),
        status: 'pending',
      }),
    });
    return json(res, 201, { ok: true, replacement: inserted?.[0] || inserted });
  } catch (error) {
    return json(res, error.status || 500, { error: 'Không lưu được nguồn thay thế.' });
  }
};
