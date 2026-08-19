const {
  allowMethods, json, parseJson, safeText, safeMultilineText, safeDate,
  requireSameOrigin,
} = require('../../_lib/utils');
const { requireAdmin } = require('../../_lib/auth');
const { supabase } = require('../../_lib/supabase');
const { announcementsTable } = require('../../_lib/config');
const { audit } = require('../../_lib/audit');

module.exports = async (req, res) => {
  if (!allowMethods(req, res, ['PATCH', 'DELETE'])) return;
  if (!requireSameOrigin(req, res)) return;
  if (!requireAdmin(req, res)) return;
  const id = Number(req.query.id);
  if (!Number.isInteger(id) || id <= 0) return json(res, 400, { error: 'ID thông báo không hợp lệ.' });
  try {
    if (req.method === 'DELETE') {
      await supabase(`${announcementsTable}?id=eq.${id}`, { method: 'DELETE' });
      await audit('announcement.delete', 'announcement', id);
      return json(res, 200, { ok: true });
    }
    const body = await parseJson(req);
    const payload = { updatedat: new Date().toISOString() };
    if ('title' in body) payload.title = safeText(body.title, { max: 160 });
    if ('message' in body) payload.message = safeMultilineText(body.message, { max: 3000 });
    if ('tone' in body) payload.tone = ['info', 'success', 'warning', 'danger'].includes(body.tone) ? body.tone : 'info';
    if ('display_mode' in body) payload.display_mode = ['banner', 'toast', 'modal'].includes(body.display_mode) ? body.display_mode : 'banner';
    if ('page_scope' in body) payload.page_scope = ['all', 'home', 'library', 'completed', 'guide', 'about', 'privacy', 'terms'].includes(body.page_scope) ? body.page_scope : 'all';
    if ('dismissible' in body) payload.dismissible = body.dismissible !== false;
    if ('enabled' in body) payload.enabled = body.enabled !== false;
    if ('startsat' in body) payload.startsat = safeDate(body.startsat);
    if ('endsat' in body) payload.endsat = safeDate(body.endsat);
    const updated = await supabase(`${announcementsTable}?id=eq.${id}`, {
      method: 'PATCH', body: JSON.stringify(payload),
    });
    await audit('announcement.update', 'announcement', id);
    return json(res, 200, { announcement: updated?.[0] });
  } catch (error) {
    return json(res, error.status || 500, { error: 'Không cập nhật được thông báo.' });
  }
};
