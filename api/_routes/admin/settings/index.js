const { allowMethods, json, parseJson, requireSameOrigin } = require('../../_lib/utils');
const { requireAdmin } = require('../../_lib/auth');
const { supabase } = require('../../_lib/supabase');
const { settingsTable } = require('../../_lib/config');
const { loadSettings, sanitizeSettings } = require('../../_lib/settings');
const { audit } = require('../../_lib/audit');

module.exports = async (req, res) => {
  if (!allowMethods(req, res, ['GET', 'PATCH'])) return;
  if (!requireAdmin(req, res)) return;
  if (req.method === 'PATCH' && !requireSameOrigin(req, res)) return;

  try {
    if (req.method === 'GET') return json(res, 200, { settings: await loadSettings() });
    const body = await parseJson(req);
    const settings = sanitizeSettings(body.settings || body);
    const updated = await supabase(`${settingsTable}?id=eq.main`, {
      method: 'PATCH',
      body: JSON.stringify({ settings, updatedat: new Date().toISOString() }),
    });
    if (!Array.isArray(updated) || !updated.length) {
      await supabase(settingsTable, {
        method: 'POST',
        body: JSON.stringify({ id: 'main', settings }),
      });
    }
    await audit('settings.update', 'site_settings', 'main');
    return json(res, 200, { settings });
  } catch (error) {
    return json(res, error.status || 500, {
      error: error.status === 400 ? 'Hãy chạy supabase.sql của V06 trước.' : 'Không lưu được cài đặt.',
    });
  }
};
