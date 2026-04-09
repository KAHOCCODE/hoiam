function getEnv(name, fallback = '') {
  const value = process.env[name];
  if (typeof value === 'string' && value.length > 0) return value;
  if (fallback) return fallback;
  throw new Error(`Missing environment variable: ${name}`);
}

module.exports = { getEnv };
