import { isOnline } from '@core/sync/networkMonitor';
import {
  supabaseLogin,
  supabaseLogout,
  supabaseRefreshSession,
  supabaseRestoreSession,
  type SupabaseSession,
} from './supabaseAuth';
import {
  cacheOfflineCredentials,
  verifyOfflineCredentials,
  createLocalSession,
  verifyLocalSession,
  refreshCachedUserData,
  type LocalSession,
} from './offlineAuth';
import type { RegisteredPharmacy } from '@core/types';

// ── Persisted session store (tauri-plugin-store) ───────────────────────────

// We keep a lightweight JSON store in AppData/auth/session.json
// via @tauri-apps/plugin-store. Lazy-imported so the module loads in dev
// without Tauri context errors.

async function getStore() {
  const { Store } = await import('@tauri-apps/plugin-store');
  return Store.load('auth/session.json', { autoSave: true });
}

async function persistSession(data: {
  supabaseSession?: SupabaseSession | null;
  localSession?: LocalSession | null;
  user?: RegisteredPharmacy | null;
}): Promise<void> {
  try {
    const store = await getStore();
    if (data.supabaseSession !== undefined) await store.set('supabaseSession', data.supabaseSession);
    if (data.localSession !== undefined) await store.set('localSession', data.localSession);
    if (data.user !== undefined) await store.set('user', data.user);
  } catch {
    // Running in browser / dev mode without Tauri — silently skip
  }
}

async function loadPersistedSession(): Promise<{
  supabaseSession: SupabaseSession | null;
  localSession: LocalSession | null;
  user: RegisteredPharmacy | null;
}> {
  try {
    const store = await getStore();
    return {
      supabaseSession: (await store.get<SupabaseSession>('supabaseSession')) ?? null,
      localSession: (await store.get<LocalSession>('localSession')) ?? null,
      user: (await store.get<RegisteredPharmacy>('user')) ?? null,
    };
  } catch {
    return { supabaseSession: null, localSession: null, user: null };
  }
}

async function clearPersistedSession(): Promise<void> {
  try {
    const store = await getStore();
    await store.set('supabaseSession', null);
    await store.set('localSession', null);
    await store.set('user', null);
  } catch { /* browser / dev mode */ }
}

// ── Public API ─────────────────────────────────────────────────────────────

export interface AuthResult {
  user: RegisteredPharmacy;
  isOffline: boolean;
}

/**
 * Login attempt:
 *   1. If online → Supabase login → cache credentials locally
 *   2. If offline → bcrypt verify against local cache → issue local session
 */
export async function login(email: string, password: string): Promise<AuthResult> {
  if (isOnline()) {
    try {
      const { user, session } = await supabaseLogin(email, password);
      // Cache for future offline use
      await cacheOfflineCredentials(user, password);
      const localSession = await createLocalSession(user.id, user.email);
      await persistSession({ supabaseSession: session, localSession, user });
      return { user, isOffline: false };
    } catch (onlineErr) {
      // Online login failed (wrong password, network blip, etc.) — propagate
      throw onlineErr;
    }
  }

  // Offline path
  const result = await verifyOfflineCredentials(email, password);
  if (!result) throw new Error('Incorrect email or password (offline mode)');

  const localSession = await createLocalSession(result.user.id, result.user.email);
  await persistSession({ localSession, supabaseSession: null, user: result.user });
  return { user: result.user, isOffline: true };
}

export async function logout(): Promise<void> {
  if (isOnline()) {
    try { await supabaseLogout(); } catch { /* ignore */ }
  }
  await clearPersistedSession();
}

/**
 * Try to restore the previous session on app startup.
 * Returns the user if a valid session exists, or null if login is required.
 */
export async function restoreSession(): Promise<RegisteredPharmacy | null> {
  const { supabaseSession, localSession, user } = await loadPersistedSession();
  if (!user) return null;

  // Try to silently refresh the Supabase token if online
  if (isOnline()) {
    try {
      const refreshed = await supabaseRefreshSession();
      if (refreshed) {
        await persistSession({ supabaseSession: refreshed });
        // Also sync latest profile from Supabase
        await refreshCachedUserData(user.id, user);
        return user;
      }
      // Refresh failed — fall through to local session check
    } catch { /* offline / network error */ }
  }

  // Validate local session token
  if (localSession && (await verifyLocalSession(localSession))) {
    return user;
  }

  // Try to restore from existing Supabase session object stored locally
  if (supabaseSession && supabaseSession.expiresAt * 1000 > Date.now()) {
    return user;
  }

  // All sessions expired — require re-login
  await clearPersistedSession();
  return null;
}

/**
 * Called when the app comes back online after being offline.
 * Silently upgrades a local session to a full Supabase session if possible.
 */
export async function tryUpgradeToOnlineSession(
  email: string,
  password: string
): Promise<void> {
  try {
    const { user, session } = await supabaseLogin(email, password);
    await cacheOfflineCredentials(user, password);
    await persistSession({ supabaseSession: session, user });
  } catch { /* silent — user stays on local session */ }
}
