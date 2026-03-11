import React, { useState, useEffect } from 'react';
import Modal from './Modal';
import type { BillItem } from '../types';

interface SchemeModalProps {
    isOpen: boolean;
    onClose: () => void;
    item: BillItem;
    onApply: (itemId: string, schemeQty: number, mode: 'flat' | 'percent' | 'price_override' | 'free_qty' | 'qty_ratio', value: number, discountAmount: number, discountPercent: number, schemeTotalQty?: number) => void;
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

const SchemeModal: React.FC<SchemeModalProps> = ({ isOpen, onClose, item, onApply, onClear }) => {
    const [schemeRule, setSchemeRule] = useState('');
    const [schemePercent, setSchemePercent] = useState<number>(0);

    useEffect(() => {
        if (!isOpen) return;

        if (item.schemeMode === 'qty_ratio' && (item.schemeQty || 0) > 0 && (item.schemeTotalQty || 0) > 0) {
            setSchemeRule(`${item.schemeQty} in ${item.schemeTotalQty}`);
            setSchemePercent(0);
            return;
        }

        if (item.schemeMode === 'percent' && (item.schemeValue || 0) > 0) {
            setSchemePercent(item.schemeValue || 0);
            setSchemeRule('');
            return;
        }

        setSchemeRule('');
        setSchemePercent(item.schemeDiscountPercent || 0);
    }, [isOpen, item]);

    const unitsPerPack = item.unitsPerPack || 1;
    const billedQty = Math.max(0, (item.quantity || 0) + ((item.looseQuantity || 0) / unitsPerPack));
    const baseRate = item.rate ?? item.mrp ?? 0;
    const netRate = baseRate * (1 - ((item.discountPercent || 0) / 100));
    const lineSubtotal = billedQty * netRate;

    const parsedRule = parseSchemeRule(schemeRule);

    const computed = (() => {
        if (schemePercent > 0) {
            const discountAmount = Math.min(lineSubtotal, lineSubtotal * (schemePercent / 100));
            return { mode: 'percent' as const, discountPercent: schemePercent, discountAmount, schemeQty: billedQty, schemeTotalQty: undefined, value: schemePercent };
        }

        if (parsedRule) {
            const benefitPercent = (parsedRule.freeQty / parsedRule.requiredQty) * 100;
            const discountAmount = Math.min(lineSubtotal, lineSubtotal * (benefitPercent / 100));
            return {
                mode: 'qty_ratio' as const,
                discountPercent: benefitPercent,
                discountAmount,
                schemeQty: parsedRule.freeQty,
                schemeTotalQty: parsedRule.requiredQty,
                value: parsedRule.freeQty,
            };
        }

        return { mode: null, discountPercent: 0, discountAmount: 0, schemeQty: 0, schemeTotalQty: undefined, value: 0 };
    })();

    const handleApply = () => {
        if (!computed.mode || computed.discountAmount <= 0) {
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
            computed.schemeTotalQty
        );
        onClose();
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Scheme Rule" widthClass="max-w-xl">
            <div className="space-y-4 p-2">
                <div className="text-xs text-gray-500 uppercase">{item.name}</div>

                <div>
                    <label className="block text-xs font-semibold mb-1">Scheme format</label>
                    <input
                        type="text"
                        value={schemeRule}
                        onChange={(e) => {
                            setSchemeRule(e.target.value);
                            if (e.target.value.trim()) setSchemePercent(0);
                        }}
                        placeholder="1 in 10 or 10+1"
                        className="w-full p-2 border border-app-border bg-input-bg"
                    />
                </div>

                <div className="text-center text-xs text-gray-400">OR</div>

                <div>
                    <label className="block text-xs font-semibold mb-1">Scheme %</label>
                    <input
                        type="number"
                        value={schemePercent === 0 ? '' : schemePercent}
                        onChange={(e) => {
                            const value = parseFloat(e.target.value) || 0;
                            setSchemePercent(Math.max(0, value));
                            if (value > 0) setSchemeRule('');
                        }}
                        placeholder="5"
                        className="w-full p-2 border border-app-border bg-input-bg"
                    />
                </div>

                <div className="rounded border border-dashed border-emerald-300 bg-emerald-50 p-3 text-sm">
                    <div className="flex justify-between"><span>SCH%</span><span>{computed.discountPercent.toFixed(2)}%</span></div>
                    <div className="flex justify-between"><span>Benefit</span><span>₹{computed.discountAmount.toFixed(2)}</span></div>
                </div>
            </div>

            <div className="flex justify-between items-center p-4 border-t border-app-border bg-gray-50">
                <button onClick={() => { onClear(item.id); onClose(); }} className="px-4 py-2 text-xs text-red-600">Clear</button>
                <div className="flex gap-2">
                    <button onClick={onClose} className="px-4 py-2 text-xs">Cancel</button>
                    <button onClick={handleApply} className="px-4 py-2 bg-primary text-white text-xs">Apply</button>
                </div>
            </div>
        </Modal>
    );
};

export default SchemeModal;
