import React, { useState, useMemo } from 'react';
import Card from '../components/Card';
import type { InventoryItem, Transaction, Purchase, Distributor, Customer, SalesReturn, PurchaseReturn, ModuleConfig } from '../types';
import { configurableModules } from '../constants';
import { getOutstandingBalance } from '../utils/helpers';
import { getStockBreakup } from '../utils/stock';

interface ReportsProps {
  inventory: InventoryItem[];
  transactions: Transaction[];
  purchases: Purchase[];
  distributors: Distributor[];
  customers: Customer[];
  salesReturns: SalesReturn[];
  purchaseReturns: PurchaseReturn[];
  onPrintReport: (report: { title: string; data: any[]; headers: string[]; filters: any; }) => void;
  config?: ModuleConfig;
}

const round2 = (value: number) => Number((Number(value || 0)).toFixed(2));

const Reports: React.FC<ReportsProps> = ({
  inventory, transactions, purchases, distributors, customers, salesReturns, purchaseReturns, onPrintReport, config,
}) => {
    const todayIso = new Date().toISOString().split('T')[0];
    const firstOfMonthIso = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0];
    const [reportStartDate, setReportStartDate] = useState(firstOfMonthIso);
    const [reportEndDate, setReportEndDate] = useState(todayIso);

    const reportModuleConfig = useMemo(() => configurableModules.find(m => m.id === 'reports'), []);
    const availableReports = useMemo(() => {
        if (!reportModuleConfig || !reportModuleConfig.fields) return [];
        return reportModuleConfig.fields.filter(field => config?.fields?.[field.id] !== false && field.id !== 'report' && field.id !== 'balanceCarryforward');
    }, [reportModuleConfig, config]);

    const generateReportData = (reportId: string) => {
        const effectiveStartDate = reportStartDate || firstOfMonthIso;
        const effectiveEndDate = reportEndDate || todayIso;
        const filters = { startDate: effectiveStartDate, endDate: effectiveEndDate };
        let filteredData: any[] = [];
        let headers: string[] = [];
        let title = '';

        const applyDateFilter = (items: any[], dateField: string = 'date') => {
            let temp = [...items];
            const start = new Date(effectiveStartDate);
            start.setHours(0, 0, 0, 0);
            const end = new Date(effectiveEndDate);
            end.setHours(23, 59, 59, 999);
            temp = temp.filter((item: any) => new Date(item[dateField]) >= start && new Date(item[dateField]) <= end);
            return temp;
        };

        const customerByName = new Map(customers.map(c => [c.name, c]));
        const sales = applyDateFilter(transactions).filter(tx => tx.status !== 'draft');
        const completedSales = sales.filter(tx => tx.status !== 'cancelled');
        const cancelledSales = sales.filter(tx => tx.status === 'cancelled');
        const filteredPurchases = applyDateFilter(purchases).filter(p => p.status !== 'draft');
        const completedPurchases = filteredPurchases.filter(p => p.status !== 'cancelled');
        const filteredSalesReturns = applyDateFilter(salesReturns);
        const filteredPurchaseReturns = applyDateFilter(purchaseReturns);

        switch (reportId) {
            case 'salesRegister':
                title = 'Sales Register';
                headers = ['Bill No', 'Bill Date', 'Customer Name', 'GSTIN', 'Billing Category', 'Taxable Amount', 'GST Amount', 'Discount', 'Net Amount', 'Status'];
                filteredData = completedSales.map(tx => ({
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
                title = 'Sales Summary';
                headers = ['Total Sales Bills', 'Total Gross Sales', 'Total Discount', 'Total Taxable Value', 'Total GST', 'Net Sales', 'Cash Sales', 'Credit Sales'];
                filteredData = [{
                    'Total Sales Bills': completedSales.length,
                    'Total Gross Sales': round2(completedSales.reduce((sum, tx) => sum + Number(tx.subtotal || 0), 0)),
                    'Total Discount': round2(completedSales.reduce((sum, tx) => sum + Number(tx.totalItemDiscount || 0) + Number(tx.schemeDiscount || 0), 0)),
                    'Total Taxable Value': round2(completedSales.reduce((sum, tx) => sum + (Number(tx.subtotal || 0) - Number(tx.totalItemDiscount || 0) - Number(tx.schemeDiscount || 0)), 0)),
                    'Total GST': round2(completedSales.reduce((sum, tx) => sum + Number(tx.totalGst || 0), 0)),
                    'Net Sales': round2(completedSales.reduce((sum, tx) => sum + Number(tx.total || 0), 0)),
                    'Cash Sales': round2(completedSales.filter(tx => tx.paymentMode?.toLowerCase().includes('cash')).reduce((sum, tx) => sum + Number(tx.total || 0), 0)),
                    'Credit Sales': round2(completedSales.filter(tx => tx.paymentMode?.toLowerCase().includes('credit')).reduce((sum, tx) => sum + Number(tx.total || 0), 0))
                }];
                break;
            case 'billWiseSales':
                title = 'Bill-wise Sales';
                headers = ['Bill No', 'Date', 'Customer', 'Amount', 'Discount', 'GST', 'Final Bill Amount'];
                filteredData = completedSales.map(tx => ({
                    'Bill No': tx.invoiceNumber || tx.id,
                    'Date': new Date(tx.date).toLocaleDateString('en-GB'),
                    'Customer': tx.customerName,
                    'Amount': round2(tx.subtotal || 0),
                    'Discount': round2((tx.totalItemDiscount || 0) + (tx.schemeDiscount || 0)),
                    'GST': round2(tx.totalGst || 0),
                    'Final Bill Amount': round2(tx.total || 0)
                }));
                break;
            case 'dateWiseSales': {
                title = 'Date-wise Sales';
                headers = ['Date', 'Number of Bills', 'Gross Sales', 'Discount', 'GST', 'Net Sales'];
                const map = new Map<string, any>();
                completedSales.forEach(tx => {
                    const date = new Date(tx.date).toLocaleDateString('en-GB');
                    const current = map.get(date) || { bills: 0, gross: 0, discount: 0, gst: 0, net: 0 };
                    map.set(date, {
                        bills: current.bills + 1,
                        gross: current.gross + Number(tx.subtotal || 0),
                        discount: current.discount + Number(tx.totalItemDiscount || 0) + Number(tx.schemeDiscount || 0),
                        gst: current.gst + Number(tx.totalGst || 0),
                        net: current.net + Number(tx.total || 0)
                    });
                });
                filteredData = Array.from(map.entries()).map(([date, data]) => ({
                    'Date': date,
                    'Number of Bills': data.bills,
                    'Gross Sales': round2(data.gross),
                    'Discount': round2(data.discount),
                    'GST': round2(data.gst),
                    'Net Sales': round2(data.net)
                }));
                break;
            }
            case 'partyWiseSales': {
                title = 'Party-wise Sales';
                headers = ['Customer Name', 'Number of Bills', 'Total Sales', 'Discount', 'GST', 'Net Amount', 'Outstanding'];
                const map = new Map<string, any>();
                completedSales.forEach(tx => {
                    const current = map.get(tx.customerName) || { bills: 0, sales: 0, discount: 0, gst: 0, net: 0 };
                    map.set(tx.customerName, {
                        bills: current.bills + 1,
                        sales: current.sales + Number(tx.subtotal || 0),
                        discount: current.discount + Number(tx.totalItemDiscount || 0) + Number(tx.schemeDiscount || 0),
                        gst: current.gst + Number(tx.totalGst || 0),
                        net: current.net + Number(tx.total || 0)
                    });
                });
                filteredData = Array.from(map.entries()).map(([name, data]) => ({
                    'Customer Name': name,
                    'Number of Bills': data.bills,
                    'Total Sales': round2(data.sales),
                    'Discount': round2(data.discount),
                    'GST': round2(data.gst),
                    'Net Amount': round2(data.net),
                    'Outstanding': round2(getOutstandingBalance(customerByName.get(name)))
                }));
                break;
            }
            case 'itemWiseSales': {
                title = 'Item-wise Sales';
                headers = ['Item Name', 'HSN', 'Quantity Sold', 'Free Qty', 'Gross Value', 'Discount', 'GST', 'Net Value'];
                const map = new Map<string, any>();
                completedSales.forEach(tx => tx.items.forEach((item: any) => {
                    const key = `${item.name}|${item.hsnCode || ''}`;
                    const current = map.get(key) || { name: item.name, hsn: item.hsnCode || 'N/A', qty: 0, free: 0, gross: 0, discount: 0, gst: 0, net: 0 };
                    const gross = (Number(item.quantity || 0) + Number(item.freeQuantity || 0)) * Number(item.rate ?? item.mrp ?? 0);
                    const discount = Number(item.itemFlatDiscount || 0) + (Number(item.quantity || 0) * Number(item.rate ?? item.mrp ?? 0) * (Number(item.discountPercent || 0) / 100)) + Number(item.schemeDiscountAmount || 0);
                    const taxable = Number(item.quantity || 0) * Number(item.rate ?? item.mrp ?? 0) - discount;
                    const gst = taxable * (Number(item.gstPercent || 0) / 100);
                    map.set(key, {
                        ...current,
                        qty: current.qty + Number(item.quantity || 0),
                        free: current.free + Number(item.freeQuantity || 0),
                        gross: current.gross + gross,
                        discount: current.discount + discount,
                        gst: current.gst + gst,
                        net: current.net + (gross - discount + gst)
                    });
                }));
                filteredData = Array.from(map.values()).map(v => ({
                    'Item Name': v.name,
                    'HSN': v.hsn,
                    'Quantity Sold': round2(v.qty),
                    'Free Qty': round2(v.free),
                    'Gross Value': round2(v.gross),
                    'Discount': round2(v.discount),
                    'GST': round2(v.gst),
                    'Net Value': round2(v.net)
                }));
                break;
            }
            case 'categoryWiseSales':
            case 'areaWiseSales':
                title = reportId === 'categoryWiseSales' ? 'Category-wise Sales' : 'Area-wise Sales';
                headers = reportId === 'categoryWiseSales'
                    ? ['Category', 'Quantity', 'Gross Amount', 'Discount', 'GST', 'Net Sales']
                    : ['Area / Locality', 'Number of Bills', 'Sales Amount', 'GST', 'Net Value'];
                if (reportId === 'categoryWiseSales') {
                    const categoryMap = completedSales.flatMap(tx => tx.items).reduce((acc: Map<string, any>, item: any) => {
                        const key = item.category || 'Uncategorized';
                        const current = acc.get(key) || { qty: 0, gross: 0, discount: 0, gst: 0, net: 0 };
                        const gross = (Number(item.quantity || 0) + Number(item.freeQuantity || 0)) * Number(item.rate ?? item.mrp ?? 0);
                        const discount = Number(item.itemFlatDiscount || 0) + (Number(item.quantity || 0) * Number(item.rate ?? item.mrp ?? 0) * (Number(item.discountPercent || 0) / 100));
                        const gst = (gross - discount) * (Number(item.gstPercent || 0) / 100);
                        acc.set(key, { qty: current.qty + Number(item.quantity || 0), gross: current.gross + gross, discount: current.discount + discount, gst: current.gst + gst, net: current.net + (gross - discount + gst) });
                        return acc;
                    }, new Map<string, any>());
                    filteredData = Array.from(categoryMap.entries()).map(([k, v]) => ({ 'Category': k, 'Quantity': round2(v.qty), 'Gross Amount': round2(v.gross), 'Discount': round2(v.discount), 'GST': round2(v.gst), 'Net Sales': round2(v.net) }));
                } else {
                    const areaMap = completedSales.reduce((acc: Map<string, any>, tx) => {
                        const key = customerByName.get(tx.customerName)?.area || 'Unknown';
                        const current = acc.get(key) || { bills: 0, sales: 0, gst: 0, net: 0 };
                        acc.set(key, { bills: current.bills + 1, sales: current.sales + Number(tx.subtotal || 0), gst: current.gst + Number(tx.totalGst || 0), net: current.net + Number(tx.total || 0) });
                        return acc;
                    }, new Map<string, any>());
                    filteredData = Array.from(areaMap.entries()).map(([k, v]) => ({ 'Area / Locality': k, 'Number of Bills': v.bills, 'Sales Amount': round2(v.sales), 'GST': round2(v.gst), 'Net Value': round2(v.net) }));
                }
                break;
            case 'salesReturnRegister':
            case 'creditNoteRegister':
                title = reportId === 'salesReturnRegister' ? 'Sales Return Register' : 'Credit Note Register';
                headers = reportId === 'salesReturnRegister'
                    ? ['Return Voucher No', 'Date', 'Original Bill No', 'Customer', 'Item / Amount', 'Tax Reversal', 'Return Total']
                    : ['Credit Note No', 'Date', 'Customer', 'Reference Bill', 'Amount', 'Reason'];
                filteredData = filteredSalesReturns.map(ret => reportId === 'salesReturnRegister'
                    ? ({
                        'Return Voucher No': ret.id,
                        'Date': new Date(ret.date).toLocaleDateString('en-GB'),
                        'Original Bill No': ret.originalInvoiceNumber || ret.originalInvoiceId,
                        'Customer': ret.customerName,
                        'Item / Amount': `${ret.items.length} items`,
                        'Tax Reversal': round2(ret.items.reduce((sum: number, i: any) => sum + (Number(i.returnQuantity || 0) * Number(i.rate ?? i.mrp ?? 0) * (Number(i.gstPercent || 0) / 100)), 0)),
                        'Return Total': round2(ret.totalRefund || 0)
                    })
                    : ({
                        'Credit Note No': `CN-${ret.id}`,
                        'Date': new Date(ret.date).toLocaleDateString('en-GB'),
                        'Customer': ret.customerName,
                        'Reference Bill': ret.originalInvoiceNumber || ret.originalInvoiceId,
                        'Amount': round2(ret.totalRefund || 0),
                        'Reason': ret.remarks || 'Sales return adjustment'
                    })
                );
                break;
            case 'schemeDiscountReport':
                title = 'Scheme/Discount Report';
                headers = ['Bill No', 'Date', 'Customer', 'Item', 'Trade Discount', 'Bill Discount', 'Scheme Discount', 'Net Impact'];
                filteredData = completedSales.flatMap(tx => tx.items.map((item: any) => {
                    const tradeDiscount = Number(item.itemFlatDiscount || 0) + (Number(item.quantity || 0) * Number(item.rate ?? item.mrp ?? 0) * (Number(item.discountPercent || 0) / 100));
                    const schemeDiscount = Number(item.schemeDiscountAmount || 0);
                    const billDiscount = (Number(tx.totalItemDiscount || 0) + Number(tx.schemeDiscount || 0)) / Math.max(tx.items.length, 1);
                    return {
                        'Bill No': tx.invoiceNumber || tx.id,
                        'Date': new Date(tx.date).toLocaleDateString('en-GB'),
                        'Customer': tx.customerName,
                        'Item': item.name,
                        'Trade Discount': round2(tradeDiscount),
                        'Bill Discount': round2(billDiscount),
                        'Scheme Discount': round2(schemeDiscount),
                        'Net Impact': round2(tradeDiscount + billDiscount + schemeDiscount)
                    };
                }));
                break;
            case 'freeQuantityReport':
                title = 'Free Quantity Report';
                headers = ['Bill No', 'Date', 'Customer', 'Item', 'Sold Qty', 'Free Qty', 'Effective Rate'];
                filteredData = completedSales.flatMap(tx => tx.items.filter((i: any) => Number(i.freeQuantity || 0) > 0).map((i: any) => ({
                    'Bill No': tx.invoiceNumber || tx.id,
                    'Date': new Date(tx.date).toLocaleDateString('en-GB'),
                    'Customer': tx.customerName,
                    'Item': i.name,
                    'Sold Qty': round2(i.quantity || 0),
                    'Free Qty': round2(i.freeQuantity || 0),
                    'Effective Rate': round2((Number(i.rate ?? i.mrp ?? 0) * Number(i.quantity || 0)) / Math.max(Number(i.quantity || 0) + Number(i.freeQuantity || 0), 1))
                })));
                break;
            case 'profitOnSales':
            case 'marginAnalysis':
                title = reportId === 'profitOnSales' ? 'Profit on Sales' : 'Margin Analysis';
                headers = reportId === 'profitOnSales'
                    ? ['Bill No / Item', 'Sales Value', 'Cost Value', 'Gross Profit', 'Profit %']
                    : ['Item Name', 'Sales Rate', 'Cost Rate', 'Margin Amount', 'Margin %'];
                filteredData = completedSales.flatMap(tx => tx.items.map((i: any) => {
                    const inv = inventory.find(item => item.id === i.inventoryItemId || item.name === i.name);
                    const salesRate = Number(i.rate ?? i.mrp ?? 0);
                    const costRate = Number(inv?.purchasePrice || inv?.ptr || 0);
                    const salesValue = Number(i.quantity || 0) * salesRate;
                    const costValue = Number(i.quantity || 0) * costRate;
                    const profit = salesValue - costValue;
                    return reportId === 'profitOnSales'
                        ? { 'Bill No / Item': `${tx.invoiceNumber || tx.id} / ${i.name}`, 'Sales Value': round2(salesValue), 'Cost Value': round2(costValue), 'Gross Profit': round2(profit), 'Profit %': salesValue > 0 ? round2((profit / salesValue) * 100) : 0 }
                        : { 'Item Name': i.name, 'Sales Rate': round2(salesRate), 'Cost Rate': round2(costRate), 'Margin Amount': round2(salesRate - costRate), 'Margin %': salesRate > 0 ? round2(((salesRate - costRate) / salesRate) * 100) : 0 };
                }));
                break;
            case 'cancelledDeletedBills':
                title = 'Cancelled Bills';
                headers = ['Bill No', 'Date', 'Customer', 'Amount', 'Cancelled On', 'Cancelled By'];
                filteredData = cancelledSales.map(tx => ({
                    'Bill No': tx.invoiceNumber || tx.id,
                    'Date': new Date(tx.date).toLocaleDateString('en-GB'),
                    'Customer': tx.customerName,
                    'Amount': round2(tx.total || 0),
                    'Cancelled On': tx.createdAt ? new Date(tx.createdAt).toLocaleDateString('en-GB') : new Date(tx.date).toLocaleDateString('en-GB'),
                    'Cancelled By': tx.billedByName || 'System'
                }));
                break;
            case 'purchaseRegister':
            case 'billWisePurchase':
                title = reportId === 'purchaseRegister' ? 'Purchase Register' : 'Bill-wise Purchase';
                headers = reportId === 'purchaseRegister'
                    ? ['Purchase Bill No', 'Date', 'Supplier', 'Taxable Amount', 'GST', 'Discount', 'Net Amount']
                    : ['Bill No', 'Date', 'Supplier', 'Amount', 'GST', 'Discount', 'Final Amount'];
                filteredData = completedPurchases.map(p => ({
                    [reportId === 'purchaseRegister' ? 'Purchase Bill No' : 'Bill No']: p.invoiceNumber,
                    'Date': new Date(p.date).toLocaleDateString('en-GB'),
                    'Supplier': p.supplier,
                    [reportId === 'purchaseRegister' ? 'Taxable Amount' : 'Amount']: round2(p.subtotal - p.totalItemDiscount - p.totalItemSchemeDiscount - p.schemeDiscount),
                    'GST': round2(p.totalGst || 0),
                    'Discount': round2((p.totalItemDiscount || 0) + (p.totalItemSchemeDiscount || 0) + (p.schemeDiscount || 0)),
                    [reportId === 'purchaseRegister' ? 'Net Amount' : 'Final Amount']: round2(p.totalAmount || 0)
                }));
                break;
            case 'purchaseSummary':
                title = 'Purchase Summary';
                headers = ['Total Purchase Bills', 'Gross Purchase', 'Discount', 'Taxable Value', 'GST', 'Net Purchase'];
                filteredData = [{
                    'Total Purchase Bills': completedPurchases.length,
                    'Gross Purchase': round2(completedPurchases.reduce((s, p) => s + Number(p.subtotal || 0), 0)),
                    'Discount': round2(completedPurchases.reduce((s, p) => s + Number(p.totalItemDiscount || 0) + Number(p.totalItemSchemeDiscount || 0) + Number(p.schemeDiscount || 0), 0)),
                    'Taxable Value': round2(completedPurchases.reduce((s, p) => s + Number(p.subtotal || 0) - Number(p.totalItemDiscount || 0) - Number(p.totalItemSchemeDiscount || 0) - Number(p.schemeDiscount || 0), 0)),
                    'GST': round2(completedPurchases.reduce((s, p) => s + Number(p.totalGst || 0), 0)),
                    'Net Purchase': round2(completedPurchases.reduce((s, p) => s + Number(p.totalAmount || 0), 0))
                }];
                break;
            case 'supplierWisePurchase':
            case 'itemWisePurchase': {
                title = reportId === 'supplierWisePurchase' ? 'Supplier-wise Purchase' : 'Item-wise Purchase';
                if (reportId === 'supplierWisePurchase') {
                    headers = ['Supplier', 'Number of Bills', 'Purchase Amount', 'Discount', 'GST', 'Net Purchase'];
                    const map = new Map<string, any>();
                    completedPurchases.forEach(p => {
                        const current = map.get(p.supplier) || { bills: 0, purchase: 0, discount: 0, gst: 0, net: 0 };
                        map.set(p.supplier, { bills: current.bills + 1, purchase: current.purchase + Number(p.subtotal || 0), discount: current.discount + Number(p.totalItemDiscount || 0) + Number(p.totalItemSchemeDiscount || 0) + Number(p.schemeDiscount || 0), gst: current.gst + Number(p.totalGst || 0), net: current.net + Number(p.totalAmount || 0) });
                    });
                    filteredData = Array.from(map.entries()).map(([k, v]) => ({ 'Supplier': k, 'Number of Bills': v.bills, 'Purchase Amount': round2(v.purchase), 'Discount': round2(v.discount), 'GST': round2(v.gst), 'Net Purchase': round2(v.net) }));
                } else {
                    headers = ['Item Name', 'Quantity Purchased', 'Free Qty', 'Purchase Value', 'GST', 'Net Value'];
                    const map = new Map<string, any>();
                    completedPurchases.forEach(p => p.items.forEach((i: any) => {
                        const current = map.get(i.name) || { qty: 0, free: 0, value: 0, gst: 0, net: 0 };
                        const gross = (Number(i.quantity || 0) + Number(i.freeQuantity || 0)) * Number(i.purchasePrice || 0);
                        const discount = Number(i.discountPercent || 0) * Number(i.purchasePrice || 0) * Number(i.quantity || 0) / 100 + Number(i.schemeDiscountAmount || 0);
                        const taxable = gross - discount;
                        const gst = taxable * Number(i.gstPercent || 0) / 100;
                        map.set(i.name, { qty: current.qty + Number(i.quantity || 0), free: current.free + Number(i.freeQuantity || 0), value: current.value + gross, gst: current.gst + gst, net: current.net + taxable + gst });
                    }));
                    filteredData = Array.from(map.entries()).map(([k, v]) => ({ 'Item Name': k, 'Quantity Purchased': round2(v.qty), 'Free Qty': round2(v.free), 'Purchase Value': round2(v.value), 'GST': round2(v.gst), 'Net Value': round2(v.net) }));
                }
                break;
            }
            case 'purchaseReturnRegister':
            case 'debitNoteRegister':
                title = reportId === 'purchaseReturnRegister' ? 'Purchase Return Register' : 'Debit Note Register';
                headers = reportId === 'purchaseReturnRegister'
                    ? ['Return No', 'Date', 'Supplier', 'Original Bill Ref', 'Return Amount', 'Tax Effect']
                    : ['Debit Note No', 'Date', 'Supplier', 'Reference', 'Amount', 'Reason'];
                filteredData = filteredPurchaseReturns.map(ret => reportId === 'purchaseReturnRegister'
                    ? ({
                        'Return No': ret.id,
                        'Date': new Date(ret.date).toLocaleDateString('en-GB'),
                        'Supplier': ret.supplier,
                        'Original Bill Ref': ret.originalPurchaseInvoiceId,
                        'Return Amount': round2(ret.totalValue || 0),
                        'Tax Effect': round2((ret.totalValue || 0) * 0.12)
                    })
                    : ({
                        'Debit Note No': `DN-${ret.id}`,
                        'Date': new Date(ret.date).toLocaleDateString('en-GB'),
                        'Supplier': ret.supplier,
                        'Reference': ret.originalPurchaseInvoiceId,
                        'Amount': round2(ret.totalValue || 0),
                        'Reason': ret.remarks || 'Purchase return adjustment'
                    })
                );
                break;
            case 'stockSummary':
            case 'batchWiseStock':
            case 'expiryWiseStock': {
                title = reportId === 'stockSummary' ? 'Stock Summary' : reportId === 'batchWiseStock' ? 'Batch-wise Stock' : 'Expiry-wise Stock';
                headers = reportId === 'stockSummary'
                    ? ['Item Name', 'Batch', 'Pack', 'Stock (Strips / Loose / Total)', 'MRP', 'PTR / Cost', 'Value', 'Expiry']
                    : reportId === 'batchWiseStock'
                    ? ['Item', 'Batch', 'Expiry', 'Quantity', 'Value']
                    : ['Item', 'Batch', 'Expiry', 'Qty', 'Value'];
                filteredData = inventory.map(item => {
                    const breakup = getStockBreakup(item.stock, item.unitsPerPack, item.packType);
                    const row = {
                        'Item Name': item.name,
                        'Item': item.name,
                        'Batch': item.batch,
                        'Pack': item.packType || item.packUnit || 'N/A',
                        'Stock (Strips / Loose / Total)': `${breakup.pack} / ${breakup.loose} / ${breakup.totalUnits}`,
                        'MRP': round2(item.mrp || 0),
                        'PTR / Cost': round2(item.ptr || item.purchasePrice || 0),
                        'Value': round2(breakup.totalUnits * Number(item.purchasePrice || item.ptr || 0)),
                        'Expiry': item.expiry ? new Date(item.expiry).toLocaleDateString('en-GB') : 'N/A',
                        'Quantity': breakup.totalUnits,
                        'Qty': breakup.totalUnits,
                        _sort: item.expiry ? new Date(item.expiry).getTime() : Number.MAX_SAFE_INTEGER
                    } as any;
                    return row;
                });
                if (reportId === 'expiryWiseStock') {
                    filteredData = filteredData.sort((a, b) => a._sort - b._sort);
                }
                break;
            }
            case 'nearExpiryReport':
            case 'expiredStockReport': {
                title = reportId === 'nearExpiryReport' ? 'Near Expiry Report' : 'Expired Stock Report';
                headers = reportId === 'nearExpiryReport' ? ['Item', 'Batch', 'Expiry', 'Remaining Days', 'Qty', 'Value'] : ['Item', 'Batch', 'Expiry', 'Qty', 'Value'];
                const now = new Date();
                filteredData = inventory.map(item => {
                    const breakup = getStockBreakup(item.stock, item.unitsPerPack, item.packType);
                    const expiryDate = item.expiry ? new Date(item.expiry) : null;
                    const remainingDays = expiryDate ? Math.ceil((expiryDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)) : null;
                    return {
                        'Item': item.name,
                        'Batch': item.batch,
                        'Expiry': expiryDate ? expiryDate.toLocaleDateString('en-GB') : 'N/A',
                        'Remaining Days': remainingDays ?? 'N/A',
                        'Qty': breakup.totalUnits,
                        'Value': round2(breakup.totalUnits * Number(item.purchasePrice || item.ptr || 0)),
                        _remainingDays: remainingDays
                    };
                }).filter(row => reportId === 'nearExpiryReport' ? typeof row._remainingDays === 'number' && row._remainingDays >= 0 && row._remainingDays <= 90 : typeof row._remainingDays === 'number' && row._remainingDays < 0);
                break;
            }
            case 'negativeStock':
                title = 'Negative Stock Report';
                headers = ['Item', 'Batch', 'Current Stock', 'Location'];
                filteredData = inventory.filter(i => Number(i.stock || 0) < 0).map(i => ({ 'Item': i.name, 'Batch': i.batch, 'Current Stock': Number(i.stock || 0), 'Location': i.rackNumber || 'N/A' }));
                break;
            case 'reorderLevelReport':
                title = 'Reorder Level Report';
                headers = ['Item', 'Current Stock', 'Minimum Limit', 'Required Reorder Qty'];
                filteredData = inventory.map(i => {
                    const breakup = getStockBreakup(i.stock, i.unitsPerPack, i.packType);
                    const minLimit = Number(i.minStockLimit || 0);
                    return { 'Item': i.name, 'Current Stock': breakup.totalUnits, 'Minimum Limit': minLimit, 'Required Reorder Qty': Math.max(minLimit - breakup.totalUnits, 0) };
                }).filter(i => i['Required Reorder Qty'] > 0);
                break;
            case 'ledgerReport': {
                title = 'Account Ledger';
                headers = ['Date', 'Voucher No', 'Particulars', 'Debit', 'Credit', 'Running Balance'];
                const rows = [
                    ...customers.flatMap(c => (c.ledger || []).map(entry => ({ party: c.name, entry })),),
                    ...distributors.flatMap(d => (d.ledger || []).map(entry => ({ party: d.name, entry })),)
                ];
                filteredData = applyDateFilter(rows.map(r => ({ date: r.entry.date, voucher: r.entry.referenceInvoiceNumber || r.entry.journalEntryNumber || r.entry.id, particulars: `${r.party} - ${r.entry.description}`, debit: Number(r.entry.debit || 0), credit: Number(r.entry.credit || 0), balance: Number(r.entry.balance || 0) })), 'date').map(r => ({
                    'Date': new Date(r.date).toLocaleDateString('en-GB'),
                    'Voucher No': r.voucher,
                    'Particulars': r.particulars,
                    'Debit': round2(r.debit),
                    'Credit': round2(r.credit),
                    'Running Balance': round2(r.balance)
                }));
                break;
            }
            case 'dayBook':
                title = 'Day Book';
                headers = ['Date', 'Voucher Type', 'Voucher No', 'Party / Ledger', 'Amount', 'Narration'];
                filteredData = [
                    ...completedSales.map(tx => ({ 'Date': new Date(tx.date).toLocaleDateString('en-GB'), 'Voucher Type': 'Sales', 'Voucher No': tx.invoiceNumber || tx.id, 'Party / Ledger': tx.customerName, 'Amount': round2(tx.total || 0), 'Narration': `Sale (${tx.paymentMode || 'N/A'})`, _sort: tx.date })),
                    ...completedPurchases.map(p => ({ 'Date': new Date(p.date).toLocaleDateString('en-GB'), 'Voucher Type': 'Purchase', 'Voucher No': p.invoiceNumber, 'Party / Ledger': p.supplier, 'Amount': round2(p.totalAmount || 0), 'Narration': 'Purchase entry', _sort: p.date })),
                ].sort((a, b) => new Date(a._sort).getTime() - new Date(b._sort).getTime());
                break;
            case 'outstandingReceivables':
                title = 'Outstanding Receivables';
                headers = ['Customer', 'Bill No', 'Bill Date', 'Due Amount', 'Received Amount', 'Balance Outstanding', 'Ageing'];
                filteredData = completedSales.map(tx => {
                    const dueAmount = Number(tx.total || 0);
                    const receivedAmount = Number(tx.amountReceived || 0);
                    const balance = dueAmount - receivedAmount;
                    return {
                        'Customer': tx.customerName,
                        'Bill No': tx.invoiceNumber || tx.id,
                        'Bill Date': new Date(tx.date).toLocaleDateString('en-GB'),
                        'Due Amount': round2(dueAmount),
                        'Received Amount': round2(receivedAmount),
                        'Balance Outstanding': round2(balance),
                        'Ageing': Math.max(0, Math.ceil((new Date().getTime() - new Date(tx.date).getTime()) / (1000 * 60 * 60 * 24)))
                    };
                }).filter(r => r['Balance Outstanding'] > 0);
                break;
            case 'outstandingPayables':
                title = 'Outstanding Payables';
                headers = ['Supplier', 'Bill No', 'Bill Date', 'Bill Amount', 'Paid Amount', 'Balance Outstanding', 'Ageing'];
                filteredData = completedPurchases.map(p => {
                    const billAmount = Number(p.totalAmount || 0);
                    const supplierOutstanding = Math.max(Number(getOutstandingBalance(distributors.find(d => d.name === p.supplier)) || 0), 0);
                    const paidAmount = Math.max(billAmount - supplierOutstanding, 0);
                    return {
                        'Supplier': p.supplier,
                        'Bill No': p.invoiceNumber,
                        'Bill Date': new Date(p.date).toLocaleDateString('en-GB'),
                        'Bill Amount': round2(billAmount),
                        'Paid Amount': round2(paidAmount),
                        'Balance Outstanding': round2(Math.max(billAmount - paidAmount, 0)),
                        'Ageing': Math.max(0, Math.ceil((new Date().getTime() - new Date(p.date).getTime()) / (1000 * 60 * 60 * 24)))
                    };
                }).filter(r => r['Balance Outstanding'] > 0);
                break;
            default:
                title = 'Report Not Implemented';
                headers = ['Message'];
                filteredData = [{ 'Message': 'This report is under development.' }];
                break;
        }

        onPrintReport({ title, data: filteredData, headers, filters });
    };

    return (
        <main className="flex-1 overflow-hidden flex flex-col page-fade-in bg-app-bg">
            <div className="bg-primary text-white h-7 flex items-center px-4 justify-between border-b border-gray-600 shadow-md flex-shrink-0">
                <span className="text-[10px] font-black uppercase tracking-widest">Display Reports & Analysis (MIS)</span>
                <span className="text-[10px] font-black uppercase text-accent">Management Info System</span>
            </div>

            <div className="p-4 flex-1 overflow-y-auto">
                <Card className="p-3 tally-border !rounded-none grid grid-cols-1 md:grid-cols-3 gap-4 items-end bg-white mb-6">
                    <div>
                        <label className="text-[10px] font-bold text-gray-500 uppercase block mb-1">From Date</label>
                        <input type="date" value={reportStartDate} onChange={e => setReportStartDate(e.target.value)} className="w-full border border-gray-400 p-2 text-sm font-bold outline-none" />
                    </div>
                    <div>
                        <label className="text-[10px] font-bold text-gray-500 uppercase block mb-1">To Date</label>
                        <input type="date" value={reportEndDate} onChange={e => setReportEndDate(e.target.value)} className="w-full border border-gray-400 p-2 text-sm font-bold outline-none" />
                    </div>
                    <div>
                        <button
                            onClick={() => { setReportStartDate(firstOfMonthIso); setReportEndDate(todayIso); }}
                            className="w-full py-2 tally-border bg-white font-bold uppercase text-[10px] hover:bg-gray-50 transition-colors"
                        >
                            Reset Date Range
                        </button>
                    </div>
                </Card>

                <Card className="p-8 tally-border bg-white !rounded-none shadow-lg">
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-x-12 gap-y-10">
                        {availableReports.map(report => (
                            <button
                                key={report.id}
                                onClick={() => generateReportData(report.id)}
                                className="flex flex-col items-center text-center p-6 rounded-md border border-gray-200 bg-white hover:bg-primary hover:text-white hover:border-primary transition-all shadow-sm active:scale-95 group"
                            >
                                <span className="text-xl font-bold text-app-text-primary group-hover:text-white mb-2">{report.name}</span>
                                <p className="text-xs text-app-text-secondary group-hover:text-white/80">Click to generate and print this report.</p>
                            </button>
                        ))}
                    </div>
                </Card>
            </div>
        </main>
    );
};

export default Reports;
