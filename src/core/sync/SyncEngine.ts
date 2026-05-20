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

function setStatus(status: SyncStatus, details?: string) {
  _status = status;
  listeners.forEach((fn) => fn(status, details));
}

async function runSyncCycle(): Promise<void> {
  if (!_organizationId || !_supabaseUrl) return;

  const online = await checkConnectivity(_supabaseUrl);
  if (!online) {
    setStatus('offline');
    scheduleSyncCycle();
    return;
  }

  setStatus('syncing');

  try {
    // 1. Push local pending changes first
    const { failed } = await processSyncQueue();
    if (failed > 0) {
      setStatus('error', `${failed} record(s) failed to sync`);
    } else {
      setStatus('idle');
    }
  } catch (err) {
    setStatus('error', err instanceof Error ? err.message : 'Unknown sync error');
  }

  scheduleSyncCycle();
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

    // Initial pull on startup (if online)
    if (isOnline()) {
      pullDeltaFromSupabase(organizationId)
        .then(() => processSyncQueue())
        .then(() => setStatus('idle'))
        .catch((err) => setStatus('error', err instanceof Error ? err.message : 'Initial sync failed'));
    } else {
      setStatus('offline');
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
    await runSyncCycle();
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
