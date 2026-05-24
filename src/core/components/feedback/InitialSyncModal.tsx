/**
 * Blocking modal shown during the foreground phase of initial sync.
 * Lists each table with a progress bar and shows estimated time remaining.
 *
 * Usage: render conditionally in AuthProvider when isForegroundComplete() === false
 *        after a successful online login.
 */
import React, { useEffect, useState, useMemo } from 'react';
import {
  onInitialSyncProgress,
  type InitialSyncProgress,
  type TableProgress,
} from '@core/sync/InitialSync';

interface Props {
  /** Called when user clicks 'Retry' after a fatal error */
  onRetry: () => void;
  /** Called when user gives up (sync is offered again on next login) */
  onSkip?: () => void;
}

// Friendly labels for the technical table names
const TABLE_LABEL: Record<string, string> = {
  profiles: 'Account profile',
  configurations: 'Settings',
  business_roles: 'Roles',
  team_members: 'Team members',
  company_codes: 'Company codes',
  set_of_books: 'Sets of books',
  gl_master: 'Chart of accounts',
  gl_assignments: 'GL mappings',
  categories: 'Categories',
  sub_categories: 'Sub-categories',
  material_master: 'Materials',
  inventory: 'Inventory',
  customers: 'Customers',
  suppliers: 'Suppliers',
  distributors: 'Distributors',
  doctor_master: 'Doctors',
  supplier_product_map: 'Vendor mappings',
  customer_price_list: 'Price lists',
  mbc_card_types: 'Card types',
  mbc_card_templates: 'Card templates',
};

function fmtLabel(tableName: string): string {
  return TABLE_LABEL[tableName] ?? tableName.replace(/_/g, ' ');
}

const InitialSyncModal: React.FC<Props> = ({ onRetry, onSkip }) => {
  const [snap, setSnap] = useState<InitialSyncProgress | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const startedAt = useMemo(() => Date.now(), []);

  useEffect(() => {
    const unsub = onInitialSyncProgress(setSnap);
    const tick = setInterval(() => setElapsed(Math.floor((Date.now() - startedAt) / 1000)), 1000);
    return () => { unsub(); clearInterval(tick); };
  }, [startedAt]);

  if (!snap) {
    return <FullScreenSpinner message="Preparing your workspace…" />;
  }

  const fgTables = snap.tables.filter((t) => t.phase === 'foreground');
  const completed = fgTables.filter((t) => t.is_complete).length;
  const total = fgTables.length || 1;
  const percent = Math.round(snap.overallProgress * 100);

  // Crude ETA based on elapsed / progress
  const etaSec = snap.overallProgress > 0.02
    ? Math.max(1, Math.floor(elapsed * (1 - snap.overallProgress) / snap.overallProgress))
    : null;

  const fatal = snap.fatalError;

  return (
    <div className="fixed inset-0 bg-gray-900/90 z-[100] flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-2xl max-w-2xl w-full max-h-[90vh] flex flex-col">
        <div className="px-6 py-5 border-b">
          <h2 className="text-xl font-semibold text-gray-900">
            Setting up your workspace
          </h2>
          <p className="text-sm text-gray-600 mt-1">
            Downloading your business data so it's available offline. This happens once per device.
          </p>
        </div>

        {/* Overall progress */}
        <div className="px-6 py-4 bg-blue-50 border-b">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-gray-700">
              Overall progress: {completed}/{total} groups
            </span>
            <span className="text-sm font-bold text-blue-700">{percent}%</span>
          </div>
          <div className="h-2.5 bg-blue-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-blue-600 transition-all duration-300"
              style={{ width: `${percent}%` }}
            />
          </div>
          <div className="flex justify-between text-xs text-gray-600 mt-1.5">
            <span>{elapsed}s elapsed</span>
            {etaSec !== null && <span>~{etaSec}s remaining</span>}
          </div>
        </div>

        {/* Per-table list */}
        <div className="flex-1 overflow-auto px-6 py-3">
          <ul className="space-y-1.5">
            {fgTables.map((t) => (
              <TableRow key={t.table_name} progress={t} isCurrent={snap.currentTable === t.table_name} />
            ))}
          </ul>
        </div>

        {/* Footer / error */}
        <div className="px-6 py-4 border-t bg-gray-50">
          {fatal ? (
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-red-700">Sync failed</p>
                <p className="text-xs text-red-600 mt-0.5">{fatal}</p>
              </div>
              <div className="flex gap-2">
                {onSkip && (
                  <button
                    onClick={onSkip}
                    className="px-3 py-1.5 text-sm text-gray-700 bg-white border rounded hover:bg-gray-100"
                  >
                    Continue offline
                  </button>
                )}
                <button
                  onClick={onRetry}
                  className="px-3 py-1.5 text-sm text-white bg-blue-600 rounded hover:bg-blue-700"
                >
                  Retry
                </button>
              </div>
            </div>
          ) : (
            <p className="text-xs text-gray-500 text-center">
              Please do not close the app. We're getting things ready.
            </p>
          )}
        </div>
      </div>
    </div>
  );
};

interface RowProps {
  progress: TableProgress;
  isCurrent: boolean;
}

const TableRow: React.FC<RowProps> = ({ progress, isCurrent }) => {
  const label = fmtLabel(progress.table_name);
  const pct = progress.total_rows && progress.total_rows > 0
    ? Math.round((progress.synced_rows / progress.total_rows) * 100)
    : (progress.is_complete ? 100 : 0);

  const statusIcon = progress.is_complete
    ? '✓'
    : isCurrent
      ? '⟳'
      : progress.last_error
        ? '⚠'
        : '·';

  const statusColor = progress.is_complete
    ? 'text-green-600'
    : isCurrent
      ? 'text-blue-600 animate-spin-slow'
      : progress.last_error
        ? 'text-amber-600'
        : 'text-gray-400';

  return (
    <li className="flex items-center gap-3 py-1.5">
      <span className={`w-4 text-center text-sm font-bold ${statusColor}`}>{statusIcon}</span>
      <span className="flex-1 text-sm text-gray-800 capitalize">{label}</span>
      <span className="text-xs text-gray-500 tabular-nums w-32 text-right">
        {progress.is_complete
          ? `${progress.total_rows ?? '✓'} rows`
          : progress.total_rows
            ? `${progress.synced_rows.toLocaleString()} / ${progress.total_rows.toLocaleString()}`
            : isCurrent ? 'starting…' : 'waiting'
        }
      </span>
      <div className="w-24 h-1.5 bg-gray-200 rounded-full overflow-hidden">
        <div
          className={`h-full transition-all ${progress.is_complete ? 'bg-green-500' : 'bg-blue-500'}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </li>
  );
};

const FullScreenSpinner: React.FC<{ message: string }> = ({ message }) => (
  <div className="fixed inset-0 bg-gray-900/90 z-[100] flex items-center justify-center">
    <div className="text-gray-200 text-sm">{message}</div>
  </div>
);

export default InitialSyncModal;
