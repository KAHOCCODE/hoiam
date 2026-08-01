const { allowMethods, json } = require('../../_lib/utils');
const { requireAdmin } = require('../../_lib/auth');
const { supabase, isMissingDatabaseObject } = require('../../_lib/supabase');
const { replacementsTable } = require('../../_lib/config');

module.exports = async (req, res) => {
  if (!allowMethods(req, res, ['GET'])) return;
  if (!requireAdmin(req, res)) return;
  try {
    const replacements = await supabase(`${replacementsTable}?select=*&order=createdat.desc`);
    return json(res, 200, { replacements: Array.isArray(replacements) ? replacements : [] });
  } catch (error) {
    if (isMissingDatabaseObject(error)) return json(res, 200, { replacements: [], setup_required: true });
    return json(res, error.status || 500, { error: 'Không tải được nguồn thay thế.' });
  }
};
