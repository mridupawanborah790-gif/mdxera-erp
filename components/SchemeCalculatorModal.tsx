import React, { useState, useEffect, useRef } from 'react';
import Modal from './Modal';

interface SchemeCalculatorModalProps {
    isOpen: boolean;
    onClose: () => void;
    baseRate: number;
    onApply: (effectiveRate: number) => void;
}

const SchemeCalculatorModal: React.FC<SchemeCalculatorModalProps> = ({ isOpen, onClose, baseRate, onApply }) => {
    const [rate, setRate] = useState(baseRate);
    const [schemeString, setSchemeString] = useState('10+1');
    const [purchaseQty, setPurchaseQty] = useState(10);
    const [freeQty, setFreeQty] = useState(1);
    
    const rateRef = useRef<HTMLInputElement>(null);
    const schemeRef = useRef<HTMLInputElement>(null);
    const purQtyRef = useRef<HTMLInputElement>(null);
    const freeQtyRef = useRef<HTMLInputElement>(null);
    const applyBtnRef = useRef<HTMLButtonElement>(null);

    useEffect(() => {
        if (isOpen) {
            setRate(baseRate);
            setSchemeString('10+1');
            setPurchaseQty(10);
            setFreeQty(1);
            setTimeout(() => {
                schemeRef.current?.focus();
                schemeRef.current?.select();
            }, 100);
        }
    }, [isOpen, baseRate]);

    const handleSchemeStringChange = (val: string) => {
        setSchemeString(val);
        const match = val.match(/^(\d+)\+(\d+)$/);
        if (match) {
            setPurchaseQty(Number(match[1]));
            setFreeQty(Number(match[2]));
        }
    };

    const effectiveRate = (purchaseQty + freeQty) > 0 
        ? (rate * purchaseQty) / (purchaseQty + freeQty)
        : rate;

    const handleApply = () => {
        onApply(Number(effectiveRate.toFixed(2)));
        onClose();
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Escape') {
            e.preventDefault();
            onClose();
            return;
        }

        if (e.key === 'Enter') {
            const target = e.target as HTMLElement;
            
            // If Ctrl+Enter OR Enter on Apply button OR Enter on the last input (Free Qty)
            if (e.ctrlKey || target === applyBtnRef.current || target === freeQtyRef.current) {
                e.preventDefault();
                handleApply();
                return;
            }

            // Normal Enter navigation
            e.preventDefault();
            if (target === rateRef.current) schemeRef.current?.focus();
            else if (target === schemeRef.current) purQtyRef.current?.focus();
            else if (target === purQtyRef.current) freeQtyRef.current?.focus();
            else if (target === freeQtyRef.current) applyBtnRef.current?.focus();
        }
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Scheme Calculator" widthClass="max-w-xs">
            <div className="p-4 space-y-4 bg-white dark:bg-gray-800 shadow-xl border border-gray-200 dark:border-gray-700" onKeyDown={handleKeyDown}>
                <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                        <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Base Rate (₹)</label>
                        <input
                            ref={rateRef}
                            type="number"
                            value={rate || ''}
                            onChange={e => setRate(Number(e.target.value))}
                            className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded font-mono bg-transparent dark:text-white focus:ring-1 focus:ring-blue-500 outline-none"
                        />
                    </div>
                    <div className="space-y-1">
                        <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Scheme (e.g. 10+1)</label>
                        <input
                            ref={schemeRef}
                            type="text"
                            value={schemeString}
                            onChange={e => handleSchemeStringChange(e.target.value)}
                            placeholder="10+1"
                            className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded font-mono bg-transparent dark:text-white focus:ring-1 focus:ring-blue-500 outline-none uppercase"
                        />
                    </div>
                </div>

                <div className="flex items-center gap-2 text-xs font-bold text-gray-400 uppercase">
                    <div className="flex-1 h-[1px] bg-gray-200 dark:bg-gray-700"></div>
                    <span>Manual Override</span>
                    <div className="flex-1 h-[1px] bg-gray-200 dark:bg-gray-700"></div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                        <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Pur Qty</label>
                        <input
                            ref={purQtyRef}
                            type="number"
                            value={purchaseQty || ''}
                            onChange={e => setPurchaseQty(Number(e.target.value))}
                            className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded font-mono bg-transparent dark:text-white focus:ring-1 focus:ring-blue-500 outline-none"
                        />
                    </div>
                    <div className="space-y-1">
                        <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Free Qty</label>
                        <input
                            ref={freeQtyRef}
                            type="number"
                            value={freeQty || ''}
                            onChange={e => setFreeQty(Number(e.target.value))}
                            className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded font-mono bg-transparent dark:text-white focus:ring-1 focus:ring-blue-500 outline-none"
                        />
                    </div>
                </div>

                <div className="p-3 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-100 dark:border-emerald-800 rounded">
                    <p className="text-[10px] font-black text-emerald-600 dark:text-emerald-400 uppercase tracking-widest mb-1">Effective Rate</p>
                    <div className="flex items-baseline gap-1">
                        <span className="text-3xl font-black text-emerald-700 dark:text-emerald-300">₹{effectiveRate.toFixed(2)}</span>
                        <span className="text-[10px] font-bold text-emerald-500/50 uppercase">/ UNIT</span>
                    </div>
                </div>

                <button
                    ref={applyBtnRef}
                    onClick={handleApply}
                    className="w-full py-3 bg-emerald-600 text-white font-black uppercase tracking-[0.2em] hover:bg-emerald-700 transition-all shadow-lg active:transform active:scale-95 focus:ring-4 focus:ring-emerald-500/50 outline-none"
                >
                    Apply Rate (Enter)
                </button>
            </div>
        </Modal>
    );
};

export default SchemeCalculatorModal;
