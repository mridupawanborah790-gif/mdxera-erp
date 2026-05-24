/**
 * Sync health indicator + detail panel.
 *
 * Drop this anywhere in the StatusBar / Header:
 *
 *   <SyncIndicator />
 *
 * Shows a colored dot + label reflecting the current sync state:
 *   🟢 Synced               — no pending work
 *   🟡 Syncing (N)          — pending items waiting to upload
 *   🔴 N failed             — items the server rejected
 *
 * Click → opens a modal with the queue contents and Retry/Discard actions.
 */
import React, { useEffect, useState, useCallback } from 'react';
import { SyncEngine, type SyncStatus } from '@core/sync/SyncEngine';
import { db } from '@core/db/client';
import { TABLE } from '@core/db/schema';
import { useOnlineStatus } from '@core/hooks/useOnlineStatus';

interface QueueItem {
  id: number;
  operation: string;
  table_name: string;
  record_id: string;
  attempts: number;
  last_error: string | null;
  status: string;
  created_at: number;
}

export const SyncIndicator: React.FC = () => {
  const online = useOnlineStatus();
  const [status, setStatus] = useState<SyncStatus>('idle');
  const [pendingCount, setPendingCount] = useState(0);
  const [failedCount, setFailedCount] = useState(0);
  const [detail, setDetail] = useState<string | undefined>();
  const [open, setOpen] = useState(false);

  const refreshCounts = useCallback(async () => {
    try {
      const pendingRows = await db.select<{ n: number }>(
        `SELECT COUNT(*) as n FROM ${TABLE.SYNC_QUEUE} WHERE status = 'pending'`
      );
      const failedRows = await db.select<{ n: number }>(
        `SELECT COUNT(*) as n FROM ${TABLE.SYNC_QUEUE} WHERE status = 'failed'`
      );
      setPendingCount(pendingRows[0]?.n ?? 0);
      setFailedCount(failedRows[0]?.n ?? 0);
    } catch { /* SQLite not ready */ }
  }, []);

  useEffect(() => {
    const unsub = SyncEngine.on((s, d) => {
      setStatus(s);
      setDetail(d);
      refreshCounts();
    });
    refreshCounts();
    const interval = setInterval(refreshCounts, 5000);
    return () => { unsub(); clearInterval(interval); };
  }, [refreshCounts]);

  // Color + label resolution
  const { color, label, dot } = (() => {
    if (failedCount > 0) {
      return { color: 'text-red-600', dot: 'bg-red-500', label: `${failedCount} failed` };
    }
    if (!online) {
      return { color: 'text-gray-500', dot: 'bg-gray-400', label: 'Offline' };
    }
    if (status === 'syncing' || pendingCount > 0) {
      return { color: 'text-amber-600', dot: 'bg-amber-500 animate-pulse', label: `Syncing${pendingCount > 0 ? ` (${pendingCount})` : ''}` };
    }
    if (status === 'error') {
      return { color: 'text-red-600', dot: 'bg-red-500', label: 'Sync error' };
    }
    return { color: 'text-green-700', dot: 'bg-green-500', label: 'Synced' };
  })();

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title={detail ?? `Last status: ${status}`}
        className={`inline-flex items-center gap-1.5 text-xs font-medium ${color} hover:underline focus:outline-none`}
      >
        <span className={`inline-block h-2 w-2 rounded-full ${dot}`} />
        <span>{label}</span>
      </button>

      {open && (
        <SyncDetailModal
          onClose={() => setOpen(false)}
          onRefresh={refreshCounts}
          online={online}
          status={status}
          pendingCount={pendingCount}
          failedCount={failedCount}
        />
      )}
    </>
  );
};

// ── Detail modal ───────────────────────────────────────────────────────────

interface ModalProps {
  onClose: () => void;
  onRefresh: () => void;
  online: boolean;
  status: SyncStatus;
  pendingCount: number;
  failedCount: number;
}

const SyncDetailModal: React.FC<ModalProps> = ({ onClose, onRefresh, online, status, pendingCount, failedCount }) => {
  const [pending, setPending] = useState<QueueItem[]>([]);
  const [failed, setFailed] = useState<QueueItem[]>([]);
  const [busy, setBusy] = useState(false);

  const loadLists = useCallback(async () => {
    try {
      const p = await db.select<QueueItem>(
        `SELECT id, operation, table_name, record_id, attempts, last_error, status, created_at
         FROM ${TABLE.SYNC_QUEUE} WHERE status = 'pending'
         ORDER BY created_at ASC LIMIT 100`
      );
      const f = await db.select<QueueItem>(
        `SELECT id, operation, table_name, record_id, attempts, last_error, status, created_at
         FROM ${TABLE.SYNC_QUEUE} WHERE status = 'failed'
         ORDER BY created_at DESC LIMIT 100`
      );
      setPending(p);
      setFailed(f);
    } catch (err) {
      console.warn('[SyncIndicator] failed to load queue:', err);
    }
  }, []);

  useEffect(() => { loadLists(); }, [loadLists]);

  const handleForceSync = async () => {
    setBusy(true);
    try {
      await SyncEngine.forceSync();
      onRefresh();
      await loadLists();
    } finally {
      setBusy(false);
    }
  };

  const handleRetryFailed = async () => {
    setBusy(true);
    try {
      // Reset failed → pending so the next cycle picks them up
      await db.execute(
        `UPDATE ${TABLE.SYNC_QUEUE} SET status = 'pending', attempts = 0, last_error = NULL WHERE status = 'failed'`
      );
      await SyncEngine.forceSync();
      onRefresh();
      await loadLists();
    } finally {
      setBusy(false);
    }
  };

  const handleDiscardOne = async (id: number) => {
    if (!window.confirm('Discard this record? It will not be uploaded to the server.')) return;
    setBusy(true);
    try {
      await db.execute(`DELETE FROM ${TABLE.SYNC_QUEUE} WHERE id = ?`, [id]);
      onRefresh();
      await loadLists();
    } finally {
      setBusy(false);
    }
  };

  const handleDiscardAllFailed = async () => {
    if (!window.confirm(`Discard ALL ${failedCount} failed records? This cannot be undone.`)) return;
    setBusy(true);
    try {
      await db.execute(`DELETE FROM ${TABLE.SYNC_QUEUE} WHERE status = 'failed'`);
      onRefresh();
      await loadLists();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-lg shadow-xl max-w-3xl w-full max-h-[80vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-4 border-b flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold">Sync Status</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              {online ? 'Connected' : 'Offline'} · State: <span className="font-medium">{status}</span>
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700 text-xl leading-none"
          >&times;</button>
        </div>

        {/* Summary cards */}
        <div className="px-5 py-3 grid grid-cols-3 gap-3 border-b bg-gray-50">
          <div className="bg-white rounded border p-3">
            <div className="text-xs text-gray-500 uppercase tracking-wide">Pending</div>
            <div className="text-2xl font-bold text-amber-600 mt-1">{pendingCount}</div>
          </div>
          <div className="bg-white rounded border p-3">
            <div className="text-xs text-gray-500 uppercase tracking-wide">Failed</div>
            <div className="text-2xl font-bold text-red-600 mt-1">{failedCount}</div>
          </div>
          <div className="bg-white rounded border p-3 flex flex-col justify-between">
            <div className="text-xs text-gray-500 uppercase tracking-wide">Actions</div>
            <div className="flex gap-2 mt-1">
              <button
                onClick={handleForceSync}
                disabled={busy || !online}
                className="text-xs px-2 py-1 bg-blue-600 text-white rounded disabled:opacity-50 hover:bg-blue-700"
              >
                Sync Now
              </button>
              {failedCount > 0 && (
                <button
                  onClick={handleRetryFailed}
                  disabled={busy || !online}
                  className="text-xs px-2 py-1 bg-amber-600 text-white rounded disabled:opacity-50 hover:bg-amber-700"
                >
                  Retry Failed
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Lists */}
        <div className="flex-1 overflow-auto px-5 py-3">
          {failed.length > 0 && (
            <section className="mb-5">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-semibold text-red-700">Failed records ({failed.length})</h3>
                <button
                  onClick={handleDiscardAllFailed}
                  disabled={busy}
                  className="text-xs text-red-600 hover:underline disabled:opacity-50"
                >
                  Discard all
                </button>
              </div>
              <QueueTable items={failed} onDiscard={handleDiscardOne} busy={busy} showError />
            </section>
          )}

          {pending.length > 0 && (
            <section>
              <h3 className="text-sm font-semibold text-amber-700 mb-2">Pending records ({pending.length}{pending.length === 100 ? '+' : ''})</h3>
              <QueueTable items={pending} onDiscard={handleDiscardOne} busy={busy} showError={false} />
            </section>
          )}

          {failed.length === 0 && pending.length === 0 && (
            <div className="text-center text-sm text-gray-500 py-12">
              ✓ All changes are synced with the server.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

interface QueueTableProps {
  items: QueueItem[];
  onDiscard: (id: number) => void;
  busy: boolean;
  showError: boolean;
}

const QueueTable: React.FC<QueueTableProps> = ({ items, onDiscard, busy, showError }) => (
  <table className="w-full text-xs border">
    <thead className="bg-gray-100 text-gray-600">
      <tr>
        <th className="px-2 py-1.5 text-left">Op</th>
        <th className="px-2 py-1.5 text-left">Table</th>
        <th className="px-2 py-1.5 text-left">Record ID</th>
        <th className="px-2 py-1.5 text-left">Attempts</th>
        {showError && <th className="px-2 py-1.5 text-left">Last error</th>}
        <th className="px-2 py-1.5 text-right">Actions</th>
      </tr>
    </thead>
    <tbody>
      {items.map((item) => (
        <tr key={item.id} className="border-t">
          <td className="px-2 py-1">{item.operation}</td>
          <td className="px-2 py-1 font-mono">{item.table_name}</td>
          <td className="px-2 py-1 font-mono text-gray-600 truncate max-w-[160px]" title={item.record_id}>{item.record_id}</td>
          <td className="px-2 py-1 text-center">{item.attempts}</td>
          {showError && (
            <td className="px-2 py-1 text-red-600 max-w-[280px] truncate" title={item.last_error ?? ''}>
              {item.last_error ?? '—'}
            </td>
          )}
          <td className="px-2 py-1 text-right">
            <button
              onClick={() => onDiscard(item.id)}
              disabled={busy}
              className="text-red-600 hover:underline disabled:opacity-50"
            >
              Discard
            </button>
          </td>
        </tr>
      ))}
    </tbody>
  </table>
);

export default SyncIndicator;
