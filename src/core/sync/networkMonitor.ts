type NetworkListener = (online: boolean) => void;

const listeners = new Set<NetworkListener>();
let _isOnline = typeof navigator !== 'undefined' ? navigator.onLine : true;

function notify(online: boolean) {
  _isOnline = online;
  listeners.forEach((fn) => fn(online));
}

if (typeof window !== 'undefined') {
  window.addEventListener('online', () => notify(true));
  window.addEventListener('offline', () => notify(false));
}

/** Subscribe to network status changes. Returns an unsubscribe function. */
export function onNetworkChange(fn: NetworkListener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function isOnline(): boolean {
  return _isOnline;
}

/**
 * Verify actual connectivity by pinging the Supabase REST endpoint.
 * Falls back to navigator.onLine if the request fails to send at all.
 */
export async function checkConnectivity(supabaseUrl: string): Promise<boolean> {
  try {
    const res = await fetch(`${supabaseUrl}/rest/v1/`, {
      method: 'HEAD',
      signal: AbortSignal.timeout(5000),
    });
    return res.ok || res.status < 500;
  } catch {
    return false;
  }
}
