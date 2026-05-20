import { db } from '@core/db/client';
import { TABLE } from '@core/db/schema';
import { SyncQueue } from '@core/sync/SyncQueue';
import { supabase } from '@core/db/supabaseClient';
import type { RegisteredPharmacy, InventoryItem, Medicine } from '@core/types';

// ── Inventory ──────────────────────────────────────────────────────────────

export async function fetchInventory(user: RegisteredPharmacy): Promise<InventoryItem[]> {
  const rows = await db.select<InventoryItem>(
    `SELECT * FROM ${TABLE.INVENTORY} WHERE organization_id = ? AND is_active = 1`,
    [user.organization_id]
  );
  if (rows.length > 0) return rows;

  const { data } = await supabase
    .from('inventory')
    .select('*')
    .eq('organization_id', user.organization_id)
    .eq('is_active', true);

  if (data?.length) await db.bulkUpsert(TABLE.INVENTORY, data.map(serialize));
  return (data ?? []) as InventoryItem[];
}

export async function saveInventoryItem(
  item: InventoryItem,
  user: RegisteredPharmacy
): Promise<void> {
  const row = serialize(item as Record<string, unknown>);
  await db.upsert(TABLE.INVENTORY, row);
  await SyncQueue.enqueue('UPDATE', TABLE.INVENTORY, item.id, row, user.organization_id);
}

export async function updateInventoryStock(
  id: string,
  newStock: number,
  user: RegisteredPharmacy
): Promise<void> {
  const now = new Date().toISOString();
  await db.execute(
    `UPDATE ${TABLE.INVENTORY} SET stock = ?, updated_at = ?, _sync_status = 'pending' WHERE id = ?`,
    [newStock, now, id]
  );
  const rows = await db.select<InventoryItem>(
    `SELECT * FROM ${TABLE.INVENTORY} WHERE id = ? LIMIT 1`,
    [id]
  );
  if (rows[0]) {
    await SyncQueue.enqueue('UPDATE', TABLE.INVENTORY, id, rows[0] as Record<string, unknown>, user.organization_id);
  }
}

export async function deleteInventoryItem(id: string, user: RegisteredPharmacy): Promise<void> {
  await db.execute(
    `UPDATE ${TABLE.INVENTORY} SET is_active = 0, updated_at = ? WHERE id = ?`,
    [new Date().toISOString(), id]
  );
  await SyncQueue.enqueue('UPDATE', TABLE.INVENTORY, id, { id, is_active: 0 }, user.organization_id);
}

// ── Material Master (Medicine catalog) ─────────────────────────────────────

export async function fetchMedicineMaster(user: RegisteredPharmacy): Promise<Medicine[]> {
  const rows = await db.select<Medicine>(
    `SELECT * FROM ${TABLE.MATERIAL_MASTER} WHERE organization_id = ? AND is_active = 1 ORDER BY name ASC`,
    [user.organization_id]
  );
  if (rows.length > 0) return rows;

  const { data } = await supabase
    .from('material_master')
    .select('*')
    .eq('organization_id', user.organization_id)
    .eq('is_active', true);

  if (data?.length) await db.bulkUpsert(TABLE.MATERIAL_MASTER, data.map(serialize));
  return (data ?? []) as Medicine[];
}

export async function saveMedicine(medicine: Medicine, user: RegisteredPharmacy): Promise<void> {
  const row = serialize(medicine as Record<string, unknown>);
  await db.upsert(TABLE.MATERIAL_MASTER, row);
  await SyncQueue.enqueue('INSERT', TABLE.MATERIAL_MASTER, medicine.id, row, user.organization_id);
}

export async function updateMedicine(medicine: Medicine, user: RegisteredPharmacy): Promise<void> {
  const row = serialize(medicine as Record<string, unknown>);
  await db.upsert(TABLE.MATERIAL_MASTER, row);
  await SyncQueue.enqueue('UPDATE', TABLE.MATERIAL_MASTER, medicine.id, row, user.organization_id);
}

// ── Supplier Product Map ───────────────────────────────────────────────────

export async function fetchSupplierProductMaps(user: RegisteredPharmacy) {
  const rows = await db.select(
    `SELECT * FROM ${TABLE.SUPPLIER_PRODUCT_MAP} WHERE organization_id = ?`,
    [user.organization_id]
  );
  if (rows.length > 0) return rows;

  const { data } = await supabase
    .from('supplier_product_map')
    .select('*')
    .eq('organization_id', user.organization_id);

  if (data?.length) await db.bulkUpsert(TABLE.SUPPLIER_PRODUCT_MAP, data.map(serialize));
  return data ?? [];
}

// ── Physical Inventory ─────────────────────────────────────────────────────

export async function fetchPhysicalInventory(user: RegisteredPharmacy) {
  const rows = await db.select(
    `SELECT * FROM ${TABLE.PHYSICAL_INVENTORY} WHERE organization_id = ? ORDER BY start_date DESC`,
    [user.organization_id]
  );
  if (rows.length > 0) return rows.map(deserializeItems);

  const { data } = await supabase
    .from('physical_inventory')
    .select('*')
    .eq('organization_id', user.organization_id);

  if (data?.length) await db.bulkUpsert(TABLE.PHYSICAL_INVENTORY, data.map(serialize));
  return (data ?? []).map(deserializeItems);
}

export async function savePhysicalInventory(
  session: Record<string, unknown>,
  user: RegisteredPharmacy
): Promise<void> {
  const row = serialize(session);
  await db.upsert(TABLE.PHYSICAL_INVENTORY, row);
  await SyncQueue.enqueue('INSERT', TABLE.PHYSICAL_INVENTORY, row.id as string, row, user.organization_id);
}

// ── MRP change log ─────────────────────────────────────────────────────────

export async function fetchMrpChangeLogs(user: RegisteredPharmacy) {
  const rows = await db.select(
    `SELECT * FROM ${TABLE.MRP_CHANGE_LOG} WHERE organization_id = ? ORDER BY created_at DESC`,
    [user.organization_id]
  );
  if (rows.length > 0) return rows;

  const { data } = await supabase
    .from('mrp_change_log')
    .select('*')
    .eq('organization_id', user.organization_id);

  if (data?.length) await db.bulkUpsert(TABLE.MRP_CHANGE_LOG, data.map(serialize));
  return data ?? [];
}

// ── Doctor master ──────────────────────────────────────────────────────────

export async function fetchDoctors(user: RegisteredPharmacy) {
  const rows = await db.select(
    `SELECT * FROM ${TABLE.DOCTOR_MASTER} WHERE organization_id = ? AND is_active = 1 ORDER BY name ASC`,
    [user.organization_id]
  );
  if (rows.length > 0) return rows;

  const { data } = await supabase
    .from('doctor_master')
    .select('*')
    .eq('organization_id', user.organization_id)
    .eq('is_active', true);

  if (data?.length) await db.bulkUpsert(TABLE.DOCTOR_MASTER, data.map(serialize));
  return data ?? [];
}

export async function saveDoctor(
  doctor: Record<string, unknown>,
  user: RegisteredPharmacy
): Promise<void> {
  const row = serialize(doctor);
  await db.upsert(TABLE.DOCTOR_MASTER, row);
  await SyncQueue.enqueue('INSERT', TABLE.DOCTOR_MASTER, row.id as string, row, user.organization_id);
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
