import React, { useMemo } from 'react';
import type { InventoryItem, Purchase, Transaction } from '../types';

type Props = {
  isOpen: boolean;
  product: InventoryItem | null;
  purchases: Purchase[];
  sales: Transaction[];
  loading?: boolean;
  onClose: () => void;
};

const toDateValue = (value?: string) => new Date(value || 0).getTime();
const fmtDate = (value?: string) => value ? new Date(value).toLocaleDateString('en-IN') : '-';
const fmtMoney = (value: number) => `₹${(Number.isFinite(value) ? value : 0).toFixed(2)}`;

const ProductInsightsPanel: React.FC<Props> = ({ isOpen, product, purchases, sales, loading = false, onClose }) => {
  const purchaseRows = useMemo(() => {
    if (!product) return [];
    const rows: any[] = [];
    purchases
      .filter((p) => p.status !== 'cancelled')
      .forEach((p) => {
        (p.items || []).forEach((it: any) => {
          const sameById = product.id && it.inventoryItemId && it.inventoryItemId === product.id;
          const sameByName = (it.name || '').toLowerCase().trim() === (product.name || '').toLowerCase().trim();
          if (!sameById && !sameByName) return;
          const qty = Number(it.quantity || 0);
          const loose = Number(it.looseQuantity || 0);
          const rate = Number(it.purchasePrice || 0);
          const disc = Number(it.discountPercent || 0) + Number(it.schemeDiscountPercent || 0);
          const gst = Number(it.gstPercent || 0);
          const invoiceValue = Number(it.lineTotal || (qty + loose) * rate || 0);
          rows.push({
            date: p.date,
            supplier: p.supplier,
            voucherNo: p.id || p.invoiceNumber,
            batch: it.batch || '-',
            expiry: it.expiry || '-',
            qty,
            loose,
            rate,
            discount: disc,
            landedCost: rate * (1 - disc / 100),
            gst,
            invoiceValue,
          });
        });
      });
    return rows.sort((a, b) => toDateValue(b.date) - toDateValue(a.date)).slice(0, 20);
  }, [purchases, product]);

  const salesRows = useMemo(() => {
    if (!product) return [];
    const rows: any[] = [];
    sales
      .filter((s) => s.status !== 'cancelled')
      .forEach((s) => {
        (s.items || []).forEach((it: any) => {
          const sameById = product.id && it.inventoryItemId && it.inventoryItemId === product.id;
          const sameByName = (it.name || '').toLowerCase().trim() === (product.name || '').toLowerCase().trim();
          if (!sameById && !sameByName) return;
          const qty = Number(it.quantity || 0) + Number(it.looseQuantity || 0);
          const rate = Number(it.rate || it.mrp || 0);
          const discount = Number(it.discountPercent || 0) + Number(it.schemeDiscountPercent || 0);
          const gst = Number(it.gstPercent || 0);
          const net = Number(it.finalAmount || it.amount || qty * rate || 0);
          rows.push({ date: s.date, customer: s.customerName || '-', billId: s.id, qty, rate, discount, gst, net });
        });
      });
    return rows.sort((a, b) => toDateValue(b.date) - toDateValue(a.date)).slice(0, 20);
  }, [sales, product]);

  const purchaseSummary = useMemo(() => {
    const rates = purchaseRows.map((r) => r.rate);
    const last = rates[0] || 0;
    const avg = rates.length ? rates.reduce((a, b) => a + b, 0) / rates.length : 0;
    const best = purchaseRows.reduce((acc, row) => row.rate < acc.rate ? row : acc, purchaseRows[0] || { rate: 0, supplier: '-' });
    return { last, avg30: avg, avg90: avg, best };
  }, [purchaseRows]);

  const salesSummary = useMemo(() => {
    const rates = salesRows.map((r) => r.rate);
    const last = rates[0] || 0;
    const avg = rates.length ? rates.reduce((a, b) => a + b, 0) / rates.length : 0;
    return { last, avg30: avg, avg90: avg };
  }, [salesRows]);

  const margin = useMemo(() => {
    const selling = salesSummary.last || Number(product?.mrp || 0);
    const purchase = purchaseSummary.avg30 || Number(product?.purchasePrice || 0);
    const profitPerUnit = selling - purchase;
    const currentMargin = selling > 0 ? (profitPerUnit / selling) * 100 : 0;
    return { selling, purchase, profitPerUnit, currentMargin };
  }, [purchaseSummary.avg30, salesSummary.last, product]);

  const exportCsv = () => {
    const lines = [
      ['Section', 'Date', 'Party', 'Ref', 'Qty', 'Rate', 'Net'].join(','),
      ...purchaseRows.map((r) => ['Purchase', r.date, r.supplier, r.voucherNo, `${r.qty}/${r.loose}`, r.rate, r.invoiceValue].join(',')),
      ...salesRows.map((r) => ['Sales', r.date, r.customer, r.billId, r.qty, r.rate, r.net].join(',')),
    ];
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${(product?.name || 'product').replace(/\s+/g, '_')}_insights.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportExcel = () => {
    const lines = [
      ['Section', 'Date', 'Party', 'Ref', 'Qty', 'Rate', 'Net'].join('\t'),
      ...purchaseRows.map((r) => ['Purchase', r.date, r.supplier, r.voucherNo, `${r.qty}/${r.loose}`, r.rate, r.invoiceValue].join('\t')),
      ...salesRows.map((r) => ['Sales', r.date, r.customer, r.billId, r.qty, r.rate, r.net].join('\t')),
    ];
    const blob = new Blob([lines.join('\n')], { type: 'application/vnd.ms-excel' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${(product?.name || 'product').replace(/\s+/g, '_')}_insights.xls`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (!isOpen || !product) return null;

  return (
    <div className="absolute top-0 right-0 h-full w-[48%] bg-white border-l border-gray-200 shadow-2xl z-20 flex flex-col">
      <div className="p-3 border-b border-gray-200 flex items-center justify-between">
        <div>
          <p className="text-[10px] font-black uppercase tracking-widest text-gray-500">Product Details / Insights</p>
          <p className="text-sm font-bold text-gray-900">{product.name}</p>
        </div>
        <div className="flex gap-2">
          <button onClick={exportCsv} className="px-2 py-1 text-xs font-bold border">CSV</button>
          <button onClick={exportExcel} className="px-2 py-1 text-xs font-bold border">Excel</button>
          <button onClick={() => window.print()} className="px-2 py-1 text-xs font-bold border">PDF</button>
          <button onClick={onClose} className="px-2 py-1 text-xs font-bold border">Close</button>
        </div>
      </div>
      {loading ? <div className="p-4 animate-pulse space-y-3"><div className="h-8 bg-gray-100" /><div className="h-20 bg-gray-100" /><div className="h-20 bg-gray-100" /></div> : (
      <div className="p-3 overflow-auto space-y-4 text-xs">
        <div>
          <p className="font-black uppercase text-gray-500 mb-1">Purchase Summary</p>
          <p>Last Purchase Rate: <span className="font-bold">{fmtMoney(purchaseSummary.last)}</span> · Avg 30/90: <span className="font-bold">{fmtMoney(purchaseSummary.avg30)} / {fmtMoney(purchaseSummary.avg90)}</span> · Best: <span className="font-bold">{fmtMoney(purchaseSummary.best?.rate || 0)} ({purchaseSummary.best?.supplier || '-'})</span></p>
        </div>
        <table className="w-full border text-[11px]"><thead><tr className="bg-gray-50"><th>Date</th><th>Supplier</th><th>Voucher</th><th>Batch</th><th>Exp</th><th>Qty</th><th>PTR</th><th>Disc</th><th>Landed</th><th>GST</th><th>Invoice</th></tr></thead><tbody>{purchaseRows.map((r,idx)=><tr key={idx} className="border-t"><td>{fmtDate(r.date)}</td><td>{r.supplier}</td><td>{r.voucherNo}</td><td>{r.batch}</td><td>{r.expiry}</td><td>{r.qty}/{r.loose}</td><td>{fmtMoney(r.rate)}</td><td>{r.discount.toFixed(2)}%</td><td>{fmtMoney(r.landedCost)}</td><td>{r.gst}%</td><td>{fmtMoney(r.invoiceValue)}</td></tr>)}</tbody></table>

        <div>
          <p className="font-black uppercase text-gray-500 mb-1">Sales Summary</p>
          <p>Last Selling Rate: <span className="font-bold">{fmtMoney(salesSummary.last)}</span> · Avg 30/90: <span className="font-bold">{fmtMoney(salesSummary.avg30)} / {fmtMoney(salesSummary.avg90)}</span></p>
        </div>
        <table className="w-full border text-[11px]"><thead><tr className="bg-gray-50"><th>Date</th><th>Customer</th><th>Bill</th><th>Qty</th><th>Rate</th><th>Disc</th><th>GST</th><th>Net</th></tr></thead><tbody>{salesRows.map((r,idx)=><tr key={idx} className="border-t"><td>{fmtDate(r.date)}</td><td>{r.customer}</td><td>{r.billId}</td><td>{r.qty}</td><td>{fmtMoney(r.rate)}</td><td>{r.discount.toFixed(2)}%</td><td>{r.gst}%</td><td>{fmtMoney(r.net)}</td></tr>)}</tbody></table>

        <div className="border p-2">
          <p className="font-black uppercase text-gray-500">Profit / Margin Summary</p>
          <p className={margin.currentMargin < 5 ? 'text-red-600 font-bold' : 'font-bold'}>Current Margin: {margin.currentMargin.toFixed(2)}%</p>
          <p className={margin.profitPerUnit < 0 ? 'text-red-600 font-bold' : 'font-bold'}>Profit per unit: {fmtMoney(margin.profitPerUnit)}</p>
        </div>
      </div>)}
    </div>
  );
};

export default ProductInsightsPanel;
