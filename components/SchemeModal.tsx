import React, { useState, useEffect } from 'react';
import Modal from './Modal';
import type { BillItem } from '../types';

interface SchemeModalProps {
    isOpen: boolean;
    onClose: () => void;
    item: BillItem;
    onApply: (itemId: string, schemeQty: number, mode: 'flat' | 'percent' | 'price_override' | 'free_qty' | 'qty_ratio', value: number, discountAmount: number, discountPercent: number, freeQuantity: number, schemeTotalQty?: number, schemeDisplayPercent?: number) => void;
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


const SchemeModal: React.FC<SchemeModalProps> = ({ isOpen, onClose, item, onApply, onClear }) => {
    const [schemeRule, setSchemeRule] = useState('');
    const [selectedRule, setSelectedRule] = useState('custom');
    const [schemePercent, setSchemePercent] = useState<number>(0);
    const [schemeRate, setSchemeRate] = useState<number>(0);

    useEffect(() => {
        if (!isOpen) return;

        if (item.schemeMode === 'qty_ratio' && (item.schemeQty || 0) > 0 && (item.schemeTotalQty || 0) > 0) {
            setSchemeRule(`${item.schemeQty} in ${item.schemeTotalQty}`);
            setSelectedRule('custom');
            setSchemePercent(0);
            setSchemeRate(0);
            return;
        }

        if (item.schemeMode === 'percent' && (item.schemeValue || 0) > 0) {
            setSchemePercent(item.schemeValue || 0);
            setSchemeRule('');
            setSelectedRule('custom');
            setSchemeRate(0);
            return;
        }

        setSchemeRule('');
        setSelectedRule('custom');
        setSchemePercent(item.schemeDiscountPercent || 0);
        setSchemeRate(0);
    }, [isOpen, item]);

    const unitsPerPack = item.unitsPerPack || 1;
    const billedQty = Math.max(0, (item.quantity || 0) + ((item.looseQuantity || 0) / unitsPerPack));
    const baseRate = item.rate ?? item.mrp ?? 0;
    const netRate = baseRate * (1 - ((item.discountPercent || 0) / 100));
    const lineSubtotal = billedQty * netRate;

    const parsedRule = parseSchemeRule(schemeRule);
    const parsedPercentRule = parsePercentRule(schemeRule);

    const computed = (() => {
        if (schemeRate > 0) {
            const discountAmount = Math.min(lineSubtotal, billedQty * schemeRate);
            const discountPercent = lineSubtotal > 0 ? (discountAmount / lineSubtotal) * 100 : 0;
            const freeQuantity = netRate > 0 ? discountAmount / netRate : 0;
            return { mode: 'flat' as const, discountPercent, discountAmount, schemeQty: billedQty, schemeTotalQty: undefined, value: schemeRate, freeQuantity };
        }

        if (schemePercent > 0 || (parsedPercentRule || 0) > 0) {
            const resolvedPercent = schemePercent > 0 ? schemePercent : (parsedPercentRule || 0);
            const discountAmount = Math.min(lineSubtotal, lineSubtotal * (resolvedPercent / 100));
            const freeQuantity = netRate > 0 ? discountAmount / netRate : 0;
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
            const discountAmount = Math.min(lineSubtotal, freeQuantity * netRate);
            const benefitPercent = lineSubtotal > 0 ? (discountAmount / lineSubtotal) * 100 : 0;
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

    const handleApply = () => {
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
            computed.schemeTotalQty,
            schemeDisplayPercent
        );
        onClose();
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Scheme Rule" widthClass="max-w-md">
            <div className="space-y-4 p-2">
                <div className="text-xs text-gray-500 uppercase">{item.name}</div>

                <div>
                    <label className="block text-xs font-semibold mb-1">Quick Scheme</label>
                    <select
                        value={selectedRule}
                        onChange={(e) => {
                            const nextRule = e.target.value;
                            setSelectedRule(nextRule);
                            if (nextRule === 'custom') return;
                            setSchemeRule(nextRule.includes('%') ? '' : nextRule);
                            setSchemePercent(nextRule.includes('%') ? Number(nextRule.replace('%', '')) : 0);
                            setSchemeRate(0);
                        }}
                        className="w-full p-2 border border-app-border bg-input-bg"
                    >
                        <option value="custom">Custom</option>
                        <option value="10+1">10+1</option>
                        <option value="1 in 10">1 in 10</option>
                        <option value="100%">100% scheme</option>
                    </select>
                </div>

                <div>
                    <label className="block text-xs font-semibold mb-1">Scheme format</label>
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
                            if (value > 0) {
                                setSchemeRule('');
                                setSchemeRate(0);
                                setSelectedRule('custom');
                            }
                        }}
                        placeholder="5"
                        className="w-full p-2 border border-app-border bg-input-bg"
                    />
                </div>

                <div>
                    <label className="block text-xs font-semibold mb-1">Scheme Rate (₹ per billed qty)</label>
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
                        placeholder="0"
                        className="w-full p-2 border border-app-border bg-input-bg"
                    />
                </div>

                <div className="rounded border border-dashed border-emerald-300 bg-emerald-50 p-3 text-sm">
                    <div className="flex justify-between"><span>SCH%</span><span>{schemeDisplayPercent.toFixed(2)}%</span></div>
                    <div className="flex justify-between"><span>FREE Qty</span><span>{computed.freeQuantity.toFixed(2)}</span></div>
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
