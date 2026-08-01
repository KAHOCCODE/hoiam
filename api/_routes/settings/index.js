const { allowMethods, json, logServerError } = require('../_lib/utils');
const { loadSettings } = require('../_lib/settings');
const { supabase } = require('../_lib/supabase');
const { announcementsTable } = require('../_lib/config');

module.exports = async (req, res) => {
  if (!allowMethods(req, res, ['GET'])) return;
  try {
    const settings = await loadSettings();
    let announcements = [];
    try {
      const rows = await supabase(
        `${announcementsTable}?enabled=eq.true&select=id,title,message,tone,display_mode,page_scope,dismissible,startsat,endsat&order=createdat.desc`
      );
      const now = Date.now();
      announcements = Array.isArray(rows) ? rows.filter((item) => {
        const starts = item.startsat ? new Date(item.startsat).getTime() : 0;
        const ends = item.endsat ? new Date(item.endsat).getTime() : Number.POSITIVE_INFINITY;
        return starts <= now && now <= ends;
      }) : [];
    } catch (error) {
      if (![400, 404].includes(error.status)) throw error;
    }
    return json(res, 200, { settings, announcements: Array.isArray(announcements) ? announcements : [] });
  } catch (error) {
    logServerError('api/settings', error);
    return json(res, 200, { settings: null, announcements: [] });
  }
};
