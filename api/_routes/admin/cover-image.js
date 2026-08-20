const { allowMethods, json, parseJson, safeUrl, requireSameOrigin } = require('../_lib/utils');
const { requireAdmin } = require('../_lib/auth');
const { discoverCoverImage } = require('../_lib/cover-image');
const { supabase, table } = require('../_lib/supabase');
const { audit } = require('../_lib/audit');

module.exports = async (req, res) => {
  if (!allowMethods(req, res, ['POST'])) return;
  if (!requireSameOrigin(req, res)) return;
  if (!requireAdmin(req, res)) return;

  try {
    const body = await parseJson(req);
    const sourceUrl = safeUrl(body.url);
    if (!sourceUrl) return json(res, 400, { error: 'Truyện chưa có link nguồn hợp lệ.' });

    let imageUrl = '';
    try {
      imageUrl = await discoverCoverImage(sourceUrl);
    } catch (error) {
      if ([422, 504].includes(Number(error.status))) {
        return json(res, 200, {
          found: false,
          reason: error.message || 'Website nguồn không cho phép đọc ảnh tự động.',
        });
      }
      throw error;
    }
    if (!imageUrl) {
      return json(res, 200, {
        found: false,
        reason: 'Trang nguồn chưa cung cấp ảnh bìa có thể nhận diện.',
      });
    }

    const storyId = Number(body.story_id || 0);
    if (!storyId) return json(res, 200, { found: true, image_url: imageUrl });
    if (!Number.isInteger(storyId) || storyId < 1) return json(res, 400, { error: 'ID truyện không hợp lệ.' });

    const updated = await supabase(`${table}?id=eq.${storyId}`, {
      method: 'PATCH',
      body: JSON.stringify({ thumbnail_url: imageUrl, updatedat: new Date().toISOString() }),
    });
    const story = Array.isArray(updated) ? updated[0] : updated;
    if (!story) return json(res, 404, { error: 'Không tìm thấy truyện.' });
    await audit('story.find_cover', 'story', storyId, { source: new URL(sourceUrl).hostname });
    return json(res, 200, { found: true, image_url: imageUrl, story });
  } catch (error) {
    return json(res, error.status || 500, { error: error.message || 'Không tìm được ảnh bìa.' });
  }
};
