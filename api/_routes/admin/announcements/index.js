const {
  allowMethods, json, parseJson, safeText, safeMultilineText, safeDate,
  requireSameOrigin,
} = require('../../_lib/utils');
const { requireAdmin } = require('../../_lib/auth');
const { supabase, isMissingDatabaseObject } = require('../../_lib/supabase');
const { announcementsTable } = require('../../_lib/config');
const { audit } = require('../../_lib/audit');

function payloadFrom(body) {
  const tone = ['info', 'success', 'warning', 'danger'].includes(body.tone) ? body.tone : 'info';
  const displayMode = ['banner', 'toast', 'modal'].includes(body.display_mode) ? body.display_mode : 'banner';
  const pageScope = ['all', 'home', 'library', 'completed', 'guide'].includes(body.page_scope)
    ? body.page_scope
    : 'all';
  return {
    title: safeText(body.title, { max: 160 }),
    message: safeMultilineText(body.message, { max: 3000 }),
    tone,
    display_mode: displayMode,
    page_scope: pageScope,
    dismissible: body.dismissible !== false,
    enabled: body.enabled !== false,
    startsat: safeDate(body.startsat),
    endsat: safeDate(body.endsat),
    updatedat: new Date().toISOString(),
  };
}

module.exports = async (req, res) => {
  if (!allowMethods(req, res, ['GET', 'POST'])) return;
  if (!requireAdmin(req, res)) return;
  if (req.method === 'POST' && !requireSameOrigin(req, res)) return;
  try {
    if (req.method === 'GET') {
      const announcements = await supabase(`${announcementsTable}?select=*&order=createdat.desc`);
      return json(res, 200, { announcements: Array.isArray(announcements) ? announcements : [] });
    }
    const body = await parseJson(req);
    const payload = payloadFrom(body);
    if (!payload.title || !payload.message) return json(res, 400, { error: 'Hãy nhập tiêu đề và nội dung.' });
    const inserted = await supabase(announcementsTable, { method: 'POST', body: JSON.stringify(payload) });
    const item = inserted?.[0] || inserted;
    await audit('announcement.create', 'announcement', item?.id);
    return json(res, 201, { announcement: item });
  } catch (error) {
    if (req.method === 'GET' && isMissingDatabaseObject(error)) return json(res, 200, { announcements: [], setup_required: true });
    return json(res, error.status || 500, { error: 'Không xử lý được thông báo.' });
  }
};

module.exports.payloadFrom = payloadFrom;
