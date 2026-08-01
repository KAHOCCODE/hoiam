const { getEnv } = require('./env');

module.exports = {
  donationsTable: getEnv('SUPABASE_DONATIONS_TABLE', 'donations'),
  settingsTable: getEnv('SUPABASE_SETTINGS_TABLE', 'site_settings'),
  announcementsTable: getEnv('SUPABASE_ANNOUNCEMENTS_TABLE', 'announcements'),
  replacementsTable: getEnv('SUPABASE_SOURCE_REPLACEMENTS_TABLE', 'source_replacements'),
  auditTable: getEnv('SUPABASE_AUDIT_TABLE', 'admin_audit_logs'),
};
