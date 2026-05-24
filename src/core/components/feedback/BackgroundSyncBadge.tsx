/**
 * Small non-blocking badge shown in the StatusBar while transactional data
 * is downloading in the background. Disappears when sync completes.
 *
 * Designed to be unobtrusive — the app is fully usable during background sync;
 * this just reassures the user that historical data is on its way.
 */
import React, { useEffect, useState } from 'react';
import { onInitialSyncProgress, type InitialSyncProgress } from '@core/sync/InitialSync';

const BackgroundSyncBadge: React.FC = () => {
  const [snap, setSnap] = useState<InitialSyncProgress | null>(null);

  useEffect(() => {
    const unsub = onInitialSyncProgress(setSnap);
    return unsub;
  }, []);

  // Show only while background phase is running
  if (!snap || snap.phase !== 'background') return null;

  const bgTables = snap.tables.filter((t) => t.phase === 'background');
  const completed = bgTables.filter((t) => t.is_complete).length;
  const total = bgTables.length || 1;
  const percent = Math.round(snap.overallProgress * 100);
  const current = snap.currentTable ? snap.currentTable.replace(/_/g, ' ') : null;

  return (
    <div
      className="flex items-center gap-1.5 text-[10px] bg-white/10 px-2 py-0.5 rounded border border-white/10"
      title={`Downloading historical data: ${completed}/${total} tables done, ${percent}% overall`}
    >
      <span className="inline-block h-1.5 w-1.5 rounded-full bg-amber-400 animate-pulse" />
      <span className="uppercase tracking-wider opacity-80">
        {current ? `Loading: ${current}` : 'Loading history'}
      </span>
      <span className="opacity-60 tabular-nums">{percent}%</span>
    </div>
  );
};

export default BackgroundSyncBadge;
