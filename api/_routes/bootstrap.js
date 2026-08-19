const { allowMethods, json, logServerError } = require('./_lib/utils');
const { listPublicStories } = require('./stories/index');
const { loadPublicSettings } = require('./settings/index');

module.exports = async (req, res) => {
  if (!allowMethods(req, res, ['GET'])) return;

  const [storyResult, settingResult] = await Promise.allSettled([
    listPublicStories(),
    loadPublicSettings(),
  ]);

  if (storyResult.status === 'rejected' && settingResult.status === 'rejected') {
    logServerError('api/bootstrap:stories', storyResult.reason);
    logServerError('api/bootstrap:settings', settingResult.reason);
    return json(res, 500, { error: 'Không tải được dữ liệu website.' });
  }

  if (storyResult.status === 'rejected') logServerError('api/bootstrap:stories', storyResult.reason);
  if (settingResult.status === 'rejected') logServerError('api/bootstrap:settings', settingResult.reason);

  const publicSettings = settingResult.status === 'fulfilled'
    ? settingResult.value
    : { settings: null, announcements: [] };

  return json(res, 200, {
    stories: storyResult.status === 'fulfilled' && Array.isArray(storyResult.value) ? storyResult.value : [],
    settings: publicSettings.settings,
    announcements: Array.isArray(publicSettings.announcements) ? publicSettings.announcements : [],
    stories_unavailable: storyResult.status === 'rejected',
    settings_unavailable: settingResult.status === 'rejected',
  });
};
