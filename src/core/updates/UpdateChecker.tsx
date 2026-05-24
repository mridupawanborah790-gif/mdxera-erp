/**
 * "Check for updates" panel rendered inside the Settings screen.
 *
 * Surfaces three states:
 *   - Idle / up-to-date: shows the current version + a button to recheck.
 *   - Update available: shows the new version + Install / Skip buttons.
 *   - Downloading / installing: progress bar.
 *
 * The component is safe to render in browser dev mode — every action gracefully
 * no-ops since updateService gates on the Tauri runtime.
 */

import React, { useCallback, useEffect, useState } from 'react';
import type { Update } from '@tauri-apps/plugin-updater';
import {
    checkForUpdate,
    downloadAndInstall,
    restartApp,
    getCurrentVersion,
    type DownloadProgress,
    type UpdateStatus,
} from './updateService';

const formatBytes = (bytes: number): string => {
    if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB'];
    let i = 0;
    let n = bytes;
    while (n >= 1024 && i < units.length - 1) {
        n /= 1024;
        i++;
    }
    return `${n.toFixed(n >= 10 ? 0 : 1)} ${units[i]}`;
};

interface Props {
    addNotification: (message: string, type?: 'success' | 'error' | 'warning') => void;
}

const UpdateChecker: React.FC<Props> = ({ addNotification }) => {
    const [currentVersion, setCurrentVersion] = useState<string>('');
    const [status, setStatus] = useState<UpdateStatus>({ state: 'idle' });

    useEffect(() => {
        getCurrentVersion().then(setCurrentVersion).catch(() => setCurrentVersion('unknown'));
    }, []);

    const onCheck = useCallback(async () => {
        setStatus({ state: 'checking' });
        try {
            const update = await checkForUpdate({ silent: false });
            if (update) {
                setStatus({ state: 'available', update, checkedAt: Date.now() });
            } else {
                setStatus({ state: 'up-to-date', checkedAt: Date.now() });
            }
        } catch (err: any) {
            const msg = err?.message ?? String(err);
            setStatus({ state: 'error', message: msg });
            addNotification(`Update check failed: ${msg}`, 'error');
        }
    }, [addNotification]);

    const onInstall = useCallback(async (update: Update) => {
        setStatus({ state: 'downloading', downloaded: 0, total: null });
        try {
            await downloadAndInstall(update, (p: DownloadProgress) => {
                setStatus({ state: 'downloading', downloaded: p.downloaded, total: p.total });
            });
            setStatus({ state: 'ready', installedVersion: update.version });
            addNotification(`Update ${update.version} installed. Restart to finish.`, 'success');
        } catch (err: any) {
            const msg = err?.message ?? String(err);
            setStatus({ state: 'error', message: msg });
            addNotification(`Update install failed: ${msg}`, 'error');
        }
    }, [addNotification]);

    const onRestart = useCallback(async () => {
        try {
            await restartApp();
        } catch (err: any) {
            addNotification(`Restart failed: ${err?.message ?? err}`, 'error');
        }
    }, [addNotification]);

    const isBusy = status.state === 'checking' || status.state === 'downloading';

    return (
        <section className="space-y-6">
            <div className="border-b-2 border-primary pb-2 flex justify-between items-end">
                <h3 className="text-lg font-black text-primary uppercase tracking-tight">System & Updates</h3>
                <span className="text-[9px] font-bold text-gray-400">v{currentVersion}</span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-start">
                <div className="md:col-span-2 space-y-2">
                    <p className="text-xs font-bold text-gray-700 uppercase tracking-wider">Application Version</p>
                    <p className="text-2xl font-black text-primary">MDXera ERP {currentVersion}</p>
                    <p className="text-[11px] text-gray-500 leading-relaxed">
                        Updates are delivered through GitHub Releases and verified with a signing key
                        bundled at build time. Your data is never touched during an update.
                    </p>

                    {status.state === 'idle' && (
                        <p className="text-[11px] text-gray-400 italic">Click "Check for updates" to see if a newer build is available.</p>
                    )}

                    {status.state === 'checking' && (
                        <p className="text-[11px] text-primary font-bold flex items-center gap-2">
                            <span className="w-3 h-3 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
                            Contacting update server&hellip;
                        </p>
                    )}

                    {status.state === 'up-to-date' && (
                        <p className="text-[11px] text-green-700 font-bold">You're on the latest version.</p>
                    )}

                    {status.state === 'available' && (
                        <div className="bg-yellow-50 border-l-4 border-yellow-500 p-3 mt-2 space-y-2">
                            <p className="text-xs font-black text-yellow-900 uppercase">
                                Update available: {status.update.version}
                            </p>
                            {status.update.body && (
                                <pre className="text-[10px] text-yellow-900/80 whitespace-pre-wrap font-mono leading-snug max-h-32 overflow-y-auto">
                                    {status.update.body}
                                </pre>
                            )}
                        </div>
                    )}

                    {status.state === 'downloading' && (
                        <div className="space-y-1 mt-2">
                            <p className="text-[11px] font-bold text-primary">
                                Downloading update&hellip; {formatBytes(status.downloaded)}
                                {status.total ? ` / ${formatBytes(status.total)}` : ''}
                            </p>
                            <div className="h-2 bg-gray-200 overflow-hidden">
                                <div
                                    className="h-full bg-primary transition-all"
                                    style={{
                                        width: status.total
                                            ? `${Math.min(100, (status.downloaded / status.total) * 100)}%`
                                            : '30%',
                                    }}
                                />
                            </div>
                        </div>
                    )}

                    {status.state === 'ready' && (
                        <p className="text-[11px] text-green-700 font-bold">
                            Update {status.installedVersion} installed. Click "Restart now" to finish.
                        </p>
                    )}

                    {status.state === 'error' && (
                        <p className="text-[11px] text-red-700 font-bold">Error: {status.message}</p>
                    )}
                </div>

                <div className="flex flex-col gap-2 items-stretch">
                    {status.state !== 'available' && status.state !== 'ready' && (
                        <button
                            type="button"
                            onClick={onCheck}
                            disabled={isBusy}
                            className="px-4 py-3 tally-button-primary uppercase text-[11px] font-black tracking-widest disabled:opacity-50"
                        >
                            {status.state === 'checking' ? 'Checking…' : 'Check for updates'}
                        </button>
                    )}

                    {status.state === 'available' && (
                        <>
                            <button
                                type="button"
                                onClick={() => onInstall(status.update)}
                                className="px-4 py-3 tally-button-primary uppercase text-[11px] font-black tracking-widest"
                            >
                                Install {status.update.version}
                            </button>
                            <button
                                type="button"
                                onClick={() => setStatus({ state: 'idle' })}
                                className="px-4 py-2 tally-border bg-white text-gray-600 uppercase text-[10px] font-black tracking-widest hover:bg-gray-50"
                            >
                                Skip for now
                            </button>
                        </>
                    )}

                    {status.state === 'ready' && (
                        <button
                            type="button"
                            onClick={onRestart}
                            className="px-4 py-3 tally-button-primary uppercase text-[11px] font-black tracking-widest"
                        >
                            Restart now
                        </button>
                    )}
                </div>
            </div>
        </section>
    );
};

export default UpdateChecker;
