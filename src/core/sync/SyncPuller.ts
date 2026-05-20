import { supabase } from '@core/db/supabaseClient';
import { db } from '@core/db/client';
import { SYNCABLE_TABLES, TABLE } from '@core/db/schema';
import { resolveConflict } from './conflictResolver';

interface SyncMeta {
  table_name: string;
  last_pulled_at: number | null;
}

/** Pull changes from Supabase for all syncable tables and apply them to SQLite. */
export async function pullDeltaFromSupabase(organizationId: string): Promise<void> {
  // Load all pull timestamps in one query
  const metaRows = await db.select<SyncMeta>(
    `SELECT table_name, last_pulled_at FROM ${TABLE.SYNC_META}`
  );
  const metaMap = new Map(metaRows.map((r) => [r.table_name, r.last_pulled_at]));

  for (const tableName of SYNCABLE_TABLES) {
    await pullTable(tableName, organizationId, metaMap.get(tableName) ?? null);
  }
}

async function pullTable(
  tableName: string,
  organizationId: string,
  lastPulledAt: number | null
): Promise<void> {
  try {
    let query = supabase
      .from(tableName)
      .select('*')
      .eq('organization_id', organizationId);

    if (lastPulledAt !== null) {
      // Only fetch records changed since last pull (ISO 8601)
      const since = new Date(lastPulledAt).toISOString();
      query = query.gt('updated_at', since);
    }

    const { data: remoteRows, error } = await query;
    if (error) throw new Error(error.message);
    if (!remoteRows || remoteRows.length === 0) {
      await updatePullTimestamp(tableName);
      return;
    }

    // For each remote row, compare with local and apply if remote wins
    for (const remote of remoteRows) {
      const localRows = await db.select<{ updated_at: string; _sync_status: string }>(
        `SELECT updated_at, _sync_status FROM ${tableName} WHERE id = ?`,
        [remote.id]
      );

      if (localRows.length === 0) {
        // New record — insert directly
        await upsertLocalRow(tableName, remote);
      } else {
        const local = localRows[0];
        // Don't overwrite if we have unsent local changes (pending in queue)
        if (local._sync_status === 'pending') continue;

        const winner = resolveConflict(local.updated_at, remote.updated_at);
        if (winner === 'remote') {
          await upsertLocalRow(tableName, remote);
        }
      }
    }

    await updatePullTimestamp(tableName);
  } catch (err) {
    // Log but don't crash — partial sync is acceptable
    console.warn(`[SyncPuller] Failed to pull table ${tableName}:`, err);
  }
}

async function upsertLocalRow(
  tableName: string,
  remote: Record<string, unknown>
): Promise<void> {
  // Serialize any nested objects/arrays to JSON (Supabase JSONB → SQLite TEXT)
  const row: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(remote)) {
    row[k] = v !== null && typeof v === 'object' ? JSON.stringify(v) : v;
  }
  row._sync_status = 'synced';
  row._local_only = 0;

  await db.upsert(tableName, row);
}

async function updatePullTimestamp(tableName: string): Promise<void> {
  await db.execute(
    `INSERT OR REPLACE INTO ${TABLE.SYNC_META} (table_name, last_pulled_at) VALUES (?, ?)`,
    [tableName, Date.now()]
  );
}
