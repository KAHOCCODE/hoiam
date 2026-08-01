const assert = require('node:assert/strict');

process.env.SUPABASE_URL = 'https://example.supabase.co';
process.env.SUPABASE_SECRET_KEY = 'sb_secret_test_only';
process.env.SUPABASE_STORIES_TABLE = 'stories';
process.env.SUPABASE_INCREMENT_VOTES_RPC = 'increment_story_votes';

let mode = 'unvote';
const calls = [];

global.fetch = async (url, options = {}) => {
  const target = String(url); const method = options.method || 'GET';
  calls.push({ target, method, body: options.body || '' });

  if (target.includes('/rpc/increment_story_votes')) {
    return response(404, { code: 'PGRST202', message: 'Could not find the function in the schema cache' });
  }
  if (target.includes('/rpc/increment_votes')) {
    if (mode === 'legacy-increment') return response(200, [{ increment_votes: 6 }]);
    return response(404, { code: 'PGRST202', message: 'Could not find the function in the schema cache' });
  }
  if (target.includes('/stories?id=eq.92') && method === 'GET') return response(200, [{ id: 92, votes: 5 }]);
  if (target.includes('/stories?id=eq.92') && method === 'PATCH') return response(200, [{ id: 92, votes: 4 }]);
  throw new Error(`Unexpected request: ${method} ${target}`);
};

function response(status, payload) {
  return { ok: status >= 200 && status < 300, status, json: async () => payload };
}

(async () => {
  const { incrementStoryVotes } = require('../api/_routes/_lib/stories');
  assert.equal(await incrementStoryVotes(92, -1), 4, 'Legacy database must support unvote');
  assert.ok(calls.some((call) => call.method === 'PATCH' && call.body.includes('"votes":4')));

  mode = 'legacy-increment'; calls.length = 0;
  assert.equal(await incrementStoryVotes(92, 1), 6, 'Legacy increment RPC must remain supported');
  assert.ok(calls.some((call) => call.target.includes('/rpc/increment_votes')));
  console.log('Vote compatibility check passed.');
})().catch((error) => { console.error(error); process.exit(1); });
