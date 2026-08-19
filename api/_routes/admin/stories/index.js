const {
  allowMethods, json, parseJson, safeText, safeMultilineText, safeUrl,
  safeDate, requireSameOrigin,
} = require('../../_lib/utils');
const { requireAdmin } = require('../../_lib/auth');
const { supabase, storiesPath, table } = require('../../_lib/supabase');
const { audit } = require('../../_lib/audit');

const fields = [
  'id', 'title', 'linkstory', 'version', 'note', 'votes', 'status', 'youtubelink',
  'thumbnail_url', 'visible', 'source_status', 'source_reason', 'source_deadline',
  'source_warning_public', 'completedat', 'deletedat', 'views', 'youtube_clicks',
  'createdat', 'updatedat',
].join(',');

async function listStoriesForAdmin() {
  try {
    return await supabase(storiesPath(`select=${fields}&order=createdat.desc`));
  } catch (error) {
    if (error.status !== 400) throw error;
    let legacy;
    try {
      legacy = await supabase(storiesPath(
        'select=id,title,linkstory,version,note,votes,status,youtubelink,visible,createdat&order=createdat.desc'
      ));
    } catch (legacyError) {
      if (legacyError.status !== 400) throw legacyError;
      legacy = await supabase(storiesPath(
        'select=id,title,linkstory,version,note,votes,status,youtubelink,createdat&order=createdat.desc'
      ));
    }
    return Array.isArray(legacy) ? legacy.map((story) => ({
      ...story,
      visible: story.visible !== false,
      source_status: 'normal',
      source_reason: '',
      source_deadline: null,
      source_warning_public: false,
      thumbnail_url: null,
      completedat: null,
      deletedat: null,
      views: 0,
      youtube_clicks: 0,
    })) : [];
  }
}

module.exports = async (req, res) => {
  if (!allowMethods(req, res, ['GET', 'POST'])) return;
  if (!requireAdmin(req, res)) return;
  if (req.method !== 'GET' && !requireSameOrigin(req, res)) return;

  try {
    if (req.method === 'GET') {
      const stories = await listStoriesForAdmin();
      return json(res, 200, { stories: Array.isArray(stories) ? stories : [] });
    }

    const body = await parseJson(req);
    const title = safeText(body.title, { max: 220 });
    const youtubelink = safeUrl(body.youtubelink);
    const linkstory = safeUrl(body.linkstory);
    if (title.length < 2) return json(res, 400, { error: 'Tên truyện quá ngắn.' });
    if (String(body.youtubelink || '').trim() && !youtubelink) {
      return json(res, 400, { error: 'Link YouTube không hợp lệ.' });
    }

    const payload = {
      title,
      linkstory: linkstory || null,
      youtubelink: youtubelink || null,
      thumbnail_url: safeUrl(body.thumbnail_url) || null,
      version: body.version === 'Edit' ? 'Edit' : 'Convert',
      note: safeMultilineText(body.note, { max: 5000 }),
      votes: Math.max(0, Math.floor(Number(body.votes || 0))),
      status: 'đã hoàn thành',
      visible: body.visible !== false,
      completedat: safeDate(body.completedat) || new Date().toISOString(),
      updatedat: new Date().toISOString(),
    };

    const inserted = await supabase(table, { method: 'POST', body: JSON.stringify(payload) });
    const story = Array.isArray(inserted) ? inserted[0] : inserted;
    await audit('story.create_completed', 'story', story?.id, { title });
    return json(res, 201, { story });
  } catch (error) {
    return json(res, error.status || 500, {
      error: error.status === 400
        ? 'Hãy chạy supabase.sql của V06 trước khi dùng dashboard mới.'
        : error.message || 'Không tải được dữ liệu admin.',
    });
  }
};

module.exports.listStoriesForAdmin = listStoriesForAdmin;
