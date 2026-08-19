const { allowMethods, json } = require('../_lib/utils');
const { requireAdmin } = require('../_lib/auth');
const { supabase, isMissingDatabaseObject } = require('../_lib/supabase');
const { donationsTable, replacementsTable, announcementsTable } = require('../_lib/config');
const { loadSettings } = require('../_lib/settings');
const { listStoriesForAdmin } = require('./stories/index');

async function optionalList(path) {
  try {
    const rows = await supabase(path);
    return { rows: Array.isArray(rows) ? rows : [], setupRequired: false };
  } catch (error) {
    if (isMissingDatabaseObject(error)) return { rows: [], setupRequired: true };
    throw error;
  }
}

module.exports = async (req, res) => {
  if (!allowMethods(req, res, ['GET'])) return;
  if (!requireAdmin(req, res)) return;

  try {
    const [stories, donations, replacements, announcements, settings] = await Promise.all([
      listStoriesForAdmin(),
      optionalList(`${donationsTable}?select=*&order=createdat.desc`),
      optionalList(`${replacementsTable}?select=*&order=createdat.desc`),
      optionalList(`${announcementsTable}?select=*&order=createdat.desc`),
      loadSettings(),
    ]);

    return json(res, 200, {
      stories: Array.isArray(stories) ? stories : [],
      donations: donations.rows,
      replacements: replacements.rows,
      announcements: announcements.rows,
      settings,
      setup_required: donations.setupRequired || replacements.setupRequired || announcements.setupRequired,
    });
  } catch (error) {
    return json(res, error.status || 500, { error: error.message || 'Không tải được dữ liệu quản trị.' });
  }
};
