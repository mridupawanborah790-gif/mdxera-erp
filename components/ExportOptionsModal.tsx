
import React from 'react';
import Modal from './Modal';
import { arrayToCsvRow, downloadCsv } from '../utils/csv';

// Accessing global XLSX and html2pdf from index.html
declare const XLSX: any;
declare const html2pdf: any;

interface ExportOptionsModalProps {
    isOpen: boolean;
    onClose: () => void;
    data: any[];
    title: string;
    pharmacyName: string;
}

const ExportOptionsModal: React.FC<ExportOptionsModalProps> = ({ isOpen, onClose, data, title, pharmacyName }) => {
    const headers = ['S.No', 'Product Name', 'Material Code', 'Brand/Mfr', 'Composition', 'Pack', 'GST%', 'Status'];

    const getExportData = () => {
        return data.map((item, idx) => [
            idx + 1,
            item.name,
            item.materialCode,
            item.brand || item.manufacturer || '',
            item.composition || '',
            item.pack || '',
            `${item.gstRate}%`,
            item.is_active ? 'Active' : 'Inactive'
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
        XLSX.utils.book_append_sheet(wb, ws, "Material Master");
        XLSX.writeFile(wb, `Material_Master_${new Date().toISOString().split('T')[0]}.xlsx`);
        onClose();
    };

    const handleExportCsv = () => {
        const csvContent = [
            arrayToCsvRow(headers),
            ...getExportData().map(row => arrayToCsvRow(row))
        ].join('\n');
        downloadCsv(csvContent, `Material_Master_${new Date().toISOString().split('T')[0]}.csv`);
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
                <h2 style="margin: 5px 0; color: #666;">${title}</h2>
                <p style="font-size: 10px; color: #999;">Exported on: ${new Date().toLocaleString()}</p>
            </div>
            <table style="width: 100%; border-collapse: collapse; font-size: 9px;">
                <thead>
                    <tr style="background-color: #f1f1f1;">
                        ${headers.map(h => `<th style="border: 1px solid #ccc; padding: 6px; text-align: left;">${h}</th>`).join('')}
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
        `;

        const opt = {
            margin: 10,
            filename: `Material_Master_${new Date().toISOString().split('T')[0]}.pdf`,
            image: { type: 'jpeg', quality: 0.98 },
            html2canvas: { scale: 2, useCORS: true },
            jsPDF: { unit: 'mm', format: 'a4', orientation: 'landscape' }
        };

        html2pdf().set(opt).from(element).save().then(() => onClose());
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Export Data Format" widthClass="max-w-md">
            <div className="p-8 space-y-6">
                <p className="text-sm font-bold text-gray-500 uppercase tracking-widest text-center">
                    Select desired file format for export
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
            <div className="p-4 bg-gray-50 border-t flex justify-end">
                <button onClick={onClose} className="px-6 py-2 text-[10px] font-black uppercase text-gray-400 hover:text-black tracking-widest">
                    Cancel (Esc)
                </button>
            </div>
        </Modal>
    );
};

const ExportButton = ({ label, icon, onClick, color }: any) => (
    <button 
        onClick={onClick}
        className={`w-full p-4 border-2 border-gray-200 flex items-center justify-between transition-all group rounded-none bg-white ${color}`}
    >
        <div className="flex items-center gap-4">
            <span className="text-2xl">{icon}</span>
            <span className="text-xs font-black uppercase tracking-widest text-gray-700 group-hover:text-black">
                {label}
            </span>
        </div>
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="opacity-0 group-hover:opacity-100 transition-opacity"><polyline points="9 18 15 12 9 6"/></svg>
    </button>
);

export default ExportOptionsModal;
