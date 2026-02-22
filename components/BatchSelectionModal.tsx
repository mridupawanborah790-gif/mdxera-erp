
import React, { useEffect, useRef, useState } from 'react';
import Modal from './Modal';
import { InventoryItem } from '../types';

interface BatchSelectionModalProps {
    isOpen: boolean;
    onClose: () => void;
    productName: string;
    batches: InventoryItem[];
    onSelect: (batch: InventoryItem) => void;
}

// Synchronized typography style from Product Selection Matrix
const matrixRowTextStyle = "text-2xl font-normal tracking-tight uppercase leading-tight";

const BatchSelectionModal: React.FC<BatchSelectionModalProps> = ({ isOpen, onClose, productName, batches, onSelect }) => {
    const [selectedIndex, setSelectedIndex] = useState(0);
    const containerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (isOpen) {
            setSelectedIndex(0);
            // Small delay to ensure modal is rendered before focusing
            setTimeout(() => containerRef.current?.focus(), 150);
        }
    }, [isOpen]);

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (batches.length === 0) return;
        
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            setSelectedIndex(prev => (prev + 1) % batches.length);
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setSelectedIndex(prev => (prev - 1 + batches.length) % batches.length);
        } else if (e.key === 'Enter') {
            e.preventDefault();
            if (batches[selectedIndex]) onSelect(batches[selectedIndex]);
        } else if (e.key === 'Escape') {
            onClose();
        }
    };

    if (!isOpen) return null;

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={`Batch Selection Matrix`} widthClass="max-w-xl" heightClass="h-auto">
            <div 
                ref={containerRef}
                className="flex flex-col outline-none bg-white dark:bg-zinc-950 font-normal" 
                onKeyDown={handleKeyDown} 
                tabIndex={0}
            >
                {/* Product Identifier Section */}
                <div className="p-6 bg-slate-50 dark:bg-zinc-900 border-b-2 border-app-border flex flex-col gap-1">
                    <p className="text-[10px] font-black uppercase text-primary tracking-[0.3em] leading-none mb-1">Target Material</p>
                    <h3 className="text-2xl font-black uppercase text-gray-950 dark:text-white leading-tight tracking-tight">
                        {productName}
                    </h3>
                </div>
                
                <div className="overflow-y-auto max-h-[50vh] custom-scrollbar">
                    <table className="min-w-full border-collapse">
                        <thead className="bg-gray-100 dark:bg-zinc-800 text-gray-600 sticky top-0 z-10">
                            <tr className="uppercase font-black text-[11px] tracking-widest border-b border-app-border">
                                <th className="p-4 text-left w-12">#</th>
                                <th className="p-4 text-left">Batch Number</th>
                                <th className="p-4 text-center">Expiry Date</th>
                                <th className="p-4 text-right">Avail. Qty</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100 dark:divide-zinc-800">
                            {batches.map((batch, idx) => {
                                const isSelected = idx === selectedIndex;
                                const isExpired = new Date(batch.expiry) < new Date();
                                
                                return (
                                    <tr 
                                        key={batch.id} 
                                        onClick={() => onSelect(batch)}
                                        onMouseEnter={() => setSelectedIndex(idx)}
                                        className={`cursor-pointer transition-all ${
                                            isSelected 
                                            ? 'bg-primary text-white scale-[1.01] shadow-lg z-20 relative' 
                                            : isExpired ? 'bg-red-50/30' : 'hover:bg-slate-50 dark:hover:bg-zinc-900'
                                        }`}
                                    >
                                        <td className={`p-4 text-center font-bold ${isSelected ? 'text-white' : 'text-gray-400'}`}>
                                            {idx + 1}
                                        </td>
                                        <td className="p-4">
                                            <span className={`${matrixRowTextStyle} font-mono tracking-wider ${isSelected ? 'text-white' : 'text-primary'}`}>
                                                {batch.batch}
                                            </span>
                                            {isExpired && (
                                                <span className="ml-2 px-1.5 py-0.5 bg-red-600 text-white text-[9px] font-black uppercase rounded-none">Expired</span>
                                            )}
                                        </td>
                                        <td className={`p-4 text-center ${matrixRowTextStyle} ${isSelected ? 'text-white' : 'text-gray-700 dark:text-gray-300'}`}>
                                            {batch.expiry}
                                        </td>
                                        <td className={`p-4 text-right ${matrixRowTextStyle} ${isSelected ? 'text-white' : (batch.stock <= 0 ? 'text-red-500' : 'text-emerald-700')}`}>
                                            {batch.stock}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
                
                {/* Shortcut Information Footer */}
                <div className="p-4 bg-gray-100 dark:bg-zinc-900 border-t-2 border-app-border flex justify-between items-center px-6">
                    <div className="flex items-center gap-4">
                        <div className="flex items-center gap-1.5">
                            <span className="px-2 py-0.5 bg-white dark:bg-zinc-800 border border-gray-300 rounded-none font-mono text-[10px] font-black shadow-sm">↑ ↓</span>
                            <span className="text-[10px] font-black text-gray-400 uppercase tracking-tighter">Navigate</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                            <span className="px-2 py-0.5 bg-white dark:bg-zinc-800 border border-gray-300 rounded-none font-mono text-[10px] font-black shadow-sm">ENT</span>
                            <span className="text-[10px] font-black text-gray-400 uppercase tracking-tighter">Confirm</span>
                        </div>
                    </div>
                    <button 
                        onClick={onClose} 
                        className="text-[11px] font-black uppercase tracking-widest text-red-600 hover:bg-red-50 px-3 py-1.5 transition-colors"
                    >
                        Cancel (Esc)
                    </button>
                </div>
            </div>
        </Modal>
    );
};

export default BatchSelectionModal;
