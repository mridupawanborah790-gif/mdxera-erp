import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import type { InventoryItem } from '../types';
import { formatExpiryToMMYY } from '../utils/helpers';

interface InventoryBatchDetailModalProps {
    isOpen: boolean;
    itemName: string;
    rows: InventoryItem[];
    onClose: () => void;
}

const InventoryBatchDetailModal: React.FC<InventoryBatchDetailModalProps> = ({ isOpen, itemName, rows, onClose }) => {
    useEffect(() => {
        if (!isOpen) return;
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                event.preventDefault();
                onClose();
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isOpen, onClose]);

    if (!isOpen) return null;

    const sortedRows = [...rows].sort((a, b) => (a.batch || '').localeCompare(b.batch || ''));

    return createPortal(
        <div className="fixed inset-0 z-[220] bg-black/60 flex items-center justify-center p-4" onClick={onClose}>
            <div className="w-full max-w-7xl max-h-[90vh] bg-white border-2 border-primary shadow-2xl flex flex-col" onClick={e => e.stopPropagation()}>
                <div className="px-4 py-3 bg-primary text-white flex justify-between items-center">
                    <div>
                        <p className="text-[10px] font-black uppercase tracking-widest">Batch-wise Stock Breakdown</p>
                        <h2 className="text-lg font-black uppercase">{itemName}</h2>
                    </div>
                    <button onClick={onClose} className="px-3 py-1 border border-white text-xs font-black uppercase">Esc / Close</button>
                </div>

                <div className="flex-1 overflow-auto">
                    <table className="min-w-full border-collapse whitespace-nowrap">
                        <thead className="bg-gray-100 sticky top-0 z-10">
                            <tr className="text-xs font-black uppercase text-gray-700 border-b border-gray-400">
                                <th className="px-2 py-2 border-r border-gray-300 text-center">#</th>
                                <th className="px-2 py-2 border-r border-gray-300 text-left">Batch</th>
                                <th className="px-2 py-2 border-r border-gray-300 text-center">Expiry</th>
                                <th className="px-2 py-2 border-r border-gray-300 text-right">Pack Qty</th>
                                <th className="px-2 py-2 border-r border-gray-300 text-right">Loose Qty</th>
                                <th className="px-2 py-2 border-r border-gray-300 text-right">Total Stock</th>
                                <th className="px-2 py-2 border-r border-gray-300 text-right">PTR</th>
                                <th className="px-2 py-2 border-r border-gray-300 text-right">MRP</th>
                                <th className="px-2 py-2 border-r border-gray-300 text-right">Rate A</th>
                                <th className="px-2 py-2 border-r border-gray-300 text-right">Rate B</th>
                                <th className="px-2 py-2 border-r border-gray-300 text-right">Rate C</th>
                                <th className="px-2 py-2 border-r border-gray-300 text-right">Stock Value</th>
                                <th className="px-2 py-2 text-left">Barcode</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200 text-sm">
                            {sortedRows.map((row, index) => {
                                const unitsPerPack = Math.max(1, Number(row.unitsPerPack) || 1);
                                const packQty = Math.floor((Number(row.stock) || 0) / unitsPerPack);
                                const looseQty = (Number(row.stock) || 0) % unitsPerPack;
                                const stockValue = Number(row.value ?? (row.stock * (row.cost || row.ptr || 0)));

                                return (
                                    <tr key={row.id} className="hover:bg-yellow-50">
                                        <td className="px-2 py-1.5 border-r border-gray-200 text-center">{index + 1}</td>
                                        <td className="px-2 py-1.5 border-r border-gray-200 font-mono text-primary">{row.batch || '-'}</td>
                                        <td className="px-2 py-1.5 border-r border-gray-200 text-center">{formatExpiryToMMYY(row.expiry) || '-'}</td>
                                        <td className="px-2 py-1.5 border-r border-gray-200 text-right">{packQty}</td>
                                        <td className="px-2 py-1.5 border-r border-gray-200 text-right">{looseQty}</td>
                                        <td className="px-2 py-1.5 border-r border-gray-200 text-right font-semibold">{row.stock}</td>
                                        <td className="px-2 py-1.5 border-r border-gray-200 text-right">₹{Number(row.ptr || 0).toFixed(2)}</td>
                                        <td className="px-2 py-1.5 border-r border-gray-200 text-right">₹{Number(row.mrp || 0).toFixed(2)}</td>
                                        <td className="px-2 py-1.5 border-r border-gray-200 text-right">₹{Number(row.rateA || 0).toFixed(2)}</td>
                                        <td className="px-2 py-1.5 border-r border-gray-200 text-right">₹{Number(row.rateB || 0).toFixed(2)}</td>
                                        <td className="px-2 py-1.5 border-r border-gray-200 text-right">₹{Number(row.rateC || 0).toFixed(2)}</td>
                                        <td className="px-2 py-1.5 border-r border-gray-200 text-right font-semibold">₹{stockValue.toFixed(2)}</td>
                                        <td className="px-2 py-1.5">{row.barcode || '-'}</td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>,
        document.body,
    );
};

export default InventoryBatchDetailModal;
