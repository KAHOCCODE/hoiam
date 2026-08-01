const assert = require('node:assert/strict');

process.env.SUPABASE_URL = 'https://example.supabase.co';
process.env.SUPABASE_SECRET_KEY = 'sb_secret_test_only';
process.env.ADMIN_PASSWORD = 'test-password';
process.env.ADMIN_SESSION_SECRET = '01234567890123456789012345678901';

global.fetch = async () => ({
  ok: false,
  status: 404,
  json: async () => ({ code: 'PGRST205', message: 'Could not find the table in the schema cache' }),
});

function response() {
  return {
    statusCode: 200,
    headers: {},
    setHeader(name, value) { this.headers[String(name).toLowerCase()] = value; },
    end(body = '') { this.body = body; },
  };
}

(async () => {
  const { setSession } = require('../api/_routes/_lib/auth');
  const sessionResponse = response();
  setSession({ headers: {} }, sessionResponse);
  const cookie = sessionResponse.headers['set-cookie'].split(';')[0];
  const checks = [
    ['../api/_routes/admin/donations/index', 'donations'],
    ['../api/_routes/admin/source-replacements/index', 'replacements'],
    ['../api/_routes/admin/announcements/index', 'announcements'],
  ];

  for (const [modulePath, key] of checks) {
    const handler = require(modulePath); const res = response();
    await handler({ method: 'GET', headers: { cookie }, socket: {} }, res);
    assert.equal(res.statusCode, 200, `${key} must stay usable before migration`);
    const payload = JSON.parse(res.body);
    assert.deepEqual(payload[key], []);
    assert.equal(payload.setup_required, true);
  }
  console.log('Legacy admin compatibility check passed.');
})().catch((error) => { console.error(error); process.exit(1); });
