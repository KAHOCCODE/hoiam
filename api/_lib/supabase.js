const { getEnv } = require('./env');

const baseUrl = getEnv('SUPABASE_URL');
const serviceRoleKey = getEnv('SUPABASE_SERVICE_ROLE_KEY');
const table = getEnv('SUPABASE_STORIES_TABLE', 'stories');

async function supabase(path, options = {}) {
  const response = await fetch(`${baseUrl}/rest/v1/${path}`, {
    ...options,
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
      ...(options.headers || {}),
    },
  });

  let payload = null;
  try { payload = await response.json(); } catch { payload = null; }

  if (!response.ok) {
    const error = new Error(payload?.message || payload?.error || 'Supabase request failed.');
    error.status = response.status;
    error.payload = payload;
    throw error;
  }

  return payload;
}

function storiesPath(query = 'select=*') {
  return `${table}?${query}`;
}

module.exports = { supabase, storiesPath, table };
