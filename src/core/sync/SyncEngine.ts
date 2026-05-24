import { isOnline, onNetworkChange, checkConnectivity } from './networkMonitor';
import { SyncQueue } from './SyncQueue';
import { processSyncQueue } from './SyncWorker';
import { pullDeltaFromSupabase } from './SyncPuller';

export type SyncStatus = 'idle' | 'syncing' | 'offline' | 'error';

type StatusListener = (status: SyncStatus, details?: string) => void;

const listeners = new Set<StatusListener>();

let _status: SyncStatus = 'idle';
let _workerTimer: ReturnType<typeof setTimeout> | null = null;
let _organizationId: string | null = null;
let _supabaseUrl: string | null = null;
let _running = false;

const SYNC_INTERVAL_MS = 30_000; // 30 seconds
let _isSyncing = false; // re-entrancy guard

function setStatus(status: SyncStatus, details?: string) {
  _status = status;
  listeners.forEach((fn) => fn(status, details));
}

async function runSyncCycle(skipConnectivityCheck = false): Promise<void> {
  if (!_organizationId || !_supabaseUrl) return;

  // Re-entrancy guard: don't start a new cycle if one is already running.
  if (_isSyncing) {
    console.info('[SyncEngine] Cycle already running, skipping.');
    return;
  }
  _isSyncing = true;

  try {
    // Skip the HTTP connectivity ping for user-triggered syncs (forceSync)
    // because a failed ping (e.g. profiles table returns non-200) would
    // silently abort the push even when the browser reports online.
    const online = skipConnectivityCheck
      ? navigator.onLine
      : await checkConnectivity(_supabaseUrl);

    if (!online) {
      setStatus('offline');
      return;
    }

    setStatus('syncing');

    // Push local pending changes first
    const result = await processSyncQueue();
    console.info('[SyncEngine] Sync cycle result:', result);

    if (result.failed > 0) {
      setStatus('error', `${result.failed} record(s) failed to sync`);
    } else if (result.deferred > 0) {
      setStatus('syncing', `${result.deferred} record(s) waiting for dependencies`);
    } else {
      setStatus('idle');
    }
  } catch (err) {
    setStatus('error', err instanceof Error ? err.message : 'Unknown sync error');
    console.error('[SyncEngine] Sync cycle error:', err);
  } finally {
    _isSyncing = false;
    scheduleSyncCycle();
  }
}

function scheduleSyncCycle() {
  if (!_running) return;
  _workerTimer = setTimeout(runSyncCycle, SYNC_INTERVAL_MS);
}

export const SyncEngine = {
  /** Initialize and start the sync engine. Call once after auth. */
  start(organizationId: string, supabaseUrl: string): void {
    _organizationId = organizationId;
    _supabaseUrl = supabaseUrl;
    _running = true;

    // Reset any stuck syncing records from a previous session
    SyncQueue.resetStuck().catch(console.warn);

    // Listen for network transitions
    onNetworkChange(async (online) => {
      if (online) {
        // Network came back — pull immediately, then push
        setStatus('syncing');
        try {
          await pullDeltaFromSupabase(organizationId);
          await processSyncQueue();
          setStatus('idle');
        } catch (err) {
          setStatus('error', err instanceof Error ? err.message : 'Sync error on reconnect');
        }
      } else {
        setStatus('offline');
      }
    });

    // NB: we DO NOT auto-pull on start. SyncBootstrap owns the first pull —
    // running it here too would race with InitialSync's foreground writes
    // ("database is locked") on a fresh sync.
    if (!isOnline()) {
      setStatus('offline');
    } else {
      setStatus('idle');
    }

    scheduleSyncCycle();
  },

  stop(): void {
    _running = false;
    if (_workerTimer !== null) {
      clearTimeout(_workerTimer);
      _workerTimer = null;
    }
  },

  /** Force an immediate sync cycle (e.g. when user clicks "Sync Now"). */
  async forceSync(): Promise<void> {
    if (_workerTimer !== null) {
      clearTimeout(_workerTimer);
      _workerTimer = null;
    }
    // Pass skipConnectivityCheck=true so a failed ping doesn't abort the push
    // when the user explicitly requests a sync and the browser shows online.
    await runSyncCycle(true);
  },

  getStatus(): SyncStatus {
    return _status;
  },

  /** Subscribe to status changes. Returns unsubscribe function. */
  on(fn: StatusListener): () => void {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },

  /** Pending item count — for the status bar badge. */
  async pendingCount(): Promise<number> {
    return SyncQueue.pendingCount();
  },
};
