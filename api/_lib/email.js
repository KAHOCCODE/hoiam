const { getEnv } = require('./env');

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function mailConfigured() {
  return Boolean(process.env.SMTP_USER && process.env.SMTP_APP_PASSWORD);
}

async function sendDonationAppliedEmail(donation, totalVotes) {
  if (!donation?.donor_email) return { skipped: true };
  if (!mailConfigured()) {
    const error = new Error('Email chưa được cấu hình trong biến môi trường.');
    error.code = 'EMAIL_NOT_CONFIGURED';
    throw error;
  }

  const nodemailer = require('nodemailer');
  const secure = String(getEnv('SMTP_SECURE', 'true')).toLowerCase() !== 'false';
  const sender = getEnv('DONATION_SENDER_EMAIL', 'hoiamdammy@gmail.com');
  const transporter = nodemailer.createTransport({
    host: getEnv('SMTP_HOST', 'smtp.gmail.com'),
    port: Number(getEnv('SMTP_PORT', '465')),
    secure,
    auth: {
      user: getEnv('SMTP_USER', sender),
      pass: getEnv('SMTP_APP_PASSWORD'),
    },
  });

  const amount = Number(donation.amount_vnd || 0).toLocaleString('vi-VN');
  const stones = Number(donation.stone_count || 0).toLocaleString('vi-VN');
  const applied = Number(donation.applied_votes || 0).toLocaleString('vi-VN');
  const total = Number(totalVotes || 0).toLocaleString('vi-VN');

  await transporter.sendMail({
    from: `Hồi Âm Đam Mỹ <${sender}>`,
    to: donation.donor_email,
    subject: `Đã cộng vote cho ${donation.story_title}`,
    text: [
      `Xin chào ${donation.donor_name},`,
      '',
      `Hồi Âm Đam Mỹ đã xác nhận khoản tặng ${amount}đ (${stones} Cá/Linh Thạch).`,
      `Truyện: ${donation.story_title}`,
      `Số vote đã cộng: ${applied}`,
      `Tổng vote mới: ${total}`,
      '',
      'Cảm ơn bạn đã đồng hành cùng Hồi Âm Đam Mỹ!',
    ].join('\n'),
    html: `
      <div style="font-family:Arial,sans-serif;max-width:620px;margin:auto;color:#241b35">
        <div style="padding:28px;border-radius:22px;background:#f7f2ff;border:1px solid #e6d7ff">
          <p>Xin chào <strong>${escapeHtml(donation.donor_name)}</strong>,</p>
          <h2 style="color:#7c3aed">Vote đã được cộng thành công ✨</h2>
          <p>Hồi Âm Đam Mỹ đã xác nhận khoản tặng <strong>${amount}đ</strong> (${stones} Cá/Linh Thạch).</p>
          <p><strong>Truyện:</strong> ${escapeHtml(donation.story_title)}<br>
          <strong>Vote đã cộng:</strong> ${applied}<br>
          <strong>Tổng vote mới:</strong> ${total}</p>
          <p>Cảm ơn bạn đã đồng hành cùng Hồi Âm Đam Mỹ!</p>
        </div>
      </div>`,
  });

  return { sent: true };
}

module.exports = { sendDonationAppliedEmail, mailConfigured };
