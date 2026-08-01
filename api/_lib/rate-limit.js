const buckets = new Map();

function rateLimit(key, { limit = 8, windowMs = 60_000 } = {}) {
  const now = Date.now();
  const bucket = buckets.get(key);

  if (!bucket || now - bucket.startedAt >= windowMs) {
    buckets.set(key, { count: 1, startedAt: now });
    return { allowed: true, retryAfter: 0 };
  }

  bucket.count += 1;
  if (bucket.count <= limit) return { allowed: true, retryAfter: 0 };

  return {
    allowed: false,
    retryAfter: Math.max(1, Math.ceil((windowMs - (now - bucket.startedAt)) / 1000)),
  };
}

module.exports = { rateLimit };
