const { allowMethods, json } = require('../../_lib/utils');
const { requireAdmin } = require('../../_lib/auth');
const { supabase, storiesPath } = require('../../_lib/supabase');

module.exports = async (req, res) => {
  if (!allowMethods(req, res, ['GET'])) return;
  if (!requireAdmin(req, res)) return;

  try {
    const stories = await supabase(
      storiesPath('select=id,title,linkstory,version,note,votes,status,youtubelink,createdat,visible&order=createdat.desc')
    );
    json(res, 200, { stories });
  } catch (error) {
    json(res, error.status || 500, { error: error.message || 'Không tải được dữ liệu admin.' });
  }
};
