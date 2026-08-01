const {
  allowMethods, json, parseJson, safeText, safeMultilineText, safeEmail,
  safeDate, requireSameOrigin,
} = require('../../_lib/utils');
const { requireAdmin } = require('../../_lib/auth');
const { supabase, table, isMissingDatabaseObject } = require('../../_lib/supabase');
const { donationsTable } = require('../../_lib/config');
const { calculateDonation } = require('../../_lib/donations');
const { audit } = require('../../_lib/audit');

module.exports = async (req, res) => {
  if (!allowMethods(req, res, ['GET', 'POST'])) return;
  if (!requireAdmin(req, res)) return;
  if (req.method === 'POST' && !requireSameOrigin(req, res)) return;

  try {
    if (req.method === 'GET') {
      const donations = await supabase(`${donationsTable}?select=*&order=createdat.desc`);
      return json(res, 200, { donations: Array.isArray(donations) ? donations : [] });
    }

    const body = await parseJson(req);
    const storyId = Number(body.story_id);
    const donorName = safeText(body.donor_name, { max: 120 });
    const donorEmail = safeEmail(body.donor_email);
    const donation = calculateDonation(body.amount_vnd);
    if (!Number.isInteger(storyId) || storyId <= 0) return json(res, 400, { error: 'Hãy chọn truyện.' });
    if (donorName.length < 2) return json(res, 400, { error: 'Tên người gửi quá ngắn.' });
    if (donation.amountVnd < 1000) return json(res, 400, { error: 'Số tiền không hợp lệ.' });

    const stories = await supabase(`${table}?id=eq.${storyId}&select=id,title&limit=1`);
    const story = stories?.[0];
    if (!story) return json(res, 404, { error: 'Không tìm thấy truyện.' });

    const inserted = await supabase(donationsTable, {
      method: 'POST',
      body: JSON.stringify({
        story_id: story.id,
        story_title: story.title,
        donor_name: donorName,
        amount_vnd: donation.amountVnd,
        stone_count: donation.stoneCount,
        suggested_votes: donation.suggestedVotes,
        status: 'confirmed',
        source_channel: 'admin',
        donor_email: donorEmail || null,
        transaction_ref: safeText(body.transaction_ref, { max: 120 }) || null,
        transfer_content: safeText(body.transfer_content, { max: 180 }),
        donatedat: safeDate(body.donatedat),
        note: safeMultilineText(body.note, { max: 1500 }),
        confirmedat: new Date().toISOString(),
        email_status: donorEmail ? 'waiting_apply' : 'not_requested',
      }),
    });
    const saved = Array.isArray(inserted) ? inserted[0] : inserted;
    await audit('donation.create_external', 'donation', saved?.id, { story_id: story.id });
    return json(res, 201, { donation: saved });
  } catch (error) {
    if (req.method === 'GET' && isMissingDatabaseObject(error)) return json(res, 200, { donations: [], setup_required: true });
    return json(res, error.status || 500, { error: error.message || 'Không xử lý được donate.' });
  }
};
