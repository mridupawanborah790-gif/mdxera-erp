import { db } from '@core/db/client';
import { TABLE } from '@core/db/schema';
import { SyncQueue } from '@core/sync/SyncQueue';
import { supabase } from '@core/db/supabaseClient';
import type { RegisteredPharmacy, Transaction, SalesReturn, SalesChallan, DeliveryChallan } from '@core/types';

const PAGE_SIZE = 500;

// ── Sales Bills ────────────────────────────────────────────────────────────

export async function fetchTransactions(user: RegisteredPharmacy): Promise<Transaction[]> {
  const rows = await db.select<Record<string, unknown>>(
    `SELECT * FROM ${TABLE.SALES_BILL} WHERE organization_id = ? ORDER BY date DESC`,
    [user.organization_id]
  );
  if (rows.length > 0) return rows.map(deserializeTransaction) as Transaction[];

  const { data } = await supabase
    .from('sales_bill')
    .select('*')
    .eq('organization_id', user.organization_id)
    .order('date', { ascending: false })
    .limit(PAGE_SIZE);

  if (data?.length) await db.bulkUpsert(TABLE.SALES_BILL, data.map(serialize));
  return ((data ?? []).map(deserializeTransaction)) as Transaction[];
}

export async function addTransaction(
  tx: Transaction,
  user: RegisteredPharmacy
): Promise<void> {
  const row = serialize(tx as unknown as Record<string, unknown>);
  await db.upsert(TABLE.SALES_BILL, row);
  await SyncQueue.enqueue('INSERT', TABLE.SALES_BILL, tx.id, row, user.organization_id);
}

export async function updateTransaction(
  tx: Transaction,
  user: RegisteredPharmacy
): Promise<void> {
  const row = serialize(tx as unknown as Record<string, unknown>);
  await db.upsert(TABLE.SALES_BILL, row);
  await SyncQueue.enqueue('UPDATE', TABLE.SALES_BILL, tx.id, row, user.organization_id);
}

// ── Sales Returns ──────────────────────────────────────────────────────────

export async function fetchSalesReturns(user: RegisteredPharmacy): Promise<SalesReturn[]> {
  const rows = await db.select<Record<string, unknown>>(
    `SELECT * FROM ${TABLE.SALES_RETURNS} WHERE organization_id = ? ORDER BY date DESC`,
    [user.organization_id]
  );
  if (rows.length > 0) return rows.map(deserializeItems) as unknown as SalesReturn[];

  const { data } = await supabase
    .from('sales_returns')
    .select('*')
    .eq('organization_id', user.organization_id);

  if (data?.length) await db.bulkUpsert(TABLE.SALES_RETURNS, data.map(serialize));
  return ((data ?? []).map(deserializeItems)) as unknown as SalesReturn[];
}

export async function addSalesReturn(
  sr: SalesReturn,
  user: RegisteredPharmacy
): Promise<void> {
  const row = serialize(sr as unknown as Record<string, unknown>);
  await db.upsert(TABLE.SALES_RETURNS, row);
  await SyncQueue.enqueue('INSERT', TABLE.SALES_RETURNS, sr.id, row, user.organization_id);
}

// ── Sales Challans ─────────────────────────────────────────────────────────

export async function fetchSalesChallans(user: RegisteredPharmacy): Promise<SalesChallan[]> {
  const rows = await db.select<Record<string, unknown>>(
    `SELECT * FROM ${TABLE.SALES_CHALLANS} WHERE organization_id = ? ORDER BY date DESC`,
    [user.organization_id]
  );
  if (rows.length > 0) return rows.map(deserializeItems) as unknown as SalesChallan[];

  const { data } = await supabase
    .from('sales_challans')
    .select('*')
    .eq('organization_id', user.organization_id);

  if (data?.length) await db.bulkUpsert(TABLE.SALES_CHALLANS, data.map(serialize));
  return ((data ?? []).map(deserializeItems)) as unknown as SalesChallan[];
}

export async function saveSalesChallan(
  challan: SalesChallan,
  user: RegisteredPharmacy
): Promise<void> {
  const row = serialize(challan as unknown as Record<string, unknown>);
  await db.upsert(TABLE.SALES_CHALLANS, row);
  await SyncQueue.enqueue('INSERT', TABLE.SALES_CHALLANS, challan.id, row, user.organization_id);
}

// ── Delivery Challans ──────────────────────────────────────────────────────

export async function fetchDeliveryChallans(user: RegisteredPharmacy): Promise<DeliveryChallan[]> {
  const rows = await db.select<Record<string, unknown>>(
    `SELECT * FROM ${TABLE.DELIVERY_CHALLANS} WHERE organization_id = ? ORDER BY date DESC`,
    [user.organization_id]
  );
  if (rows.length > 0) return rows.map(deserializeItems) as unknown as DeliveryChallan[];

  const { data } = await supabase
    .from('delivery_challans')
    .select('*')
    .eq('organization_id', user.organization_id);

  if (data?.length) await db.bulkUpsert(TABLE.DELIVERY_CHALLANS, data.map(serialize));
  return ((data ?? []).map(deserializeItems)) as unknown as DeliveryChallan[];
}

export async function saveDeliveryChallan(
  challan: DeliveryChallan,
  user: RegisteredPharmacy
): Promise<void> {
  const row = serialize(challan as unknown as Record<string, unknown>);
  await db.upsert(TABLE.DELIVERY_CHALLANS, row);
  await SyncQueue.enqueue('INSERT', TABLE.DELIVERY_CHALLANS, challan.id, row, user.organization_id);
}

// ── Serialization ──────────────────────────────────────────────────────────

function serialize(obj: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    result[k] = v !== null && typeof v === 'object' ? JSON.stringify(v) : v;
  }
  if (!result.id) result.id = crypto.randomUUID();
  return result;
}

function deserializeItems(row: Record<string, unknown>): Record<string, unknown> {
  const r = { ...row };
  if (typeof r.items === 'string') {
    try { r.items = JSON.parse(r.items as string); } catch { /* ok */ }
  }
  return r;
}

function deserializeTransaction(row: Record<string, unknown>): Record<string, unknown> {
  const r = deserializeItems(row);
  // No extra JSON fields in sales_bill beyond items
  return r;
}
