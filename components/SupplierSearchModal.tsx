
import React, { useState, useMemo, useEffect, useRef } from 'react';
import Modal from './Modal';
import { Distributor } from '../types';
import { fuzzyMatch } from '../utils/search';
import { getOutstandingBalance } from '../utils/helpers';
import SupplierLedgerModal from './SupplierLedgerModal';

interface SupplierSearchModalProps {
    isOpen: boolean;
    onClose: () => void;
    distributors: Distributor[];
    onSelect: (distributor: Distributor) => void;
    initialSearch?: string;
}

const uniformTextStyle = "text-2xl font-normal tracking-tight uppercase leading-tight";

const SupplierSearchModal: React.FC<SupplierSearchModalProps> = ({ isOpen, onClose, distributors, onSelect, initialSearch = '' }) => {
    const [searchTerm, setSearchTerm] = useState(initialSearch);
    const [selectedIndex, setSelectedIndex] = useState(0);
    const [isLedgerModalOpen, setIsLedgerModalOpen] = useState(false);
    const searchInputRef = useRef<HTMLInputElement>(null);
    const resultsContainerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (isOpen) {
            setSearchTerm(initialSearch);
            setSelectedIndex(0);
            setTimeout(() => searchInputRef.current?.focus(), 150);
        }
    }, [isOpen, initialSearch]);

    const filtered = useMemo(() => {
        /* Fix: Rename d.isActive to d.is_active */
        const active = distributors.filter(d => d.is_active !== false);
        if (!searchTerm.trim()) return active;
        return active.filter(d =>
            fuzzyMatch(d.name, searchTerm) ||
            /* Fix: Rename d.gstNumber to d.gst_number */
            fuzzyMatch(d.gst_number, searchTerm) ||
            fuzzyMatch(d.phone, searchTerm)
        );
    }, [distributors, searchTerm]);

    useEffect(() => {
        if (resultsContainerRef.current) {
            const activeRow = resultsContainerRef.current.querySelector(`[data-index="${selectedIndex}"]`);
            if (activeRow) {
                activeRow.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
            }
        }
    }, [selectedIndex]);

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (isLedgerModalOpen) return;

        if (e.key === 'ArrowDown') {
            e.preventDefault();
            setSelectedIndex(prev => (prev + 1) % Math.max(1, filtered.length));
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setSelectedIndex(prev => (prev - 1 + filtered.length) % Math.max(1, filtered.length));
        } else if (e.key === 'Enter') {
            e.preventDefault();
            if (filtered[selectedIndex]) {
                onSelect(filtered[selectedIndex]);
            }
        } else if (e.key === 'F4') {
            e.preventDefault();
            if (filtered[selectedIndex]) {
                setIsLedgerModalOpen(true);
            }
        } else if (e.key === 'Escape') {
            e.preventDefault();
            onClose();
        }
    };

    if (!isOpen) return null;

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Master Supplier Directory">
            <div className="flex flex-col h-full bg-[#fffde7] dark:bg-zinc-950 outline-none" onKeyDown={handleKeyDown}>
                <div className="py-2 px-4 bg-primary text-white flex-shrink-0 flex justify-between items-center">
                    <div className="flex items-center gap-3">
                        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9h18v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V9Z" /><path d="m3 9 2.45-4.9A2 2 0 0 1 7.24 3h9.52a2 2 0 0 1 1.8 1.1L21 9" /><path d="M12 3v6" /></svg>
                        <span className="text-xs font-black uppercase tracking-[0.2em]">Supplier Selection Matrix</span>
                    </div>
                    <span className="text-[10px] font-bold uppercase opacity-70">↑/↓ Navigate | F4 Ledger | Enter Select | Esc Close</span>
                </div>

                <div className="p-2 bg-white dark:bg-zinc-900 border-b-2 border-primary/10">
                    <input
                        ref={searchInputRef}
                        type="text"
                        value={searchTerm}
                        onChange={e => setSearchTerm(e.target.value)}
                        placeholder="Search Supplier Name or GSTIN..."
                        className="w-full p-2 border-2 border-primary/20 bg-white text-base font-black focus:border-primary outline-none shadow-inner uppercase tracking-tighter"
                    />
                </div>

                <div className="flex-1 overflow-auto bg-white" ref={resultsContainerRef}>
                    {filtered.length > 0 ? (
                        <table className="min-w-full border-collapse">
                            <thead className="sticky top-0 z-10 bg-gray-100 border-b border-gray-400 shadow-sm">
                                <tr className="text-[10px] font-black uppercase text-gray-500 tracking-widest h-10">
                                    <th className="p-2 px-4 text-left border-r border-gray-200">Legal Name of Supplier</th>
                                    <th className="p-2 px-4 text-center border-r border-gray-200 w-48">GSTIN</th>
                                    <th className="p-2 px-4 text-right">Balance</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filtered.map((dist, idx) => {
                                    const isSelected = idx === selectedIndex;
                                    const balance = getOutstandingBalance(dist);
                                    return (
                                        <tr
                                            key={dist.id}
                                            data-index={idx}
                                            onClick={() => onSelect(dist)}
                                            onMouseEnter={() => setSelectedIndex(idx)}
                                            className={`cursor-pointer transition-all border-b border-gray-100 h-12 ${isSelected ? 'bg-primary text-white z-10 shadow-xl scale-[1.01]' : 'hover:bg-yellow-50'}`}
                                        >
                                            <td className="p-2 px-4 border-r border-gray-200">
                                                <p className={`leading-none ${uniformTextStyle} ${isSelected ? 'text-white' : 'text-gray-950'}`}>{dist.name}</p>
                                            </td>
                                            <td className={`p-2 px-4 border-r border-gray-200 text-center font-mono ${uniformTextStyle} ${isSelected ? 'text-white' : 'text-primary'}`}>
                                                {/* Fix: Rename dist.gstNumber to dist.gst_number */}
                                                {dist.gst_number || 'N/A'}
                                            </td>
                                            <td className={`p-2 px-4 text-right ${uniformTextStyle} ${isSelected ? 'text-white' : (balance > 0 ? 'text-red-600' : 'text-emerald-700')}`}>
                                                ₹{balance.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    ) : (
                        <div className="h-full flex flex-col items-center justify-center opacity-20 p-20 text-center">
                            <svg xmlns="http://www.w3.org/2000/svg" width="80" height="80" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="mb-4"><circle cx="12" cy="12" r="10" /><line x1="15" y1="9" x2="9" y2="15" /><line x1="9" y1="9" x2="15" y2="15" /></svg>
                            <p className="text-2xl font-black uppercase tracking-widest">No Supplier Found</p>
                        </div>
                    )}
                </div>

                <div className="p-4 bg-slate-100 border-t border-app-border flex justify-end gap-3 flex-shrink-0">
                    <button onClick={onClose} className="px-8 py-3 text-[11px] font-black uppercase tracking-widest text-gray-500 hover:text-black">Discard (Esc)</button>
                    <button
                        onClick={() => filtered[selectedIndex] && onSelect(filtered[selectedIndex])}
                        className="px-16 py-4 bg-primary text-white text-[12px] font-black uppercase tracking-[0.3em] shadow-2xl active:translate-y-1 transform transition-all"
                    >
                        Confirm Supplier (Enter)
                    </button>
                </div>
            </div>

            {isLedgerModalOpen && filtered[selectedIndex] && (
                <SupplierLedgerModal
                    isOpen={isLedgerModalOpen}
                    onClose={() => setIsLedgerModalOpen(false)}
                    distributor={filtered[selectedIndex]}
                />
            )}
        </Modal>
    );
};

export default SupplierSearchModal;
