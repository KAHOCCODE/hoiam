const { supabase } = require('./supabase');
const { settingsTable } = require('./config');
const { safeText, safeMultilineText, safeUrl, safeEmail } = require('./utils');

const defaults = {
  channelName: 'Hồi Âm Đam Mỹ',
  tagline: 'Nơi cộng đồng cùng chọn câu chuyện tiếp theo.',
  youtubeUrl: '',
  logoUrl: '',
  aboutTitle: 'Hồi Âm Đam Mỹ',
  aboutBody: '',
  contactEmail: '',
  socialLinks: [],
  donation: {
    enabled: false,
    bankName: '',
    bankId: '',
    accountName: '',
    accountNumber: '',
    qrUrl: '',
    transferTemplate: '{story} - {name}',
    note: '',
    unitLabel: 'Cá/Linh Thạch',
  },
};

function sanitizeSettings(input = {}) {
  const donation = input.donation || {};
  const socialLinks = Array.isArray(input.socialLinks)
    ? input.socialLinks.slice(0, 30).map((link, index) => ({
      id: safeText(link.id || `link-${index + 1}`, { max: 50 }),
      label: safeText(link.label, { max: 80 }),
      url: safeUrl(link.url),
      description: safeText(link.description, { max: 180 }),
      icon: safeText(link.icon, { max: 60, fallback: 'fa-link' }),
      color: /^#[0-9a-f]{6}$/i.test(link.color || '') ? link.color : '#a78bfa',
      visible: link.visible !== false,
    })).filter((link) => link.label && link.url)
    : [];

  return {
    channelName: safeText(input.channelName, { max: 100, fallback: defaults.channelName }),
    tagline: safeText(input.tagline, { max: 180, fallback: defaults.tagline }),
    youtubeUrl: safeUrl(input.youtubeUrl),
    logoUrl: safeUrl(input.logoUrl),
    aboutTitle: safeText(input.aboutTitle, { max: 140, fallback: defaults.aboutTitle }),
    aboutBody: safeMultilineText(input.aboutBody, { max: 8000 }),
    contactEmail: safeEmail(input.contactEmail),
    socialLinks,
    donation: {
      enabled: donation.enabled === true,
      bankName: safeText(donation.bankName, { max: 100 }),
      bankId: safeText(donation.bankId, { max: 20 }).replace(/[^A-Za-z0-9]/g, ''),
      accountName: safeText(donation.accountName, { max: 120 }),
      accountNumber: safeText(donation.accountNumber, { max: 80 }),
      qrUrl: safeUrl(donation.qrUrl),
      transferTemplate: safeText(donation.transferTemplate, { max: 180, fallback: defaults.donation.transferTemplate }),
      note: safeMultilineText(donation.note, { max: 1000 }),
      unitLabel: safeText(donation.unitLabel, { max: 50, fallback: defaults.donation.unitLabel }),
    },
  };
}

async function loadSettings() {
  try {
    const rows = await supabase(`${settingsTable}?id=eq.main&select=settings&limit=1`);
    return sanitizeSettings({ ...defaults, ...(rows?.[0]?.settings || {}) });
  } catch (error) {
    if (error.status === 404 || error.status === 400) return sanitizeSettings(defaults);
    throw error;
  }
}

module.exports = { defaults, sanitizeSettings, loadSettings };
