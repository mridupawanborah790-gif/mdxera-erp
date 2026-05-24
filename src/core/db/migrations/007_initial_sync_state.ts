// Tracks per-table progress for the one-time bulk download from Supabase
// (used when a device is first set up against an existing production database).
// Survives crashes and reconnects — sync resumes from `synced_rows` on restart.
export const SQL_007_INITIAL_SYNC_STATE = `
CREATE TABLE IF NOT EXISTS _initial_sync_state (
  table_name TEXT PRIMARY KEY,
  phase TEXT NOT NULL DEFAULT 'foreground',     -- 'foreground' | 'background'
  total_rows INTEGER,                            -- null until first count completes
  synced_rows INTEGER NOT NULL DEFAULT 0,
  is_complete INTEGER NOT NULL DEFAULT 0,
  started_at INTEGER,
  completed_at INTEGER,
  last_error TEXT,
  retry_count INTEGER NOT NULL DEFAULT 0,
  next_retry_at INTEGER                          -- Unix ms, null when not waiting to retry
);
CREATE INDEX IF NOT EXISTS idx_iss_incomplete
  ON _initial_sync_state(is_complete, phase);
`;
