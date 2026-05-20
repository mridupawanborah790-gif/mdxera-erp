import { db } from '@core/db/client';
import { TABLE } from '@core/db/schema';
import { supabase } from '@core/db/supabaseClient';
import type { RegisteredPharmacy } from '@core/types';

// Reports are read-only aggregation queries — no writes, no sync queue.

export interface DailySalesSummary {
  date: string;
  totalSales: number;
  totalPurchases: number;
  billCount: number;
  cashSales: number;
  creditSales: number;
}

export async function fetchDailySummary(
  user: RegisteredPharmacy,
  date: string
): Promise<DailySalesSummary> {
  const rows = await db.select<{ total: number; count: number; payment_mode: string }>(
    `SELECT SUM(total) as total, COUNT(*) as count, payment_mode
     FROM ${TABLE.SALES_BILL}
     WHERE organization_id = ? AND date(date) = date(?)
     GROUP BY payment_mode`,
    [user.organization_id, date]
  );

  let totalSales = 0;
  let billCount = 0;
  let cashSales = 0;
  let creditSales = 0;

  for (const row of rows) {
    totalSales += row.total ?? 0;
    billCount += row.count ?? 0;
    if (row.payment_mode === 'Cash') cashSales += row.total ?? 0;
    else creditSales += row.total ?? 0;
  }

  const purchaseRows = await db.select<{ total: number }>(
    `SELECT SUM(total_amount) as total
     FROM ${TABLE.PURCHASES}
     WHERE organization_id = ? AND date(date) = date(?)`,
    [user.organization_id, date]
  );

  return {
    date,
    totalSales,
    totalPurchases: purchaseRows[0]?.total ?? 0,
    billCount,
    cashSales,
    creditSales,
  };
}

export interface SalesReportRow {
  id: string;
  date: string;
  customer_name: string;
  total: number;
  payment_mode: string;
  status: string;
}

export async function fetchSalesReport(
  user: RegisteredPharmacy,
  fromDate: string,
  toDate: string
): Promise<SalesReportRow[]> {
  // Try local first
  const rows = await db.select<SalesReportRow>(
    `SELECT id, date, customer_name, total, payment_mode, status
     FROM ${TABLE.SALES_BILL}
     WHERE organization_id = ? AND date(date) BETWEEN date(?) AND date(?)
     ORDER BY date DESC`,
    [user.organization_id, fromDate, toDate]
  );
  if (rows.length > 0) return rows;

  // Fallback to Supabase
  const { data } = await supabase
    .from('sales_bill')
    .select('id, date, customer_name, total, payment_mode, status')
    .eq('organization_id', user.organization_id)
    .gte('date', fromDate)
    .lte('date', toDate)
    .order('date', { ascending: false });

  return (data ?? []) as SalesReportRow[];
}

export interface PurchaseReportRow {
  id: string;
  date: string;
  supplier: string;
  total_amount: number;
  status: string;
}

export async function fetchPurchaseReport(
  user: RegisteredPharmacy,
  fromDate: string,
  toDate: string
): Promise<PurchaseReportRow[]> {
  const rows = await db.select<PurchaseReportRow>(
    `SELECT id, date, supplier, total_amount, status
     FROM ${TABLE.PURCHASES}
     WHERE organization_id = ? AND date(date) BETWEEN date(?) AND date(?)
     ORDER BY date DESC`,
    [user.organization_id, fromDate, toDate]
  );
  if (rows.length > 0) return rows;

  const { data } = await supabase
    .from('purchases')
    .select('id, date, supplier, total_amount, status')
    .eq('organization_id', user.organization_id)
    .gte('date', fromDate)
    .lte('date', toDate)
    .order('date', { ascending: false });

  return (data ?? []) as PurchaseReportRow[];
}

export async function fetchLowStockItems(user: RegisteredPharmacy, threshold = 10) {
  return db.select(
    `SELECT id, name, batch, stock, min_stock_limit, expiry
     FROM ${TABLE.INVENTORY}
     WHERE organization_id = ? AND is_active = 1 AND stock <= ?
     ORDER BY stock ASC`,
    [user.organization_id, threshold]
  );
}

export async function fetchExpiringItems(user: RegisteredPharmacy, daysAhead = 90) {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() + daysAhead);
  const cutoffStr = cutoff.toISOString().split('T')[0];

  return db.select(
    `SELECT id, name, batch, stock, expiry
     FROM ${TABLE.INVENTORY}
     WHERE organization_id = ? AND is_active = 1 AND expiry IS NOT NULL AND expiry <= ?
     ORDER BY expiry ASC`,
    [user.organization_id, cutoffStr]
  );
}
