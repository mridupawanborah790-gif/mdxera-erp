/**
 * Thin wrapper over @tauri-apps/plugin-updater so the rest of the app doesn't
 * have to know about Tauri APIs. Three things it provides:
 *
 *   1. checkForUpdate({ silent }) — polls the updater endpoint configured in
 *      tauri.conf.json (the GitHub Releases `latest.json` for mdxera-offline)
 *      and returns either the available update or null.
 *   2. downloadAndInstall(update, onProgress) — streams the bundle to disk,
 *      verifies the minisign signature against the public key baked in at
 *      build time, and applies it.
 *   3. restartApp() — relaunches so the new version takes effect.
 *
 * Browser fallback: when the bundle is opened outside Tauri (e.g. vite dev in
 * a regular browser tab for UI work), every function resolves to a no-op so
 * the calling code doesn't have to guard.
 */

import type { Update } from '@tauri-apps/plugin-updater';

export type UpdateStatus =
    | { state: 'idle' }
    | { state: 'checking' }
    | { state: 'up-to-date'; checkedAt: number }
    | { state: 'available'; update: Update; checkedAt: number }
    | { state: 'downloading'; downloaded: number; total: number | null }
    | { state: 'ready'; installedVersion: string }
    | { state: 'error'; message: string };

export interface CheckOptions {
    /** Suppress error popups; used for the silent boot-time check. */
    silent?: boolean;
}

// Detect whether we're running inside a Tauri shell. The plugin-updater APIs
// throw immediately when called from a plain browser; this guard means dev
// servers and Storybook-style hosts stay usable.
function isTauri(): boolean {
    if (typeof window === 'undefined') return false;
    return Boolean((window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__);
}

const STORAGE_KEY = 'mdxera:lastUpdateCheck';
const SILENT_CHECK_THROTTLE_MS = 60 * 60 * 1000; // once per hour per session

let _inFlight: Promise<Update | null> | null = null;

export async function checkForUpdate(options: CheckOptions = {}): Promise<Update | null> {
    if (!isTauri()) return null;

    // Coalesce parallel callers (background boot + user-clicked button at the
    // same time) so we only hit the endpoint once.
    if (_inFlight) return _inFlight;

    _inFlight = (async () => {
        try {
            const { check } = await import('@tauri-apps/plugin-updater');
            const update = await check();
            try { window.localStorage.setItem(STORAGE_KEY, String(Date.now())); } catch { /* private mode */ }
            return update ?? null;
        } catch (err) {
            if (!options.silent) {
                console.error('[updates] check failed:', err);
            } else {
                console.warn('[updates] silent check failed:', err);
            }
            throw err;
        } finally {
            _inFlight = null;
        }
    })();

    return _inFlight;
}

/** True when the last silent check was less than SILENT_CHECK_THROTTLE_MS ago. */
export function recentlyChecked(): boolean {
    try {
        const raw = window.localStorage.getItem(STORAGE_KEY);
        if (!raw) return false;
        const last = Number(raw);
        if (!Number.isFinite(last)) return false;
        return Date.now() - last < SILENT_CHECK_THROTTLE_MS;
    } catch {
        return false;
    }
}

export interface DownloadProgress {
    downloaded: number;
    total: number | null;
}

export async function downloadAndInstall(
    update: Update,
    onProgress?: (progress: DownloadProgress) => void,
): Promise<void> {
    if (!isTauri()) throw new Error('Auto-update is only available in the desktop app.');

    let downloaded = 0;
    let total: number | null = null;

    await update.downloadAndInstall((event) => {
        if (event.event === 'Started') {
            total = typeof event.data.contentLength === 'number' ? event.data.contentLength : null;
            onProgress?.({ downloaded: 0, total });
        } else if (event.event === 'Progress') {
            downloaded += event.data.chunkLength ?? 0;
            onProgress?.({ downloaded, total });
        } else if (event.event === 'Finished') {
            onProgress?.({ downloaded: total ?? downloaded, total });
        }
    });
}

/** Relaunch the app so the new binary takes effect. */
export async function restartApp(): Promise<void> {
    if (!isTauri()) return;
    const { relaunch } = await import('@tauri-apps/plugin-process');
    await relaunch();
}

/** Current app version, from tauri.conf.json. */
export async function getCurrentVersion(): Promise<string> {
    if (!isTauri()) {
        // Browser dev mode: fall back to the version stamped by Vite if any.
        return 'dev';
    }
    const { getVersion } = await import('@tauri-apps/api/app');
    return getVersion();
}
