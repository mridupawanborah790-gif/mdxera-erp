import { db } from '@core/db/client';
import { TABLE } from '@core/db/schema';
import { SyncQueue } from '@core/sync/SyncQueue';
import { supabase } from '@core/db/supabaseClient';
import type { RegisteredPharmacy } from '@core/types';

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
  if (typeof r.transactions === 'string') {
    try { r.transactions = JSON.parse(r.transactions as string); } catch { r.transactions = []; }
  }
  return r;
}

export async function fetchMbcCards(user: RegisteredPharmacy) {
  const rows = await db.select<Record<string, unknown>>(
    `SELECT * FROM ${TABLE.MBC_CARDS} WHERE organization_id = ? ORDER BY created_at DESC`,
    [user.organization_id]
  );
  if (rows.length > 0) return rows.map(deserialize);

  const { data } = await supabase
    .from('mbc_cards')
    .select('*')
    .eq('organization_id', user.organization_id);

  if (data?.length) await db.bulkUpsert(TABLE.MBC_CARDS, data.map(serialize));
  return (data ?? []).map(deserialize);
}

export async function saveMbcCard(
  card: Record<string, unknown>,
  user: RegisteredPharmacy
): Promise<void> {
  const row = serialize(card);
  await db.upsert(TABLE.MBC_CARDS, row);
  await SyncQueue.enqueue('INSERT', TABLE.MBC_CARDS, row.id as string, row, user.organization_id);
}

export async function updateMbcCard(
  card: Record<string, unknown>,
  user: RegisteredPharmacy
): Promise<void> {
  const row = serialize(card);
  await db.upsert(TABLE.MBC_CARDS, row);
  await SyncQueue.enqueue('UPDATE', TABLE.MBC_CARDS, row.id as string, row, user.organization_id);
}
