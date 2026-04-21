import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import type { PurchaseItem } from '../../../core/types/types';
import { normalizeImportDate, formatExpiryToMMYY } from '../../../core/utils/helpers';

interface BatchDetailModalProps {
    isOpen: boolean;
    onClose: () => void;
    item: PurchaseItem | null;
    onSave: (id: string, batch: string, expiry: string) => void;
}

const BatchDetailModal: React.FC<BatchDetailModalProps> = ({ isOpen, onClose, item, onSave }) => {
    const [batch, setBatch] = useState('');
    const [expiry, setExpiry] = useState('');
    const batchInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (isOpen && item) {
            setBatch(item.batch || '');
            setExpiry(formatExpiryToMMYY(item.expiry) || '');
            // Auto-focus the batch field with a small delay for animation
            setTimeout(() => batchInputRef.current?.focus(), 150);
        }
    }, [isOpen, item]);

    if (!isOpen || !item) return null;

    const handleSave = () => {
        // Use normalizeImportDate to convert shorthand MM/YY to full Postgres DATE
        const finalExpiry = normalizeImportDate(expiry) || '';
        onSave(item.id, batch, finalExpiry);
        onClose();
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
            if (document.activeElement === batchInputRef.current) {
                // Focus expiry if enter pressed on batch
                const expiryInput = document.getElementById('sheet-expiry') as HTMLInputElement;
                expiryInput?.focus();
            } else {
                handleSave();
            }
        } else if (e.key === 'Escape') {
            onClose();
        }
    };

    const formatExpiryMask = (value: string) => {
        const cleaned = value.replace(/\D/g, '');
        if (cleaned.length === 0) return '';
        let month = cleaned.slice(0, 2);
        let year = cleaned.slice(2, 4);
        if (month.length === 2) {
            let m = parseInt(month);
            if (m > 12) month = '12';
            if (m === 0) month = '01';
        } else if (month.length === 1 && parseInt(month) > 1) {
            month = '0' + month;
        }
        if (cleaned.length > 2) return `${month}/${year}`;
        return month;
    };

    return createPortal(
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in duration-300 p-4" onClick={onClose}>
            <div 
                className="w-full max-w-xl bg-white dark:bg-gray-900 rounded-none shadow-[0_20px_50px_rgba(0,0,0,0.3)] p-10 animate-in zoom-in-95 fade-in duration-300"
                onClick={e => e.stopPropagation()}
                onKeyDown={handleKeyDown}
            >
                <div className="mb-8">
                    <p className="text-[11px] font-black text-primary uppercase tracking-[0.25em] mb-2">Stock Details Required</p>
                    <h3 className="text-3xl font-black text-gray-900 dark:text-white leading-tight uppercase truncate">
                        {item.name || 'Manual Product'}
                    </h3>
                    <p className="text-sm font-bold text-gray-400 mt-1">{item.brand || 'No Brand specified'}</p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-1.5">
                        <label className="block text-xs font-black text-gray-500 uppercase tracking-widest ml-1">Batch Number</label>
                        <input 
                            ref={batchInputRef}
                            type="text" 
                            value={batch}
                            onChange={e => setBatch(e.target.value.toUpperCase())}
                            placeholder="e.g. B24X90"
                            className="w-full p-4 text-xl font-mono font-black border-2 border-app-border rounded-none bg-input-bg focus:border-primary focus:ring-4 focus:ring-primary/10 outline-none transition-all uppercase shadow-sm"
                        />
                    </div>

                    <div className="space-y-1.5">
                        <label className="block text-xs font-black text-gray-500 uppercase tracking-widest ml-1">Expiry Date (MM/YY)</label>
                        <input 
                            id="sheet-expiry"
                            type="text" 
                            value={expiry}
                            onChange={e => setExpiry(formatExpiryMask(e.target.value))}
                            placeholder="MM/YY"
                            maxLength={5}
                            className="w-full p-4 text-xl font-black border-2 border-app-border rounded-none bg-input-bg focus:border-primary focus:ring-4 focus:ring-primary/10 outline-none transition-all shadow-sm"
                        />
                    </div>
                </div>

                <div className="mt-12 flex gap-4">
                    <button 
                        onClick={onClose}
                        className="flex-1 py-4 text-sm font-black uppercase tracking-widest text-gray-400 hover:text-gray-600 transition-colors"
                    >
                        Skip
                    </button>
                    <button 
                        onClick={handleSave}
                        className="flex-[2] py-5 bg-primary text-white font-black rounded-none shadow-xl shadow-primary/30 hover:bg-primary-dark transition-all transform active:scale-95 uppercase tracking-widest text-lg"
                    >
                        Confirm & Save
                    </button>
                </div>

                <div className="mt-8 text-center border-t border-app-border pt-4">
                    <span className="text-[10px] font-bold text-gray-400 uppercase tracking-tighter">
                        Press <span className="bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 rounded-none border border-app-border text-gray-600 font-mono">Enter ↵</span> to navigate faster
                    </span>
                </div>
            </div>
        </div>,
        document.body
    );
};

export default BatchDetailModal;
