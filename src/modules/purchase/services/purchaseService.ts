import { db } from '@core/db/client';
import { TABLE } from '@core/db/schema';
import { SyncQueue } from '@core/sync/SyncQueue';
import { supabase } from '@core/db/supabaseClient';
import type { RegisteredPharmacy, Purchase, PurchaseOrder, PurchaseReturn, DeliveryChallan } from '@core/types';

const PAGE_SIZE = 500;

function serialize(obj: Record<string, unknown>): Record<string, unknown> {
  const r: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    r[k] = v !== null && typeof v === 'object' ? JSON.stringify(v) : v;
  }
  if (!r.id) r.id = crypto.randomUUID();
  return r;
}

function deserializeItems(row: Record<string, unknown>): Record<string, unknown> {
  const r = { ...row };
  if (typeof r.items === 'string') {
    try { r.items = JSON.parse(r.items as string); } catch { /* ok */ }
  }
  return r;
}

// ── Purchases ──────────────────────────────────────────────────────────────

export async function fetchPurchases(user: RegisteredPharmacy): Promise<Purchase[]> {
  const rows = await db.select<Record<string, unknown>>(
    `SELECT * FROM ${TABLE.PURCHASES} WHERE organization_id = ? ORDER BY date DESC`,
    [user.organization_id]
  );
  if (rows.length > 0) return rows.map(deserializeItems) as unknown as Purchase[];

  const { data } = await supabase
    .from('purchases')
    .select('*')
    .eq('organization_id', user.organization_id)
    .order('date', { ascending: false })
    .limit(PAGE_SIZE);

  if (data?.length) await db.bulkUpsert(TABLE.PURCHASES, data.map(serialize));
  return ((data ?? []).map(deserializeItems)) as unknown as Purchase[];
}

export async function addPurchase(p: Purchase, user: RegisteredPharmacy): Promise<void> {
  const row = serialize(p as unknown as Record<string, unknown>);
  await db.upsert(TABLE.PURCHASES, row);
  await SyncQueue.enqueue('INSERT', TABLE.PURCHASES, p.id, row, user.organization_id);
}

export async function updatePurchase(p: Purchase, user: RegisteredPharmacy): Promise<void> {
  const row = serialize(p as unknown as Record<string, unknown>);
  await db.upsert(TABLE.PURCHASES, row);
  await SyncQueue.enqueue('UPDATE', TABLE.PURCHASES, p.id, row, user.organization_id);
}

// ── Purchase Orders ────────────────────────────────────────────────────────

export async function fetchPurchaseOrders(user: RegisteredPharmacy): Promise<PurchaseOrder[]> {
  const rows = await db.select<Record<string, unknown>>(
    `SELECT * FROM ${TABLE.PURCHASE_ORDERS} WHERE organization_id = ? ORDER BY date DESC`,
    [user.organization_id]
  );
  if (rows.length > 0) return rows.map(deserializeItems) as unknown as PurchaseOrder[];

  const { data } = await supabase
    .from('purchase_orders')
    .select('*')
    .eq('organization_id', user.organization_id);

  if (data?.length) await db.bulkUpsert(TABLE.PURCHASE_ORDERS, data.map(serialize));
  return ((data ?? []).map(deserializeItems)) as unknown as PurchaseOrder[];
}

export async function savePurchaseOrder(
  po: PurchaseOrder,
  user: RegisteredPharmacy
): Promise<void> {
  const row = serialize(po as unknown as Record<string, unknown>);
  await db.upsert(TABLE.PURCHASE_ORDERS, row);
  await SyncQueue.enqueue('INSERT', TABLE.PURCHASE_ORDERS, po.id, row, user.organization_id);
}

export async function updatePurchaseOrder(
  po: PurchaseOrder,
  user: RegisteredPharmacy
): Promise<void> {
  const row = serialize(po as unknown as Record<string, unknown>);
  await db.upsert(TABLE.PURCHASE_ORDERS, row);
  await SyncQueue.enqueue('UPDATE', TABLE.PURCHASE_ORDERS, po.id, row, user.organization_id);
}

// ── Purchase Returns ───────────────────────────────────────────────────────

export async function fetchPurchaseReturns(user: RegisteredPharmacy): Promise<PurchaseReturn[]> {
  const rows = await db.select<Record<string, unknown>>(
    `SELECT * FROM ${TABLE.PURCHASE_RETURNS} WHERE organization_id = ? ORDER BY date DESC`,
    [user.organization_id]
  );
  if (rows.length > 0) return rows.map(deserializeItems) as unknown as PurchaseReturn[];

  const { data } = await supabase
    .from('purchase_returns')
    .select('*')
    .eq('organization_id', user.organization_id);

  if (data?.length) await db.bulkUpsert(TABLE.PURCHASE_RETURNS, data.map(serialize));
  return ((data ?? []).map(deserializeItems)) as unknown as PurchaseReturn[];
}

export async function addPurchaseReturn(
  pr: PurchaseReturn,
  user: RegisteredPharmacy
): Promise<void> {
  const row = serialize(pr as unknown as Record<string, unknown>);
  await db.upsert(TABLE.PURCHASE_RETURNS, row);
  await SyncQueue.enqueue('INSERT', TABLE.PURCHASE_RETURNS, pr.id, row, user.organization_id);
}
