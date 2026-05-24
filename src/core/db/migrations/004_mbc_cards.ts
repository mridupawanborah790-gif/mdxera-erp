// MBC card management tables (types, templates, history). The base mbc_cards
// table is already defined in 001_initial.ts but is extended here with the
// surrounding tables and additional columns the module needs.
export const SQL_004_MBC_CARDS = `
CREATE TABLE IF NOT EXISTS mbc_card_types (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  type_name TEXT NOT NULL,
  type_code TEXT NOT NULL,
  description TEXT,
  default_validity_value INTEGER NOT NULL DEFAULT 1,
  default_validity_unit TEXT NOT NULL DEFAULT 'years',
  default_card_value REAL NOT NULL DEFAULT 0,
  template_id TEXT,
  color_theme TEXT,
  prefix TEXT NOT NULL DEFAULT 'MBC',
  auto_numbering INTEGER NOT NULL DEFAULT 1,
  allow_manual_value_edit INTEGER NOT NULL DEFAULT 0,
  allow_renewal INTEGER NOT NULL DEFAULT 1,
  allow_upgrade INTEGER NOT NULL DEFAULT 1,
  benefits TEXT,
  terms_conditions TEXT,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  _sync_status TEXT DEFAULT 'synced',
  _local_only INTEGER DEFAULT 0,
  UNIQUE (organization_id, type_name),
  UNIQUE (organization_id, type_code)
);

CREATE TABLE IF NOT EXISTS mbc_card_templates (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  template_name TEXT NOT NULL,
  template_code TEXT NOT NULL,
  card_type_id TEXT,
  width REAL NOT NULL DEFAULT 86,
  height REAL NOT NULL DEFAULT 54,
  orientation TEXT NOT NULL DEFAULT 'landscape',
  background_image TEXT,
  logo_image TEXT,
  template_json TEXT NOT NULL DEFAULT '{}',
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  _sync_status TEXT DEFAULT 'synced',
  _local_only INTEGER DEFAULT 0,
  UNIQUE (organization_id, template_name),
  UNIQUE (organization_id, template_code)
);

CREATE TABLE IF NOT EXISTS mbc_card_history (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  mbc_card_id TEXT NOT NULL,
  action_type TEXT NOT NULL,
  old_card_type_id TEXT,
  new_card_type_id TEXT,
  old_validity_to TEXT,
  new_validity_to TEXT,
  old_card_value REAL,
  new_card_value REAL,
  remarks TEXT,
  action_by TEXT,
  action_date TEXT DEFAULT (datetime('now')),
  _sync_status TEXT DEFAULT 'synced',
  _local_only INTEGER DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_mbc_history_org_card ON mbc_card_history (organization_id, mbc_card_id, action_date DESC);

-- Extend mbc_cards with the columns the module expects (these don't exist in 001_initial.ts).
-- SQLite ALTER TABLE limitations: each ADD COLUMN must be its own statement.
-- We use a runtime check by wrapping in a separate migration that tolerates 'duplicate column' errors.
`;
