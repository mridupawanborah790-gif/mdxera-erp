import { db } from '@core/db/client';
import { isOnline } from '@core/sync/networkMonitor';
import { statePrefixLookup } from './pincodePrefixes';

export interface PincodeLookupResult {
  district: string;
  state: string;
  source: 'cache' | 'api' | 'prefix';
}

// Cache TTL: 1 year. Pincode data is essentially static.
const CACHE_TTL_MS = 365 * 24 * 60 * 60 * 1000;

/**
 * Read a cached pincode entry from SQLite.
 * Returns null when not in cache.
 */
async function readCache(pincode: string): Promise<{ district: string; state: string } | null> {
  try {
    const rows = await db.select<{ district: string; state: string; cached_at: number }>(
      'SELECT district, state, cached_at FROM pincode_cache WHERE pincode = ? LIMIT 1',
      [pincode]
    );
    if (rows.length === 0) return null;
    const row = rows[0];
    if (Date.now() - row.cached_at > CACHE_TTL_MS) return null;
    if (!row.district || !row.state) return null;
    return { district: row.district, state: row.state };
  } catch {
    // SQLite not available (e.g. during early app bootstrap before DB init)
    return null;
  }
}

/**
 * Write a successful lookup into the cache.
 */
async function writeCache(pincode: string, district: string, state: string): Promise<void> {
  try {
    await db.execute(
      `INSERT OR REPLACE INTO pincode_cache (pincode, district, state, cached_at) VALUES (?, ?, ?, ?)`,
      [pincode, district, state, Date.now()]
    );
  } catch {
    // Cache write failures are non-fatal
  }
}

/**
 * Look up an Indian 6-digit pincode against district/state.
 *
 * Resolution order:
 *   1. Local SQLite cache (instant, works offline)
 *   2. Online API (postalpincode.in) — caches the result on success
 *   3. State-prefix fallback — returns state only, district empty
 *   4. null — no lookup possible
 */
export const lookupPincode = async (pincode: string): Promise<PincodeLookupResult | null> => {
  if (!pincode || pincode.length !== 6 || !/^\d{6}$/.test(pincode)) return null;

  // 1. Cache hit
  const cached = await readCache(pincode);
  if (cached) {
    return { district: cached.district, state: cached.state, source: 'cache' };
  }

  // 2. Online API
  if (isOnline()) {
    try {
      const response = await fetch(`https://api.postalpincode.in/pincode/${pincode}`, {
        signal: AbortSignal.timeout(5000),
      });
      const data = await response.json();
      if (data?.[0]?.Status === 'Success' && data[0].PostOffice?.[0]) {
        const detail = data[0].PostOffice[0];
        await writeCache(pincode, detail.District, detail.State);
        return { district: detail.District, state: detail.State, source: 'api' };
      }
    } catch (e) {
      console.warn('[pincode] online lookup failed, falling back to state prefix:', e);
    }
  }

  // 3. State-prefix fallback (offline or API failure)
  const state = statePrefixLookup(pincode);
  if (state) {
    return { district: '', state, source: 'prefix' };
  }

  // 4. Nothing we can do
  return null;
};
