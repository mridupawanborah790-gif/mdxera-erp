/**
 * Offline-first voucher number generator (range-allocation model).
 *
 * Each device pre-reserves a CHUNK of numbers from the server (e.g. 124-223)
 * via the `reserve_voucher_range` Postgres function. Numbers are then used
 * sequentially from that local pool — works identically online and offline.
 * When the pool runs low (< LOW_WATER_MARK), a background prefetch grabs
 * another chunk. When the pool is empty AND offline, generation fails with
 * a clear error.
 *
 * Why this design:
 *   - ZERO collisions across devices (server hands out non-overlapping ranges)
 *   - ZERO renumbering after sync (the assigned number is final)
 *   - Existing production data is respected (server's currentNumber is the
 *     source of truth; new ranges start from it)
 *
 * Required server function: see supabase/functions/_shared/reserve_voucher_range.sql
 */
import { db } from '@core/db/client';
import { supabase } from '@core/db/supabaseClient';
import { isOnline } from '@core/sync/networkMonitor';
import { getDeviceId } from '@core/utils/deviceId';
import type { RegisteredPharmacy } from '@core/types';

export type VoucherDocumentType =
  | 'sales-gst'
  | 'sales-non-gst'
  | 'purchase-entry'
  | 'purchase-order'
  | 'sales-challan'
  | 'delivery-challan'
  | 'physical-inventory';

export interface VoucherReservationResult {
  documentNumber: string;
  usedNumber: number;
  nextNumber: number;
  remainingCount: number | null;
}

interface VoucherReservation {
  id: string;
  organization_id: string;
  document_type: string;
  fy: string;
  device_id: string;
  range_start: number;
  range_end: number;
  next_available: number;
  exhausted: number;
}

const DEFAULT_CHUNK_SIZE = 100;
const LOW_WATER_MARK = 20; // pre-fetch a new range when remaining < this
const MAX_LOCAL_FALLBACK_RANGE = 1_000_000_000; // safety cap for emergency offline numbers

// ── Helpers ────────────────────────────────────────────────────────────────

function defaultPrefix(docType: VoucherDocumentType): string {
  switch (docType) {
    case 'sales-gst':         return 'INV';
    case 'sales-non-gst':     return 'NGI';
    case 'purchase-entry':    return 'PUR';
    case 'purchase-order':    return 'PO';
    case 'sales-challan':     return 'SC';
    case 'delivery-challan':  return 'DC';
    case 'physical-inventory':return 'PI';
    default:                  return 'INV';
  }
}

function configColumn(docType: VoucherDocumentType): string {
  switch (docType) {
    case 'sales-gst':         return 'invoice_config';
    case 'sales-non-gst':     return 'non_gst_invoice_config';
    case 'purchase-entry':    return 'purchase_config';
    case 'purchase-order':    return 'purchase_order_config';
    case 'sales-challan':     return 'sales_challan_config';
    case 'delivery-challan':  return 'delivery_challan_config';
    case 'physical-inventory':return 'physical_inventory_config';
  }
}

function computeFiscalYear(now = new Date()): string {
  const month = now.getMonth() + 1;
  const year = now.getFullYear();
  const start = month >= 4 ? year : year - 1;
  const end = (start + 1) % 100;
  return `${start}-${end.toString().padStart(2, '0')}`;
}

interface ConfigFormatting {
  prefix: string;
  paddingLength: number;
  useFiscalYear: boolean;
}

async function readConfigFormatting(
  docType: VoucherDocumentType,
  orgId: string
): Promise<ConfigFormatting> {
  const col = configColumn(docType);
  const rows = await db.select<Record<string, unknown>>(
    `SELECT ${col} as cfg FROM configurations WHERE organization_id = ? LIMIT 1`,
    [orgId]
  );
  let cfg: { prefix?: string; paddingLength?: number; useFiscalYear?: boolean } = {};
  if (rows.length > 0 && rows[0].cfg) {
    const raw = rows[0].cfg;
    if (typeof raw === 'string') {
      try { cfg = JSON.parse(raw); } catch { /* defaults */ }
    } else if (typeof raw === 'object') {
      cfg = raw as typeof cfg;
    }
  }
  return {
    prefix: cfg.prefix ?? defaultPrefix(docType),
    paddingLength: Math.max(1, cfg.paddingLength ?? 6),
    useFiscalYear: cfg.useFiscalYear ?? true,
  };
}

function format(fmt: ConfigFormatting, n: number, fy: string): string {
  return fmt.prefix + n.toString().padStart(fmt.paddingLength, '0') + (fmt.useFiscalYear ? `-${fy}` : '');
}

// ── Range management ───────────────────────────────────────────────────────

/**
 * Find an active (non-exhausted) reservation for this org+docType+fy.
 */
async function findActiveReservation(
  orgId: string,
  docType: VoucherDocumentType,
  fy: string
): Promise<VoucherReservation | null> {
  const rows = await db.select<VoucherReservation>(
    `SELECT * FROM voucher_reservations
     WHERE organization_id = ? AND document_type = ? AND fy = ? AND exhausted = 0
     ORDER BY range_start ASC LIMIT 1`,
    [orgId, docType, fy]
  );
  if (rows.length === 0) return null;
  const r = rows[0];
  if (r.next_available > r.range_end) {
    // Already used up but not yet marked exhausted; mark now
    await db.execute(`UPDATE voucher_reservations SET exhausted = 1 WHERE id = ?`, [r.id]);
    return null;
  }
  return r;
}

/**
 * Fetch a new range from the server. Requires internet.
 */
async function fetchNewRangeFromServer(
  orgId: string,
  docType: VoucherDocumentType,
  deviceId: string,
  chunkSize: number = DEFAULT_CHUNK_SIZE
): Promise<VoucherReservation> {
  const { data, error } = await supabase.rpc('reserve_voucher_range', {
    p_organization_id: orgId,
    p_document_type: docType,
    p_device_id: deviceId,
    p_chunk_size: chunkSize,
  });
  if (error) throw new Error(error.message);
  const payload = Array.isArray(data) ? data[0] : data;
  if (!payload?.success) {
    throw new Error(payload?.message ?? 'Server refused voucher range reservation');
  }

  const id = `${orgId}-${docType}-${payload.fy}-${payload.range_start}`;
  const reservation: VoucherReservation = {
    id,
    organization_id: orgId,
    document_type: docType,
    fy: payload.fy,
    device_id: deviceId,
    range_start: payload.range_start,
    range_end: payload.range_end,
    next_available: payload.range_start,
    exhausted: 0,
  };
  await db.execute(
    `INSERT OR REPLACE INTO voucher_reservations
       (id, organization_id, document_type, fy, device_id, range_start, range_end, next_available, reserved_at, exhausted)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`,
    [id, orgId, docType, payload.fy, deviceId, payload.range_start, payload.range_end, payload.range_start, Date.now()]
  );
  return reservation;
}

/**
 * Ensure we have an active reservation. If pool is empty and we're online,
 * fetch a new range. If pool is empty and offline, throw.
 */
async function ensureReservation(
  orgId: string,
  docType: VoucherDocumentType,
  fy: string,
  deviceId: string
): Promise<VoucherReservation> {
  const active = await findActiveReservation(orgId, docType, fy);
  if (active) return active;

  if (!isOnline()) {
    throw new Error(
      `No voucher numbers available offline for "${docType}". ` +
      `Please connect to the internet to fetch a new range.`
    );
  }

  return fetchNewRangeFromServer(orgId, docType, deviceId);
}

/**
 * Pre-fetch a new range in the background if the current pool is low.
 * Non-blocking — failures are swallowed (we'll try again on next reservation).
 */
function maybePrefetchAsync(orgId: string, docType: VoucherDocumentType, deviceId: string): void {
  if (!isOnline()) return;
  // Fire-and-forget: don't await
  (async () => {
    try {
      const fy = computeFiscalYear();
      const active = await findActiveReservation(orgId, docType, fy);
      const remaining = active ? active.range_end - active.next_available + 1 : 0;
      if (remaining < LOW_WATER_MARK) {
        await fetchNewRangeFromServer(orgId, docType, deviceId);
      }
    } catch (err) {
      // Silent failure; will retry on next reservation
      console.warn('[voucher] background prefetch failed:', err);
    }
  })();
}

// ── Public API ─────────────────────────────────────────────────────────────

export async function reserveVoucherNumber(
  docType: VoucherDocumentType,
  user: RegisteredPharmacy,
  isPreview: boolean = false
): Promise<VoucherReservationResult> {
  const deviceId = await getDeviceId();
  const fy = computeFiscalYear();
  const fmt = await readConfigFormatting(docType, user.organization_id);

  const reservation = await ensureReservation(user.organization_id, docType, fy, deviceId);
  const usedNumber = reservation.next_available;

  if (usedNumber > MAX_LOCAL_FALLBACK_RANGE) {
    throw new Error('Voucher number out of safe range — please contact support.');
  }

  const documentNumber = format(fmt, usedNumber, reservation.fy);

  if (isPreview) {
    return {
      documentNumber,
      usedNumber,
      nextNumber: usedNumber + 1,
      remainingCount: reservation.range_end - usedNumber,
    };
  }

  const newNextAvailable = usedNumber + 1;
  const willExhaust = newNextAvailable > reservation.range_end;
  await db.execute(
    `UPDATE voucher_reservations SET next_available = ?, exhausted = ? WHERE id = ?`,
    [newNextAvailable, willExhaust ? 1 : 0, reservation.id]
  );

  // Pre-fetch in background if low
  maybePrefetchAsync(user.organization_id, docType, deviceId);

  return {
    documentNumber,
    usedNumber,
    nextNumber: newNextAvailable,
    remainingCount: reservation.range_end - usedNumber,
  };
}

/**
 * Cancel a voucher number. With range allocation, cancellation just leaves
 * a gap in the sequence (the number is already consumed from our range).
 * If the cancelled number is the most recent one we issued (range[end]==used),
 * we can "rewind" by decrementing next_available.
 *
 * Online: also notifies the server's audit log.
 */
export async function markVoucherCancelled(
  docType: VoucherDocumentType,
  user: RegisteredPharmacy,
  documentNumber: string,
  referenceId?: string
): Promise<void> {
  const fy = computeFiscalYear();
  const fmt = await readConfigFormatting(docType, user.organization_id);
  const active = await findActiveReservation(user.organization_id, docType, fy);

  if (active && active.next_available > active.range_start) {
    const lastIssued = active.next_available - 1;
    const lastIssuedFormatted = format(fmt, lastIssued, active.fy);
    if (lastIssuedFormatted === documentNumber) {
      // Rewind: this WAS the most recent number, so free it up for reuse
      await db.execute(
        `UPDATE voucher_reservations SET next_available = ?, exhausted = 0 WHERE id = ?`,
        [lastIssued, active.id]
      );
    }
  }

  // Notify server's audit trail when online
  if (isOnline()) {
    try {
      await supabase.rpc('log_voucher_number_event', {
        p_organization_id: user.organization_id,
        p_document_type: docType,
        p_event_type: 'cancelled',
        p_document_number: documentNumber,
        p_reference_id: referenceId ?? null,
      });
    } catch (err) {
      console.warn('[voucher] cancel audit log failed (non-fatal):', err);
    }
  }
}

/**
 * Wipe all cached voucher reservations on this device. Use this when the local
 * cache has stale ranges (e.g. server config was wrong when the range was
 * pulled). Next reservation will fetch a fresh range from the server.
 */
export async function clearVoucherReservations(): Promise<void> {
  await db.execute(`DELETE FROM voucher_reservations`);
  console.info('[voucher] cleared all voucher_reservations');
}

/**
 * Pre-fetch ranges for all document types after a successful online login.
 * Call this from AuthProvider after restoreSession() or login() succeeds.
 */
export async function warmupVoucherRanges(user: RegisteredPharmacy): Promise<void> {
  if (!isOnline()) return;
  const deviceId = await getDeviceId();
  const fy = computeFiscalYear();
  const docTypes: VoucherDocumentType[] = [
    'sales-gst', 'sales-non-gst', 'purchase-entry', 'purchase-order',
    'sales-challan', 'delivery-challan', 'physical-inventory',
  ];
  for (const docType of docTypes) {
    try {
      const active = await findActiveReservation(user.organization_id, docType, fy);
      if (active && (active.range_end - active.next_available + 1) >= LOW_WATER_MARK) {
        continue; // already have enough
      }
      await fetchNewRangeFromServer(user.organization_id, docType, deviceId);
    } catch (err) {
      console.warn(`[voucher] warmup failed for ${docType}:`, err);
    }
  }
}

/**
 * Health-check for the StatusBar UI: returns remaining count per doc type.
 */
export async function getVoucherPoolStatus(orgId: string): Promise<Array<{
  documentType: string;
  remaining: number;
  rangeEnd: number | null;
  fy: string;
}>> {
  const fy = computeFiscalYear();
  const rows = await db.select<VoucherReservation>(
    `SELECT * FROM voucher_reservations
     WHERE organization_id = ? AND fy = ? AND exhausted = 0`,
    [orgId, fy]
  );
  return rows.map((r) => ({
    documentType: r.document_type,
    remaining: r.range_end - r.next_available + 1,
    rangeEnd: r.range_end,
    fy: r.fy,
  }));
}
