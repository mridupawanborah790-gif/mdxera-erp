// Sync infrastructure tables — these are local-only and never pushed to Supabase.
export const SQL_002_SYNC_TABLES = `
CREATE TABLE IF NOT EXISTS _sync_queue (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  operation TEXT NOT NULL,
  table_name TEXT NOT NULL,
  record_id TEXT NOT NULL,
  payload TEXT NOT NULL,
  organization_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  attempts INTEGER DEFAULT 0,
  last_error TEXT,
  status TEXT DEFAULT 'pending'
);
CREATE INDEX IF NOT EXISTS idx_sq_status ON _sync_queue(status);
CREATE INDEX IF NOT EXISTS idx_sq_created ON _sync_queue(created_at);

CREATE TABLE IF NOT EXISTS _sync_meta (
  table_name TEXT PRIMARY KEY,
  last_pulled_at INTEGER,
  last_pushed_at INTEGER
);

CREATE TABLE IF NOT EXISTS _local_auth (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  user_data TEXT NOT NULL,
  roles_data TEXT NOT NULL,
  hmac_secret TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS _migrations (
  version INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  applied_at INTEGER NOT NULL
);
`;
