const { allowMethods, json, parseJson, safeMultilineText, requireSameOrigin } = require('../../_lib/utils');
const { requireAdmin } = require('../../_lib/auth');
const { supabase, table } = require('../../_lib/supabase');
const { replacementsTable } = require('../../_lib/config');
const { audit } = require('../../_lib/audit');

module.exports = async (req, res) => {
  if (!allowMethods(req, res, ['PATCH'])) return;
  if (!requireSameOrigin(req, res)) return;
  if (!requireAdmin(req, res)) return;
  const id = Number(req.query.id);
  if (!Number.isInteger(id) || id <= 0) return json(res, 400, { error: 'ID nguồn thay thế không hợp lệ.' });

  try {
    const body = await parseJson(req);
    const rows = await supabase(`${replacementsTable}?id=eq.${id}&select=*&limit=1`);
    const replacement = rows?.[0];
    if (!replacement) return json(res, 404, { error: 'Không tìm thấy nguồn thay thế.' });
    if (replacement.status !== 'pending') return json(res, 409, { error: 'Nguồn này đã được xử lý.' });

    const approved = body.action === 'approve';
    if (!approved && body.action !== 'reject') return json(res, 400, { error: 'Thao tác không hợp lệ.' });

    if (approved) {
      await supabase(`${table}?id=eq.${replacement.story_id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          linkstory: replacement.replacement_url,
          source_status: 'replaced',
          source_reason: 'Đã thay bằng nguồn do cộng đồng gửi và admin duyệt.',
          source_deadline: null,
          source_warning_public: false,
          visible: true,
          updatedat: new Date().toISOString(),
        }),
      });
    }

    const updated = await supabase(`${replacementsTable}?id=eq.${id}`, {
      method: 'PATCH',
      body: JSON.stringify({
        status: approved ? 'approved' : 'rejected',
        admin_note: safeMultilineText(body.admin_note, { max: 1000 }),
        reviewedat: new Date().toISOString(),
      }),
    });
    await audit(`source_replacement.${body.action}`, 'source_replacement', id, {
      story_id: replacement.story_id,
    });
    return json(res, 200, { replacement: updated?.[0] });
  } catch (error) {
    return json(res, error.status || 500, { error: error.message || 'Không xử lý được nguồn thay thế.' });
  }
};
