
import React from 'react';
import Modal from './Modal';
import { arrayToCsvRow, downloadCsv } from '../utils/csv';
import type { InventoryItem } from '../types';
import { formatExpiryToMMYY } from '../utils/helpers';

// Accessing global XLSX and html2pdf from index.html
declare const XLSX: any;
declare const html2pdf: any;

interface ExportInventoryModalProps {
    isOpen: boolean;
    onClose: () => void;
    data: InventoryItem[];
    pharmacyName: string;
}

const ExportInventoryModal: React.FC<ExportInventoryModalProps> = ({ isOpen, onClose, data, pharmacyName }) => {
    const headers = ['S.No', 'Product Name', 'Brand', 'Batch', 'Expiry', 'Stock', 'UOM', 'Pur. Price', 'MRP', 'Value'];

    const getExportData = () => {
        return data.map((item, idx) => {
            const uPP = item.unitsPerPack || 1;
            const strips = Math.floor(item.stock / uPP);
            const loose = item.stock % uPP;
            const stockDisplay = `${strips}:${String(loose).padStart(2, '0')} (${item.stock})`;

            return [
                idx + 1,
                item.name,
                item.brand || '',
                item.batch,
                formatExpiryToMMYY(item.expiry),
                stockDisplay,
                item.unitOfMeasurement || item.baseUnit || '',
                (item.purchasePrice || 0).toFixed(2),
                (item.mrp || 0).toFixed(2),
                (item.value || 0).toFixed(2)
            ];
        });
    };

    const handleExportExcel = () => {
        if (typeof XLSX === 'undefined') {
            alert("Excel library not loaded.");
            return;
        }
        const wsData = [headers, ...getExportData()];
        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.aoa_to_sheet(wsData);
        XLSX.utils.book_append_sheet(wb, ws, "Inventory Summary");
        XLSX.writeFile(wb, `Inventory_Summary_${new Date().toISOString().split('T')[0]}.xlsx`);
        onClose();
    };

    const handleExportCsv = () => {
        const csvContent = [
            arrayToCsvRow(headers),
            ...getExportData().map(row => arrayToCsvRow(row))
        ].join('\n');
        downloadCsv(csvContent, `Inventory_Summary_${new Date().toISOString().split('T')[0]}.csv`);
        onClose();
    };

    const handleExportPdf = () => {
        if (typeof html2pdf === 'undefined') {
            alert("PDF library not loaded.");
            return;
        }

        const element = document.createElement('div');
        element.style.padding = '20px';
        element.style.fontFamily = 'Arial, sans-serif';
        element.innerHTML = `
            <div style="text-align: center; margin-bottom: 20px;">
                <h1 style="margin: 0; text-transform: uppercase;">${pharmacyName}</h1>
                <h2 style="margin: 5px 0; color: #666;">STOCK SUMMARY REPORT</h2>
                <p style="font-size: 10px; color: #999;">Generated on: ${new Date().toLocaleString()}</p>
            </div>
            <table style="width: 100%; border-collapse: collapse; font-size: 8px;">
                <thead>
                    <tr style="background-color: #004242; color: white;">
                        ${headers.map(h => `<th style="border: 1px solid #003333; padding: 6px; text-align: left;">${h}</th>`).join('')}
                    </tr>
                </thead>
                <tbody>
                    ${getExportData().map(row => `
                        <tr>
                            ${row.map(cell => `<td style="border: 1px solid #eee; padding: 5px;">${cell}</td>`).join('')}
                        </tr>
                    `).join('')}
                </tbody>
            </table>
            <div style="margin-top: 20px; text-align: right; font-size: 10px; font-weight: bold;">
                Total Valuation: ₹${data.reduce((s, i) => s + (i.value || 0), 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
            </div>
        `;

        const opt = {
            margin: 10,
            filename: `Inventory_Summary_${new Date().toISOString().split('T')[0]}.pdf`,
            image: { type: 'jpeg', quality: 0.98 },
            html2canvas: { scale: 2, useCORS: true },
            jsPDF: { unit: 'mm', format: 'a4', orientation: 'landscape' }
        };

        html2pdf().set(opt).from(element).save().then(() => onClose());
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Export Inventory Format" widthClass="max-w-md">
            <div className="p-8 space-y-6 bg-app-bg">
                <p className="text-xs font-black text-gray-500 uppercase tracking-widest text-center">
                    Choose export destination for summary data
                </p>
                
                <div className="grid grid-cols-1 gap-4">
                    <ExportButton 
                        label="Microsoft Excel (.xlsx)" 
                        icon="📊" 
                        onClick={handleExportExcel} 
                        color="hover:border-emerald-500 hover:bg-emerald-50"
                    />
                    <ExportButton 
                        label="Comma Separated (.csv)" 
                        icon="📄" 
                        onClick={handleExportCsv} 
                        color="hover:border-blue-500 hover:bg-blue-50"
                    />
                    <ExportButton 
                        label="Portable Document (.pdf)" 
                        icon="📕" 
                        onClick={handleExportPdf} 
                        color="hover:border-red-500 hover:bg-red-50"
                    />
                </div>
            </div>
            <div className="p-4 bg-gray-100 border-t flex justify-end">
                <button onClick={onClose} className="px-8 py-2 text-[10px] font-black uppercase text-gray-400 hover:text-black tracking-widest transition-colors">
                    Discard (Esc)
                </button>
            </div>
        </Modal>
    );
};

const ExportButton = ({ label, icon, onClick, color }: any) => (
    <button 
        onClick={onClick}
        className={`w-full p-5 border-2 border-gray-200 flex items-center justify-between transition-all group rounded-none bg-white shadow-sm ${color}`}
    >
        <div className="flex items-center gap-4">
            <span className="text-3xl">{icon}</span>
            <span className="text-xs font-black uppercase tracking-[0.1em] text-gray-700 group-hover:text-black">
                {label}
            </span>
        </div>
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="opacity-0 group-hover:opacity-100 transition-opacity"><polyline points="9 18 15 12 9 6"/></svg>
    </button>
);

export default ExportInventoryModal;
