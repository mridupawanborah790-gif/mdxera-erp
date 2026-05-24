// Journal entry tables — mirrors the Supabase accounting_journal_schema.sql.
// Used by NewJournalEntryVoucher.tsx and other accounting workflows.
export const SQL_003_JOURNAL_ENTRIES = `
CREATE TABLE IF NOT EXISTS journal_entry_header (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  journal_entry_number TEXT NOT NULL,
  posting_date TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'Posted',
  reference_type TEXT,
  reference_id TEXT,
  reference_document_id TEXT,
  document_type TEXT,
  document_reference TEXT,
  company TEXT,
  company_code_id TEXT,
  set_of_books TEXT,
  set_of_books_id TEXT,
  narration TEXT,
  currency_code TEXT NOT NULL DEFAULT 'INR',
  total_debit REAL NOT NULL DEFAULT 0,
  total_credit REAL NOT NULL DEFAULT 0,
  created_by TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  _sync_status TEXT DEFAULT 'synced',
  _local_only INTEGER DEFAULT 0,
  UNIQUE(organization_id, journal_entry_number)
);
CREATE INDEX IF NOT EXISTS idx_jeh_org_date ON journal_entry_header(organization_id, posting_date DESC);
CREATE INDEX IF NOT EXISTS idx_jeh_ref ON journal_entry_header(reference_type, reference_id);
CREATE INDEX IF NOT EXISTS idx_jeh_ref_doc ON journal_entry_header(reference_document_id, document_type);

CREATE TABLE IF NOT EXISTS journal_entry_lines (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  journal_entry_id TEXT,
  reference_document_id TEXT,
  document_type TEXT,
  line_number INTEGER NOT NULL DEFAULT 1,
  gl_code TEXT,
  gl_name TEXT,
  account_code TEXT,
  account_name TEXT,
  ledger_code TEXT,
  ledger_name TEXT,
  debit REAL NOT NULL DEFAULT 0,
  credit REAL NOT NULL DEFAULT 0,
  line_memo TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  _sync_status TEXT DEFAULT 'synced',
  _local_only INTEGER DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_jel_journal ON journal_entry_lines(journal_entry_id);
CREATE INDEX IF NOT EXISTS idx_jel_org ON journal_entry_lines(organization_id);
CREATE INDEX IF NOT EXISTS idx_jel_ref_doc ON journal_entry_lines(reference_document_id, document_type);
`;
