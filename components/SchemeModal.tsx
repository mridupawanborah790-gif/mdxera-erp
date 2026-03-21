import React, { useState, useEffect, useRef } from 'react';
import Modal from './Modal';
import type { BillItem } from '../types';
import { handleEnterToNextField } from '../utils/navigation';

interface SchemeModalProps {
    isOpen: boolean;
    onClose: () => void;
    item: BillItem;
    schemeCalculationBasis: 'before_discount' | 'after_discount';
    onApply: (itemId: string, schemeQty: number, mode: 'flat' | 'percent' | 'price_override' | 'free_qty' | 'qty_ratio', value: number, discountAmount: number, discountPercent: number, freeQuantity: number, schemeCalculationBasis: 'before_discount' | 'after_discount', schemeTotalQty?: number, schemeDisplayPercent?: number) => void;
    onClear: (itemId: string) => void;
}

const parseSchemeRule = (value: string): { freeQty: number; requiredQty: number } | null => {
    const normalized = value.toLowerCase().trim();
    if (!normalized) return null;

    const inMatch = normalized.match(/^(\d+(?:\.\d+)?)\s*in\s*(\d+(?:\.\d+)?)$/);
    if (inMatch) {
        const freeQty = Number(inMatch[1]);
        const requiredQty = Number(inMatch[2]);
        if (freeQty > 0 && requiredQty > 0) return { freeQty, requiredQty };
    }

    const plusMatch = normalized.match(/^(\d+(?:\.\d+)?)\s*\+\s*(\d+(?:\.\d+)?)$/);
    if (plusMatch) {
        const requiredQty = Number(plusMatch[1]);
        const freeQty = Number(plusMatch[2]);
        if (freeQty > 0 && requiredQty > 0) return { freeQty, requiredQty };
    }

    return null;
};

const parsePercentRule = (value: string): number | null => {
    const normalized = value.toLowerCase().trim();
    if (!normalized) return null;

    const percentMatch = normalized.match(/^(\d+(?:\.\d+)?)\s*%\s*(scheme)?$/);
    if (!percentMatch) return null;

    const percent = Number(percentMatch[1]);
    if (percent <= 0) return null;
    return percent;
};

const calculateSchemeDisplayPercent = (params: { mode: 'flat' | 'percent' | 'price_override' | 'free_qty' | 'qty_ratio'; value: number; schemeQty: number; schemeTotalQty?: number; billedQty: number; discountPercent: number; }): number => {
    const { mode, value, schemeQty, schemeTotalQty, billedQty, discountPercent } = params;

    if (mode === 'percent') return Math.max(0, value);

    if (mode === 'flat') {
        return Math.max(0, Number(discountPercent || 0));
    }

    if (mode === 'qty_ratio') {
        const totalQty = Math.max(0, Number(schemeTotalQty || 0));
        const freeQty = Math.max(0, Number(schemeQty || 0));
        if (totalQty <= 0) return 0;
        return (freeQty / totalQty) * 100;
    }

    if (mode === 'free_qty') {
        const billed = Math.max(0, Number(billedQty || 0));
        const freeQty = Math.max(0, Number(schemeQty || 0));
        if (billed <= 0) return 0;
        return (Math.min(freeQty, billed) / billed) * 100;
    }

    return 0;
};


const SchemeModal: React.FC<SchemeModalProps> = ({ isOpen, onClose, item, schemeCalculationBasis, onApply, onClear }) => {
    const [schemeRule, setSchemeRule] = useState('');
    const [selectedRule, setSelectedRule] = useState('custom');
    const [schemePercent, setSchemePercent] = useState<number>(0);
    const [schemeRate, setSchemeRate] = useState<number>(0);
    const firstInputRef = useRef<HTMLSelectElement>(null);

    useEffect(() => {
        if (!isOpen) return;

        if (item.schemeMode === 'qty_ratio' && (item.schemeQty || 0) > 0 && (item.schemeTotalQty || 0) > 0) {
            setSchemeRule(`${item.schemeQty} in ${item.schemeTotalQty}`);
            setSelectedRule('custom');
            setSchemePercent(0);
            setSchemeRate(0);
        } else if (item.schemeMode === 'percent' && (item.schemeValue || 0) > 0) {
            setSchemePercent(item.schemeValue || 0);
            setSchemeRule('');
            setSelectedRule('custom');
            setSchemeRate(0);
        } else {
            setSchemeRule('');
            setSelectedRule('custom');
            setSchemePercent(item.schemeDiscountPercent || 0);
            setSchemeRate(0);
        }

        // Auto focus the select box on open
        const timer = setTimeout(() => {
            firstInputRef.current?.focus();
        }, 150);
        return () => clearTimeout(timer);
    }, [isOpen, item]);

    const unitsPerPack = item.unitsPerPack || 1;
    const billedQty = Math.max(0, (item.quantity || 0) + ((item.looseQuantity || 0) / unitsPerPack));
    const baseRate = item.rate ?? item.mrp ?? 0;
    const tradeDiscountFactor = 1 - ((item.discountPercent || 0) / 100);
    const netRate = baseRate * tradeDiscountFactor;
    const lineSubtotal = billedQty * netRate;
    const lineGross = billedQty * baseRate;
    const schemeBaseAmount = schemeCalculationBasis === 'before_discount' ? lineGross : lineSubtotal;
    const schemeBaseRate = billedQty > 0 ? (schemeBaseAmount / billedQty) : 0;

    const parsedRule = parseSchemeRule(schemeRule);
    const parsedPercentRule = parsePercentRule(schemeRule);

    const computed = (() => {
        if (schemeRate > 0) {
            const discountAmount = Math.min(lineSubtotal, billedQty * schemeRate);
            const discountPercent = schemeBaseAmount > 0 ? (discountAmount / schemeBaseAmount) * 100 : 0;
            const freeQuantity = schemeBaseRate > 0 ? discountAmount / schemeBaseRate : 0;
            return { mode: 'flat' as const, discountPercent, discountAmount, schemeQty: billedQty, schemeTotalQty: undefined, value: schemeRate, freeQuantity };
        }

        if (schemePercent > 0 || (parsedPercentRule || 0) > 0) {
            const resolvedPercent = schemePercent > 0 ? schemePercent : (parsedPercentRule || 0);
            const discountAmount = Math.min(lineSubtotal, schemeBaseAmount * (resolvedPercent / 100));
            const freeQuantity = schemeBaseRate > 0 ? discountAmount / schemeBaseRate : 0;
            return {
                mode: 'percent' as const,
                discountPercent: resolvedPercent,
                discountAmount,
                schemeQty: billedQty,
                schemeTotalQty: undefined,
                value: resolvedPercent,
                freeQuantity,
            };
        }

        if (parsedRule) {
            const ruleApplications = Math.floor(billedQty / parsedRule.requiredQty);
            const freeQuantity = ruleApplications * parsedRule.freeQty;
            const discountAmount = Math.min(lineSubtotal, freeQuantity * schemeBaseRate);
            const benefitPercent = schemeBaseAmount > 0 ? (discountAmount / schemeBaseAmount) * 100 : 0;
            return {
                mode: 'qty_ratio' as const,
                discountPercent: benefitPercent,
                discountAmount,
                schemeQty: parsedRule.freeQty,
                schemeTotalQty: parsedRule.requiredQty,
                value: parsedRule.freeQty,
                freeQuantity,
            };
        }

        return { mode: null, discountPercent: 0, discountAmount: 0, schemeQty: 0, schemeTotalQty: undefined, value: 0, freeQuantity: 0 };
    })();

    const schemeDisplayPercent = computed.mode
        ? calculateSchemeDisplayPercent({
            mode: computed.mode,
            value: computed.value,
            schemeQty: computed.schemeQty,
            schemeTotalQty: computed.schemeTotalQty,
            billedQty,
            discountPercent: computed.discountPercent,
        })
        : 0;

    const handleApply = (e?: React.FormEvent) => {
        if (e) {
            e.preventDefault();
            e.stopPropagation();
        }
        
        if (!computed.mode) {
            onClear(item.id);
            onClose();
            return;
        }

        onApply(
            item.id,
            computed.schemeQty,
            computed.mode,
            computed.value,
            computed.discountAmount,
            computed.discountPercent,
            computed.freeQuantity,
            schemeCalculationBasis,
            computed.schemeTotalQty,
            schemeDisplayPercent
        );
        onClose();
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Scheme Rule" widthClass="max-w-md">
            <form onSubmit={handleApply} onKeyDown={handleEnterToNextField} className="flex flex-col h-full">
                <div className="space-y-4 p-4 flex-1 overflow-y-auto">
                    <div className="text-xs text-gray-500 uppercase font-bold">{item.name}</div>
                    <div className="text-[10px] font-black uppercase text-indigo-700 bg-indigo-50 border border-indigo-200 rounded px-2 py-1 inline-flex">
                        Basis: {schemeCalculationBasis === 'after_discount' ? 'After Disc%' : 'Before Discount'}
                    </div>

                    <div>
                        <label className="block text-[10px] font-black uppercase text-gray-400 mb-1">Quick Scheme</label>
                        <select
                            ref={firstInputRef}
                            value={selectedRule}
                            onChange={(e) => {
                                const nextRule = e.target.value;
                                setSelectedRule(nextRule);
                                if (nextRule === 'custom') return;
                                setSchemeRule(nextRule.includes('%') ? '' : nextRule);
                                setSchemePercent(nextRule.includes('%') ? Number(nextRule.replace('%', '')) : 0);
                                setSchemeRate(0);
                            }}
                            className="w-full p-2 border border-gray-300 bg-white focus:bg-yellow-50 outline-none text-sm font-bold"
                        >
                            <option value="custom">Custom (Manual Entry)</option>
                            <option value="10+1">10+1 (Free Qty)</option>
                            <option value="1 in 10">1 in 10 (Ratio)</option>
                            <option value="100%">100% scheme</option>
                        </select>
                    </div>

                    <div>
                        <label className="block text-[10px] font-black uppercase text-gray-400 mb-1">Scheme format</label>
                        <input
                            type="text"
                            value={schemeRule}
                            onChange={(e) => {
                                setSchemeRule(e.target.value);
                                if (e.target.value.trim()) {
                                    setSchemePercent(0);
                                    setSchemeRate(0);
                                    setSelectedRule('custom');
                                }
                            }}
                            placeholder="e.g. 1 in 10 or 10+1"
                            className="w-full p-2 border border-gray-300 bg-white focus:bg-yellow-50 outline-none text-sm font-bold uppercase"
                        />
                    </div>

                    <div className="text-center text-[10px] font-black text-gray-300">--- OR ---</div>

                    <div>
                        <label className="block text-[10px] font-black uppercase text-gray-400 mb-1">Scheme %</label>
                        <input
                            type="number"
                            value={schemePercent === 0 ? '' : schemePercent}
                            onChange={(e) => {
                                const value = parseFloat(e.target.value) || 0;
                                setSchemePercent(Math.max(0, value));
                                if (value > 0) {
                                    setSchemeRule('');
                                    setSchemeRate(0);
                                    setSelectedRule('custom');
                                }
                            }}
                            placeholder="5"
                            className="w-full p-2 border border-gray-300 bg-white focus:bg-yellow-50 outline-none text-sm font-bold"
                        />
                    </div>

                    <div>
                        <label className="block text-[10px] font-black uppercase text-gray-400 mb-1">Scheme Rate (₹ per unit)</label>
                        <input
                            type="number"
                            value={schemeRate === 0 ? '' : schemeRate}
                            onChange={(e) => {
                                const value = parseFloat(e.target.value) || 0;
                                setSchemeRate(Math.max(0, value));
                                if (value > 0) {
                                    setSchemePercent(0);
                                    setSchemeRule('');
                                    setSelectedRule('custom');
                                }
                            }}
                            placeholder="0.00"
                            className="w-full p-2 border border-gray-300 bg-white focus:bg-yellow-50 outline-none text-sm font-bold"
                        />
                    </div>

                    <div className="rounded border border-dashed border-emerald-300 bg-emerald-50 p-3 text-xs font-bold space-y-1">
                        <div className="flex justify-between text-emerald-800"><span>SCH% BENEFIT</span><span>{schemeDisplayPercent.toFixed(2)}%</span></div>
                        <div className="flex justify-between text-emerald-800"><span>FREE QUANTITY</span><span>{computed.freeQuantity.toFixed(2)}</span></div>
                        <div className="flex justify-between text-emerald-900 font-black"><span>TOTAL BENEFIT</span><span>₹{computed.discountAmount.toFixed(2)}</span></div>
                    </div>
                </div>

                <div className="flex justify-between items-center p-4 border-t border-gray-200 bg-gray-50 flex-shrink-0">
                    <button 
                        type="button" 
                        tabIndex={-1} 
                        onClick={() => { onClear(item.id); onClose(); }} 
                        className="px-4 py-2 text-[10px] font-black uppercase text-red-600 hover:bg-red-50 transition-colors"
                    >
                        Clear Scheme
                    </button>
                    <div className="flex gap-2">
                        <button 
                            type="button" 
                            tabIndex={-1} 
                            onClick={onClose} 
                            className="px-4 py-2 text-[10px] font-black uppercase text-gray-500 hover:bg-gray-100 transition-colors"
                        >
                            Cancel
                        </button>
                        <button 
                            type="submit" 
                            className="px-6 py-2 bg-primary text-white text-[10px] font-black uppercase shadow-md hover:bg-primary-dark transition-all active:scale-95"
                        >
                            Apply (Enter)
                        </button>
                    </div>
                </div>
            </form>
        </Modal>
    );
};

export default SchemeModal;
