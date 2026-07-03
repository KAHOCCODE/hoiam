const {
  allowMethods,
  json,
  parseJson,
  normalizeStatus,
  safeText,
  safeUrl,
} = require('../../_lib/utils');
const { requireAdmin } = require('../../_lib/auth');
const { supabase, table } = require('../../_lib/supabase');

function calculateDonateVotes(amountVnd) {
  let pricePerVote = 5000;
  let discountPercent = 0;

  if (amountVnd >= 1000000) {
    pricePerVote = 3000;
    discountPercent = 40;
  } else if (amountVnd >= 500000) {
    pricePerVote = 3500;
    discountPercent = 30;
  } else if (amountVnd >= 200000) {
    pricePerVote = 4000;
    discountPercent = 20;
  } else if (amountVnd >= 100000) {
    pricePerVote = 4500;
    discountPercent = 10;
  }

  const votes = Math.floor(amountVnd / pricePerVote);

  return {
    votes,
    pricePerVote,
    discountPercent,
  };
}

module.exports = async (req, res) => {
  if (!allowMethods(req, res, ['PATCH', 'DELETE'])) return;
  if (!requireAdmin(req, res)) return;

  const id = Number(req.query.id);

  if (!Number.isInteger(id) || id <= 0) {
    return json(res, 400, { error: 'ID truyện không hợp lệ.' });
  }

  try {
    if (req.method === 'DELETE') {
      await supabase(`${table}?id=eq.${id}`, {
        method: 'DELETE',
        headers: { Prefer: 'return=minimal' },
      });

      return json(res, 200, { ok: true });
    }

    const body = await parseJson(req);

    // Donate đổi vote:
    // Không tạo bảng riêng, không lưu lịch sử.
    // Chỉ tính vote rồi cộng thẳng vào cột votes của truyện.
    if ('donate_amount_vnd' in body) {
      const amountVnd = Number(body.donate_amount_vnd);

      if (!Number.isInteger(amountVnd) || amountVnd <= 0) {
        return json(res, 400, { error: 'Số tiền donate không hợp lệ.' });
      }

      const donate = calculateDonateVotes(amountVnd);

      if (donate.votes <= 0) {
        return json(res, 400, {
          error: 'Số tiền donate chưa đủ để quy đổi thành vote.',
        });
      }

      const current = await supabase(
        `${table}?id=eq.${id}&select=id,votes&limit=1`
      );

      const story = current?.[0];

      if (!story) {
        return json(res, 404, { error: 'Không tìm thấy truyện.' });
      }

      const oldVotes = Number(story.votes || 0);
      const newVotes = oldVotes + donate.votes;

      const updated = await supabase(`${table}?id=eq.${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ votes: newVotes }),
      });

      return json(res, 200, {
        ok: true,
        story: updated?.[0] || { id, votes: newVotes },
        old_votes: oldVotes,
        new_votes: newVotes,
        votes_added: donate.votes,
        amount_vnd: amountVnd,
        price_per_vote: donate.pricePerVote,
        discount_percent: donate.discountPercent,
      });
    }

    const payload = {};

    if ('title' in body) {
      payload.title = safeText(body.title, { max: 220 });
    }

    if ('linkstory' in body) {
      payload.linkstory = safeUrl(body.linkstory);
    }

    if ('youtubelink' in body) {
      payload.youtubelink = safeUrl(body.youtubelink);
    }

    if ('status' in body) {
      payload.status = normalizeStatus(body.status);
    }

    if ('note' in body) {
      payload.note = safeText(body.note, { max: 5000 });
    }

    if ('version' in body) {
      payload.version = body.version === 'Convert' ? 'Convert' : 'Edit';
    }

    if ('votes' in body) {
      const votes = Number(body.votes);
      payload.votes = Number.isFinite(votes) ? Math.max(0, Math.floor(votes)) : 0;
    }

    if ('title' in payload && payload.title.length < 2) {
      return json(res, 400, { error: 'Tên truyện quá ngắn.' });
    }

    const updated = await supabase(`${table}?id=eq.${id}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    });

    return json(res, 200, { story: updated?.[0] || payload });
  } catch (error) {
    return json(res, error.status || 500, {
      error: error.message || 'Không cập nhật được truyện.',
    });
  }
};
