const { getEnv } = require('./env');
const { supabase, table, isMissingDatabaseObject } = require('./supabase');

const incrementRpc = getEnv('SUPABASE_INCREMENT_VOTES_RPC', 'increment_story_votes');

function extractVoteCount(payload) {
  if (Number.isFinite(Number(payload))) return Math.max(0, Math.floor(Number(payload)));

  if (Array.isArray(payload) && payload.length) {
    return extractVoteCount(payload[0]);
  }

  if (payload && typeof payload === 'object') {
    for (const key of ['votes', 'new_votes', 'increment_story_votes', 'increment_votes']) {
      if (Number.isFinite(Number(payload[key]))) {
        return Math.max(0, Math.floor(Number(payload[key])));
      }
    }
  }

  return null;
}

async function incrementStoryVotes(storyId, voteDelta = 1) {
  let result;

  try {
    result = await supabase(`rpc/${incrementRpc}`, {
      method: 'POST',
      body: JSON.stringify({
        story_id: storyId,
        vote_delta: voteDelta,
      }),
    });
  } catch (error) {
    const missingRpc = isMissingDatabaseObject(error);

    if (!missingRpc) {
      throw error;
    }

    if (voteDelta === 1 && incrementRpc !== 'increment_votes') {
      try {
        result = await supabase('rpc/increment_votes', {
          method: 'POST',
          body: JSON.stringify({ story_id: storyId }),
        });
      } catch (legacyError) {
        if (!isMissingDatabaseObject(legacyError)) throw legacyError;
      }
    }

    if (result === undefined) {
      const rows = await supabase(`${table}?id=eq.${storyId}&select=id,votes&limit=1`);
      const story = Array.isArray(rows) ? rows[0] : null;
      if (!story) {
        const notFound = new Error('Không tìm thấy truyện.');
        notFound.status = 404;
        throw notFound;
      }
      const nextVotes = Math.max(0, Math.floor(Number(story.votes || 0)) + voteDelta);
      const updated = await supabase(`${table}?id=eq.${storyId}`, {
        method: 'PATCH',
        body: JSON.stringify({ votes: nextVotes }),
      });
      result = Array.isArray(updated) && updated.length ? updated[0] : { votes: nextVotes };
    }
  }

  const votes = extractVoteCount(result);
  if (votes === null) {
    const error = new Error('Không đọc được số vote mới.');
    error.status = 502;
    throw error;
  }

  return votes;
}

module.exports = { incrementStoryVotes };
