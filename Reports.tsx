import React, { useState, useMemo, useRef, useEffect } from 'react';
import Card from './components/Card';
import Modal from './components/Modal';
import type { InventoryItem, Transaction, Purchase, Distributor, Customer, SalesReturn, PurchaseReturn, ModuleConfig } from './types';
import { configurableModules } from './constants';
import { getOutstandingBalance } from './utils/helpers';

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

const Reports: React.FC<ReportsProps> = ({
  inventory, transactions, purchases, distributors, customers, salesReturns, purchaseReturns, onPrintReport, config,
}) => {
    const [reportStartDate, setReportStartDate] = useState('');
    const [reportEndDate, setReportEndDate] = useState('');

    const reportModuleConfig = useMemo(() => configurableModules.find(m => m.id === 'reports'), []);
    const availableReports = useMemo(() => {
        if (!reportModuleConfig || !reportModuleConfig.fields) return [];
        return reportModuleConfig.fields.filter(field => config?.fields?.[field.id] !== false);
    }, [reportModuleConfig, config]);

    const generateReportData = (reportId: string) => {
        const filters = { startDate: reportStartDate, endDate: reportEndDate };
        let filteredData: any[] = [];
        let headers: string[] = [];
        let title: string = '';

        const applyDateFilter = (items: any[], dateField: string = 'date') => {
            let temp = [...items];
            if (reportStartDate) {
                const start = new Date(reportStartDate);
                start.setHours(0, 0, 0, 0);
                temp = temp.filter((item: any) => new Date(item[dateField]) >= start);
            }
            if (reportEndDate) {
                const end = new Date(reportEndDate);
                end.setHours(23, 59, 59, 999);
                temp = temp.filter((item: any) => new Date(item[dateField]) <= end);
            }
            return temp;
        };

        switch (reportId) {
            case 'salesRegister':
                title = 'Sales Register';
                headers = ['Invoice ID', 'Invoice Number', 'Date', 'Customer Name', 'Total Amount', 'Items Count', 'Payment Mode', 'Status'];
                filteredData = applyDateFilter(transactions).map(tx => ({
                    'Invoice ID': tx.id,
                    'Invoice Number': tx.invoiceNumber || tx.id,
                    'Date': new Date(tx.date).toLocaleDateString('en-GB'),
                    'Customer Name': tx.customerName,
                    'Total Amount': tx.total,
                    'Items Count': tx.items.length,
                    'Payment Mode': tx.paymentMode,
                    'Status': tx.status
                }));
                break;
            case 'purchaseRegister':
                title = 'Purchase Register';
                headers = ['Invoice Number', 'Date', 'Supplier', 'Total Amount', 'Items Count', 'Status'];
                filteredData = applyDateFilter(purchases).map(p => ({
                    'Invoice Number': p.invoiceNumber,
                    'Date': new Date(p.date).toLocaleDateString('en-GB'),
                    'Supplier': p.supplier,
                    'Total Amount': p.totalAmount,
                    'Items Count': p.items.length,
                    'Status': p.status
                }));
                break;
            case 'inventoryReport':
                title = 'Inventory Stock Report';
                headers = ['Product Name', 'Brand', 'Batch', 'Expiry', 'Stock', 'Units Per Pack', 'MRP', 'Purchase Price', 'GST%', 'HSN Code'];
                filteredData = inventory.map((item: InventoryItem) => ({
                    'Product Name': item.name,
                    'Brand': item.brand,
                    'Batch': item.batch,
                    'Expiry': item.expiry ? new Date(item.expiry).toLocaleDateString('en-GB') : 'N/A',
                    'Stock': item.stock,
                    'Units Per Pack': item.unitsPerPack,
                    'MRP': item.mrp,
                    'Purchase Price': item.purchasePrice,
                    'GST%': item.gstPercent,
                    'HSN Code': item.hsnCode
                }));
                break;
            case 'customerOutstanding':
                title = 'Customer Outstanding Balances';
                headers = ['Customer Name', 'Phone', 'Outstanding Balance'];
                filteredData = customers.map(cust => ({
                    'Customer Name': cust.name,
                    'Phone': cust.phone,
                    'Outstanding Balance': getOutstandingBalance(cust)
                })).filter(c => c['Outstanding Balance'] !== 0).sort((a,b) => b['Outstanding Balance'] - a['Outstanding Balance']);
                break;
            case 'distributorOutstanding':
                title = 'Distributor Outstanding Payables';
                headers = ['Supplier Name', 'GSTIN', 'Outstanding Balance'];
                filteredData = distributors.map(dist => ({
                    'Supplier Name': dist.name,
                    'GSTIN': dist.gst_number,
                    'Outstanding Balance': getOutstandingBalance(dist)
                })).filter(d => d['Outstanding Balance'] !== 0).sort((a,b) => b['Outstanding Balance'] - a['Outstanding Balance']);
                break;
            case 'productWiseSales':
                title = 'Product-wise Sales Summary';
                headers = ['Product Name', 'Total Quantity Sold', 'Total Revenue'];
                const productSales = new Map<string, { qty: number, revenue: number }>();
                applyDateFilter(transactions).forEach(tx => {
                    tx.items.forEach((item: any) => {
                        const current = productSales.get(item.name) || { qty: 0, revenue: 0 };
                        const saleAmount = item.quantity * (item.rate || item.mrp) * (1 - (item.discountPercent || 0) / 100);
                        productSales.set(item.name, {
                            qty: current.qty + item.quantity,
                            revenue: current.revenue + saleAmount
                        });
                    });
                });
                filteredData = Array.from(productSales.entries()).map(([name, data]) => ({
                    'Product Name': name,
                    'Total Quantity Sold': data.qty,
                    'Total Revenue': data.revenue
                })).sort((a,b) => b['Total Revenue'] - a['Total Revenue']);
                break;
            case 'stockSalesAnalysis':
                title = 'Stock & Sales Analysis';
                headers = ['Product Name', 'Current Stock', 'Total Sold (Period)', 'Stock Turnover'];
                const salesByProduct = new Map<string, number>();
                applyDateFilter(transactions).forEach(tx => {
                    tx.items.forEach((item: any) => {
                        salesByProduct.set(item.name, (salesByProduct.get(item.name) || 0) + item.quantity);
                    });
                });
                filteredData = inventory.map((item: InventoryItem) => {
                    const soldQty = salesByProduct.get(item.name) || 0;
                    const stockVal = Number(item.stock);
                    const stockTurnover = stockVal > 0 ? (Number(soldQty) / stockVal) : 0;
                    return {
                        'Product Name': item.name,
                        'Current Stock': item.stock,
                        'Total Sold (Period)': soldQty,
                        'Stock Turnover': stockTurnover.toFixed(2)
                    };
                }).sort((a: any, b: any) => parseFloat(b['Stock Turnover']) - parseFloat(a['Stock Turnover']));
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
                            onClick={() => { setReportStartDate(''); setReportEndDate(''); }}
                            className="w-full py-2 tally-border bg-white font-bold uppercase text-[10px] hover:bg-gray-50 transition-colors"
                        >
                            Clear Filters
                        </button>
                    </div>
                </Card>

                <Card className="p-8 tally-border bg-white !rounded-none shadow-lg">
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-x-12 gap-y-10">
                        {availableReports.map(report => (
                            <button 
                                key={report.id} 
                                onClick={() => generateReportData(report.id)}
                                className="flex flex-col items-center text-center p-6 rounded-md border border-gray-200 bg-white hover:bg-primary-extralight/50 hover:border-primary-light transition-all shadow-sm active:scale-95"
                            >
                                <span className="text-xl font-bold text-app-text-primary mb-2">{report.name}</span>
                                <p className="text-xs text-app-text-secondary">Click to generate and print this report.</p>
                            </button>
                        ))}
                    </div>
                </Card>
            </div>
        </main>
    );
};

export default Reports;