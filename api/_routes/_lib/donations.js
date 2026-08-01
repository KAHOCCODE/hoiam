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

module.exports = { calculateDonation, donationStatus };
