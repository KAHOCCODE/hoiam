const {
  allowMethods, json, parseJson, safeText, safeMultilineText, safeEmail,
  safeDate, requireSameOrigin, getClientIp,
} = require('../_lib/utils');
const { supabase, table } = require('../_lib/supabase');
const { donationsTable } = require('../_lib/config');
const { calculateDonation } = require('../_lib/donations');
const { loadSettings } = require('../_lib/settings');
const { rateLimit } = require('../_lib/rate-limit');

function makeTransferContent(template, story, name) {
  const raw = String(template || '{story} - {name}')
    .replaceAll('{story}', story)
    .replaceAll('{name}', name);
  return safeText(raw, { max: 180 });
}

module.exports = async (req, res) => {
  if (!allowMethods(req, res, ['POST'])) return;
  if (!requireSameOrigin(req, res)) return;

  const limited = rateLimit(`donation:${getClientIp(req)}`, { limit: 4, windowMs: 10 * 60_000 });
  if (!limited.allowed) {
    return json(res, 429, { error: 'Bạn đã gửi nhiều thông báo donate. Vui lòng thử lại sau.' }, {
      'Retry-After': String(limited.retryAfter),
    });
  }

  try {
    const body = await parseJson(req);
    if (safeText(body.website, { max: 40 })) return json(res, 201, { ok: true });

    const storyId = Number(body.story_id);
    const donorName = safeText(body.donor_name, { max: 120 });
    const donorEmail = safeEmail(body.donor_email);
    const transactionRef = safeText(body.transaction_ref, { max: 120 });
    const sourceChannel = ['website', 'youtube', 'email'].includes(body.source_channel)
      ? body.source_channel
      : 'website';
    const donation = calculateDonation(body.amount_vnd);

    if (!Number.isInteger(storyId) || storyId <= 0) return json(res, 400, { error: 'Hãy chọn truyện muốn ủng hộ.' });
    if (donorName.length < 2) return json(res, 400, { error: 'Hãy nhập tên người gửi.' });
    if (!Number.isInteger(donation.amountVnd) || donation.amountVnd < 1000) {
      return json(res, 400, { error: 'Số tiền tối thiểu là 1.000đ.' });
    }
    if (String(body.donor_email || '').trim() && !donorEmail) {
      return json(res, 400, { error: 'Email nhận thông báo không hợp lệ.' });
    }

    const rows = await supabase(`${table}?id=eq.${storyId}&select=id,title,status&limit=1`);
    const story = Array.isArray(rows) ? rows[0] : null;
    if (!story) return json(res, 404, { error: 'Không tìm thấy truyện.' });

    const settings = await loadSettings();
    if (!settings.donation.enabled) return json(res, 409, { error: 'Kênh đang tạm đóng nhận donate trên website.' });

    const transferContent = makeTransferContent(
      settings.donation.transferTemplate,
      safeText(story.title, { max: 100 }),
      donorName
    );
    const payload = {
      story_id: storyId,
      story_title: story.title,
      donor_name: donorName,
      amount_vnd: donation.amountVnd,
      stone_count: donation.stoneCount,
      suggested_votes: donation.suggestedVotes,
      status: 'pending',
      source_channel: sourceChannel,
      donor_email: donorEmail || null,
      transaction_ref: transactionRef || null,
      transfer_content: transferContent,
      donatedat: safeDate(body.donatedat),
      note: safeMultilineText(body.note, { max: 1500 }),
      email_status: donorEmail ? 'waiting_apply' : 'not_requested',
    };

    const inserted = await supabase(donationsTable, { method: 'POST', body: JSON.stringify(payload) });
    const saved = Array.isArray(inserted) ? inserted[0] : inserted;
    return json(res, 201, {
      ok: true,
      donation: {
        id: saved?.id,
        status: saved?.status || 'pending',
        stone_count: donation.stoneCount,
        suggested_votes: donation.suggestedVotes,
        transfer_content: transferContent,
      },
    });
  } catch (error) {
    const detail = JSON.stringify(error?.payload || '').toLowerCase();
    if (detail.includes('donations_transaction_ref_unique') || detail.includes('duplicate')) {
      return json(res, 409, { error: 'Mã giao dịch này đã được gửi trước đó.' });
    }
    return json(res, error.status || 500, {
      error: error.status === 400
        ? 'Chức năng donate chưa được khởi tạo. Admin cần chạy supabase.sql V06.'
        : 'Không lưu được thông báo donate lúc này.',
    });
  }
};
