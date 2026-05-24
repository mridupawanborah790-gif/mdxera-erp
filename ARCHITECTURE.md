# MDXera ERP — Architecture & Operations Reference

> Snapshot date: 2026-05-24. This document is the authoritative reference for the system's current state, intended to be loaded as conversation context when working on the codebase.

---

## 1. One-paragraph summary

MDXera ERP is a Tauri-based desktop pharmacy ERP that wraps a legacy React/Supabase web app. The web app (`App.tsx`, 3200 LOC) was a thin online-only client; it has been retrofitted with an **offline-first sync layer** (Tauri SQLite + a custom SyncEngine) so it works without internet. The two halves coexist: the legacy app still drives all UI and business logic, but reads/writes are now bridged through SQLite and a sync queue that pushes to Supabase in the background. There are real seams in this design — most notably **two persistence layers** (an in-memory cache the legacy app uses, plus the new SQLite store) — and most of the work in this codebase has been bridging them safely.

---

## 2. Top-level layout

```
mdxera-erp/
├── index.tsx                       Vite/React entry point
├── App.tsx                         LEGACY app component (3221 LOC)
├── services/                       LEGACY services (root, pre-refactor)
│   ├── storageService.ts           3776 LOC — bridge between legacy memoryCache and new SQLite
│   ├── indexedDbService.ts         IndexedDB shim (DISABLED — ENABLE_INDEXED_DB = false)
│   ├── supabaseClient.ts           Singleton @supabase/supabase-js client
│   ├── companyDefaultsService.ts   ensurePostingContext / loadDefaultPostingContext
│   └── ...
├── src/
│   ├── app/                        NEW app shell (UNUSED — kept for future cutover)
│   │   ├── App.tsx                 Slim shell with AuthProvider+SyncProvider+Router
│   │   ├── Router.tsx              Lazy routes (props don't match legacy components yet)
│   │   └── providers/
│   ├── core/
│   │   ├── auth/                   authService.ts, authStore.ts, rosterSync.ts
│   │   ├── components/
│   │   │   ├── feedback/
│   │   │   │   ├── InitialSyncModal.tsx        Blocking modal during foreground phase
│   │   │   │   ├── BackgroundSyncBadge.tsx     Status-bar progress for background phase
│   │   │   │   └── SyncIndicator.tsx           Click-through queue inspector
│   │   │   └── layout/
│   │   │       ├── Header.tsx                  Has the new "Sync All" button
│   │   │       ├── StatusBar.tsx               Bottom bar, hosts indicators
│   │   │       └── AppErrorBoundary.tsx        Surfaces uncaught render errors
│   │   ├── db/
│   │   │   ├── client.ts                       Singleton Tauri SQL plugin wrapper
│   │   │   ├── schema.ts                       Table-name constants
│   │   │   ├── migrations/                     7 migrations, applied in order
│   │   │   └── supabaseClient.ts
│   │   ├── sync/
│   │   │   ├── SyncBootstrap.tsx               Mounted in legacy App; orchestrates everything
│   │   │   ├── InitialSync.ts                  Foreground + background bulk pulls
│   │   │   ├── SyncEngine.ts                   Recurring 30s push/pull loop
│   │   │   ├── SyncPuller.ts                   Delta pulls from Supabase → SQLite
│   │   │   ├── SyncWorker.ts                   Pushes _sync_queue → Supabase
│   │   │   ├── SyncQueue.ts                    SQLite _sync_queue CRUD
│   │   │   ├── columnFilter.ts                 Schema-aware row adapter (JSON encoding, NOT NULL defaults)
│   │   │   ├── conflictResolver.ts             updated_at last-writer-wins
│   │   │   └── networkMonitor.ts               Online/offline detection
│   │   ├── voucher/
│   │   │   └── voucherService.ts               Range-allocation invoice numbering
│   │   └── services/
│   │       └── storageService.ts               Re-export of legacy storageService (bridge)
│   └── modules/                                Per-feature React components (legacy props-drilled)
├── supabase/
│   └── functions/_shared/reserve_voucher_range.sql   MUST be deployed manually
└── tsconfig.json                               Excludes src/app/**, powersync.ts (unused)
```

---

## 3. The dual-persistence problem (most important thing to know)

The repo has **two parallel storage layers**:

| Layer | Lives in | Read by | Written by |
|---|---|---|---|
| **Legacy in-memory cache** (`memoryCache: Record<string, any[]>`) | `services/storageService.ts` (module-level) | All legacy React components via `storage.fetchX()` / `storage.getData()` | `storage.saveData()` and the bridge |
| **New SQLite store** (`mdxera.db`) | Tauri plugin-sql | New sync code (`SyncPuller`, `InitialSync`) and `SyncIndicator` | `SyncBootstrap`, `SyncEngine`, hydration |

IndexedDB exists in the legacy code but is **disabled** (`ENABLE_INDEXED_DB = false` in `services/indexedDbService.ts`). That means the legacy app's only persistent store is SQLite — but the legacy app doesn't read from it directly. The bridge is `hydrateMemoryCacheFromSqlite(orgId)` which copies SQLite rows into `memoryCache` on app start (and after every InitialSync foreground phase).

**Mental model:** SQLite is the durable store; `memoryCache` is the view the legacy UI reads from. Hydration warms the view from the store. Writes update both: `saveData()` updates `memoryCache` synchronously AND enqueues to `_sync_queue` (SQLite) for the SyncEngine to push to Supabase. Reads always go through `memoryCache`.

---

## 4. Boot sequence

1. `index.tsx` mounts `<AppErrorBoundary><App/></AppErrorBoundary>` — `App` is the **legacy** root `App.tsx`. `src/app/App.tsx` is NOT used (its Router doesn't pass the props legacy components expect).
2. Legacy `App.tsx` mounts. Initial `isAppLoading=true` shows a spinner.
3. `useEffect` at line ~812 calls `storage.getCurrentUser()` (Supabase session lookup).
4. If a user is found:
   - Fire-and-forget `storage.hydrateMemoryCacheFromSqlite(orgId)` — runs in background, fires `mdxera:hydrate-complete` when done.
   - `setCurrentUser(user)` — this triggers the `<SyncBootstrap>` child to mount.
   - `storage.fetchProfile()` to get latest profile.
   - `loadData(user, 'initial')` — pulls fresh data from Supabase, populates React state.
5. `SyncBootstrap`'s effect:
   - Warms up voucher ranges.
   - Checks `isForegroundComplete()` from `_initial_sync_state` table.
   - **If foreground complete:** starts `SyncEngine`; kicks off background phase if needed.
   - **If not complete + online:** sets phase='running' (modal appears), `runForegroundSync()` downloads masters, **then** starts SyncEngine + background phase. SyncEngine deliberately deferred to avoid racing InitialSync writes.
   - **If not complete + offline:** sets phase='skipped'; user works with whatever's already in cache.
6. `mdxera:hydrate-complete` fires when hydration finishes → legacy App re-runs `loadData('sync')` to refresh React state from now-populated cache.

---

## 5. The sync layer (technical details)

### 5.1 Tables tracked

`src/core/db/schema.ts` declares two sets:
- `SYNCABLE_TABLES` — 35 tables that mirror Supabase
- Internal: `_sync_queue`, `_sync_meta`, `_local_auth`, `_migrations`, `_initial_sync_state`

### 5.2 SyncBootstrap (`src/core/sync/SyncBootstrap.tsx`)

Single React component mounted by legacy App when `currentUser` exists. Owns the lifecycle:
- Subscribes to window `mdxera:resync-all` event (Sync All button) — clears `_initial_sync_state` + `_sync_meta` and re-arms itself.
- Exposes `window.__mdxera` helpers: `clearVoucherReservations()`, `triggerFullResync()`, `runForegroundSync()`, `startBackgroundSync()`.
- Renders `<InitialSyncModal>` only during `phase === 'running' | 'error'`.

### 5.3 InitialSync (`src/core/sync/InitialSync.ts`)

Two phases:
- **Foreground** (`FOREGROUND_TABLES`): masters required for POS to function. Runs serially with progress modal. profiles → configurations → business_roles → team_members → company_codes → set_of_books → gl_master → gl_assignments → categories → sub_categories → material_master → inventory → customers → suppliers → distributors → doctor_master → supplier_product_map → customer_price_list → mbc_card_types → mbc_card_templates.
- **Background** (`BACKGROUND_TABLES`): transaction history. Runs after foreground; status-bar badge. purchases → purchase_orders → sales_bill → sales_challans → delivery_challans → sales_returns → purchase_returns → journal_entry_header → journal_entry_lines → promotions → ewaybills → mbc_cards → mbc_card_history → physical_inventory → mrp_change_log.

Each table is paginated (1000 rows/batch via `.range()`), resumable from `_initial_sync_state.synced_rows`, auto-retried (backoff 30s → 2min → 10min, max 3 attempts).

### 5.4 SyncEngine (`src/core/sync/SyncEngine.ts`)

Runs every 30 s **after foreground sync is done**. Each cycle:
1. `checkConnectivity()` (HEAD-like GET to `/rest/v1/profiles?limit=0` with apikey — returns 200).
2. `processSyncQueue()` — pushes pending `_sync_queue` rows to Supabase.
3. Status: idle / syncing / offline / error.
4. Listens for online/offline events; immediate pull on reconnect.

**Important:** SyncEngine does NOT auto-pull on `start()` — `SyncBootstrap` controls when pulls happen so they don't race with InitialSync.

### 5.5 SyncPuller (`src/core/sync/SyncPuller.ts`)

Delta-pulls each table since `_sync_meta.last_pulled_at`. Per-table overrides in `TABLE_META`:
- `profiles` uses `user_id` as PK (not `id`)
- `delivery_challans`, `sales_challans`, `physical_inventory`, `mrp_change_log`, `journal_entry_lines`, `sales_returns`, `purchase_returns` use `created_at` as delta column (no `updated_at`)
- `mbc_card_history` has `deltaCol: null` (always full-pull — Supabase has neither timestamp)

Session-level `_permanentlyMissingTables` Set: any table that returns "schema mismatch" (e.g. `customer_price_list` if missing on a given Supabase project) is added and skipped for the rest of the session — stops the 30-second cycle from re-querying it.

### 5.6 SyncWorker (`src/core/sync/SyncWorker.ts`)

Pushes `_sync_queue` to Supabase. Push order is FK-safe (`TABLE_PRIORITY` map: profiles=1 → ... → journal_entry_lines=81). FK violations are **deferred** (not failed) so parent rows can sync first. Real failures use `formatError()` (handles PostgrestError plain objects, not just Error instances).

### 5.7 columnFilter (`src/core/sync/columnFilter.ts`)

Adapts Supabase rows for SQLite insert:
- `getSchemaForTable()` introspects via `PRAGMA table_info` (cached)
- Drops unknown columns
- JSON-stringifies nested objects/arrays
- Booleans → 0/1
- **NOT NULL defaults**: for any NOT NULL column where the incoming value is null, substitutes `''` (TEXT), `0` (INTEGER/REAL), or omits to let SQLite use the declared default. Stops "NOT NULL constraint failed: purchase_orders.supplier" type errors when production has loose data.

### 5.8 db client (`src/core/db/client.ts`)

**The single most critical file.** Tauri's plugin-sql uses a SQLite POOL — each `database.execute()` may land on a different connection. This makes explicit BEGIN/COMMIT impossible (BEGIN on conn A, COMMIT on conn C → "cannot commit - no transaction is active"). Our wrapper:

- **No explicit transactions.** `db.transaction()` is in name only — runs statements serially inside a single queued block. Each statement auto-commits. **Lost atomicity is accepted** because all our use cases are `INSERT OR REPLACE` with retry.
- **Single op queue** (`_opQueue`): every `execute`/`select`/`transaction` runs to completion before the next starts.
- **Busy retry** (`withBusyRetry`): up to 4 attempts on SQLITE_BUSY with 50/100/200/400 ms backoff.
- **PRAGMAs run 4× at init**: `journal_mode = WAL`, `busy_timeout = 10000`, `foreign_keys = ON`, `synchronous = NORMAL`. Run multiple times because each pool connection needs them and we can't pin to one.

---

## 6. Voucher numbering

`src/core/voucher/voucherService.ts` implements **range allocation**:
- Device requests a chunk (default 100) via `supabase.rpc('reserve_voucher_range', ...)` SQL function
- Server atomically advances `configurations.invoice_config.currentNumber` AND `internalCurrentNumber`
- Device consumes numbers locally from `voucher_reservations` SQLite table
- When pool < `LOW_WATER_MARK = 20`, prefetches another range
- Offline: uses cached pool; throws cleanly when exhausted

**The SQL function lives at `supabase/functions/_shared/reserve_voucher_range.sql` and must be deployed manually via Supabase SQL Editor.** No tooling auto-deploys it. The function reads `GREATEST(internalCurrentNumber, currentNumber, startingNumber)` so it stays in sync with the legacy app's running counter.

---

## 7. POS save flow (offline-safe)

1. POS.handleSave → onSaveOrUpdateTransaction → App.handleSaveOrUpdateTransaction
2. `addTransaction(tx, user, isUpdate)` in legacy storageService:
   - **If online:** `ensurePostingContext` + `validateGLMappings` (Supabase reads). If offline: SKIPPED. The bill is queued; server-side will validate on push.
   - `saveData('sales_bill', tx, user, isUpdate)`:
     - Updates `memoryCache`
     - `idb.put` (no-op since IDB disabled)
     - **If online:** tries `supabase.from('sales_bill').insert(...)` directly. On success: marks `_sync_status: 'synced'`. On network error: marks pending AND enqueues to `_sync_queue` via `SyncQueue.enqueue()`.
     - **If offline:** skips Supabase entirely, marks pending AND enqueues.
   - Stock deduction loop: `updateMemoryCacheBulk` for inventory (replaces old `clearTableMemoryCache` which was wiping state offline). Each updated inventory row also enqueued.
   - `syncSalesLedger`: SKIPPED when offline (returns early). Otherwise updates GL postings.
3. App.tsx updates React state: `setTransactions([savedTx, ...prev])`, `refreshInventoryViews()`.

Result: offline saves are fully local + queued. SyncEngine pushes them when online.

---

## 8. Known issues (FIXED list — what's been done)

1. ✅ `index.tsx` bootstrapped legacy `App.tsx` directly, bypassing the new sync stack. → `SyncBootstrap` injected into legacy App tree.
2. ✅ Legacy `saveData()` always required online; failed offline with "Network connection issue." → Offline path enqueues to SyncQueue, online network error also enqueues.
3. ✅ `reserve_voucher_range.sql` read only `cfg ->> 'currentNumber'` while legacy stored counter in `internalCurrentNumber`. → SQL now reads `GREATEST(internal, current, starting)`.
4. ✅ Legacy `loadData` ran before hydration → wiped `memoryCache` to `[]`. → Hydration runs first (boot) AND after foreground sync; `getData` falls back to on-demand hydrate when offline + cache empty.
5. ✅ Blank screen on POS save: `syncSalesLedger` threw on offline-non-network errors; `clearTableMemoryCache('INVENTORY')` wiped state. → `syncSalesLedger` returns early offline; cache patched in place via `updateMemoryCacheBulk`.
6. ✅ Blank screen on first launch from `configurations.masterShortcuts.map is not a function`. → Added `master_shortcuts` and 4 other JSON columns to `SQLITE_JSON_COLUMNS`; added auto-detect for any string starting with `[`/`{`.
7. ✅ Hydration timed out at 15 s during InitialSync writes → made fire-and-forget, no timeout, fires `mdxera:hydrate-complete` event. Hydrate runs AFTER foreground sync, not during.
8. ✅ SyncPuller failures: profiles `id` vs `user_id`; sales_returns/purchase_returns missing `updated_at` on server; mbc_card_history missing both timestamps; customer_price_list missing entirely. → Per-table `TABLE_META` overrides; permanently-missing tables cached per session.
9. ✅ `[object Object]` shown in failed sync queue. → `formatError()` extracts `message`/`code`/`details`/`hint` from PostgrestError objects.
10. ✅ "cannot commit - no transaction is active" — root cause: Tauri plugin-sql pool gives BEGIN/COMMIT to different connections. → Removed explicit BEGIN/COMMIT; all DB ops serialized through `_opQueue` with busy-retry; SyncEngine deferred until after InitialSync.
11. ✅ networkMonitor 401 spam — `/rest/v1/` returns 401 even with apikey. → Switched to `/rest/v1/profiles?select=user_id&limit=0` which returns 200.
12. ✅ Sync All button: clears state and re-arms the modal flow.
13. ✅ AppErrorBoundary surfaces uncaught errors instead of white-screening.

## 9. Known issues (TO FIX list — what's still open)

- **Legacy IDB is disabled but the code still tries to put/get/getAll.** All those calls return null/[] silently. This is fine but wastes cycles. Long-term: remove `idb.*` calls entirely or re-enable IndexedDB with proper migration to SQLite.
- **`src/app/App.tsx` + `Router.tsx`** are stubs — components are lazy-loaded but their props are empty `{}`. Doesn't compile against actual component prop types (excluded from `tsconfig.json`). Eventual goal: migrate legacy App.tsx to slim router-based shell once components stop being props-drilled.
- **Inventory only shows partial data after sync.** Likely because some tables fail mid-batch and the `partial sync completed` warning is shown but specific failures aren't surfaced. Worth investigating per-table row counts after a full resync.
- **No conflict resolution UI** — `conflictResolver.ts` uses last-write-wins on `updated_at`. If a user edits the same bill on two devices, the older edit silently loses.
- **No "soft delete" support** in `_sync_queue` for deletes — the DELETE op exists in the queue but the worker may not handle every table.
- **rosterSync** previously used `db.transaction` (caused "cannot commit") — now uses per-row inserts. Could be more efficient but works.
- **SyncIndicator** "Op" / "Table" columns can be blank for orphaned queue rows (predate `enqueueForSync`). User must manually Discard.
- **mbc_card_history** has neither `updated_at` nor `created_at` — full pull every cycle. Fine for small tables, bad for large.
- **The new Router** is excluded from build (`tsconfig.json`) — `src/app/App.tsx` and `src/app/Router.tsx` need their props wired up or the file deleted.
- **Multiple Header buttons share the same `R` underline shortcut** — Reload + (potentially) Resync.

## 10. Operations runbook

### 10.1 Deploying the voucher SQL
Open Supabase Dashboard → SQL Editor → paste `supabase/functions/_shared/reserve_voucher_range.sql` → Run. Verify with:
```sql
SELECT proname FROM pg_proc WHERE proname = 'reserve_voucher_range';
```

### 10.2 Clearing a stale voucher cache (after deploying new SQL)
In the app, open DevTools (F12) and run:
```js
await window.__mdxera.clearVoucherReservations();
```
Then click **Sync All** in the header (or restart) to fetch a fresh range.

### 10.3 Forcing a full resync
Click the **Sync All** button in the header. Or:
```js
window.__mdxera.triggerFullResync();
```

### 10.4 Clearing failed queue records
Open the **SyncIndicator** in the StatusBar (the green/amber/red dot at the bottom) → click → "Discard all" under Failed records.

### 10.5 Wiping local SQLite for a fresh start
Quit the app. Delete:
- `%APPDATA%/com.mdxera.erp/mdxera.db`
- `%APPDATA%/com.mdxera.erp/mdxera.db-wal`
- `%APPDATA%/com.mdxera.erp/mdxera.db-shm`
Restart and log in online — InitialSync rebuilds from scratch.

### 10.6 Verifying production counter
```sql
SELECT invoice_config->>'currentNumber'         AS curr,
       invoice_config->>'internalCurrentNumber' AS internal
FROM configurations
WHERE organization_id = '<your org id>';
```
If `internal` is NULL on an established account, set it:
```sql
UPDATE configurations
SET invoice_config = jsonb_set(invoice_config, '{internalCurrentNumber}', '223')
WHERE organization_id = '<id>';
```

---

## 11. Development conventions

- **Never re-introduce explicit BEGIN/COMMIT.** `db.transaction()` already runs statements serially; that's the safe pattern given Tauri's pool. If you need true atomicity, wrap the whole thing in `try/catch` and clean up manually on failure.
- **Don't await hydration in render-blocking paths.** Always fire-and-forget; listen for `HYDRATE_COMPLETE_EVENT`.
- **All new sync-targets must be in `SYNCABLE_TABLES`** AND have an entry in `TABLE_PRIORITY` (SyncWorker) so they push in FK-safe order.
- **JSON-encoded columns must be in `SQLITE_JSON_COLUMNS`** (storageService.ts) so they're decoded on hydration.
- **Don't call `db.transaction` recursively** — the queue will deadlock.
- **Reads bypass `memoryCache` → SQLite → Supabase** in that order. Write to `memoryCache` synchronously, persist async.

---

## 12. Key environment / build facts

- Tauri 2.x, Vite 5+, React 18
- Tauri plugin: `@tauri-apps/plugin-sql` (SQLite)
- Supabase project: `sblmbkgoiefqzykjksgm.supabase.co`
- Anon key: hardcoded fallback in `src/core/db/supabaseClient.ts` and `src/core/sync/networkMonitor.ts`
- IndexedDB intentionally disabled (`ENABLE_INDEXED_DB = false`)
- `npm run tauri:dev` for dev; `npm run build` for production
- TypeScript build EXCLUDES: `src/app/App.tsx`, `src/app/Router.tsx`, `services/powersync.ts`, `src/modules/inventory/services/inventoryService.ts`, `src/core/hooks/usePermissions.ts`

---

## 13. Failure-mode quick reference

| Symptom | Likely cause | Where to look |
|---|---|---|
| Blank screen on launch | Uncaught render error; AppErrorBoundary should show details | DevTools console + boundary screen |
| "cannot commit - no transaction is active" | Should not occur after the no-explicit-BEGIN fix; if it does, someone re-introduced BEGIN | `src/core/db/client.ts` |
| "database is locked" repeatedly | A long-running write is blocking; check that SyncEngine isn't running during InitialSync | `SyncBootstrap.tsx` ordering |
| Voucher number starts from 1 | Either SQL not deployed OR stale `voucher_reservations` cache OR production `currentNumber` is null | Section 10.1 / 10.2 / 10.6 |
| POS save offline → "Network connection issue" | An old code path bypassed enqueueForSync; check `services/storageService.ts:saveData` | The if `(!navigator.onLine)` branch should `enqueueForSync` |
| Hydration never fires the event | Most likely a SQLite init failure; check console for `[storage] SQLite client unavailable` | `services/storageService.ts:hydrateMemoryCacheFromSqlite` |
| Sync All button missing | `currentUser` may be null OR App.tsx isn't passing `onResyncAll` | App.tsx Header props |

---

*End of architecture reference. Update this file when bridging seams change or migrations add tables.*
