import { db } from '@core/db/client';
import { TABLE } from '@core/db/schema';
import { SyncQueue } from '@core/sync/SyncQueue';
import { supabase } from '@core/db/supabaseClient';
import type { RegisteredPharmacy, Supplier, Distributor } from '@core/types';

function serialize(obj: Record<string, unknown>): Record<string, unknown> {
  const r: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    r[k] = v !== null && typeof v === 'object' ? JSON.stringify(v) : v;
  }
  if (!r.id) r.id = crypto.randomUUID();
  return r;
}

function deserialize(row: Record<string, unknown>): Record<string, unknown> {
  const r = { ...row };
  if (typeof r.ledger === 'string') {
    try { r.ledger = JSON.parse(r.ledger as string); } catch { r.ledger = []; }
  }
  if (typeof r.payment_details === 'string') {
    try { r.payment_details = JSON.parse(r.payment_details as string); } catch { r.payment_details = {}; }
  }
  return r;
}

export async function fetchSuppliers(user: RegisteredPharmacy): Promise<Supplier[]> {
  const rows = await db.select<Record<string, unknown>>(
    `SELECT * FROM ${TABLE.SUPPLIERS} WHERE organization_id = ? AND is_active = 1 ORDER BY name ASC`,
    [user.organization_id]
  );
  if (rows.length > 0) return rows.map(deserialize) as unknown as Supplier[];

  const { data } = await supabase
    .from('suppliers')
    .select('*')
    .eq('organization_id', user.organization_id)
    .eq('is_active', true);

  if (data?.length) await db.bulkUpsert(TABLE.SUPPLIERS, data.map(serialize));
  return ((data ?? []).map(deserialize)) as unknown as Supplier[];
}

export async function saveSupplier(supplier: Supplier, user: RegisteredPharmacy): Promise<void> {
  const row = serialize(supplier as unknown as Record<string, unknown>);
  await db.upsert(TABLE.SUPPLIERS, row);
  await SyncQueue.enqueue('INSERT', TABLE.SUPPLIERS, supplier.id, row, user.organization_id);
}

export async function updateSupplier(supplier: Supplier, user: RegisteredPharmacy): Promise<void> {
  const row = serialize(supplier as unknown as Record<string, unknown>);
  await db.upsert(TABLE.SUPPLIERS, row);
  await SyncQueue.enqueue('UPDATE', TABLE.SUPPLIERS, supplier.id, row, user.organization_id);
}

export async function fetchDistributors(user: RegisteredPharmacy): Promise<Distributor[]> {
  const rows = await db.select<Record<string, unknown>>(
    `SELECT * FROM ${TABLE.DISTRIBUTORS} WHERE organization_id = ? AND is_active = 1 ORDER BY name ASC`,
    [user.organization_id]
  );
  if (rows.length > 0) return rows.map(deserialize) as unknown as Distributor[];

  const { data } = await supabase
    .from('distributors')
    .select('*')
    .eq('organization_id', user.organization_id);

  if (data?.length) await db.bulkUpsert(TABLE.DISTRIBUTORS, data.map(serialize));
  return ((data ?? []).map(deserialize)) as unknown as Distributor[];
}

export async function saveDistributor(
  dist: Distributor,
  user: RegisteredPharmacy
): Promise<void> {
  const row = serialize(dist as unknown as Record<string, unknown>);
  await db.upsert(TABLE.DISTRIBUTORS, row);
  await SyncQueue.enqueue('INSERT', TABLE.DISTRIBUTORS, dist.id, row, user.organization_id);
}
