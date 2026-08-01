const { supabase } = require('./supabase');
const { auditTable } = require('./config');

async function audit(action, entityType, entityId, detail = {}) {
  try {
    await supabase(auditTable, {
      method: 'POST',
      body: JSON.stringify({
        action,
        entity_type: entityType,
        entity_id: entityId === null || entityId === undefined ? null : String(entityId),
        detail,
      }),
    });
  } catch (error) {
    console.error('[admin-audit]', { message: error?.message || 'Không ghi được nhật ký.' });
  }
}

module.exports = { audit };
