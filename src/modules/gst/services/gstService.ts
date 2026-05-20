import { db } from '@core/db/client';
import { TABLE } from '@core/db/schema';
import { SyncQueue } from '@core/sync/SyncQueue';
import { supabase } from '@core/db/supabaseClient';
import type { RegisteredPharmacy, EWayBill } from '@core/types';

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
  if (typeof r.data === 'string') {
    try { r.data = JSON.parse(r.data as string); } catch { /* ok */ }
  }
  return r;
}

export async function fetchEWayBills(user: RegisteredPharmacy): Promise<EWayBill[]> {
  const rows = await db.select<Record<string, unknown>>(
    `SELECT * FROM ${TABLE.EWAYBILLS} WHERE organization_id = ? ORDER BY created_at DESC`,
    [user.organization_id]
  );
  if (rows.length > 0) return rows.map(deserialize) as unknown as EWayBill[];

  const { data } = await supabase
    .from('ewaybills')
    .select('*')
    .eq('organization_id', user.organization_id);

  if (data?.length) await db.bulkUpsert(TABLE.EWAYBILLS, data.map(serialize));
  return ((data ?? []).map(deserialize)) as unknown as EWayBill[];
}

export async function saveEWayBill(bill: EWayBill, user: RegisteredPharmacy): Promise<void> {
  const row = serialize(bill as unknown as Record<string, unknown>);
  await db.upsert(TABLE.EWAYBILLS, row);
  await SyncQueue.enqueue('INSERT', TABLE.EWAYBILLS, bill.id, row, user.organization_id);
}

export async function updateEWayBillStatus(
  id: string,
  status: string,
  user: RegisteredPharmacy
): Promise<void> {
  const now = new Date().toISOString();
  await db.execute(
    `UPDATE ${TABLE.EWAYBILLS} SET status = ?, updated_at = ? WHERE id = ?`,
    [status, now, id]
  );
  await SyncQueue.enqueue('UPDATE', TABLE.EWAYBILLS, id, { id, status }, user.organization_id);
}
