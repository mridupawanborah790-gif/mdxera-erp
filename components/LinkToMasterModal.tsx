
import React, { useState, useMemo, useEffect, useRef } from 'react';
import Modal from './Modal';
import AddMedicineModal from './AddMedicineModal';
import type { Medicine, Supplier, SupplierProductMap, PurchaseItem } from '../types';
import { fuzzyMatch } from '../utils/search';

interface LinkToMasterModalProps {
    isOpen: boolean;
    onClose: () => void;
    supplier: Supplier;
    medicines?: Medicine[];
    mappings?: SupplierProductMap[];
    onLink: (map: SupplierProductMap) => Promise<void>;
    scannedItems: PurchaseItem[];
    onFinalize: (reconciledItems: PurchaseItem[]) => void;
    onAddMedicineMaster: (med: Omit<Medicine, 'id'>) => Promise<Medicine>;
    organizationId: string;
}

const uniformTextStyle = "text-base font-medium tracking-tight uppercase";

const cleanItemName = (name: string): string => {
    return name
        .replace(/₹?(\d+\.\d{2})|(\d+\/-)/g, '')
        .replace(/\b\d{2}[\/-]\d{2}[\/-]\d{4}\b/g, '')
        .replace(/\b\d{2}[\/-]\d{2}[\/-]\d{2}\b/g, '')
        .replace(/[(){}[\]]/g, ' ')
        .replace(/[*#]/g, '')
        .replace(/\s+/g, ' ')
        .trim();
};

const LinkToMasterModal: React.FC<LinkToMasterModalProps> = ({
    isOpen,
    onClose,
    supplier,
    medicines = [],
    mappings = [],
    onLink,
    scannedItems,
    onFinalize,
    onAddMedicineMaster,
    organizationId,
}) => {
    const [searchTerm, setSearchTerm] = useState('');
    const [masterSelectedIndex, setMasterSelectedIndex] = useState(0);
    const [activeScannedIndex, setActiveScannedIndex] = useState(0);
    const [reconciledItems, setReconciledItems] = useState<PurchaseItem[]>([]);
    const [isAddMedicineSubModalOpen, setIsAddMedicineSubModalOpen] = useState(false);

    const searchInputRef = useRef<HTMLInputElement>(null);
    const scannedListRef = useRef<HTMLDivElement>(null);
    const finalizeBtnRef = useRef<HTMLButtonElement>(null);

    const isComplete = useMemo(() =>
        reconciledItems.length > 0 && reconciledItems.every(i => i.matchStatus === 'matched'),
        [reconciledItems]);

    const suggestions = useMemo(() => {
        const map: Record<string, Medicine | null> = {};
        scannedItems.forEach(item => {
            const mapping = (mappings || []).find(m =>
                m.supplier_id === supplier.id &&
                m.supplier_product_name.toLowerCase().trim() === item.name.toLowerCase().trim()
            );

            if (mapping) {
                const matchedMed = medicines.find(med => med.id === mapping.master_medicine_id);
                if (matchedMed) {
                    map[item.id] = matchedMed;
                    return;
                }
            }

            const cleaned = cleanItemName(item.name);
            const best = medicines.find(m =>
                m.name.toLowerCase().trim() === cleaned.toLowerCase() ||
                (cleaned.length > 3 && fuzzyMatch(m.name, cleaned))
            );
            map[item.id] = best || null;
        });
        return map;
    }, [scannedItems, medicines, mappings, supplier.id]);

    useEffect(() => {
        if (isOpen) {
            setReconciledItems([...scannedItems]);
            const firstPending = scannedItems.findIndex(i => i.matchStatus === 'pending');
            const initialIdx = firstPending !== -1 ? firstPending : 0;
            setActiveScannedIndex(initialIdx);
            setSearchTerm('');
            setTimeout(() => scannedListRef.current?.focus(), 150);
        }
    }, [isOpen, scannedItems]);

    useEffect(() => {
        const activeItem = scannedListRef.current?.querySelector(`[data-scanned-idx="${activeScannedIndex}"]`);
        if (activeItem) {
            activeItem.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        }
    }, [activeScannedIndex]);

    useEffect(() => {
        const handleGlobalShortcut = (e: KeyboardEvent) => {
            if (isOpen && e.ctrlKey && (e.key === '+' || e.key === '=')) {
                e.preventDefault();
                setIsAddMedicineSubModalOpen(true);
            }
        };
        window.addEventListener('keydown', handleGlobalShortcut);
        return () => window.removeEventListener('keydown', handleGlobalShortcut);
    }, [isOpen]);

    const masterResults = useMemo(() => {
        const query = (searchTerm || '').trim();
        const activeItem = reconciledItems[activeScannedIndex];
        const suggestion = activeItem ? suggestions[activeItem.id] : null;

        let filtered = [...medicines];
        if (query) {
            filtered = filtered.filter(m =>
                fuzzyMatch(String(m.name || ''), query) ||
                fuzzyMatch(String(m.composition || ''), query) ||
                fuzzyMatch(String(m.brand || ''), query)
            );
        }

        return filtered.sort((a, b) => {
            if (suggestion) {
                if (a.id === suggestion.id) return -1;
                if (b.id === suggestion.id) return 1;
            }
            const aExact = query && a.name.toLowerCase().includes(query.toLowerCase()) ? 0 : 1;
            const bExact = query && b.name.toLowerCase().includes(query.toLowerCase()) ? 0 : 1;
            if (aExact !== bExact) return aExact - bExact;
            return a.name.localeCompare(b.name);
        }).slice(0, 50);
    }, [searchTerm, medicines, activeScannedIndex, reconciledItems, suggestions]);

    const handleMapItem = async (masterMed: Medicine) => {
        const activeItem = reconciledItems[activeScannedIndex];
        if (!activeItem) return;

        const rawNomenclatureName = activeItem.name;

        // Create mapping in DB (handled in background)
        if (supplier.id && supplier.id !== 'temp') {
            const existingMap = (mappings || []).find(m =>
                m.supplier_id === supplier.id &&
                m.supplier_product_name.toLowerCase().trim() === rawNomenclatureName.toLowerCase().trim()
            );

            onLink({
                id: existingMap ? existingMap.id : crypto.randomUUID(),
                organization_id: organizationId,
                supplier_id: supplier.id,
                supplier_product_name: rawNomenclatureName,
                master_medicine_id: masterMed.id,
                auto_apply: true
            }).catch(err => console.error("Link saving failed", err));
        }

        // Update current session's reconciledItems for ALL instances of this raw nomenclature
        const updatedItems = reconciledItems.map((item) => {
            if (item.name.toLowerCase().trim() === rawNomenclatureName.toLowerCase().trim()) {
                const unitsMatch = masterMed.pack?.match(/\d+/);
                const units = unitsMatch ? parseInt(unitsMatch[0], 10) : 10;

                return {
                    ...item,
                    name: masterMed.name,
                    brand: masterMed.brand || masterMed.manufacturer || '',
                    hsnCode: masterMed.hsnCode || item.hsnCode,
                    gstPercent: masterMed.gstRate || item.gstPercent,
                    mrp: Number(masterMed.mrp || item.mrp),
                    inventoryItemId: masterMed.id,
                    unitsPerPack: units,
                    packType: masterMed.pack || item.packType,
                    matchStatus: 'matched' as const
                };
            }
            return item;
        });

        setReconciledItems(updatedItems);

        // Find next pending item
        const nextPendingIdx = updatedItems.findIndex((item, idx) => idx > activeScannedIndex && item.matchStatus === 'pending');
        const wrapPendingIdx = nextPendingIdx === -1 ? updatedItems.findIndex(item => item.matchStatus === 'pending') : nextPendingIdx;

        if (wrapPendingIdx !== -1) {
            setActiveScannedIndex(wrapPendingIdx);
            setSearchTerm('');
            setTimeout(() => scannedListRef.current?.focus(), 10);
        } else {
            setTimeout(() => {
                finalizeBtnRef.current?.focus();
            }, 150);
        }
    };

    const handleFinalize = (e?: React.MouseEvent | React.KeyboardEvent) => {
        if (e) { e.preventDefault(); e.stopPropagation(); }
        if (!isComplete) {
            const pendingCount = reconciledItems.filter(i => i.matchStatus === 'pending').length;
            alert(`Mapping Restricted: You must link all ${pendingCount} extracted items before data can be transferred to the Purchase Form.`);
            return;
        }
        onFinalize(reconciledItems);
    };

    const handleCloseAttempt = () => {
        if (isComplete) {
            onClose();
        } else if (confirm("Reconciliation is incomplete. If you close now, the AI scan results will be discarded. Are you sure?")) {
            onClose();
        }
    };

    const handleLeftListKeyDown = (e: React.KeyboardEvent) => {
        if (isAddMedicineSubModalOpen) return;
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            setActiveScannedIndex(prev => (prev + 1) % reconciledItems.length);
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setActiveScannedIndex(prev => (prev - 1 + reconciledItems.length) % reconciledItems.length);
        } else if (e.key === 'Enter') {
            e.preventDefault();
            const currentItem = reconciledItems[activeScannedIndex];
            if (isComplete) {
                handleFinalize();
            } else if (currentItem && currentItem.matchStatus === 'matched') {
                const nextPending = reconciledItems.findIndex(i => i.matchStatus === 'pending');
                if (nextPending !== -1) {
                    setActiveScannedIndex(nextPending);
                } else {
                    finalizeBtnRef.current?.focus();
                }
            } else {
                searchInputRef.current?.focus();
                if (searchInputRef.current) searchInputRef.current.select();
            }
        } else if (e.key === 'Escape') {
            e.preventDefault();
            handleCloseAttempt();
        }
    };

    const handleSearchKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            setMasterSelectedIndex(prev => (prev + 1) % Math.max(1, masterResults.length));
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setMasterSelectedIndex(prev => (prev - 1 + masterResults.length) % Math.max(1, masterResults.length));
        } else if (e.key === 'Enter') {
            e.preventDefault();
            const selectedMaster = masterResults[masterSelectedIndex];
            if (selectedMaster) {
                handleMapItem(selectedMaster);
            }
        } else if (e.key === 'Escape') {
            e.preventDefault();
            scannedListRef.current?.focus();
        }
    };

    const handleSmartMatchAll = async () => {
        let updated = [...reconciledItems];
        for (let i = 0; i < updated.length; i++) {
            const item = updated[i];
            if (item.matchStatus === 'pending' && suggestions[item.id]) {
                const match = suggestions[item.id]!;

                const existingMap = (mappings || []).find(m =>
                    m.supplier_id === supplier.id &&
                    m.supplier_product_name.toLowerCase().trim() === item.name.toLowerCase().trim()
                );

                const unitsMatch = match.pack?.match(/\d+/);
                const units = unitsMatch ? parseInt(unitsMatch[0], 10) : 10;

                updated[i] = {
                    ...item,
                    name: match.name,
                    brand: match.brand || match.manufacturer || '',
                    hsnCode: match.hsnCode || item.hsnCode,
                    gstPercent: match.gstRate || item.gstPercent,
                    mrp: Number(match.mrp || item.mrp),
                    inventoryItemId: match.id,
                    unitsPerPack: units,
                    packType: match.pack || item.packType,
                    matchStatus: 'matched' as const
                };

                if (supplier.id && supplier.id !== 'temp') {
                    onLink({
                        id: existingMap ? existingMap.id : crypto.randomUUID(),
                        organization_id: organizationId,
                        supplier_id: supplier.id,
                        supplier_product_name: item.name,
                        master_medicine_id: match.id,
                        auto_apply: true
                    }).catch(console.error);
                }
            }
        }
        setReconciledItems(updated);

        const nextPending = updated.findIndex(i => i.matchStatus === 'pending');
        if (nextPending !== -1) {
            setActiveScannedIndex(nextPending);
            scannedListRef.current?.focus();
        } else {
            finalizeBtnRef.current?.focus();
        }
    };

    const handleAddMedicineSuccess = async (newMedData: Omit<Medicine, 'id' | 'created_at' | 'updated_at'>) => {
        setIsAddMedicineSubModalOpen(false);
        try {
            const newMed = await onAddMedicineMaster(newMedData);
            handleMapItem(newMed);
        } catch (error) { console.error("Failed to create master SKU", error); }
    };

    if (!isOpen) return null;

    const unmappedCount = reconciledItems.filter(i => i.matchStatus === 'pending').length;
    const autoMatchCount = reconciledItems.filter(i => i.matchStatus === 'pending' && suggestions[i.id]).length;

    return (
        <>
            <Modal isOpen={isOpen} onClose={handleCloseAttempt} title="Scanned Bill Reconciliation Worksheet" widthClass="max-w-[95vw]" heightClass="h-[90vh]">
                <div className="flex flex-col h-full bg-slate-100 dark:bg-zinc-950 overflow-hidden">
                    <div className="bg-primary text-white p-3 flex justify-between items-center flex-shrink-0 shadow-lg z-20">
                        <div className="flex items-center gap-4">
                            <span className="text-xs font-black uppercase tracking-widest bg-white/20 px-3 py-1 border border-white/30 truncate max-w-[300px]">Supplier: {supplier.name}</span>
                            <span className="text-xs font-black uppercase tracking-widest">{reconciledItems.length} Extracted Items</span>
                            {unmappedCount > 0 && (
                                <span className="bg-red-600 text-white px-3 py-1 rounded-none text-[10px] font-black animate-pulse uppercase border-2 border-white/50 shadow-lg">
                                    {unmappedCount} REMAINING FOR MAPPING
                                </span>
                            )}
                        </div>
                        <div className="flex items-center gap-3">
                            {autoMatchCount > 0 && unmappedCount > 0 && (
                                <button onClick={handleSmartMatchAll} className="bg-white text-primary px-4 py-1.5 text-[10px] font-black uppercase rounded-none border-2 border-white hover:bg-accent hover:text-black transition-all shadow-lg animate-bounce">
                                    ✨ AI SMART-RESOLVE {autoMatchCount} ITEMS
                                </button>
                            )}
                            <button
                                ref={finalizeBtnRef}
                                onClick={handleFinalize}
                                disabled={!isComplete}
                                onKeyDown={(e) => e.key === 'Enter' && handleFinalize(e)}
                                className={`px-8 py-2 font-black text-xs uppercase tracking-widest shadow-xl transition-all ml-2 border-2 ${isComplete ? 'bg-accent text-black border-black hover:scale-105 active:translate-y-1 focus:ring-4 focus:ring-accent/40' : 'bg-gray-400 text-gray-200 border-gray-500 cursor-not-allowed opacity-40'}`}
                                title={isComplete ? "Transfer to Purchase Form" : "All items must be matched before proceeding"}
                            >
                                {isComplete ? 'Transfer Reconciled Data (Enter)' : 'Reconciliation Pending'}
                            </button>
                        </div>
                    </div>

                    <div className="flex flex-1 overflow-hidden">
                        <div ref={scannedListRef} tabIndex={0} onKeyDown={handleLeftListKeyDown} className="w-[35%] border-r-4 border-primary/10 flex flex-col bg-white overflow-hidden shadow-2xl z-10 outline-none focus:ring-4 focus:ring-primary/20">
                            <div className="p-4 bg-gray-50 border-b border-app-border flex justify-between items-center">
                                <h3 className="text-[11px] font-black uppercase text-primary tracking-widest">Invoice Extractions</h3>
                                {isComplete && <span className="text-[10px] font-black text-emerald-600 uppercase flex items-center gap-1"><svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20"><path d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" /></svg> 100% RECONCILED</span>}
                            </div>
                            <div className="flex-1 overflow-y-auto custom-scrollbar bg-slate-50">
                                {reconciledItems.map((item, idx) => {
                                    const isActive = idx === activeScannedIndex;
                                    const isMapped = item.matchStatus === 'matched';
                                    const hasAutoMatch = !isMapped && suggestions[item.id];
                                    return (
                                        <button
                                            key={item.id}
                                            data-scanned-idx={idx}
                                            onClick={() => { setActiveScannedIndex(idx); scannedListRef.current?.focus(); }}
                                            className={`w-full py-2.5 px-4 border-b border-gray-200 text-left transition-all flex items-center gap-4 ${isActive ? 'bg-blue-600 text-white z-10 shadow-lg' : isMapped ? 'bg-emerald-600 text-white' : 'bg-white hover:bg-gray-50'}`}
                                        >
                                            <div className={`w-8 h-8 rounded-none flex items-center justify-center font-black text-sm flex-shrink-0 ${isActive ? 'bg-white/20' : isMapped ? 'bg-white/20' : (hasAutoMatch ? 'bg-amber-100 text-amber-700 animate-pulse' : 'bg-red-50 text-red-600 border border-red-200')}`}>
                                                {isMapped ? '✓' : (hasAutoMatch ? '✨' : '!')}
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <p className={`truncate leading-none ${uniformTextStyle} ${isActive || isMapped ? 'text-white' : 'text-gray-950'}`}>{item.name}</p>
                                            </div>
                                        </button>
                                    );
                                })}
                            </div>
                        </div>

                        <div className="flex-1 flex flex-col bg-[#fffde7]/20 overflow-hidden">
                            <div className="p-4 bg-white dark:bg-zinc-900 border-b-2 border-primary/10 flex-shrink-0">
                                <div className="flex justify-between items-center mb-3">
                                    <div className="flex items-center gap-2">
                                        <span className="w-5 h-5 rounded-none bg-emerald-600 text-white flex items-center justify-center font-black text-[10px]">SKU</span>
                                        <h3 className="text-[11px] font-black uppercase tracking-widest text-emerald-700">Database Reconciliation Engine</h3>
                                    </div>
                                    <button onClick={() => setIsAddMedicineSubModalOpen(true)} className="px-4 py-1.5 bg-emerald-50 text-emerald-700 border-2 border-emerald-200 text-[9px] font-black uppercase tracking-widest hover:bg-emerald-100">+ Register Missing SKU</button>
                                </div>
                                <div className="relative">
                                    <input ref={searchInputRef} type="text" value={searchTerm} onChange={e => { setSearchTerm(e.target.value); setMasterSelectedIndex(0); }} onKeyDown={handleSearchKeyDown} placeholder="Search catalog manually... (Ctrl + + to create new)" className={`w-full h-11 p-2.5 pl-10 border-2 border-gray-400 bg-white focus:border-primary focus:bg-[#fffde7] outline-none shadow-sm ${uniformTextStyle}`} />
                                    <svg className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3"><circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" /></svg>
                                </div>
                            </div>

                            <div className="flex-1 overflow-y-auto p-0 bg-white">
                                {masterResults.length > 0 ? (
                                    <table className="min-w-full border-collapse">
                                        <thead className="sticky top-0 z-20 bg-gray-50 border-b border-gray-400 shadow-sm">
                                            <tr className="text-[10px] font-black uppercase text-gray-500 tracking-wider h-10">
                                                <th className="p-2 px-4 text-left">SKU Description</th>
                                                <th className="p-2 px-4 text-left">MFR</th>
                                                <th className="p-2 px-4 text-right">MRP</th>
                                                <th className="p-2 px-4 w-20">Action</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-gray-100">
                                            {masterResults.map((med, mIdx) => {
                                                const isSelected = mIdx === masterSelectedIndex;
                                                const isRecommendation = suggestions[reconciledItems[activeScannedIndex]?.id]?.id === med.id;
                                                return (
                                                    <tr key={med.id} onClick={() => handleMapItem(med)} onMouseEnter={() => setMasterSelectedIndex(mIdx)} className={`cursor-pointer transition-all ${isSelected ? 'bg-primary text-white' : isRecommendation ? 'bg-emerald-50 border-l-4 border-emerald-500' : 'hover:bg-yellow-50'} h-12`}>
                                                        <td className="p-2 px-4">
                                                            <p className={`leading-tight ${uniformTextStyle} ${isSelected ? 'text-white' : 'text-gray-950'}`}>{med.name}</p>
                                                            <p className="text-[10px] italic font-bold mt-1 line-clamp-1 opacity-70">{med.composition}</p>
                                                        </td>
                                                        <td className={`p-2 px-4 opacity-80 ${uniformTextStyle}`}>{med.brand || med.manufacturer || '—'}</td>
                                                        <td className={`p-2 px-4 text-right font-black ${uniformTextStyle}`}>₹{parseFloat(med.mrp || '0').toFixed(2)}</td>
                                                        <td className="p-2 px-4 text-right"><div className={`w-8 h-8 rounded-none border-2 flex items-center justify-center font-black text-lg ${isSelected ? 'border-white' : 'border-emerald-100 text-emerald-600'}`}>↵</div></td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                ) : (
                                    <div className="h-full flex flex-col items-center justify-center opacity-30 p-20 text-center">
                                        <p className="text-xl font-black uppercase tracking-widest">No Database Match Found</p>
                                        <p className="text-xs font-bold uppercase mt-2">Try a different search or create a new SKU record</p>
                                    </div>
                                )}
                            </div>

                            <div className="p-3 bg-slate-900 text-white/50 border-t border-white/10 flex justify-center items-center gap-10 flex-shrink-0">
                                <span className="text-[9px] font-black uppercase tracking-tighter"><span className="px-1.5 py-0.5 bg-white/10 border border-white/20 mr-1">↑/↓</span> Navigate Results</span>
                                <span className="text-[9px] font-black uppercase tracking-tighter"><span className="px-1.5 py-0.5 bg-white/10 border border-white/20 mr-1">ENTER</span> Map SKU</span>
                            </div>
                        </div>
                    </div>
                </div>
            </Modal>

            <AddMedicineModal
                isOpen={isAddMedicineSubModalOpen}
                onClose={() => setIsAddMedicineSubModalOpen(false)}
                onAddMedicine={handleAddMedicineSuccess}
                initialName={cleanItemName(reconciledItems[activeScannedIndex]?.name || '')}
                organizationId={organizationId}
            />
        </>
    );
};

export default LinkToMasterModal;
