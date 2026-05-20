import { db } from '@core/db/client';

export type SyncOperation = 'INSERT' | 'UPDATE' | 'DELETE';
export type QueueStatus = 'pending' | 'syncing' | 'done' | 'failed';

export interface QueuedRecord {
  id: number;
  operation: SyncOperation;
  table_name: string;
  record_id: string;
  payload: string; // JSON string
  organization_id: string;
  created_at: number;
  attempts: number;
  last_error: string | null;
  status: QueueStatus;
}

export const SyncQueue = {
  /** Add an operation to the queue. Call this after every local write. */
  async enqueue(
    operation: SyncOperation,
    table: string,
    recordId: string,
    payload: Record<string, unknown>,
    organizationId: string
  ): Promise<void> {
    await db.execute(
      `INSERT INTO _sync_queue (operation, table_name, record_id, payload, organization_id, created_at, status)
       VALUES (?, ?, ?, ?, ?, ?, 'pending')`,
      [operation, table, recordId, JSON.stringify(payload), organizationId, Date.now()]
    );
  },

  /** Fetch up to `limit` pending records, oldest first. */
  async getPending(limit = 50): Promise<QueuedRecord[]> {
    return db.select<QueuedRecord>(
      `SELECT * FROM _sync_queue WHERE status = 'pending' ORDER BY created_at ASC LIMIT ?`,
      [limit]
    );
  },

  /** Mark a batch of records as successfully synced. */
  async markDone(ids: number[]): Promise<void> {
    if (ids.length === 0) return;
    const placeholders = ids.map(() => '?').join(',');
    await db.execute(
      `UPDATE _sync_queue SET status = 'done' WHERE id IN (${placeholders})`,
      ids
    );
  },

  /** Increment the attempt counter and record the error message.
   *  After `maxAttempts` (default 3) the record is moved to 'failed'. */
  async markFailed(id: number, error: string, maxAttempts = 3): Promise<void> {
    const rows = await db.select<{ attempts: number }>(
      'SELECT attempts FROM _sync_queue WHERE id = ?',
      [id]
    );
    const current = rows[0]?.attempts ?? 0;
    const nextAttempts = current + 1;
    const newStatus = nextAttempts >= maxAttempts ? 'failed' : 'pending';

    await db.execute(
      `UPDATE _sync_queue SET attempts = ?, last_error = ?, status = ? WHERE id = ?`,
      [nextAttempts, error, newStatus, id]
    );
  },

  /** Mark a batch as currently in-flight (prevents duplicate processing). */
  async markSyncing(ids: number[]): Promise<void> {
    if (ids.length === 0) return;
    const placeholders = ids.map(() => '?').join(',');
    await db.execute(
      `UPDATE _sync_queue SET status = 'syncing' WHERE id IN (${placeholders})`,
      ids
    );
  },

  /** Reset stuck 'syncing' records back to 'pending' (called on app start). */
  async resetStuck(): Promise<void> {
    await db.execute(
      `UPDATE _sync_queue SET status = 'pending' WHERE status = 'syncing'`
    );
  },

  /** Count of pending records — useful for the status bar indicator. */
  async pendingCount(): Promise<number> {
    const rows = await db.select<{ n: number }>(
      `SELECT COUNT(*) as n FROM _sync_queue WHERE status = 'pending'`
    );
    return rows[0]?.n ?? 0;
  },

  /** Count of failed records — shown as errors in status bar. */
  async failedCount(): Promise<number> {
    const rows = await db.select<{ n: number }>(
      `SELECT COUNT(*) as n FROM _sync_queue WHERE status = 'failed'`
    );
    return rows[0]?.n ?? 0;
  },
};
