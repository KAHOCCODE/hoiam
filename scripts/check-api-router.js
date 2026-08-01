const assert = require('node:assert/strict');

process.env.SUPABASE_URL = 'https://example.supabase.co';
process.env.SUPABASE_SECRET_KEY = 'sb_secret_test_only';
process.env.ADMIN_PASSWORD = 'test-password';
process.env.ADMIN_SESSION_SECRET = '01234567890123456789012345678901';

const router = require('../api');

assert.equal(router.requestPath({ url: '/api/stories?sort=votes' }), 'stories');
assert.equal(router.requestPath({ url: '/api/admin/stories/92' }), 'admin/stories/92');
assert.equal(router.requestPath({ url: '/api', query: { path: 'stories/92/vote' } }), 'stories/92/vote');
assert.ok(router.resolveRoute('stories'));
assert.ok(router.resolveRoute('admin/settings'));
assert.equal(router.resolveRoute('stories/92/vote').id, '92');
assert.equal(router.resolveRoute('stories/178/metrics').id, '178');
assert.equal(router.resolveRoute('admin/donations/12').id, '12');
assert.equal(router.resolveRoute('unknown'), null);

console.log('API router compatibility check passed (19 routes, 1 Vercel Function).');
