/**
 * Schema-aware row filtering for Supabase → SQLite sync.
 *
 * Production Supabase schemas can have columns that our SQLite mirror doesn't
 * (yet) know about. Without filtering, INSERT statements crash with
 * "no such column". This helper:
 *
 *   1. Introspects each SQLite table once (PRAGMA table_info) and caches the
 *      list of allowed columns.
 *   2. Strips unknown columns from incoming Supabase rows.
 *   3. JSON-stringifies nested objects/arrays (SQLite TEXT columns).
 *   4. Converts booleans to integers (SQLite has no bool type).
 *   5. Sets the sync-engine bookkeeping columns (_sync_status, _local_only).
 *
 * The cache survives the entire app session; tables only change when a
 * migration runs (and the app restarts after).
 */
import { db } from '@core/db/client';

interface ColumnInfo {
  name: string;
  type: string; // SQLite column declared type (TEXT/INTEGER/REAL/etc.)
  notnull: number;
  dflt_value: string | null;
  pk: number;
}

interface SchemaInfo {
  /** Column name → ColumnInfo (so callers can check notnull and type). */
  byName: Map<string, ColumnInfo>;
}

const _schemaCache = new Map<string, SchemaInfo>();

/**
 * Read the SQLite column list for a table. Results are cached.
 * Returns null if the table doesn't exist (gracefully — caller can skip).
 */
async function getSchemaForTable(tableName: string): Promise<SchemaInfo | null> {
  const cached = _schemaCache.get(tableName);
  if (cached) return cached;

  try {
    // PRAGMA returns rows with: cid, name, type, notnull, dflt_value, pk
    const rows = await db.select<ColumnInfo>(`PRAGMA table_info(${tableName})`);
    if (rows.length === 0) return null;
    const info: SchemaInfo = { byName: new Map(rows.map((r) => [r.name, r])) };
    _schemaCache.set(tableName, info);
    return info;
  } catch (err) {
    console.warn(`[columnFilter] Failed to introspect table "${tableName}":`, err);
    return null;
  }
}

async function getColumnsForTable(tableName: string): Promise<Set<string> | null> {
  const schema = await getSchemaForTable(tableName);
  return schema ? new Set(schema.byName.keys()) : null;
}

/** Pick a safe default for a NOT NULL column whose incoming value is null/undefined. */
function defaultForNotNull(col: ColumnInfo): unknown {
  if (col.dflt_value !== null && col.dflt_value !== undefined) return undefined; // SQLite uses the declared default
  const t = (col.type || '').toUpperCase();
  if (t.includes('INT')) return 0;
  if (t.includes('REAL') || t.includes('FLOA') || t.includes('DOUB') || t.includes('NUM')) return 0;
  // TEXT, BLOB, anything else → empty string
  return '';
}

/**
 * Convert a single Supabase row into a SQLite-compatible row.
 * Drops unknown columns, JSON-encodes nested values, converts booleans → 0/1.
 */
export async function adaptRowForSqlite(
  tableName: string,
  row: Record<string, unknown>,
  options?: {
    /** Override _sync_status (default: 'synced' for pulled rows) */
    syncStatus?: string;
  }
): Promise<Record<string, unknown> | null> {
  const schema = await getSchemaForTable(tableName);
  if (!schema) return null;
  const allowed = schema.byName;

  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    if (!allowed.has(key)) continue; // drop unknown columns

    if (value === null || value === undefined) {
      out[key] = null;
    } else if (typeof value === 'boolean') {
      out[key] = value ? 1 : 0;
    } else if (typeof value === 'object') {
      // JSONB / array columns → stringify
      out[key] = JSON.stringify(value);
    } else if (value instanceof Date) {
      out[key] = (value as Date).toISOString();
    } else {
      out[key] = value;
    }
  }

  // Fill NOT NULL columns whose incoming value is null/undefined with a safe default.
  // Otherwise the INSERT crashes with "NOT NULL constraint failed: …" and we lose the row.
  for (const [name, col] of allowed.entries()) {
    if (col.notnull !== 1) continue;
    if (col.pk === 1) continue; // PK NOT NULL handled by upstream
    if (out[name] !== null && out[name] !== undefined) continue;
    const fallback = defaultForNotNull(col);
    if (fallback === undefined) {
      // Column has a declared default — leave it out so SQLite uses it.
      delete out[name];
    } else {
      out[name] = fallback;
    }
  }

  // Add sync-engine bookkeeping columns if they exist on the table
  if (allowed.has('_sync_status')) out._sync_status = options?.syncStatus ?? 'synced';
  if (allowed.has('_local_only')) out._local_only = 0;

  return out;
}

/**
 * Convert a batch of Supabase rows into SQLite-compatible rows.
 * Returns only the rows that survived adaptation (table-exists check passes).
 */
export async function adaptRowsForSqlite(
  tableName: string,
  rows: Record<string, unknown>[],
  options?: { syncStatus?: string }
): Promise<Record<string, unknown>[]> {
  const adapted: Record<string, unknown>[] = [];
  for (const row of rows) {
    const a = await adaptRowForSqlite(tableName, row, options);
    if (a) adapted.push(a);
  }
  return adapted;
}

/**
 * Bulk insert using a column-filtered row set.
 * Uses INSERT OR REPLACE so re-pulling the same record is idempotent.
 */
export async function bulkInsertAdapted(
  tableName: string,
  rows: Record<string, unknown>[]
): Promise<number> {
  if (rows.length === 0) return 0;
  const cols = Object.keys(rows[0]);
  if (cols.length === 0) return 0;

  const placeholders = cols.map(() => '?').join(', ');
  const sql = `INSERT OR REPLACE INTO ${tableName} (${cols.join(', ')}) VALUES (${placeholders})`;

  await db.transaction(async (tx) => {
    for (const row of rows) {
      const values = cols.map((c) => row[c] ?? null);
      await tx.execute(sql, values);
    }
  });

  return rows.length;
}

/** Clear the cache (called when migrations run and schema may have changed). */
export function clearColumnCache(): void {
  _schemaCache.clear();
}
