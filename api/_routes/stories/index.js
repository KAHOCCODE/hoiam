const { allowMethods, json, logServerError } = require('../_lib/utils');
const { supabase, storiesPath } = require('../_lib/supabase');

const extendedFields = [
  'id', 'title', 'linkstory', 'version', 'note', 'votes', 'status', 'youtubelink',
  'thumbnail_url', 'source_status', 'source_reason', 'source_deadline',
  'source_warning_public', 'completedat', 'views', 'youtube_clicks', 'createdat',
].join(',');
const legacyFields = 'id,title,linkstory,version,note,votes,status,youtubelink,createdat';

async function listPublicStories() {
  try {
    return await supabase(
      storiesPath(`select=${extendedFields}&visible=eq.true&deletedat=is.null&order=createdat.desc`)
    );
  } catch (error) {
    const details = JSON.stringify(error?.payload || {}).toLowerCase();
    const legacySchema = error?.status === 400 && [
      'visible', 'deletedat', 'thumbnail_url', 'source_status', 'source_reason',
      'source_deadline', 'source_warning_public', 'completedat', 'views', 'youtube_clicks',
    ].some((column) => details.includes(column));
    if (!legacySchema) throw error;

    return supabase(storiesPath(`select=${legacyFields}&order=createdat.desc`));
  }
}

module.exports = async (req, res) => {
  if (!allowMethods(req, res, ['GET'])) return;

  try {
    const stories = await listPublicStories();
    return json(res, 200, { stories: Array.isArray(stories) ? stories : [] });
  } catch (error) {
    logServerError('api/stories', error);
    return json(res, error.status || 500, { error: 'Không tải được kho truyện.' });
  }
};

module.exports.listPublicStories = listPublicStories;
