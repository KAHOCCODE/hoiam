function calculateDonation(amountVnd) {
  const amount = Math.floor(Number(amountVnd));
  let pricePerVote = 5000;

  if (amount >= 1_000_000) pricePerVote = 3000;
  else if (amount >= 500_000) pricePerVote = 3500;
  else if (amount >= 200_000) pricePerVote = 4000;
  else if (amount >= 100_000) pricePerVote = 4500;

  return {
    amountVnd: amount,
    stoneCount: Math.floor(amount / 1000),
    suggestedVotes: Math.floor(amount / pricePerVote),
    pricePerVote,
  };
}

function donationStatus(value) {
  const allowed = ['pending', 'confirmed', 'waiting_votes', 'applied', 'rejected'];
  return allowed.includes(value) ? value : 'pending';
}

function normalizeTransferText(value, max = 50) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[đĐ]/g, (letter) => (letter === 'đ' ? 'd' : 'D'))
    .replace(/[^A-Za-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

function makeTransferContent(template, story, name) {
  const compactStory = normalizeTransferText(story, 32);
  const compactName = normalizeTransferText(name, 15);
  const raw = String(template || '{story} - {name}')
    .replaceAll('{story}', compactStory)
    .replaceAll('{name}', compactName);
  return normalizeTransferText(raw);
}

module.exports = { calculateDonation, donationStatus, normalizeTransferText, makeTransferContent };
