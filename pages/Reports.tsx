import React, { useEffect, useMemo, useState } from 'react';
import Modal from '../components/Modal';
import type { InventoryItem, Transaction, Purchase, Distributor, Customer, SalesReturn, PurchaseReturn, ModuleConfig, DoctorMaster } from '../types';
import { getOutstandingBalance } from '../utils/helpers';
import { getStockBreakup } from '../utils/stock';

interface ReportsProps {
  inventory: InventoryItem[];
  transactions: Transaction[];
  purchases: Purchase[];
  distributors: Distributor[];
  customers: Customer[];
  doctors: DoctorMaster[];
  salesReturns: SalesReturn[];
  purchaseReturns: PurchaseReturn[];
  onPrintReport: (report: { title: string; data: any[]; headers: string[]; filters: any; }) => void;
  config?: ModuleConfig;
}

interface ReportDefinition {
  id: string;
  name: string;
  group: string;
}

type SortDirection = 'asc' | 'desc';

const round2 = (value: number) => Number((Number(value || 0)).toFixed(2));

const REPORT_LIST: ReportDefinition[] = [
  { id: 'salesRegister', name: 'Sales Register', group: 'Sales Reports' },
  { id: 'salesSummary', name: 'Sales Summary', group: 'Sales Reports' },
  { id: 'billWiseSales', name: 'Bill-wise Sales', group: 'Sales Reports' },
  { id: 'dateWiseSales', name: 'Date-wise Sales', group: 'Sales Reports' },
  { id: 'partyWiseSales', name: 'Party-wise Sales', group: 'Sales Reports' },
  { id: 'doctorWiseSales', name: 'Doctor-wise Sales', group: 'Sales Reports' },
  { id: 'itemWiseSales', name: 'Item-wise Sales', group: 'Sales Reports' },
  { id: 'categoryWiseSales', name: 'Category-wise Sales', group: 'Sales Reports' },
  { id: 'areaWiseSales', name: 'Area-wise Sales', group: 'Sales Reports' },
  { id: 'salesReturnRegister', name: 'Sales Return Register', group: 'Sales Reports' },
  { id: 'creditNoteRegister', name: 'Credit Note Register', group: 'Sales Reports' },
  { id: 'schemeDiscountReport', name: 'Scheme/Discount Report', group: 'Sales Reports' },
  { id: 'freeQuantityReport', name: 'Free Quantity Report', group: 'Sales Reports' },
  { id: 'profitOnSales', name: 'Profit on Sales', group: 'Sales Reports' },
  { id: 'marginAnalysis', name: 'Margin Analysis', group: 'Sales Reports' },
  { id: 'cancelledDeletedBills', name: 'Cancelled Bills', group: 'Sales Reports' },

  { id: 'purchaseRegister', name: 'Purchase Register', group: 'Purchase Reports' },
  { id: 'purchaseSummary', name: 'Purchase Summary', group: 'Purchase Reports' },
  { id: 'billWisePurchase', name: 'Bill-wise Purchase', group: 'Purchase Reports' },
  { id: 'supplierWisePurchase', name: 'Supplier-wise Purchase', group: 'Purchase Reports' },
  { id: 'itemWisePurchase', name: 'Item-wise Purchase', group: 'Purchase Reports' },
  { id: 'purchaseReturnRegister', name: 'Purchase Return Register', group: 'Purchase Reports' },
  { id: 'debitNoteRegister', name: 'Debit Note Register', group: 'Purchase Reports' },

  { id: 'stockSummary', name: 'Stock Summary', group: 'Inventory Reports' },
  { id: 'batchWiseStock', name: 'Batch-wise Stock', group: 'Inventory Reports' },
  { id: 'expiryWiseStock', name: 'Expiry-wise Stock', group: 'Inventory Reports' },
  { id: 'nearExpiryReport', name: 'Near Expiry Report', group: 'Inventory Reports' },
  { id: 'expiredStockReport', name: 'Expired Stock Report', group: 'Inventory Reports' },
  { id: 'negativeStock', name: 'Negative Stock Report', group: 'Inventory Reports' },
  { id: 'reorderLevelReport', name: 'Reorder Level Report', group: 'Inventory Reports' },

  { id: 'ledgerReport', name: 'Account Ledger', group: 'Accounting Reports' },
  { id: 'dayBook', name: 'Day Book', group: 'Accounting Reports' },
  { id: 'outstandingReceivables', name: 'Outstanding Receivables', group: 'Accounting Reports' },
  { id: 'outstandingPayables', name: 'Outstanding Payables', group: 'Accounting Reports' },
];

const isDateWithinRange = (isoDate: string, startIso: string, endIso: string) => {
  const date = new Date(isoDate);
  const start = new Date(startIso);
  start.setHours(0, 0, 0, 0);
  const end = new Date(endIso);
  end.setHours(23, 59, 59, 999);
  return date >= start && date <= end;
};

const Reports: React.FC<ReportsProps> = ({
  inventory, transactions, purchases, distributors, customers, doctors, salesReturns, purchaseReturns, onPrintReport,
}) => {
  const todayIso = new Date().toISOString().split('T')[0];
  const firstOfMonthIso = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0];

  const [periodStartDate, setPeriodStartDate] = useState(firstOfMonthIso);
  const [periodEndDate, setPeriodEndDate] = useState(todayIso);
  const [periodModalOpen, setPeriodModalOpen] = useState(false);
  const [pendingReportId, setPendingReportId] = useState<string>('salesRegister');

  const [activeReportId, setActiveReportId] = useState<string>('salesRegister');
  const [activeReportTitle, setActiveReportTitle] = useState<string>('Sales Register');
  const [headers, setHeaders] = useState<string[]>([]);
  const [baseData, setBaseData] = useState<any[]>([]);
  const [filteredData, setFilteredData] = useState<any[]>([]);
  const [selectedRowIndex, setSelectedRowIndex] = useState<number>(-1);
  const [visibleColumns, setVisibleColumns] = useState<string[]>([]);
  const [activeFilters, setActiveFilters] = useState<Record<string, string[]>>({});
  const [sortConfig, setSortConfig] = useState<{ column: string; direction: SortDirection } | null>(null);
  const [filterModalOpen, setFilterModalOpen] = useState(false);
  const [columnModalOpen, setColumnModalOpen] = useState(false);

  const reportById = useMemo(() => new Map(REPORT_LIST.map(r => [r.id, r])), []);
  const groupedReports = useMemo(() => {
    return REPORT_LIST.reduce<Record<string, ReportDefinition[]>>((acc, report) => {
      if (!acc[report.group]) acc[report.group] = [];
      acc[report.group].push(report);
      return acc;
    }, {});
  }, []);

  const applyFiltersAndSort = (source: any[], filters: Record<string, string[]>, sorter: { column: string; direction: SortDirection } | null) => {
    let next = [...source];

    Object.entries(filters).forEach(([field, values]) => {
      if (!values.length) return;
      next = next.filter(row => values.includes(String(row[field] ?? '')));
    });

    if (sorter) {
      next.sort((a, b) => {
        const aValue = a[sorter.column];
        const bValue = b[sorter.column];

        const aNum = Number(aValue);
        const bNum = Number(bValue);
        const isNumeric = !Number.isNaN(aNum) && !Number.isNaN(bNum) && aValue !== '' && bValue !== '';

        let result = 0;
        if (isNumeric) {
          result = aNum - bNum;
        } else {
          result = String(aValue ?? '').localeCompare(String(bValue ?? ''), undefined, { numeric: true });
        }

        return sorter.direction === 'asc' ? result : -result;
      });
    }

    return next;
  };

  const loadReportData = (reportId: string, startDate: string, endDate: string) => {
    let rows: any[] = [];
    let reportHeaders: string[] = [];
    let title = reportById.get(reportId)?.name || 'MIS Report';

    const customerByName = new Map(customers.map(c => [c.name, c]));
    const doctorById = new Map(doctors.map(d => [d.id, d]));
    const doctorByName = new Map(doctors.filter(d => (d.name || '').trim()).map(d => [(d.name || '').trim().toLowerCase(), d] as const));

    const sales = transactions.filter(tx => tx.status !== 'draft' && isDateWithinRange(tx.date, startDate, endDate));
    const completedSales = sales.filter(tx => tx.status !== 'cancelled');
    const cancelledSales = sales.filter(tx => tx.status === 'cancelled');
    const filteredPurchases = purchases.filter(p => p.status !== 'draft' && isDateWithinRange(p.date, startDate, endDate));
    const completedPurchases = filteredPurchases.filter(p => p.status !== 'cancelled');
    const filteredSalesReturns = salesReturns.filter(s => isDateWithinRange(s.date, startDate, endDate));
    const filteredPurchaseReturns = purchaseReturns.filter(p => isDateWithinRange(p.date, startDate, endDate));

    switch (reportId) {
      case 'salesRegister':
        reportHeaders = ['Bill No', 'Bill Date', 'Customer Name', 'GSTIN', 'Billing Category', 'Taxable Amount', 'GST Amount', 'Discount', 'Net Amount', 'Status'];
        rows = completedSales.map(tx => ({
          'Bill No': tx.invoiceNumber || tx.id,
          'Bill Date': new Date(tx.date).toLocaleDateString('en-GB'),
          'Customer Name': tx.customerName,
          'GSTIN': customerByName.get(tx.customerName)?.gstNumber || 'N/A',
          'Billing Category': tx.billType || 'regular',
          'Taxable Amount': round2(tx.subtotal - tx.totalItemDiscount - tx.schemeDiscount),
          'GST Amount': round2(tx.totalGst || 0),
          'Discount': round2((tx.totalItemDiscount || 0) + (tx.schemeDiscount || 0)),
          'Net Amount': round2(tx.total || 0),
          'Status': tx.status
        }));
        break;
      case 'salesSummary':
        reportHeaders = ['Total Sales Bills', 'Total Gross Sales', 'Total Discount', 'Total Taxable Value', 'Total GST', 'Net Sales', 'Cash Sales', 'Credit Sales'];
        rows = [{
          'Total Sales Bills': completedSales.length,
          'Total Gross Sales': round2(completedSales.reduce((sum, tx) => sum + Number(tx.subtotal || 0), 0)),
          'Total Discount': round2(completedSales.reduce((sum, tx) => sum + Number(tx.totalItemDiscount || 0) + Number(tx.schemeDiscount || 0), 0)),
          'Total Taxable Value': round2(completedSales.reduce((sum, tx) => sum + Number(tx.subtotal || 0) - Number(tx.totalItemDiscount || 0) - Number(tx.schemeDiscount || 0), 0)),
          'Total GST': round2(completedSales.reduce((sum, tx) => sum + Number(tx.totalGst || 0), 0)),
          'Net Sales': round2(completedSales.reduce((sum, tx) => sum + Number(tx.total || 0), 0)),
          'Cash Sales': round2(completedSales.filter(tx => tx.paymentMode?.toLowerCase().includes('cash')).reduce((sum, tx) => sum + Number(tx.total || 0), 0)),
          'Credit Sales': round2(completedSales.filter(tx => tx.paymentMode?.toLowerCase().includes('credit')).reduce((sum, tx) => sum + Number(tx.total || 0), 0))
        }];
        break;
      case 'billWiseSales':
        reportHeaders = ['Bill No', 'Date', 'Customer', 'Amount', 'Discount', 'GST', 'Final Bill Amount'];
        rows = completedSales.map(tx => ({
          'Bill No': tx.invoiceNumber || tx.id,
          'Date': new Date(tx.date).toLocaleDateString('en-GB'),
          'Customer': tx.customerName,
          'Amount': round2(tx.subtotal || 0),
          'Discount': round2((tx.totalItemDiscount || 0) + (tx.schemeDiscount || 0)),
          'GST': round2(tx.totalGst || 0),
          'Final Bill Amount': round2(tx.total || 0),
        }));
        break;
      case 'dateWiseSales': {
        reportHeaders = ['Date', 'Number of Bills', 'Gross Sales', 'Discount', 'GST', 'Net Sales'];
        const map = new Map<string, any>();
        completedSales.forEach(tx => {
          const date = new Date(tx.date).toLocaleDateString('en-GB');
          const current = map.get(date) || { bills: 0, gross: 0, discount: 0, gst: 0, net: 0 };
          map.set(date, { bills: current.bills + 1, gross: current.gross + Number(tx.subtotal || 0), discount: current.discount + Number(tx.totalItemDiscount || 0) + Number(tx.schemeDiscount || 0), gst: current.gst + Number(tx.totalGst || 0), net: current.net + Number(tx.total || 0) });
        });
        rows = Array.from(map.entries()).map(([date, value]) => ({ 'Date': date, 'Number of Bills': value.bills, 'Gross Sales': round2(value.gross), 'Discount': round2(value.discount), 'GST': round2(value.gst), 'Net Sales': round2(value.net) }));
        break;
      }
      case 'partyWiseSales': {
        reportHeaders = ['Customer Name', 'Number of Bills', 'Total Sales', 'Discount', 'GST', 'Net Amount', 'Outstanding'];
        const map = new Map<string, any>();
        completedSales.forEach(tx => {
          const current = map.get(tx.customerName) || { bills: 0, sales: 0, discount: 0, gst: 0, net: 0 };
          map.set(tx.customerName, { bills: current.bills + 1, sales: current.sales + Number(tx.subtotal || 0), discount: current.discount + Number(tx.totalItemDiscount || 0) + Number(tx.schemeDiscount || 0), gst: current.gst + Number(tx.totalGst || 0), net: current.net + Number(tx.total || 0) });
        });
        rows = Array.from(map.entries()).map(([name, value]) => ({ 'Customer Name': name, 'Number of Bills': value.bills, 'Total Sales': round2(value.sales), 'Discount': round2(value.discount), 'GST': round2(value.gst), 'Net Amount': round2(value.net), 'Outstanding': round2(getOutstandingBalance(customerByName.get(name))) }));
        break;
      }
      case 'doctorWiseSales': {
        reportHeaders = ['Doctor Name', 'Doctor Code', 'Specialization', 'Mobile', 'Area', 'Number of Bills', 'Number of Customers', 'Total Sales Amount', 'Total Discount', 'Total GST', 'Net Sales Value'];
        const map = new Map<string, any>();
        completedSales.forEach(tx => {
          const doctorFromId = tx.doctorId ? doctorById.get(tx.doctorId) : undefined;
          const doctorFromName = !doctorFromId ? doctorByName.get((tx.referredBy || '').trim().toLowerCase()) : undefined;
          const doctor = doctorFromId || doctorFromName;
          const doctorName = (doctor?.name || tx.referredBy || '').trim();
          if (!doctorName) return;
          const key = doctor?.id || doctorName.toLowerCase();
          const current = map.get(key) || { doctorName, doctorCode: doctor?.doctorCode || 'N/A', specialization: doctor?.specialization || 'N/A', mobile: doctor?.mobile || 'N/A', area: doctor?.area || 'N/A', bills: 0, customers: new Set<string>(), sales: 0, discount: 0, gst: 0, net: 0 };
          current.bills += 1;
          current.customers.add(tx.customerId || tx.customerName || 'Walk-in');
          current.sales += Number(tx.subtotal || 0);
          current.discount += Number(tx.totalItemDiscount || 0) + Number(tx.schemeDiscount || 0);
          current.gst += Number(tx.totalGst || 0);
          current.net += Number(tx.total || 0);
          map.set(key, current);
        });
        rows = Array.from(map.values()).map((value: any) => ({ 'Doctor Name': value.doctorName, 'Doctor Code': value.doctorCode, 'Specialization': value.specialization, 'Mobile': value.mobile, 'Area': value.area, 'Number of Bills': value.bills, 'Number of Customers': value.customers.size, 'Total Sales Amount': round2(value.sales), 'Total Discount': round2(value.discount), 'Total GST': round2(value.gst), 'Net Sales Value': round2(value.net) }));
        break;
      }
      case 'itemWiseSales': {
        reportHeaders = ['Item Name', 'HSN', 'Quantity Sold', 'Free Qty', 'Gross Value', 'Discount', 'GST', 'Net Value'];
        const map = new Map<string, any>();
        completedSales.forEach(tx => tx.items.forEach((item: any) => {
          const key = `${item.name}|${item.hsnCode || ''}`;
          const current = map.get(key) || { name: item.name, hsn: item.hsnCode || 'N/A', qty: 0, free: 0, gross: 0, discount: 0, gst: 0, net: 0 };
          const gross = (Number(item.quantity || 0) + Number(item.freeQuantity || 0)) * Number(item.rate ?? item.mrp ?? 0);
          const discount = Number(item.itemFlatDiscount || 0) + (Number(item.quantity || 0) * Number(item.rate ?? item.mrp ?? 0) * (Number(item.discountPercent || 0) / 100)) + Number(item.schemeDiscountAmount || 0);
          const taxable = Number(item.quantity || 0) * Number(item.rate ?? item.mrp ?? 0) - discount;
          const gst = taxable * (Number(item.gstPercent || 0) / 100);
          map.set(key, { ...current, qty: current.qty + Number(item.quantity || 0), free: current.free + Number(item.freeQuantity || 0), gross: current.gross + gross, discount: current.discount + discount, gst: current.gst + gst, net: current.net + (gross - discount + gst) });
        }));
        rows = Array.from(map.values()).map((v: any) => ({ 'Item Name': v.name, 'HSN': v.hsn, 'Quantity Sold': round2(v.qty), 'Free Qty': round2(v.free), 'Gross Value': round2(v.gross), 'Discount': round2(v.discount), 'GST': round2(v.gst), 'Net Value': round2(v.net) }));
        break;
      }
      case 'categoryWiseSales': {
        reportHeaders = ['Category', 'Quantity', 'Gross Amount', 'Discount', 'GST', 'Net Sales'];
        const categoryMap = completedSales.flatMap(tx => tx.items).reduce((acc: Map<string, any>, item: any) => {
          const key = item.category || 'Uncategorized';
          const current = acc.get(key) || { qty: 0, gross: 0, discount: 0, gst: 0, net: 0 };
          const gross = (Number(item.quantity || 0) + Number(item.freeQuantity || 0)) * Number(item.rate ?? item.mrp ?? 0);
          const discount = Number(item.itemFlatDiscount || 0) + (Number(item.quantity || 0) * Number(item.rate ?? item.mrp ?? 0) * (Number(item.discountPercent || 0) / 100));
          const gst = (gross - discount) * (Number(item.gstPercent || 0) / 100);
          acc.set(key, { qty: current.qty + Number(item.quantity || 0), gross: current.gross + gross, discount: current.discount + discount, gst: current.gst + gst, net: current.net + (gross - discount + gst) });
          return acc;
        }, new Map<string, any>());
        rows = Array.from(categoryMap.entries()).map(([k, v]) => ({ 'Category': k, 'Quantity': round2(v.qty), 'Gross Amount': round2(v.gross), 'Discount': round2(v.discount), 'GST': round2(v.gst), 'Net Sales': round2(v.net) }));
        break;
      }
      case 'areaWiseSales': {
        reportHeaders = ['Area / Locality', 'Number of Bills', 'Sales Amount', 'GST', 'Net Value'];
        const areaMap = completedSales.reduce((acc: Map<string, any>, tx) => {
          const key = customerByName.get(tx.customerName)?.area || 'Unknown';
          const current = acc.get(key) || { bills: 0, sales: 0, gst: 0, net: 0 };
          acc.set(key, { bills: current.bills + 1, sales: current.sales + Number(tx.subtotal || 0), gst: current.gst + Number(tx.totalGst || 0), net: current.net + Number(tx.total || 0) });
          return acc;
        }, new Map<string, any>());
        rows = Array.from(areaMap.entries()).map(([k, v]) => ({ 'Area / Locality': k, 'Number of Bills': v.bills, 'Sales Amount': round2(v.sales), 'GST': round2(v.gst), 'Net Value': round2(v.net) }));
        break;
      }
      case 'salesReturnRegister':
      case 'creditNoteRegister':
        reportHeaders = reportId === 'salesReturnRegister' ? ['Return Voucher No', 'Date', 'Original Bill No', 'Customer', 'Item / Amount', 'Tax Reversal', 'Return Total'] : ['Credit Note No', 'Date', 'Customer', 'Reference Bill', 'Amount', 'Reason'];
        rows = filteredSalesReturns.map(ret => reportId === 'salesReturnRegister' ? ({ 'Return Voucher No': ret.id, 'Date': new Date(ret.date).toLocaleDateString('en-GB'), 'Original Bill No': ret.originalInvoiceNumber || ret.originalInvoiceId, 'Customer': ret.customerName, 'Item / Amount': `${ret.items.length} items`, 'Tax Reversal': round2(ret.items.reduce((sum: number, i: any) => sum + (Number(i.returnQuantity || 0) * Number(i.rate ?? i.mrp ?? 0) * (Number(i.gstPercent || 0) / 100)), 0)), 'Return Total': round2(ret.totalRefund || 0) }) : ({ 'Credit Note No': `CN-${ret.id}`, 'Date': new Date(ret.date).toLocaleDateString('en-GB'), 'Customer': ret.customerName, 'Reference Bill': ret.originalInvoiceNumber || ret.originalInvoiceId, 'Amount': round2(ret.totalRefund || 0), 'Reason': ret.remarks || 'Sales return adjustment' }));
        break;
      case 'schemeDiscountReport':
        reportHeaders = ['Bill No', 'Date', 'Customer', 'Item', 'Trade Discount', 'Bill Discount', 'Scheme Discount', 'Net Impact'];
        rows = completedSales.flatMap(tx => tx.items.map((item: any) => {
          const tradeDiscount = Number(item.itemFlatDiscount || 0) + (Number(item.quantity || 0) * Number(item.rate ?? item.mrp ?? 0) * (Number(item.discountPercent || 0) / 100));
          const schemeDiscount = Number(item.schemeDiscountAmount || 0);
          const billDiscount = (Number(tx.totalItemDiscount || 0) + Number(tx.schemeDiscount || 0)) / Math.max(tx.items.length, 1);
          return { 'Bill No': tx.invoiceNumber || tx.id, 'Date': new Date(tx.date).toLocaleDateString('en-GB'), 'Customer': tx.customerName, 'Item': item.name, 'Trade Discount': round2(tradeDiscount), 'Bill Discount': round2(billDiscount), 'Scheme Discount': round2(schemeDiscount), 'Net Impact': round2(tradeDiscount + billDiscount + schemeDiscount) };
        }));
        break;
      case 'freeQuantityReport':
        reportHeaders = ['Bill No', 'Date', 'Customer', 'Item', 'Sold Qty', 'Free Qty', 'Effective Rate'];
        rows = completedSales.flatMap(tx => tx.items.filter((i: any) => Number(i.freeQuantity || 0) > 0).map((i: any) => ({ 'Bill No': tx.invoiceNumber || tx.id, 'Date': new Date(tx.date).toLocaleDateString('en-GB'), 'Customer': tx.customerName, 'Item': i.name, 'Sold Qty': round2(i.quantity || 0), 'Free Qty': round2(i.freeQuantity || 0), 'Effective Rate': round2((Number(i.rate ?? i.mrp ?? 0) * Number(i.quantity || 0)) / Math.max(Number(i.quantity || 0) + Number(i.freeQuantity || 0), 1)) })));
        break;
      case 'profitOnSales':
      case 'marginAnalysis':
        reportHeaders = reportId === 'profitOnSales' ? ['Bill No / Item', 'Sales Value', 'Cost Value', 'Gross Profit', 'Profit %'] : ['Item Name', 'Sales Rate', 'Cost Rate', 'Margin Amount', 'Margin %'];
        rows = completedSales.flatMap(tx => tx.items.map((i: any) => {
          const inv = inventory.find(item => item.id === i.inventoryItemId || item.name === i.name);
          const salesRate = Number(i.rate ?? i.mrp ?? 0);
          const costRate = Number(inv?.purchasePrice || inv?.ptr || 0);
          const salesValue = Number(i.quantity || 0) * salesRate;
          const costValue = Number(i.quantity || 0) * costRate;
          const profit = salesValue - costValue;
          return reportId === 'profitOnSales' ? { 'Bill No / Item': `${tx.invoiceNumber || tx.id} / ${i.name}`, 'Sales Value': round2(salesValue), 'Cost Value': round2(costValue), 'Gross Profit': round2(profit), 'Profit %': salesValue > 0 ? round2((profit / salesValue) * 100) : 0 } : { 'Item Name': i.name, 'Sales Rate': round2(salesRate), 'Cost Rate': round2(costRate), 'Margin Amount': round2(salesRate - costRate), 'Margin %': salesRate > 0 ? round2(((salesRate - costRate) / salesRate) * 100) : 0 };
        }));
        break;
      case 'cancelledDeletedBills':
        reportHeaders = ['Bill No', 'Date', 'Customer', 'Amount', 'Cancelled On', 'Cancelled By'];
        rows = cancelledSales.map(tx => ({ 'Bill No': tx.invoiceNumber || tx.id, 'Date': new Date(tx.date).toLocaleDateString('en-GB'), 'Customer': tx.customerName, 'Amount': round2(tx.total || 0), 'Cancelled On': tx.createdAt ? new Date(tx.createdAt).toLocaleDateString('en-GB') : new Date(tx.date).toLocaleDateString('en-GB'), 'Cancelled By': tx.billedByName || 'System' }));
        break;
      case 'purchaseRegister':
      case 'billWisePurchase':
        reportHeaders = reportId === 'purchaseRegister' ? ['Purchase Bill No', 'Date', 'Supplier', 'Taxable Amount', 'GST', 'Discount', 'Net Amount'] : ['Bill No', 'Date', 'Supplier', 'Amount', 'GST', 'Discount', 'Final Amount'];
        rows = completedPurchases.map(p => ({ [reportId === 'purchaseRegister' ? 'Purchase Bill No' : 'Bill No']: p.invoiceNumber, 'Date': new Date(p.date).toLocaleDateString('en-GB'), 'Supplier': p.supplier, [reportId === 'purchaseRegister' ? 'Taxable Amount' : 'Amount']: round2(p.subtotal - p.totalItemDiscount - p.totalItemSchemeDiscount - p.schemeDiscount), 'GST': round2(p.totalGst || 0), 'Discount': round2((p.totalItemDiscount || 0) + (p.totalItemSchemeDiscount || 0) + (p.schemeDiscount || 0)), [reportId === 'purchaseRegister' ? 'Net Amount' : 'Final Amount']: round2(p.totalAmount || 0) }));
        break;
      case 'purchaseSummary':
        reportHeaders = ['Total Purchase Bills', 'Gross Purchase', 'Discount', 'Taxable Value', 'GST', 'Net Purchase'];
        rows = [{ 'Total Purchase Bills': completedPurchases.length, 'Gross Purchase': round2(completedPurchases.reduce((s, p) => s + Number(p.subtotal || 0), 0)), 'Discount': round2(completedPurchases.reduce((s, p) => s + Number(p.totalItemDiscount || 0) + Number(p.totalItemSchemeDiscount || 0) + Number(p.schemeDiscount || 0), 0)), 'Taxable Value': round2(completedPurchases.reduce((s, p) => s + Number(p.subtotal || 0) - Number(p.totalItemDiscount || 0) - Number(p.totalItemSchemeDiscount || 0) - Number(p.schemeDiscount || 0), 0)), 'GST': round2(completedPurchases.reduce((s, p) => s + Number(p.totalGst || 0), 0)), 'Net Purchase': round2(completedPurchases.reduce((s, p) => s + Number(p.totalAmount || 0), 0)) }];
        break;
      case 'supplierWisePurchase':
      case 'itemWisePurchase': {
        if (reportId === 'supplierWisePurchase') {
          reportHeaders = ['Supplier', 'Number of Bills', 'Purchase Amount', 'Discount', 'GST', 'Net Purchase'];
          const map = new Map<string, any>();
          completedPurchases.forEach(p => {
            const current = map.get(p.supplier) || { bills: 0, purchase: 0, discount: 0, gst: 0, net: 0 };
            map.set(p.supplier, { bills: current.bills + 1, purchase: current.purchase + Number(p.subtotal || 0), discount: current.discount + Number(p.totalItemDiscount || 0) + Number(p.totalItemSchemeDiscount || 0) + Number(p.schemeDiscount || 0), gst: current.gst + Number(p.totalGst || 0), net: current.net + Number(p.totalAmount || 0) });
          });
          rows = Array.from(map.entries()).map(([k, v]) => ({ 'Supplier': k, 'Number of Bills': v.bills, 'Purchase Amount': round2(v.purchase), 'Discount': round2(v.discount), 'GST': round2(v.gst), 'Net Purchase': round2(v.net) }));
        } else {
          reportHeaders = ['Item Name', 'Quantity Purchased', 'Free Qty', 'Purchase Value', 'GST', 'Net Value'];
          const map = new Map<string, any>();
          completedPurchases.forEach(p => p.items.forEach((i: any) => {
            const current = map.get(i.name) || { qty: 0, free: 0, value: 0, gst: 0, net: 0 };
            const gross = (Number(i.quantity || 0) + Number(i.freeQuantity || 0)) * Number(i.purchasePrice || 0);
            const discount = Number(i.discountPercent || 0) * Number(i.purchasePrice || 0) * Number(i.quantity || 0) / 100 + Number(i.schemeDiscountAmount || 0);
            const taxable = gross - discount;
            const gst = taxable * Number(i.gstPercent || 0) / 100;
            map.set(i.name, { qty: current.qty + Number(i.quantity || 0), free: current.free + Number(i.freeQuantity || 0), value: current.value + gross, gst: current.gst + gst, net: current.net + taxable + gst });
          }));
          rows = Array.from(map.entries()).map(([k, v]) => ({ 'Item Name': k, 'Quantity Purchased': round2(v.qty), 'Free Qty': round2(v.free), 'Purchase Value': round2(v.value), 'GST': round2(v.gst), 'Net Value': round2(v.net) }));
        }
        break;
      }
      case 'purchaseReturnRegister':
      case 'debitNoteRegister':
        reportHeaders = reportId === 'purchaseReturnRegister' ? ['Return No', 'Date', 'Supplier', 'Original Bill Ref', 'Return Amount', 'Tax Effect'] : ['Debit Note No', 'Date', 'Supplier', 'Reference', 'Amount', 'Reason'];
        rows = filteredPurchaseReturns.map(ret => reportId === 'purchaseReturnRegister' ? ({ 'Return No': ret.id, 'Date': new Date(ret.date).toLocaleDateString('en-GB'), 'Supplier': ret.supplier, 'Original Bill Ref': ret.originalPurchaseInvoiceId, 'Return Amount': round2(ret.totalValue || 0), 'Tax Effect': round2((ret.totalValue || 0) * 0.12) }) : ({ 'Debit Note No': `DN-${ret.id}`, 'Date': new Date(ret.date).toLocaleDateString('en-GB'), 'Supplier': ret.supplier, 'Reference': ret.originalPurchaseInvoiceId, 'Amount': round2(ret.totalValue || 0), 'Reason': ret.remarks || 'Purchase return adjustment' }));
        break;
      case 'stockSummary':
      case 'batchWiseStock':
      case 'expiryWiseStock':
        reportHeaders = reportId === 'stockSummary' ? ['Item Name', 'Batch', 'Pack', 'Stock (Pack / Loose / Total)', 'MRP', 'PTR / Cost', 'Value', 'Expiry'] : reportId === 'batchWiseStock' ? ['Item', 'Batch', 'Expiry', 'Quantity', 'Value'] : ['Item', 'Batch', 'Expiry', 'Qty', 'Value'];
        rows = inventory.map(item => {
          const breakup = getStockBreakup(item.stock, item.unitsPerPack);
          return {
            'Item Name': item.name,
            'Item': item.name,
            'Batch': item.batch,
            'Pack': item.packType || 'N/A',
            'Stock (Pack / Loose / Total)': `${breakup.pack} / ${breakup.loose} / ${breakup.totalUnits}`,
            'MRP': round2(item.mrp || 0),
            'PTR / Cost': round2(item.ptr || item.purchasePrice || 0),
            'Value': round2(breakup.totalUnits * Number(item.purchasePrice || item.ptr || 0)),
            'Expiry': item.expiry ? new Date(item.expiry).toLocaleDateString('en-GB') : 'N/A',
            'Quantity': breakup.totalUnits,
            'Qty': breakup.totalUnits,
            _sort: item.expiry ? new Date(item.expiry).getTime() : Number.MAX_SAFE_INTEGER
          };
        });
        if (reportId === 'expiryWiseStock') rows = rows.sort((a, b) => a._sort - b._sort);
        break;
      case 'nearExpiryReport':
      case 'expiredStockReport': {
        reportHeaders = reportId === 'nearExpiryReport' ? ['Item', 'Batch', 'Expiry', 'Remaining Days', 'Qty', 'Value'] : ['Item', 'Batch', 'Expiry', 'Qty', 'Value'];
        const now = new Date();
        rows = inventory.map(item => {
          const breakup = getStockBreakup(item.stock, item.unitsPerPack, item.packType);
          const expiryDate = item.expiry ? new Date(item.expiry) : null;
          const remainingDays = expiryDate ? Math.ceil((expiryDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)) : null;
          return { 'Item': item.name, 'Batch': item.batch, 'Expiry': expiryDate ? expiryDate.toLocaleDateString('en-GB') : 'N/A', 'Remaining Days': remainingDays ?? 'N/A', 'Qty': breakup.totalUnits, 'Value': round2(breakup.totalUnits * Number(item.purchasePrice || item.ptr || 0)), _remainingDays: remainingDays };
        }).filter(row => reportId === 'nearExpiryReport' ? typeof row._remainingDays === 'number' && row._remainingDays >= 0 && row._remainingDays <= 90 : typeof row._remainingDays === 'number' && row._remainingDays < 0);
        break;
      }
      case 'negativeStock':
        reportHeaders = ['Item', 'Batch', 'Current Stock', 'Location'];
        rows = inventory.filter(i => Number(i.stock || 0) < 0).map(i => ({ 'Item': i.name, 'Batch': i.batch, 'Current Stock': Number(i.stock || 0), 'Location': i.rackNumber || 'N/A' }));
        break;
      case 'reorderLevelReport':
        reportHeaders = ['Item', 'Current Stock', 'Minimum Limit', 'Required Reorder Qty'];
        rows = inventory.map(i => {
          const breakup = getStockBreakup(i.stock, i.unitsPerPack, i.packType);
          const minLimit = Number(i.minStockLimit || 0);
          return { 'Item': i.name, 'Current Stock': breakup.totalUnits, 'Minimum Limit': minLimit, 'Required Reorder Qty': Math.max(minLimit - breakup.totalUnits, 0) };
        }).filter(i => i['Required Reorder Qty'] > 0);
        break;
      case 'ledgerReport': {
        reportHeaders = ['Date', 'Voucher No', 'Particulars', 'Debit', 'Credit', 'Running Balance'];
        const rowsPool = [
          ...customers.flatMap(c => (c.ledger || []).map(entry => ({ party: c.name, entry }))),
          ...distributors.flatMap(d => (d.ledger || []).map(entry => ({ party: d.name, entry })))
        ];
        rows = rowsPool
          .map(r => ({ date: r.entry.date, voucher: r.entry.referenceInvoiceNumber || r.entry.journalEntryNumber || r.entry.id, particulars: `${r.party} - ${r.entry.description}`, debit: Number(r.entry.debit || 0), credit: Number(r.entry.credit || 0), balance: Number(r.entry.balance || 0) }))
          .filter(r => isDateWithinRange(r.date, startDate, endDate))
          .map(r => ({ 'Date': new Date(r.date).toLocaleDateString('en-GB'), 'Voucher No': r.voucher, 'Particulars': r.particulars, 'Debit': round2(r.debit), 'Credit': round2(r.credit), 'Running Balance': round2(r.balance) }));
        break;
      }
      case 'dayBook':
        reportHeaders = ['Date', 'Voucher Type', 'Voucher No', 'Party / Ledger', 'Amount', 'Narration'];
        rows = [
          ...completedSales.map(tx => ({ 'Date': new Date(tx.date).toLocaleDateString('en-GB'), 'Voucher Type': 'Sales', 'Voucher No': tx.invoiceNumber || tx.id, 'Party / Ledger': tx.customerName, 'Amount': round2(tx.total || 0), 'Narration': `Sale (${tx.paymentMode || 'N/A'})`, _sort: tx.date })),
          ...completedPurchases.map(p => ({ 'Date': new Date(p.date).toLocaleDateString('en-GB'), 'Voucher Type': 'Purchase', 'Voucher No': p.invoiceNumber, 'Party / Ledger': p.supplier, 'Amount': round2(p.totalAmount || 0), 'Narration': 'Purchase entry', _sort: p.date })),
        ].sort((a, b) => new Date(a._sort).getTime() - new Date(b._sort).getTime());
        break;
      case 'outstandingReceivables':
        reportHeaders = ['Customer', 'Bill No', 'Bill Date', 'Due Amount', 'Received Amount', 'Balance Outstanding', 'Ageing'];
        rows = completedSales.map(tx => {
          const dueAmount = Number(tx.total || 0);
          const receivedAmount = Number(tx.amountReceived || 0);
          const balance = dueAmount - receivedAmount;
          return { 'Customer': tx.customerName, 'Bill No': tx.invoiceNumber || tx.id, 'Bill Date': new Date(tx.date).toLocaleDateString('en-GB'), 'Due Amount': round2(dueAmount), 'Received Amount': round2(receivedAmount), 'Balance Outstanding': round2(balance), 'Ageing': Math.max(0, Math.ceil((new Date().getTime() - new Date(tx.date).getTime()) / (1000 * 60 * 60 * 24))) };
        }).filter(r => r['Balance Outstanding'] > 0);
        break;
      case 'outstandingPayables':
        reportHeaders = ['Supplier', 'Bill No', 'Bill Date', 'Bill Amount', 'Paid Amount', 'Balance Outstanding', 'Ageing'];
        rows = completedPurchases.map(p => {
          const billAmount = Number(p.totalAmount || 0);
          const supplierOutstanding = Math.max(Number(getOutstandingBalance(distributors.find(d => d.name === p.supplier)) || 0), 0);
          const paidAmount = Math.max(billAmount - supplierOutstanding, 0);
          return { 'Supplier': p.supplier, 'Bill No': p.invoiceNumber, 'Bill Date': new Date(p.date).toLocaleDateString('en-GB'), 'Bill Amount': round2(billAmount), 'Paid Amount': round2(paidAmount), 'Balance Outstanding': round2(Math.max(billAmount - paidAmount, 0)), 'Ageing': Math.max(0, Math.ceil((new Date().getTime() - new Date(p.date).getTime()) / (1000 * 60 * 60 * 24))) };
        }).filter(r => r['Balance Outstanding'] > 0);
        break;
      default:
        reportHeaders = ['Message'];
        rows = [{ Message: 'No report logic configured.' }];
    }

    setActiveReportId(reportId);
    setActiveReportTitle(title);
    setHeaders(reportHeaders);
    setBaseData(rows);
    setActiveFilters({});
    setSortConfig(null);
    setVisibleColumns(reportHeaders);
    setFilteredData(rows);
    setSelectedRowIndex(rows.length ? 0 : -1);
  };

  useEffect(() => {
    loadReportData('salesRegister', periodStartDate, periodEndDate);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filterOptions = useMemo(() => {
    return headers.reduce<Record<string, string[]>>((acc, col) => {
      acc[col] = Array.from(new Set(baseData.map(row => String(row[col] ?? '')).filter(Boolean))).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
      return acc;
    }, {});
  }, [headers, baseData]);

  const totals = useMemo(() => {
    const numericColumns = headers.filter(col => filteredData.some(row => typeof row[col] === 'number'));
    const sums = numericColumns.reduce<Record<string, number>>((acc, col) => {
      acc[col] = round2(filteredData.reduce((sum, row) => sum + (typeof row[col] === 'number' ? Number(row[col]) : 0), 0));
      return acc;
    }, {});
    return { recordCount: filteredData.length, sums };
  }, [headers, filteredData]);

  const selectedRow = selectedRowIndex >= 0 ? filteredData[selectedRowIndex] : null;

  const activeFilterChips = useMemo(() => {
    return Object.entries(activeFilters).flatMap(([field, values]) => values.map(value => ({ field, value })));
  }, [activeFilters]);

  const toggleFilterValue = (field: string, value: string) => {
    const next = { ...activeFilters };
    const fieldValues = new Set(next[field] || []);
    if (fieldValues.has(value)) fieldValues.delete(value);
    else fieldValues.add(value);

    if (!fieldValues.size) delete next[field];
    else next[field] = Array.from(fieldValues);

    const nextData = applyFiltersAndSort(baseData, next, sortConfig);
    setActiveFilters(next);
    setFilteredData(nextData);
    setSelectedRowIndex(nextData.length ? 0 : -1);
  };

  const clearAllFilters = () => {
    setActiveFilters({});
    const nextData = applyFiltersAndSort(baseData, {}, sortConfig);
    setFilteredData(nextData);
    setSelectedRowIndex(nextData.length ? 0 : -1);
  };

  const removeChip = (field: string, value: string) => {
    toggleFilterValue(field, value);
  };

  const toggleSort = (column: string) => {
    let nextSort: { column: string; direction: SortDirection } | null = { column, direction: 'asc' };
    if (sortConfig?.column === column) {
      nextSort = sortConfig.direction === 'asc' ? { column, direction: 'desc' } : null;
    }
    setSortConfig(nextSort);
    const nextData = applyFiltersAndSort(baseData, activeFilters, nextSort);
    setFilteredData(nextData);
    setSelectedRowIndex(nextData.length ? 0 : -1);
  };

  const onColumnToggle = (column: string) => {
    setVisibleColumns(prev => prev.includes(column) ? prev.filter(c => c !== column) : [...prev, column]);
  };

  const downloadFile = (filename: string, content: string, mimeType: string) => {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
  };

  const exportCsv = () => {
    const rows = [visibleColumns.join(','), ...filteredData.map(row => visibleColumns.map(col => `"${String(row[col] ?? '').replace(/"/g, '""')}"`).join(','))].join('\n');
    downloadFile(`${activeReportTitle.replace(/\s+/g, '_')}.csv`, rows, 'text/csv;charset=utf-8;');
  };

  const exportXlsx = () => {
    const rows = [visibleColumns.join('\t'), ...filteredData.map(row => visibleColumns.map(col => String(row[col] ?? '')).join('\t'))].join('\n');
    downloadFile(`${activeReportTitle.replace(/\s+/g, '_')}.xlsx`, rows, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  };

  const handlePreview = () => {
    onPrintReport({ title: activeReportTitle, data: filteredData, headers: visibleColumns, filters: { startDate: periodStartDate, endDate: periodEndDate, activeFilters } });
  };

  const handlePrint = () => {
    onPrintReport({ title: `${activeReportTitle} (Print)`, data: filteredData, headers: visibleColumns, filters: { startDate: periodStartDate, endDate: periodEndDate, activeFilters } });
  };

  const onPickReport = (reportId: string) => {
    setPendingReportId(reportId);
    setPeriodModalOpen(true);
  };

  return (
    <main className="flex-1 overflow-hidden flex flex-col page-fade-in bg-app-bg">
      <div className="bg-primary text-white h-7 flex items-center px-4 justify-between border-b border-gray-600 shadow-md flex-shrink-0">
        <span className="text-[10px] font-black uppercase tracking-widest">Display Reports & Analysis (MIS)</span>
        <span className="text-[10px] font-black uppercase text-accent">Management Info System</span>
      </div>

      <div className="flex-1 min-h-0 grid grid-cols-[260px_1fr_300px] gap-2 p-2 overflow-hidden">
        <section className="border border-gray-300 bg-white min-h-0 flex flex-col">
          <div className="px-2 py-1 border-b text-[10px] font-bold uppercase bg-gray-100">MIS Reports List</div>
          <div className="min-h-0 overflow-y-auto p-1 text-[11px]">
            {Object.entries(groupedReports).map(([group, items]) => (
              <div key={group} className="mb-2">
                <div className="px-1 py-1 text-[10px] font-bold uppercase text-primary border-b border-gray-200">{group}</div>
                <div className="mt-1 space-y-0.5">
                  {items.map(report => (
                    <button
                      key={report.id}
                      className={`w-full text-left px-2 py-1 border ${activeReportId === report.id ? 'bg-primary text-white border-primary' : 'bg-white hover:bg-primary-extralight border-transparent'}`}
                      onClick={() => onPickReport(report.id)}
                    >
                      {report.name}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="border border-gray-300 bg-white min-h-0 flex flex-col">
          <div className="px-2 py-1 border-b bg-gray-100 flex items-center justify-between gap-2">
            <div>
              <div className="text-[11px] font-bold">{activeReportTitle}</div>
              <div className="text-[10px] text-gray-500">Period: {new Date(periodStartDate).toLocaleDateString('en-GB')} to {new Date(periodEndDate).toLocaleDateString('en-GB')}</div>
            </div>
            <div className="flex gap-1 text-[10px]">
              <button onClick={() => setFilterModalOpen(true)} className="px-2 py-1 border border-gray-300 hover:bg-gray-100">Filter</button>
              <button onClick={() => setColumnModalOpen(true)} className="px-2 py-1 border border-gray-300 hover:bg-gray-100">Columns</button>
              <button onClick={handlePreview} className="px-2 py-1 border border-gray-300 hover:bg-gray-100">Preview</button>
              <button onClick={exportCsv} className="px-2 py-1 border border-gray-300 hover:bg-gray-100">CSV</button>
              <button onClick={exportXlsx} className="px-2 py-1 border border-gray-300 hover:bg-gray-100">XLSX</button>
              <button onClick={handlePrint} className="px-2 py-1 border border-gray-300 hover:bg-gray-100">Print / PDF</button>
            </div>
          </div>

          {!!activeFilterChips.length && (
            <div className="px-2 py-1 border-b flex flex-wrap gap-1 text-[10px]">
              {activeFilterChips.map(chip => (
                <button key={`${chip.field}-${chip.value}`} onClick={() => removeChip(chip.field, chip.value)} className="px-1 py-0.5 border border-primary text-primary bg-primary-extralight">
                  {chip.field}: {chip.value} ✕
                </button>
              ))}
              <button onClick={clearAllFilters} className="px-1 py-0.5 border border-red-300 text-red-700">Clear all</button>
            </div>
          )}

          <div className="min-h-0 flex-1 overflow-auto">
            {filteredData.length === 0 ? (
              <div className="h-full flex items-center justify-center text-sm text-gray-500">No records found for selected period</div>
            ) : (
              <table className="w-full text-[11px] border-collapse">
                <thead className="sticky top-0 bg-gray-100 z-10">
                  <tr>
                    {visibleColumns.map(col => (
                      <th key={col} onClick={() => toggleSort(col)} className="text-left px-2 py-1 border-b border-r whitespace-nowrap cursor-pointer select-none">
                        {col} {sortConfig?.column === col ? (sortConfig.direction === 'asc' ? '▲' : '▼') : ''}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredData.map((row, idx) => (
                    <tr
                      key={`${activeReportId}-${idx}`}
                      onClick={() => setSelectedRowIndex(idx)}
                      className={`${selectedRowIndex === idx ? 'bg-primary/20' : idx % 2 ? 'bg-white' : 'bg-gray-50'} hover:bg-primary/10 cursor-pointer`}
                    >
                      {visibleColumns.map(col => (
                        <td key={`${idx}-${col}`} className="px-2 py-1 border-b border-r whitespace-nowrap">{String(row[col] ?? '-')}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <div className="border-t px-2 py-1 text-[10px] bg-gray-100 flex flex-wrap gap-x-4 gap-y-1">
            <span><strong>Total Records:</strong> {totals.recordCount}</span>
            {Object.entries(totals.sums).slice(0, 6).map(([key, value]) => (
              <span key={key}><strong>{key}:</strong> {value}</span>
            ))}
          </div>
        </section>

        <section className="border border-gray-300 bg-white min-h-0 flex flex-col">
          <div className="px-2 py-1 border-b text-[10px] font-bold uppercase bg-gray-100">Detail Preview</div>
          <div className="min-h-0 overflow-auto p-2 text-[11px] space-y-1">
            {!selectedRow ? (
              <div className="text-gray-500">Select a row to view details.</div>
            ) : (
              <>
                {Object.entries(selectedRow).map(([key, value]) => (
                  <div key={key} className="grid grid-cols-[120px_1fr] gap-2 border-b border-gray-100 py-1">
                    <div className="font-semibold text-gray-600">{key}</div>
                    <div className="break-words">{String(value ?? '-')}</div>
                  </div>
                ))}
              </>
            )}
          </div>
        </section>
      </div>

      <Modal isOpen={periodModalOpen} onClose={() => setPeriodModalOpen(false)} title="Select Report Period" widthClass="max-w-md">
        <div className="p-4 space-y-3 text-sm">
          <div>
            <label className="text-xs uppercase font-semibold text-gray-600">From Date</label>
            <input type="date" value={periodStartDate} onChange={e => setPeriodStartDate(e.target.value)} className="w-full border border-gray-300 p-2 mt-1" />
          </div>
          <div>
            <label className="text-xs uppercase font-semibold text-gray-600">To Date</label>
            <input type="date" value={periodEndDate} onChange={e => setPeriodEndDate(e.target.value)} className="w-full border border-gray-300 p-2 mt-1" />
          </div>
          <div className="flex justify-end gap-2">
            <button onClick={() => { setPeriodStartDate(firstOfMonthIso); setPeriodEndDate(todayIso); }} className="px-3 py-1 border border-gray-300">Clear</button>
            <button onClick={() => setPeriodModalOpen(false)} className="px-3 py-1 border border-gray-300">Cancel</button>
            <button onClick={() => { loadReportData(pendingReportId, periodStartDate, periodEndDate); setPeriodModalOpen(false); }} className="px-3 py-1 border border-primary bg-primary text-white">Generate Report</button>
          </div>
        </div>
      </Modal>

      <Modal isOpen={filterModalOpen} onClose={() => setFilterModalOpen(false)} title="Filter Report" widthClass="max-w-3xl">
        <div className="p-3 overflow-auto text-xs">
          <div className="grid grid-cols-3 gap-3">
            {headers.map(col => (
              <div key={col} className="border border-gray-200 p-2">
                <div className="font-semibold mb-1">{col}</div>
                <div className="max-h-48 overflow-auto space-y-1">
                  {filterOptions[col]?.map(value => (
                    <label key={`${col}-${value}`} className="flex items-center gap-1">
                      <input type="checkbox" checked={(activeFilters[col] || []).includes(value)} onChange={() => toggleFilterValue(col, value)} />
                      <span className="truncate">{value || '(Blank)'}</span>
                    </label>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <div className="flex justify-end mt-3 gap-2">
            <button onClick={clearAllFilters} className="px-3 py-1 border border-gray-300">Clear All</button>
            <button onClick={() => setFilterModalOpen(false)} className="px-3 py-1 border border-primary bg-primary text-white">Done</button>
          </div>
        </div>
      </Modal>

      <Modal isOpen={columnModalOpen} onClose={() => setColumnModalOpen(false)} title="Show / Hide Columns" widthClass="max-w-md">
        <div className="p-4 text-sm space-y-2">
          {headers.map(col => (
            <label key={col} className="flex items-center gap-2">
              <input type="checkbox" checked={visibleColumns.includes(col)} onChange={() => onColumnToggle(col)} />
              <span>{col}</span>
            </label>
          ))}
          <div className="flex justify-end">
            <button onClick={() => setColumnModalOpen(false)} className="px-3 py-1 border border-primary bg-primary text-white text-xs">Done</button>
          </div>
        </div>
      </Modal>
    </main>
  );
};

export default Reports;
