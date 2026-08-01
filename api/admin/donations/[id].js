const {
  allowMethods, json, parseJson, safeMultilineText, requireSameOrigin,
} = require('../../_lib/utils');
const { requireAdmin } = require('../../_lib/auth');
const { supabase, table } = require('../../_lib/supabase');
const { donationsTable } = require('../../_lib/config');
const { sendDonationAppliedEmail } = require('../../_lib/email');
const { audit } = require('../../_lib/audit');

function rpcResult(payload) {
  if (Array.isArray(payload)) return payload[0] || {};
  return payload && typeof payload === 'object' ? payload : {};
}

async function loadDonation(id) {
  const rows = await supabase(`${donationsTable}?id=eq.${id}&select=*&limit=1`);
  return rows?.[0] || null;
}

async function sendResultEmail(donation, totalVotes) {
  try {
    await sendDonationAppliedEmail(donation, totalVotes);
    await supabase(`${donationsTable}?id=eq.${donation.id}`, {
      method: 'PATCH',
      body: JSON.stringify({
        email_status: donation.donor_email ? 'sent' : 'not_requested',
        email_sentat: donation.donor_email ? new Date().toISOString() : null,
        email_error: '',
        updatedat: new Date().toISOString(),
      }),
    });
    return { sent: Boolean(donation.donor_email), skipped: !donation.donor_email };
  } catch (error) {
    await supabase(`${donationsTable}?id=eq.${donation.id}`, {
      method: 'PATCH',
      body: JSON.stringify({
        email_status: 'failed',
        email_error: String(error.message || 'Gửi email thất bại.').slice(0, 500),
        updatedat: new Date().toISOString(),
      }),
    });
    return { sent: false, error: error.message || 'Gửi email thất bại.' };
  }
}

module.exports = async (req, res) => {
  if (!allowMethods(req, res, ['PATCH'])) return;
  if (!requireSameOrigin(req, res)) return;
  if (!requireAdmin(req, res)) return;
  const id = Number(req.query.id);
  if (!Number.isInteger(id) || id <= 0) return json(res, 400, { error: 'ID donate không hợp lệ.' });

  try {
    const body = await parseJson(req);
    const action = String(body.action || 'update');
    let donation = await loadDonation(id);
    if (!donation) return json(res, 404, { error: 'Không tìm thấy donate.' });

    if (action === 'apply_votes') {
      const votes = Math.max(0, Math.floor(Number(body.applied_votes ?? donation.suggested_votes)));
      const result = rpcResult(await supabase('rpc/apply_donation_votes', {
        method: 'POST',
        body: JSON.stringify({ donation_id: id, vote_count: votes }),
      }));
      donation = await loadDonation(id);
      const email = result.already_applied
        ? { skipped: true, reason: 'already_applied' }
        : await sendResultEmail(donation, result.total_votes);
      await audit('donation.apply_votes', 'donation', id, {
        votes: result.applied_votes,
        total_votes: result.total_votes,
        already_applied: Boolean(result.already_applied),
      });
      return json(res, 200, { donation: await loadDonation(id), result, email });
    }

    if (action === 'retry_email') {
      if (donation.status !== 'applied') return json(res, 409, { error: 'Donate chưa được cộng vote.' });
      const stories = await supabase(`${table}?id=eq.${donation.story_id}&select=votes&limit=1`);
      const email = await sendResultEmail(donation, stories?.[0]?.votes || 0);
      await audit('donation.retry_email', 'donation', id, { sent: Boolean(email.sent) });
      return json(res, email.sent || email.skipped ? 200 : 502, { donation: await loadDonation(id), email });
    }

    const statusMap = {
      confirm: 'confirmed',
      waiting_votes: 'waiting_votes',
      reject: 'rejected',
    };
    const status = statusMap[action];
    if (!status) return json(res, 400, { error: 'Thao tác donate không hợp lệ.' });
    if (donation.status === 'applied') return json(res, 409, { error: 'Donate đã được cộng vote, không thể đổi trạng thái.' });

    const payload = {
      status,
      admin_note: safeMultilineText(body.admin_note, { max: 1500 }),
      updatedat: new Date().toISOString(),
    };
    if (status === 'confirmed') payload.confirmedat = new Date().toISOString();
    const updated = await supabase(`${donationsTable}?id=eq.${id}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    });
    await audit(`donation.${action}`, 'donation', id);
    return json(res, 200, { donation: updated?.[0] || { ...donation, ...payload } });
  } catch (error) {
    return json(res, error.status || 500, { error: error.message || 'Không cập nhật được donate.' });
  }
};
