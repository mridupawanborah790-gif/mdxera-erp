import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import type { InventoryItem } from '../types';
import { formatExpiryToMMYY } from '../utils/helpers';

interface InventoryBatchDetailModalProps {
    isOpen: boolean;
    itemName: string;
    rows: InventoryItem[];
    onClose: () => void;
    onSaveRow: (row: InventoryItem) => Promise<void>;
    allowBatchEdit?: boolean;
}

type EditableBatchFields = Pick<InventoryItem, 'batch' | 'expiry' | 'ptr' | 'mrp' | 'rateA' | 'rateB' | 'rateC'> & {
    packQty: number;
    looseQty: number;
};

const isValidExpiry = (expiry: string) => {
    const value = expiry.trim();
    if (!value) return true;
    const mmYY = /^(0[1-9]|1[0-2])\/(\d{2})$/;
    const yyyyMmDd = /^\d{4}-(0[1-9]|1[0-2])-([0][1-9]|[12]\d|3[01])$/;
    return mmYY.test(value) || yyyyMmDd.test(value);
};

const toNumber = (value: unknown, fallback = 0) => {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
};

const toNonNegativeInt = (value: unknown) => {
    const n = Math.trunc(Number(value));
    return Number.isFinite(n) ? Math.max(0, n) : 0;
};

const InventoryBatchDetailModal: React.FC<InventoryBatchDetailModalProps> = ({
    isOpen,
    itemName,
    rows,
    onClose,
    onSaveRow,
    allowBatchEdit = true,
}) => {
    const [editingRowId, setEditingRowId] = useState<string | null>(null);
    const [draft, setDraft] = useState<EditableBatchFields | null>(null);
    const [error, setError] = useState<string>('');
    const [savingRowId, setSavingRowId] = useState<string | null>(null);
    const [recentlyUpdatedId, setRecentlyUpdatedId] = useState<string | null>(null);

    useEffect(() => {
        if (!isOpen) {
            setEditingRowId(null);
            setDraft(null);
            setError('');
            setSavingRowId(null);
            setRecentlyUpdatedId(null);
            return;
        }

        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                event.preventDefault();
                if (editingRowId) {
                    setEditingRowId(null);
                    setDraft(null);
                    setError('');
                } else {
                    onClose();
                }
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [editingRowId, isOpen, onClose]);

    const sortedRows = useMemo(
        () => [...rows].sort((a, b) => (a.batch || '').localeCompare(b.batch || '')),
        [rows],
    );

    const totals = useMemo(() => {
        return sortedRows.reduce(
            (acc, row) => {
                const stock = toNumber(row.stock);
                const value = toNumber(row.value ?? (stock * toNumber(row.cost || row.ptr)));
                return { stock: acc.stock + stock, value: acc.value + value };
            },
            { stock: 0, value: 0 },
        );
    }, [sortedRows]);

    if (!isOpen) return null;

    const beginEdit = (row: InventoryItem) => {
        const unitsPerPack = Math.max(1, toNumber(row.unitsPerPack, 1));
        const stock = toNumber(row.stock);
        setEditingRowId(row.id);
        setDraft({
            batch: row.batch || '',
            expiry: row.expiry || '',
            packQty: Math.floor(stock / unitsPerPack),
            looseQty: stock % unitsPerPack,
            ptr: toNumber(row.ptr),
            mrp: toNumber(row.mrp),
            rateA: toNumber(row.rateA),
            rateB: toNumber(row.rateB),
            rateC: toNumber(row.rateC),
        });
        setError('');
    };

    const cancelEdit = () => {
        setEditingRowId(null);
        setDraft(null);
        setError('');
    };

    const saveEdit = async (row: InventoryItem) => {
        if (!draft) return;

        const packQty = toNonNegativeInt(draft.packQty);
        const looseQty = toNonNegativeInt(draft.looseQty);

        if (!isValidExpiry(draft.expiry || '')) {
            setError('Expiry must be in MM/YY or YYYY-MM-DD format.');
            return;
        }

        const numericFields = [draft.ptr, draft.mrp, draft.rateA, draft.rateB, draft.rateC];
        if (numericFields.some(value => !Number.isFinite(Number(value)))) {
            setError('PTR / MRP / Rate A-B-C must be numeric.');
            return;
        }

        const unitsPerPack = Math.max(1, toNumber(row.unitsPerPack, 1));
        const nextStock = (packQty * unitsPerPack) + looseQty;
        if (nextStock < 0) {
            setError('Quantity cannot be negative.');
            return;
        }

        const nextPtr = toNumber(draft.ptr);
        const updatedRow: InventoryItem = {
            ...row,
            batch: allowBatchEdit ? (draft.batch || '').trim() : row.batch,
            expiry: (draft.expiry || '').trim(),
            stock: nextStock,
            ptr: nextPtr,
            mrp: toNumber(draft.mrp),
            rateA: toNumber(draft.rateA),
            rateB: toNumber(draft.rateB),
            rateC: toNumber(draft.rateC),
            value: nextStock * nextPtr,
        };

        setSavingRowId(row.id);
        setError('');

        try {
            await onSaveRow(updatedRow);
            setRecentlyUpdatedId(row.id);
            setTimeout(() => setRecentlyUpdatedId(prev => (prev === row.id ? null : prev)), 1400);
            cancelEdit();
        } catch (e) {
            const message = e instanceof Error ? e.message : 'Unable to save batch changes.';
            setError(message);
        } finally {
            setSavingRowId(null);
        }
    };

    return createPortal(
        <div className="fixed inset-0 z-[220] bg-black/60 flex items-center justify-center p-2 sm:p-4" onClick={onClose}>
            <div
                className="w-[92vw] h-[80vh] sm:w-[88vw] lg:w-[85vw] xl:w-[82vw] bg-white border-2 border-primary shadow-2xl flex flex-col overflow-hidden"
                onClick={e => e.stopPropagation()}
            >
                <div className="px-4 py-3 bg-primary text-white flex justify-between items-center">
                    <div>
                        <p className="text-[10px] font-black uppercase tracking-widest">Batch-wise Stock Breakdown</p>
                        <h2 className="text-lg font-black uppercase">{itemName}</h2>
                    </div>
                    <button onClick={onClose} className="px-3 py-1 border border-white text-xs font-black uppercase">Esc / Close</button>
                </div>

                {error && (
                    <div className="px-4 py-2 text-xs font-bold uppercase bg-red-50 text-red-700 border-b border-red-200">{error}</div>
                )}

                <div className="flex-1 overflow-hidden">
                    <div className="h-full overflow-auto">
                        <table className="min-w-full border-collapse whitespace-nowrap text-xs sm:text-sm">
                            <thead className="bg-gray-100 sticky top-0 z-10">
                                <tr className="font-black uppercase text-gray-700 border-b border-gray-400">
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
                                    <th className="px-2 py-2 border-r border-gray-300 text-left">Barcode</th>
                                    <th className="px-2 py-2 text-center">Action</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-200">
                                {sortedRows.map((row, index) => {
                                    const unitsPerPack = Math.max(1, Number(row.unitsPerPack) || 1);
                                    const rowStock = Number(row.stock) || 0;
                                    const isEditing = editingRowId === row.id && draft !== null;
                                    const packQty = isEditing ? toNonNegativeInt(draft.packQty) : Math.floor(rowStock / unitsPerPack);
                                    const looseQty = isEditing ? toNonNegativeInt(draft.looseQty) : rowStock % unitsPerPack;
                                    const totalStock = (packQty * unitsPerPack) + looseQty;
                                    const ptr = isEditing ? toNumber(draft.ptr) : toNumber(row.ptr);
                                    const mrp = isEditing ? toNumber(draft.mrp) : toNumber(row.mrp);
                                    const rateA = isEditing ? toNumber(draft.rateA) : toNumber(row.rateA);
                                    const rateB = isEditing ? toNumber(draft.rateB) : toNumber(row.rateB);
                                    const rateC = isEditing ? toNumber(draft.rateC) : toNumber(row.rateC);
                                    const stockValue = totalStock * ptr;

                                    const inputClass = 'w-20 border border-gray-300 px-1 py-0.5 text-right font-semibold focus:outline-none focus:border-primary focus:bg-yellow-50';

                                    return (
                                        <tr
                                            key={row.id}
                                            className={`${recentlyUpdatedId === row.id ? 'bg-yellow-100' : 'hover:bg-yellow-50'} transition-colors`}
                                            onDoubleClick={() => !isEditing && beginEdit(row)}
                                        >
                                            <td className="px-2 py-1.5 border-r border-gray-200 text-center">{index + 1}</td>
                                            <td className="px-2 py-1.5 border-r border-gray-200 font-mono text-primary">
                                                {isEditing ? (
                                                    <input
                                                        className="w-28 border border-gray-300 px-1 py-0.5 focus:outline-none focus:border-primary"
                                                        value={draft.batch}
                                                        disabled={!allowBatchEdit}
                                                        onChange={e => setDraft(prev => (prev ? { ...prev, batch: e.target.value } : prev))}
                                                        onKeyDown={async e => {
                                                            if (e.key === 'Enter') await saveEdit(row);
                                                            if (e.key === 'Escape') cancelEdit();
                                                        }}
                                                    />
                                                ) : (row.batch || '-')}
                                            </td>
                                            <td className="px-2 py-1.5 border-r border-gray-200 text-center">
                                                {isEditing ? (
                                                    <input
                                                        className="w-24 border border-gray-300 px-1 py-0.5 text-center focus:outline-none focus:border-primary"
                                                        value={draft.expiry || ''}
                                                        onChange={e => setDraft(prev => (prev ? { ...prev, expiry: e.target.value } : prev))}
                                                        onKeyDown={async e => {
                                                            if (e.key === 'Enter') await saveEdit(row);
                                                            if (e.key === 'Escape') cancelEdit();
                                                        }}
                                                    />
                                                ) : (formatExpiryToMMYY(row.expiry) || '-')}
                                            </td>
                                            <td className="px-2 py-1.5 border-r border-gray-200 text-right">
                                                {isEditing ? <input type="number" min={0} className={inputClass} value={draft.packQty} onChange={e => setDraft(prev => (prev ? { ...prev, packQty: toNonNegativeInt(e.target.value) } : prev))} /> : packQty}
                                            </td>
                                            <td className="px-2 py-1.5 border-r border-gray-200 text-right">
                                                {isEditing ? <input type="number" min={0} className={inputClass} value={draft.looseQty} onChange={e => setDraft(prev => (prev ? { ...prev, looseQty: toNonNegativeInt(e.target.value) } : prev))} /> : looseQty}
                                            </td>
                                            <td className="px-2 py-1.5 border-r border-gray-200 text-right font-semibold">{totalStock}</td>
                                            <td className="px-2 py-1.5 border-r border-gray-200 text-right">
                                                {isEditing ? <input type="number" step="0.01" className={inputClass} value={draft.ptr} onChange={e => setDraft(prev => (prev ? { ...prev, ptr: toNumber(e.target.value) } : prev))} /> : `₹${ptr.toFixed(2)}`}
                                            </td>
                                            <td className="px-2 py-1.5 border-r border-gray-200 text-right">
                                                {isEditing ? <input type="number" step="0.01" className={inputClass} value={draft.mrp} onChange={e => setDraft(prev => (prev ? { ...prev, mrp: toNumber(e.target.value) } : prev))} /> : `₹${mrp.toFixed(2)}`}
                                            </td>
                                            <td className="px-2 py-1.5 border-r border-gray-200 text-right">
                                                {isEditing ? <input type="number" step="0.01" className={inputClass} value={draft.rateA} onChange={e => setDraft(prev => (prev ? { ...prev, rateA: toNumber(e.target.value) } : prev))} /> : `₹${rateA.toFixed(2)}`}
                                            </td>
                                            <td className="px-2 py-1.5 border-r border-gray-200 text-right">
                                                {isEditing ? <input type="number" step="0.01" className={inputClass} value={draft.rateB} onChange={e => setDraft(prev => (prev ? { ...prev, rateB: toNumber(e.target.value) } : prev))} /> : `₹${rateB.toFixed(2)}`}
                                            </td>
                                            <td className="px-2 py-1.5 border-r border-gray-200 text-right">
                                                {isEditing ? <input type="number" step="0.01" className={inputClass} value={draft.rateC} onChange={e => setDraft(prev => (prev ? { ...prev, rateC: toNumber(e.target.value) } : prev))} /> : `₹${rateC.toFixed(2)}`}
                                            </td>
                                            <td className="px-2 py-1.5 border-r border-gray-200 text-right font-semibold">₹{stockValue.toFixed(2)}</td>
                                            <td className="px-2 py-1.5 border-r border-gray-200">{row.barcode || '-'}</td>
                                            <td className="px-2 py-1.5 text-center">
                                                {!isEditing ? (
                                                    <button
                                                        onClick={() => beginEdit(row)}
                                                        className="px-2 py-1 border border-primary text-primary text-[10px] font-black uppercase hover:bg-primary hover:text-white"
                                                    >
                                                        Edit
                                                    </button>
                                                ) : (
                                                    <div className="flex justify-center gap-1">
                                                        <button
                                                            onClick={() => void saveEdit(row)}
                                                            disabled={savingRowId === row.id}
                                                            className="px-2 py-1 border border-emerald-600 text-emerald-700 text-[10px] font-black uppercase hover:bg-emerald-600 hover:text-white disabled:opacity-50"
                                                        >
                                                            Save
                                                        </button>
                                                        <button
                                                            onClick={cancelEdit}
                                                            disabled={savingRowId === row.id}
                                                            className="px-2 py-1 border border-gray-400 text-gray-600 text-[10px] font-black uppercase hover:bg-gray-100 disabled:opacity-50"
                                                        >
                                                            Cancel
                                                        </button>
                                                    </div>
                                                )}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                            <tfoot className="sticky bottom-0 bg-blue-50 border-t-2 border-primary">
                                <tr className="text-xs font-black uppercase text-primary">
                                    <td colSpan={5} className="px-2 py-2 border-r border-blue-200 text-right">Total</td>
                                    <td className="px-2 py-2 border-r border-blue-200 text-right">{totals.stock}</td>
                                    <td colSpan={5} className="px-2 py-2 border-r border-blue-200 text-right">Batch Stock Value Total</td>
                                    <td className="px-2 py-2 border-r border-blue-200 text-right">₹{totals.value.toFixed(2)}</td>
                                    <td colSpan={2} className="px-2 py-2 text-center text-[10px]">Double-click a row for inline edit</td>
                                </tr>
                            </tfoot>
                        </table>
                    </div>
                </div>
            </div>
        </div>,
        document.body,
    );
};

export default InventoryBatchDetailModal;
