import { supabase } from '@core/db/supabaseClient';
import { SyncQueue, QueuedRecord } from './SyncQueue';
import { db } from '@core/db/client';
import { TABLE } from '@core/db/schema';

const BATCH_SIZE = 50;
// Exponential backoff: 30 s → 2 min → 10 min
const BACKOFF_DELAYS = [30_000, 120_000, 600_000];

function groupByTable(records: QueuedRecord[]): Map<string, QueuedRecord[]> {
  const map = new Map<string, QueuedRecord[]>();
  for (const r of records) {
    const bucket = map.get(r.table_name) ?? [];
    bucket.push(r);
    map.set(r.table_name, bucket);
  }
  return map;
}

/** Push a batch of records for one table to Supabase. */
async function pushBatch(tableName: string, records: QueuedRecord[]): Promise<void> {
  const upserts: QueuedRecord[] = records.filter((r) => r.operation !== 'DELETE');
  const deletes: QueuedRecord[] = records.filter((r) => r.operation === 'DELETE');

  if (upserts.length > 0) {
    const payloads = upserts.map((r) => JSON.parse(r.payload) as Record<string, unknown>);
    const { error } = await supabase.from(tableName).upsert(payloads, {
      onConflict: 'id',
      ignoreDuplicates: false,
    });
    if (error) throw new Error(error.message);
  }

  for (const del of deletes) {
    const payload = JSON.parse(del.payload) as { id: string };
    const { error } = await supabase.from(tableName).delete().eq('id', payload.id);
    if (error) throw new Error(error.message);
  }
}

/** Process the entire pending queue, returning counts of success and failure. */
export async function processSyncQueue(): Promise<{ pushed: number; failed: number }> {
  const pending = await SyncQueue.getPending(BATCH_SIZE);
  if (pending.length === 0) return { pushed: 0, failed: 0 };

  const ids = pending.map((r) => r.id);
  await SyncQueue.markSyncing(ids);

  const byTable = groupByTable(pending);
  let pushed = 0;
  let failed = 0;

  for (const [tableName, records] of byTable) {
    try {
      await pushBatch(tableName, records);
      await SyncQueue.markDone(records.map((r) => r.id));
      pushed += records.length;

      // Update _sync_meta.last_pushed_at
      await db.execute(
        `INSERT OR REPLACE INTO ${TABLE.SYNC_META} (table_name, last_pushed_at) VALUES (?, ?)`,
        [tableName, Date.now()]
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      for (const record of records) {
        await SyncQueue.markFailed(record.id, msg);
      }
      failed += records.length;
    }
  }

  return { pushed, failed };
}
