
import React from 'react';
import Modal from './Modal';
import { arrayToCsvRow, downloadCsv } from '../utils/csv';
import type { Transaction } from '../types';

declare const XLSX: any;
declare const html2pdf: any;

interface ExportSalesModalProps {
    isOpen: boolean;
    onClose: () => void;
    data: Transaction[];
    pharmacyName: string;
}

const ExportSalesModal: React.FC<ExportSalesModalProps> = ({ isOpen, onClose, data, pharmacyName }) => {
    const headers = ['S.No', 'Invoice ID', 'Date', 'Customer', 'Items Count', 'Net Amount', 'Status'];

    const getExportData = () => {
        return data.map((item, idx) => [
            idx + 1,
            item.id,
            new Date(item.date).toLocaleDateString('en-IN'),
            item.customerName,
            item.itemCount,
            (item.total || 0).toFixed(2),
            item.status.toUpperCase()
        ]);
    };

    const handleExportExcel = () => {
        if (typeof XLSX === 'undefined') {
            alert("Excel library not loaded.");
            return;
        }
        const wsData = [headers, ...getExportData()];
        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.aoa_to_sheet(wsData);
        XLSX.utils.book_append_sheet(wb, ws, "Sales Register");
        XLSX.writeFile(wb, `Sales_History_${new Date().toISOString().split('T')[0]}.xlsx`);
        onClose();
    };

    const handleExportCsv = () => {
        const csvContent = [
            arrayToCsvRow(headers),
            ...getExportData().map(row => arrayToCsvRow(row))
        ].join('\n');
        downloadCsv(csvContent, `Sales_History_${new Date().toISOString().split('T')[0]}.csv`);
        onClose();
    };

    const handleExportPdf = () => {
        if (typeof html2pdf === 'undefined') {
            alert("PDF library not loaded.");
            return;
        }

        const formatDate = (value?: string | Date) => {
            if (!value) return '-';
            return new Date(value).toLocaleDateString('en-GB');
        };

        const printTime = new Date().toLocaleString('en-GB', {
            day: '2-digit',
            month: 'short',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            hour12: true,
        });

        const periodStart = data.length ? new Date(Math.min(...data.map(tx => new Date(tx.date).getTime()))) : undefined;
        const periodEnd = data.length ? new Date(Math.max(...data.map(tx => new Date(tx.date).getTime()))) : undefined;
        const netTotal = data.reduce((sum, tx) => sum + (tx.status !== 'cancelled' ? (tx.total || 0) : 0), 0);

        const element = document.createElement('div');
        element.style.padding = '16px';
        element.style.fontFamily = 'Arial, sans-serif';
        element.innerHTML = `
            <style>
                .mis-print-page { color: #111827; font-size: 10px; }
                .mis-report-header { text-align: center; margin-bottom: 10px; border-bottom: 1px solid #d1d5db; padding-bottom: 8px; }
                .company-name { font-size: 18px; font-weight: 700; text-transform: uppercase; }
                .company-address, .company-meta { font-size: 10px; margin-top: 2px; }
                .report-title { margin-top: 8px; font-size: 13px; font-weight: 700; letter-spacing: 0.05em; }
                .report-meta, .print-meta { margin-top: 5px; display: flex; justify-content: space-between; gap: 10px; font-size: 9px; }
                .mis-report-table { width: 100%; border-collapse: collapse; font-size: 9px; }
                .mis-report-table th, .mis-report-table td { border: 1px solid #9ca3af; padding: 5px; }
                .mis-report-table thead tr { background: #f3f4f6; }
                .mis-report-table tfoot tr { background: #f9fafb; font-weight: 700; }
                .right { text-align: right; }
            </style>
            <div class="mis-print-page">
              <div class="mis-report-header">
                <div class="company-name">${pharmacyName}</div>
                <div class="company-address">-</div>
                <div class="company-meta">GSTIN: - &nbsp; | &nbsp; DL: -</div>
                <div class="report-title">SALES REGISTER (PRINT)</div>
                <div class="report-meta">
                  <span>Period: ${formatDate(periodStart)} to ${formatDate(periodEnd)}</span>
                  <span>Filters: From: ${formatDate(periodStart)} | To: ${formatDate(periodEnd)}</span>
                </div>
                <div class="print-meta">
                  <span>Printed: ${printTime}</span>
                  <span>Page 1 of 1</span>
                </div>
              </div>
              <table class="mis-report-table">
                <thead>
                  <tr>
                    <th>Bill No</th>
                    <th>Bill Date</th>
                    <th>Customer Name</th>
                    <th>GSTIN</th>
                    <th>Billing Category</th>
                    <th>Taxable Amount</th>
                    <th>GST Amount</th>
                    <th>Discount</th>
                    <th>Net Amount</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  ${data.map(tx => `
                    <tr>
                      <td>${tx.id ?? '-'}</td>
                      <td>${formatDate(tx.date)}</td>
                      <td>${tx.customerName ?? '-'}</td>
                      <td>-</td>
                      <td>Retail</td>
                      <td class="right">₹ ${(tx.subtotal || tx.total || 0).toFixed(2)}</td>
                      <td class="right">₹ ${(tx.totalGst || 0).toFixed(2)}</td>
                      <td class="right">₹ ${(tx.totalItemDiscount || 0).toFixed(2)}</td>
                      <td class="right">₹ ${(tx.total || 0).toFixed(2)}</td>
                      <td>${(tx.status || '-').toString().toUpperCase()}</td>
                    </tr>
                  `).join('')}
                </tbody>
                <tfoot>
                  <tr>
                    <td colspan="5">TOTAL</td>
                    <td class="right">₹ ${data.reduce((sum, tx) => sum + (tx.subtotal || tx.total || 0), 0).toFixed(2)}</td>
                    <td class="right">₹ ${data.reduce((sum, tx) => sum + (tx.totalGst || 0), 0).toFixed(2)}</td>
                    <td class="right">₹ ${data.reduce((sum, tx) => sum + (tx.totalItemDiscount || 0), 0).toFixed(2)}</td>
                    <td class="right">₹ ${netTotal.toFixed(2)}</td>
                    <td></td>
                  </tr>
                </tfoot>
            </table>
          </div>
        `;

        const opt = {
            margin: 10,
            filename: `Sales_History_${new Date().toISOString().split('T')[0]}.pdf`,
            image: { type: 'jpeg', quality: 0.98 },
            html2canvas: { scale: 2, useCORS: true },
            jsPDF: { unit: 'mm', format: 'a4', orientation: 'landscape' }
        };

        html2pdf().set(opt).from(element).save().then(() => onClose());
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Export Sales History" widthClass="max-w-md">
            <div className="p-8 space-y-6 bg-app-bg">
                <p className="text-xs font-black text-gray-500 uppercase tracking-widest text-center">
                    Select export format for Sales Register
                </p>
                <div className="grid grid-cols-1 gap-4">
                    <ExportButton label="Microsoft Excel (.xlsx)" icon="📊" onClick={handleExportExcel} color="hover:border-emerald-500 hover:bg-emerald-50" />
                    <ExportButton label="Comma Separated (.csv)" icon="📄" onClick={handleExportCsv} color="hover:border-blue-500 hover:bg-blue-50" />
                    <ExportButton label="Portable Document (.pdf)" icon="📕" onClick={handleExportPdf} color="hover:border-red-500 hover:bg-red-50" />
                </div>
            </div>
            <div className="p-4 bg-gray-100 border-t flex justify-end">
                <button onClick={onClose} className="px-8 py-2 text-[10px] font-black uppercase text-gray-400 hover:text-black tracking-widest transition-colors">Discard (Esc)</button>
            </div>
        </Modal>
    );
};

const ExportButton = ({ label, icon, onClick, color }: any) => (
    <button onClick={onClick} className={`w-full p-5 border-2 border-gray-200 flex items-center justify-between transition-all group rounded-none bg-white shadow-sm ${color}`}>
        <div className="flex items-center gap-4">
            <span className="text-3xl">{icon}</span>
            <span className="text-xs font-black uppercase tracking-[0.1em] text-gray-700 group-hover:text-black">{label}</span>
        </div>
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="opacity-0 group-hover:opacity-100 transition-opacity"><polyline points="9 18 15 12 9 6"/></svg>
    </button>
);

export default ExportSalesModal;
