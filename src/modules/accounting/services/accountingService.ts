import { db } from '@core/db/client';
import { TABLE } from '@core/db/schema';
import { SyncQueue } from '@core/sync/SyncQueue';
import { supabase } from '@core/db/supabaseClient';
import type { RegisteredPharmacy } from '@core/types';

function serialize(obj: Record<string, unknown>): Record<string, unknown> {
  const r: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    r[k] = v !== null && typeof v === 'object' ? JSON.stringify(v) : v;
  }
  if (!r.id) r.id = crypto.randomUUID();
  return r;
}

// ── Journal Entries ────────────────────────────────────────────────────────

export interface JournalEntryHeader {
  id: string;
  organization_id: string;
  journal_entry_number: string;
  posting_date: string;
  status: 'Draft' | 'Posted' | 'Reversed';
  reference_type?: string | null;
  reference_id?: string | null;
  reference_document_id?: string | null;
  document_type?: string | null;
  document_reference?: string | null;
  company?: string | null;
  company_code_id?: string | null;
  set_of_books?: string | null;
  set_of_books_id?: string | null;
  narration?: string | null;
  currency_code?: string;
  total_debit: number;
  total_credit: number;
  created_by?: string | null;
  created_at?: string;
}

export interface JournalEntryLine {
  id?: string;
  organization_id: string;
  journal_entry_id: string;
  reference_document_id?: string | null;
  document_type?: string | null;
  line_number: number;
  gl_code?: string | null;
  gl_name?: string | null;
  account_code?: string | null;
  account_name?: string | null;
  ledger_code?: string | null;
  ledger_name?: string | null;
  debit: number;
  credit: number;
  line_memo?: string | null;
}

/** Load recent journal entries (most recent first) for a given document_type. */
export async function fetchRecentJournalEntries(
  user: RegisteredPharmacy,
  documentType: string,
  limit: number = 20
) {
  const rows = await db.select<Record<string, unknown>>(
    `SELECT id, journal_entry_number, posting_date, status, narration, reference_id, created_at, created_by, document_type
     FROM ${TABLE.JOURNAL_ENTRY_HEADER}
     WHERE organization_id = ? AND document_type = ?
     ORDER BY created_at DESC LIMIT ?`,
    [user.organization_id, documentType, limit]
  );
  if (rows.length > 0) return rows;

  const { data } = await supabase
    .from('journal_entry_header')
    .select('id, journal_entry_number, posting_date, status, narration, reference_id, created_at, created_by, document_type')
    .eq('organization_id', user.organization_id)
    .eq('document_type', documentType)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (data?.length) await db.bulkUpsert(TABLE.JOURNAL_ENTRY_HEADER, data.map(serialize));
  return data ?? [];
}

/** Load a single journal entry header + lines by id. */
export async function fetchJournalEntry(user: RegisteredPharmacy, voucherId: string) {
  const headerRows = await db.select<Record<string, unknown>>(
    `SELECT * FROM ${TABLE.JOURNAL_ENTRY_HEADER} WHERE organization_id = ? AND id = ? LIMIT 1`,
    [user.organization_id, voucherId]
  );
  let header = headerRows[0];
  let lines: Record<string, unknown>[];

  if (header) {
    lines = await db.select(
      `SELECT * FROM ${TABLE.JOURNAL_ENTRY_LINES}
       WHERE organization_id = ? AND journal_entry_id = ?
       ORDER BY line_number ASC`,
      [user.organization_id, voucherId]
    );
    return { header, lines };
  }

  // Fallback: pull from Supabase and cache
  const { data: hData } = await supabase
    .from('journal_entry_header')
    .select('*')
    .eq('organization_id', user.organization_id)
    .eq('id', voucherId)
    .maybeSingle();
  if (!hData) return { header: null, lines: [] };
  await db.upsert(TABLE.JOURNAL_ENTRY_HEADER, serialize(hData));

  const { data: lData } = await supabase
    .from('journal_entry_lines')
    .select('*')
    .eq('organization_id', user.organization_id)
    .eq('journal_entry_id', voucherId)
    .order('line_number', { ascending: true });
  if (lData?.length) await db.bulkUpsert(TABLE.JOURNAL_ENTRY_LINES, lData.map(serialize));

  return { header: hData as Record<string, unknown>, lines: (lData ?? []) as Record<string, unknown>[] };
}

/** Find existing journal_entry_numbers matching a prefix pattern. Used to compute next sequence. */
export async function fetchJournalNumbersMatching(
  user: RegisteredPharmacy,
  documentType: string,
  pattern: string,
  limit: number = 5000
): Promise<string[]> {
  // pattern uses SQL LIKE syntax: e.g., 'JV%-2025-26'
  const rows = await db.select<{ journal_entry_number: string }>(
    `SELECT journal_entry_number FROM ${TABLE.JOURNAL_ENTRY_HEADER}
     WHERE organization_id = ? AND document_type = ? AND journal_entry_number LIKE ?
     LIMIT ?`,
    [user.organization_id, documentType, pattern, limit]
  );
  if (rows.length > 0) return rows.map((r) => r.journal_entry_number);

  const { data } = await supabase
    .from('journal_entry_header')
    .select('journal_entry_number')
    .eq('organization_id', user.organization_id)
    .eq('document_type', documentType)
    .ilike('journal_entry_number', pattern.replace('%', '%')) // already SQL LIKE
    .limit(limit);

  return (data ?? []).map((r) => String((r as { journal_entry_number?: string }).journal_entry_number ?? ''));
}

export async function saveJournalEntry(
  header: Omit<JournalEntryHeader, 'id'> & { id?: string },
  lines: Omit<JournalEntryLine, 'id' | 'journal_entry_id'>[],
  user: RegisteredPharmacy,
  existingHeaderId?: string
): Promise<{ id: string; created_at: string }> {
  const id = existingHeaderId ?? header.id ?? crypto.randomUUID();
  const createdAt = (header as { created_at?: string }).created_at ?? new Date().toISOString();
  const headerRow = { ...header, id, created_at: createdAt };

  await db.transaction(async (tx) => {
    if (existingHeaderId) {
      // Replace header + lines atomically
      await tx.execute(
        `UPDATE ${TABLE.JOURNAL_ENTRY_HEADER} SET
           journal_entry_number = ?, posting_date = ?, status = ?,
           reference_type = ?, reference_id = ?, reference_document_id = ?,
           document_type = ?, document_reference = ?,
           company = ?, company_code_id = ?, set_of_books = ?, set_of_books_id = ?,
           narration = ?, currency_code = ?, total_debit = ?, total_credit = ?,
           updated_at = ?, _sync_status = 'pending'
         WHERE id = ?`,
        [
          headerRow.journal_entry_number, headerRow.posting_date, headerRow.status,
          headerRow.reference_type ?? null, headerRow.reference_id ?? null, headerRow.reference_document_id ?? null,
          headerRow.document_type ?? null, headerRow.document_reference ?? null,
          headerRow.company ?? null, headerRow.company_code_id ?? null, headerRow.set_of_books ?? null, headerRow.set_of_books_id ?? null,
          headerRow.narration ?? null, headerRow.currency_code ?? 'INR', headerRow.total_debit, headerRow.total_credit,
          new Date().toISOString(),
          existingHeaderId,
        ]
      );
      await tx.execute(
        `DELETE FROM ${TABLE.JOURNAL_ENTRY_LINES} WHERE organization_id = ? AND journal_entry_id = ?`,
        [user.organization_id, existingHeaderId]
      );
    } else {
      await tx.execute(
        `INSERT INTO ${TABLE.JOURNAL_ENTRY_HEADER}
          (id, organization_id, journal_entry_number, posting_date, status,
           reference_type, reference_id, reference_document_id, document_type, document_reference,
           company, company_code_id, set_of_books, set_of_books_id,
           narration, currency_code, total_debit, total_credit, created_by, created_at, _sync_status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')`,
        [
          id, user.organization_id, headerRow.journal_entry_number, headerRow.posting_date, headerRow.status,
          headerRow.reference_type ?? null, headerRow.reference_id ?? null, headerRow.reference_document_id ?? null,
          headerRow.document_type ?? null, headerRow.document_reference ?? null,
          headerRow.company ?? null, headerRow.company_code_id ?? null, headerRow.set_of_books ?? null, headerRow.set_of_books_id ?? null,
          headerRow.narration ?? null, headerRow.currency_code ?? 'INR', headerRow.total_debit, headerRow.total_credit,
          headerRow.created_by ?? null, createdAt,
        ]
      );
    }

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const lineId = crypto.randomUUID();
      await tx.execute(
        `INSERT INTO ${TABLE.JOURNAL_ENTRY_LINES}
          (id, organization_id, journal_entry_id, reference_document_id, document_type,
           line_number, gl_code, gl_name, account_code, account_name, ledger_code, ledger_name,
           debit, credit, line_memo, _sync_status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')`,
        [
          lineId, user.organization_id, id,
          line.reference_document_id ?? null, line.document_type ?? null,
          line.line_number ?? i + 1,
          line.gl_code ?? null, line.gl_name ?? null,
          line.account_code ?? null, line.account_name ?? null,
          line.ledger_code ?? null, line.ledger_name ?? null,
          line.debit, line.credit, line.line_memo ?? null,
        ]
      );
    }
  });

  // Enqueue sync
  await SyncQueue.enqueue(
    existingHeaderId ? 'UPDATE' : 'INSERT',
    TABLE.JOURNAL_ENTRY_HEADER,
    id,
    { ...headerRow, organization_id: user.organization_id },
    user.organization_id
  );
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    await SyncQueue.enqueue(
      'INSERT',
      TABLE.JOURNAL_ENTRY_LINES,
      `${id}-${i + 1}`,
      {
        organization_id: user.organization_id,
        journal_entry_id: id,
        line_number: line.line_number ?? i + 1,
        gl_code: line.gl_code,
        gl_name: line.gl_name,
        account_code: line.account_code,
        account_name: line.account_name,
        ledger_code: line.ledger_code,
        ledger_name: line.ledger_name,
        debit: line.debit,
        credit: line.credit,
        line_memo: line.line_memo,
        reference_document_id: line.reference_document_id,
        document_type: line.document_type,
      },
      user.organization_id
    );
  }

  return { id, created_at: createdAt };
}

export async function fetchGlMaster(user: RegisteredPharmacy) {
  const rows = await db.select(
    `SELECT * FROM ${TABLE.GL_MASTER} WHERE organization_id = ? AND active_status = 1`,
    [user.organization_id]
  );
  if (rows.length > 0) return rows;

  const { data } = await supabase
    .from('gl_master')
    .select('*')
    .eq('organization_id', user.organization_id)
    .eq('active_status', true);

  if (data?.length) await db.bulkUpsert(TABLE.GL_MASTER, data.map(serialize));
  return data ?? [];
}

export async function fetchGlAssignments(user: RegisteredPharmacy) {
  const rows = await db.select(
    `SELECT * FROM ${TABLE.GL_ASSIGNMENTS} WHERE organization_id = ?`,
    [user.organization_id]
  );
  if (rows.length > 0) return rows;

  const { data } = await supabase
    .from('gl_assignments')
    .select('*')
    .eq('organization_id', user.organization_id);

  if (data?.length) await db.bulkUpsert(TABLE.GL_ASSIGNMENTS, data.map(serialize));
  return data ?? [];
}

export async function fetchCompanyCodes(user: RegisteredPharmacy) {
  const rows = await db.select(
    `SELECT * FROM ${TABLE.COMPANY_CODES} WHERE organization_id = ?`,
    [user.organization_id]
  );
  if (rows.length > 0) return rows;

  const { data } = await supabase
    .from('company_codes')
    .select('*')
    .eq('organization_id', user.organization_id);

  if (data?.length) await db.bulkUpsert(TABLE.COMPANY_CODES, data.map(serialize));
  return data ?? [];
}

export async function fetchSetOfBooks(user: RegisteredPharmacy) {
  const rows = await db.select(
    `SELECT * FROM ${TABLE.SET_OF_BOOKS} WHERE organization_id = ?`,
    [user.organization_id]
  );
  if (rows.length > 0) return rows;

  const { data } = await supabase
    .from('set_of_books')
    .select('*')
    .eq('organization_id', user.organization_id);

  if (data?.length) await db.bulkUpsert(TABLE.SET_OF_BOOKS, data.map(serialize));
  return data ?? [];
}

/** GL accounts for a specific set_of_books (filtered subset of fetchGlMaster). */
export async function fetchGlMasterForBooks(user: RegisteredPharmacy, setOfBooksId: string) {
  const rows = await db.select<Record<string, unknown>>(
    `SELECT id, gl_code, gl_name, gl_type, parent_gl_id, active_status, set_of_books_id, opening_balance
     FROM ${TABLE.GL_MASTER}
     WHERE organization_id = ? AND set_of_books_id = ? AND active_status = 1`,
    [user.organization_id, setOfBooksId]
  );
  if (rows.length > 0) return rows;

  const { data } = await supabase
    .from('gl_master')
    .select('id, gl_code, gl_name, gl_type, parent_gl_id, active_status, set_of_books_id, opening_balance')
    .eq('organization_id', user.organization_id)
    .eq('set_of_books_id', setOfBooksId);

  if (data?.length) await db.bulkUpsert(TABLE.GL_MASTER, data.map(serialize));
  return data ?? [];
}

/** Default GL mappings for a specific set_of_books. */
export async function fetchGlAssignmentsForBooks(user: RegisteredPharmacy, setOfBooksId: string) {
  const rows = await db.select<Record<string, unknown>>(
    `SELECT * FROM ${TABLE.GL_ASSIGNMENTS}
     WHERE organization_id = ? AND set_of_books_id = ?`,
    [user.organization_id, setOfBooksId]
  );
  if (rows.length > 0) return rows;

  const { data } = await supabase
    .from('gl_assignments')
    .select('*')
    .eq('organization_id', user.organization_id)
    .eq('set_of_books_id', setOfBooksId);

  if (data?.length) await db.bulkUpsert(TABLE.GL_ASSIGNMENTS, data.map(serialize));
  return data ?? [];
}

/** Single set_of_books row by id. */
export async function fetchSetOfBooksById(user: RegisteredPharmacy, setOfBooksId: string) {
  const rows = await db.select<Record<string, unknown>>(
    `SELECT * FROM ${TABLE.SET_OF_BOOKS} WHERE organization_id = ? AND id = ? LIMIT 1`,
    [user.organization_id, setOfBooksId]
  );
  if (rows.length > 0) return rows[0];

  const { data } = await supabase
    .from('set_of_books')
    .select('*')
    .eq('organization_id', user.organization_id)
    .eq('id', setOfBooksId)
    .maybeSingle();

  if (data) await db.upsert(TABLE.SET_OF_BOOKS, serialize(data));
  return data;
}

/** Active company codes. */
export async function fetchActiveCompanyCodes(user: RegisteredPharmacy) {
  const rows = await db.select<Record<string, unknown>>(
    `SELECT id, code, description, status FROM ${TABLE.COMPANY_CODES}
     WHERE organization_id = ? AND status = 'Active'`,
    [user.organization_id]
  );
  if (rows.length > 0) return rows;

  const { data } = await supabase
    .from('company_codes')
    .select('id, code, description, status')
    .eq('organization_id', user.organization_id)
    .eq('status', 'Active');

  if (data?.length) await db.bulkUpsert(TABLE.COMPANY_CODES, data.map(serialize));
  return data ?? [];
}

/** All set_of_books for a list of company codes. */
export async function fetchSetOfBooksForCompanies(user: RegisteredPharmacy, companyCodeIds: string[]) {
  if (companyCodeIds.length === 0) return [];

  const placeholders = companyCodeIds.map(() => '?').join(',');
  const rows = await db.select<Record<string, unknown>>(
    `SELECT * FROM ${TABLE.SET_OF_BOOKS}
     WHERE organization_id = ? AND company_code_id IN (${placeholders}) AND active_status = 1`,
    [user.organization_id, ...companyCodeIds]
  );
  if (rows.length > 0) return rows;

  const { data } = await supabase
    .from('set_of_books')
    .select('*')
    .eq('organization_id', user.organization_id)
    .in('company_code_id', companyCodeIds)
    .eq('active_status', true);

  if (data?.length) await db.bulkUpsert(TABLE.SET_OF_BOOKS, data.map(serialize));
  return data ?? [];
}

export async function fetchBankMasters(user: RegisteredPharmacy) {
  const { data } = await supabase
    .from('gl_master')
    .select('id, gl_name, gl_code, parent_gl_id, active_status')
    .eq('organization_id', user.organization_id)
    .eq('gl_type', 'Bank');

  return (data ?? []).map((row) => ({
    id: row.id as string,
    bankName: row.gl_name as string,
    accountName: row.gl_name as string,
    accountNumber: row.gl_code as string,
    linkedBankGlId: row.id as string,
    activeStatus: row.active_status as string,
  }));
}
