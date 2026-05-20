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

export async function fetchGlMaster(user: RegisteredPharmacy) {
  const rows = await db.select(
    `SELECT * FROM ${TABLE.GL_MASTER} WHERE organization_id = ? AND active_status = 1`,
    [user.organization_id]
  );
  if (rows.length > 0) return rows;

  const { data } = await supabase
    .from('gl_master')
    .select('*')
    .eq('organization_id', user.organization_id)
    .eq('active_status', true);

  if (data?.length) await db.bulkUpsert(TABLE.GL_MASTER, data.map(serialize));
  return data ?? [];
}

export async function fetchGlAssignments(user: RegisteredPharmacy) {
  const rows = await db.select(
    `SELECT * FROM ${TABLE.GL_ASSIGNMENTS} WHERE organization_id = ?`,
    [user.organization_id]
  );
  if (rows.length > 0) return rows;

  const { data } = await supabase
    .from('gl_assignments')
    .select('*')
    .eq('organization_id', user.organization_id);

  if (data?.length) await db.bulkUpsert(TABLE.GL_ASSIGNMENTS, data.map(serialize));
  return data ?? [];
}

export async function fetchCompanyCodes(user: RegisteredPharmacy) {
  const rows = await db.select(
    `SELECT * FROM ${TABLE.COMPANY_CODES} WHERE organization_id = ?`,
    [user.organization_id]
  );
  if (rows.length > 0) return rows;

  const { data } = await supabase
    .from('company_codes')
    .select('*')
    .eq('organization_id', user.organization_id);

  if (data?.length) await db.bulkUpsert(TABLE.COMPANY_CODES, data.map(serialize));
  return data ?? [];
}

export async function fetchSetOfBooks(user: RegisteredPharmacy) {
  const rows = await db.select(
    `SELECT * FROM ${TABLE.SET_OF_BOOKS} WHERE organization_id = ?`,
    [user.organization_id]
  );
  if (rows.length > 0) return rows;

  const { data } = await supabase
    .from('set_of_books')
    .select('*')
    .eq('organization_id', user.organization_id);

  if (data?.length) await db.bulkUpsert(TABLE.SET_OF_BOOKS, data.map(serialize));
  return data ?? [];
}

export async function fetchBankMasters(user: RegisteredPharmacy) {
  const { data } = await supabase
    .from('gl_master')
    .select('id, gl_name, gl_code, parent_gl_id, active_status')
    .eq('organization_id', user.organization_id)
    .eq('gl_type', 'Bank');

  return (data ?? []).map((row) => ({
    id: row.id as string,
    bankName: row.gl_name as string,
    accountName: row.gl_name as string,
    accountNumber: row.gl_code as string,
    linkedBankGlId: row.id as string,
    activeStatus: row.active_status as string,
  }));
}
