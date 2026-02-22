
import React, { useState, useEffect, useRef } from 'react';
import Modal from './Modal';
import type { BillItem } from '../types';
import { handleEnterToNextField } from '../utils/navigation';

interface SchemeModalProps {
    isOpen: boolean;
    onClose: () => void;
    item: BillItem;
    onApply: (itemId: string, schemeQty: number, mode: 'flat' | 'percent' | 'price_override' | 'free_qty' | 'qty_ratio', value: number, discountAmount: number, discountPercent: number, schemeTotalQty?: number) => void;
    onClear: (itemId: string) => void;
}

const SchemeModal: React.FC<SchemeModalProps> = ({ isOpen, onClose, item, onApply, onClear }) => {
    const [schemeQty, setSchemeQty] = useState<number>(0);
    const [schemeTotalQty, setSchemeTotalQty] = useState<number>(0);
    const [schemeMode, setSchemeMode] = useState<'flat' | 'percent' | 'price_override' | 'free_qty' | 'qty_ratio'>('free_qty');
    const [schemeValue, setSchemeValue] = useState<number>(0);
    const [finalDiscountAmount, setFinalDiscountAmount] = useState<number>(0);

    const modeSelectRef = useRef<HTMLSelectElement>(null);
    const schemeQtyRef = useRef<HTMLInputElement>(null);
    const schemeTotalQtyRef = useRef<HTMLInputElement>(null);
    const schemeValRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (isOpen) {
            setSchemeQty(item.schemeQty || 0);
            setSchemeTotalQty(item.schemeTotalQty || 0);
            setSchemeMode(item.schemeMode || 'free_qty');
            setSchemeValue(item.schemeValue || 0);
            setFinalDiscountAmount(item.schemeDiscountAmount || 0);
            // Focus the mode selector on open
            setTimeout(() => modeSelectRef.current?.focus(), 150);
        }
    }, [isOpen, item]);

    const totalQty = item.quantity;
    const baseRate = item.rate ?? item.mrp ?? 0;
    const tradeDiscountPercent = item.discountPercent || 0;
    const netRate = baseRate * (1 - tradeDiscountPercent / 100);
    
    useEffect(() => {
        let calculatedTotalDiscount = 0;
        const calculationBasis = netRate;

        if (schemeMode === 'free_qty') {
            calculatedTotalDiscount = Math.min(schemeQty, totalQty) * calculationBasis;
        } else if (schemeMode === 'qty_ratio' && schemeTotalQty > 0) {
            const effectivePercent = (schemeQty / schemeTotalQty);
            calculatedTotalDiscount = (totalQty * calculationBasis) * effectivePercent;
        } else if (schemeMode === 'flat') {
            calculatedTotalDiscount = Math.min(schemeQty, totalQty) * schemeValue;
        } else if (schemeMode === 'percent') {
            calculatedTotalDiscount = Math.min(schemeQty, totalQty) * (calculationBasis * (schemeValue / 100));
        } else if (schemeMode === 'price_override') {
            calculatedTotalDiscount = Math.min(schemeQty, totalQty) * Math.max(0, calculationBasis - schemeValue);
        }

        const lineTotalBeforeScheme = totalQty * calculationBasis;
        setFinalDiscountAmount(Math.min(calculatedTotalDiscount, lineTotalBeforeScheme));

    }, [schemeQty, schemeTotalQty, schemeMode, schemeValue, totalQty, netRate]);

    const handleSave = () => {
        if (finalDiscountAmount > 0) {
            let effectivePercent = 0;
            const discountedSubtotal = netRate * totalQty;
            
            if (schemeMode === 'percent') {
                effectivePercent = schemeValue;
            } else if (schemeMode === 'qty_ratio' && schemeTotalQty > 0) {
                effectivePercent = (schemeQty / schemeTotalQty) * 100;
            } else if (discountedSubtotal > 0) {
                effectivePercent = (finalDiscountAmount / discountedSubtotal) * 100;
            }
            
            onApply(item.id, schemeQty, schemeMode, schemeValue, finalDiscountAmount, effectivePercent, schemeTotalQty);
        } else {
            onClear(item.id);
        }
        onClose();
    };

    const handlePopupKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
        if (e.key === 'Enter') {
            const target = e.target as HTMLElement;
            
            // 1. If explicit "Apply" button is focused, save.
            if (target.tagName === 'BUTTON' && target.innerText.includes('Apply')) {
                handleSave();
                return;
            }

            // 2. Immediate Save Logic based on current mode visibility
            if (schemeMode === 'free_qty') {
                // This mode only has one input: schemeQty
                if (target === schemeQtyRef.current) {
                    handleSave();
                    return;
                }
            } else if (schemeMode === 'qty_ratio') {
                // This mode has two inputs: schemeQty -> schemeTotalQty
                if (target === schemeTotalQtyRef.current) {
                    handleSave();
                    return;
                }
            } else if (['flat', 'percent', 'price_override'].includes(schemeMode)) {
                // These modes have two inputs: schemeQty -> schemeValue
                if (target === schemeValRef.current) {
                    handleSave();
                    return;
                }
            }
            
            // Default: Move to next field
            handleEnterToNextField(e);
        }

        // Arrow Key Navigation between fields
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            const target = e.target as HTMLElement;
            // Don't intercept if it's a select element (Standard behavior is to change options)
            if (target.tagName === 'SELECT') return;

            e.preventDefault();
            const focusableSelector = 'input:not([disabled]):not([readonly]), select:not([disabled]), button:not([disabled])';
            const focusables = Array.from(e.currentTarget.querySelectorAll(focusableSelector)) as HTMLElement[];
            const currentIndex = focusables.indexOf(target);

            if (e.key === 'ArrowDown' && currentIndex < focusables.length - 1) {
                focusables[currentIndex + 1].focus();
                if (focusables[currentIndex + 1] instanceof HTMLInputElement) (focusables[currentIndex + 1] as HTMLInputElement).select();
            } else if (e.key === 'ArrowUp' && currentIndex > 0) {
                focusables[currentIndex - 1].focus();
                if (focusables[currentIndex - 1] instanceof HTMLInputElement) (focusables[currentIndex - 1] as HTMLInputElement).select();
            }
        }
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={`Pricing Strategy & Schemes`} widthClass="max-w-md" heightClass="h-auto">
            <div className="p-8 font-normal" onKeyDown={handlePopupKeyDown}>
                <div className="bg-slate-50 dark:bg-slate-800 p-5 border-2 border-app-border mb-8 flex justify-between items-center rounded-none shadow-inner font-normal">
                    <div>
                        <p className="text-[10px] font-normal text-gray-400 uppercase tracking-widest leading-none mb-1.5">Product</p>
                        <p className="text-base font-normal text-gray-900 dark:text-white uppercase truncate max-w-[220px]">{item.name}</p>
                    </div>
                    <div className="text-right">
                        <p className="text-[10px] font-normal text-gray-400 uppercase tracking-widest leading-none mb-1.5">Net Base Rate</p>
                        <p className="text-lg font-normal text-primary">₹{netRate.toFixed(2)}</p>
                    </div>
                </div>

                <div className="space-y-6">
                    <div>
                        <label className="block text-[11px] font-normal text-gray-400 uppercase mb-2 ml-1 tracking-widest">Calculation Mode</label>
                        <select 
                            ref={modeSelectRef}
                            value={schemeMode} 
                            onChange={e => { setSchemeMode(e.target.value as any); }} 
                            className="w-full p-3 border-2 border-app-border rounded-none bg-input-bg font-normal text-sm focus:ring-4 focus:ring-primary/5 focus:border-primary outline-none appearance-none"
                        >
                            <option value="qty_ratio">Ratio Benefit (e.g. 1 in 10)</option>
                            <option value="free_qty">100% Off (Specific Free Units)</option>
                            <option value="percent">Percentage Off (%)</option>
                            <option value="flat">Cash Discount (₹)</option>
                            <option value="price_override">Net Unit Override (₹)</option>
                        </select>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div className={schemeMode === 'qty_ratio' ? 'col-span-1' : 'col-span-2'}>
                            <label className="block text-[11px] font-normal text-gray-400 uppercase mb-2 ml-1 tracking-widest">
                                {schemeMode === 'qty_ratio' ? 'Free Units' : 'Applied Units'}
                            </label>
                            <input 
                                ref={schemeQtyRef}
                                type="number" 
                                value={schemeQty === 0 ? '' : schemeQty} 
                                onChange={e => { setSchemeQty(parseFloat(e.target.value) || 0); }} 
                                className="w-full p-3 border-2 border-app-border rounded-none bg-input-bg text-xl font-normal focus:border-primary outline-none no-spinner shadow-sm"
                            />
                        </div>

                        {schemeMode === 'qty_ratio' && (
                            <div className="col-span-1">
                                <label className="block text-[11px] font-normal text-gray-400 uppercase mb-2 ml-1 tracking-widest">In Total</label>
                                <input 
                                    ref={schemeTotalQtyRef}
                                    type="number" 
                                    value={schemeTotalQty === 0 ? '' : schemeTotalQty} 
                                    onChange={e => { setSchemeTotalQty(parseFloat(e.target.value) || 0); }} 
                                    className="w-full p-3 border-2 border-app-border rounded-none bg-input-bg text-xl font-normal focus:border-primary outline-none no-spinner shadow-sm"
                                />
                            </div>
                        )}

                        {['flat', 'percent', 'price_override'].includes(schemeMode) && (
                            <div className="col-span-2">
                                <label className="block text-[11px] font-normal text-gray-400 uppercase mb-2 ml-1 tracking-widest">
                                    {schemeMode === 'percent' ? 'Bonus %' : schemeMode === 'price_override' ? 'Override Price (₹)' : 'Reduction (₹)'}
                                </label>
                                <input 
                                    ref={schemeValRef}
                                    type="number" 
                                    value={schemeValue === 0 ? '' : schemeValue} 
                                    onChange={e => { setSchemeValue(parseFloat(e.target.value) || 0); }} 
                                    className="w-full p-3 border-2 border-app-border rounded-none bg-input-bg text-xl font-normal focus:border-primary outline-none no-spinner shadow-sm"
                                />
                            </div>
                        )}
                    </div>
                </div>
            </div>
            
            <div className="flex justify-between items-center p-6 bg-gray-100 dark:bg-gray-900 border-t-2 border-app-border rounded-none font-normal">
                <button onClick={() => { onClear(item.id); onClose(); }} className="px-6 py-3 text-[11px] font-normal text-red-600 uppercase tracking-[0.2em] hover:bg-red-50 transition-colors">Discard Strategy</button>
                <div className="flex gap-4">
                    <button onClick={onClose} className="px-8 py-3 text-[11px] font-normal text-gray-500 uppercase tracking-[0.2em] hover:text-gray-950 transition-colors">Cancel</button>
                    <button onClick={handleSave} className="px-12 py-4 bg-primary text-white font-normal rounded-none shadow-2xl shadow-primary/30 hover:bg-primary-dark transition-all transform active:scale-95 uppercase tracking-[0.2em] text-[11px]">Apply To Billing</button>
                </div>
            </div>
        </Modal>
    );
};

export default SchemeModal;
