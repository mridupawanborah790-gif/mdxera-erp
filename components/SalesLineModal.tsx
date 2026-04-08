
import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import type { InventoryItem, BillItem, Customer, AppConfigurations } from '../types';
import { isLiquidOrWeightPack, resolveUnitsPerStrip } from '../utils/pack';

interface SalesLineModalProps {
    isOpen: boolean;
    onClose: () => void;
    productName: string;
    brandName: string;
    batches: InventoryItem[];
    customer: Customer | null;
    onConfirm: (item: BillItem) => void;
    initialItem?: BillItem | null;
    cartUnitsByBatchId?: Record<string, number>;
    isReadOnly?: boolean;
    configurations?: AppConfigurations;
}

const SalesLineModal: React.FC<SalesLineModalProps> = ({ 
    isOpen, 
    onClose, 
    productName, 
    brandName, 
    batches, 
    customer, 
    onConfirm, 
    initialItem, 
    cartUnitsByBatchId = {}, 
    isReadOnly,
    configurations
}) => {
    const [selectedBatchIndex, setSelectedBatchIndex] = useState(0);
    const [packs, setPacks] = useState<number>(1);
    const [loose, setLoose] = useState<number>(0);
    const [freePacks, setFreePacks] = useState<number>(0);
    const [discount, setDiscount] = useState<number>(0);
    const [itemFlatDiscount, setItemFlatDiscount] = useState<number>(0);
    
    // Scheme States
    const [schemeMode, setSchemeMode] = useState<BillItem['schemeMode'] | 'No Scheme'>('No Scheme');
    const [schemeValue, setSchemeValue] = useState<number>(0);
    const [schemeQty, setSchemeQty] = useState<number>(0);
    const [schemeTotalQty, setSchemeTotalQty] = useState<number>(0);

    // Refs for keyboard navigation
    const packsInputRef = useRef<HTMLInputElement>(null);
    const looseInputRef = useRef<HTMLInputElement>(null);
    const discInputRef = useRef<HTMLInputElement>(null);
    const flatInputRef = useRef<HTMLInputElement>(null);
    const schemeModeRef = useRef<HTMLSelectElement>(null);
    const schemeValRef = useRef<HTMLInputElement>(null);
    const schemeTotalQtyRef = useRef<HTMLInputElement>(null);
    const confirmBtnRef = useRef<HTMLButtonElement>(null);
    const batchListRef = useRef<HTMLDivElement>(null);
    const activeBatchRef = useRef<HTMLButtonElement>(null);

    const strictStock = configurations?.displayOptions?.strictStock ?? true;
    const enableNegativeStock = configurations?.displayOptions?.enableNegativeStock ?? false;
    const shouldPreventNegativeStock = strictStock && !enableNegativeStock;
    const globalDefaultRateTier = configurations?.displayOptions?.defaultRateTier || 'mrp';

    const sortedBatches = useMemo(() => {
        if (!batches || batches.length === 0) return [];

        const calculateAvailableStock = (batchItem: InventoryItem) => {
            const pendingInCart = cartUnitsByBatchId[batchItem.id] || 0;
            const currentLineUnitsIfEditing = initialItem && initialItem.inventoryItemId === batchItem.id
                ? ((initialItem.quantity + (initialItem.freeQuantity || 0)) * (initialItem.unitsPerPack || 1) + (initialItem.looseQuantity || 0))
                : 0;
            return batchItem.stock - (pendingInCart - currentLineUnitsIfEditing);
        };

        return [...batches].sort((a, b) => {
            const availableA = calculateAvailableStock(a);
            const availableB = calculateAvailableStock(b);
            if (availableA <= 0 && availableB > 0) return 1;
            if (availableA > 0 && availableB <= 0) return -1;
            return new Date(a.expiry).getTime() - new Date(b.expiry).getTime();
        });
    }, [batches, cartUnitsByBatchId, initialItem]);

    const activeBatch = sortedBatches[selectedBatchIndex];
    const allowLooseForBatch = activeBatch ? !isLiquidOrWeightPack(activeBatch.packType) : true;

    const currentAvailableStock = useMemo(() => {
        if (!activeBatch) return 0;
        const pendingInCart = cartUnitsByBatchId[activeBatch.id] || 0;
        const currentLineUnitsIfEditing = initialItem && initialItem.inventoryItemId === activeBatch.id
            ? ((initialItem.quantity + (initialItem.freeQuantity || 0)) * (initialItem.unitsPerPack || 1) + (initialItem.looseQuantity || 0))
            : 0;
        return activeBatch.stock - (pendingInCart - currentLineUnitsIfEditing);
    }, [activeBatch, cartUnitsByBatchId, initialItem]);

    useEffect(() => {
        if (isOpen) {
            if (initialItem) {
                const bIdx = sortedBatches.findIndex(b => b.id === initialItem.inventoryItemId);
                setSelectedBatchIndex(bIdx !== -1 ? bIdx : 0);
                setPacks(initialItem.quantity || 0);
                setLoose((allowLooseForBatch ? initialItem.looseQuantity : 0) || 0);
                setFreePacks(initialItem.freeQuantity || 0);
                setDiscount(initialItem.discountPercent || 0);
                setItemFlatDiscount(initialItem.itemFlatDiscount || 0);
                setSchemeMode(initialItem.schemeMode || 'No Scheme');
                setSchemeValue(initialItem.schemeValue || 0);
                setSchemeQty(initialItem.schemeQty || 0);
                setSchemeTotalQty(initialItem.schemeTotalQty || 0);
            } else {
                setSelectedBatchIndex(0);
                setPacks(1);
                setLoose(0);
                setFreePacks(0);
                setDiscount(customer?.defaultDiscount || 0);
                setItemFlatDiscount(0);
                setSchemeMode('No Scheme');
                setSchemeValue(0);
                setSchemeQty(0);
                setSchemeTotalQty(0);
            }
            setTimeout(() => packsInputRef.current?.focus(), 150);
        }
    }, [isOpen, initialItem, sortedBatches, customer, allowLooseForBatch]);



    // Auto-scroll active batch into view
    useEffect(() => {
        if (activeBatchRef.current) {
            activeBatchRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
    }, [selectedBatchIndex]);

    const lineTotals = useMemo(() => {
        if (!activeBatch) return { gross: 0, afterTrade: 0, schemeDiscount: 0, net: 0, units: 0 };
        
        const unitsPerPack = resolveUnitsPerStrip(activeBatch.unitsPerPack, activeBatch.packType);
        const normalizedLoose = allowLooseForBatch ? loose : 0;
        const totalUnits = (packs * unitsPerPack) + normalizedLoose;
        const baseRate = activeBatch.mrp; 
        
        let rateValue = baseRate;
        let rateTierToUse = customer?.defaultRateTier !== 'none' ? customer?.defaultRateTier : globalDefaultRateTier;
        if (rateTierToUse === 'rateA' && activeBatch.rateA) rateValue = activeBatch.rateA;
        else if (rateTierToUse === 'rateB' && activeBatch.rateB) rateValue = activeBatch.rateB;
        else if (rateTierToUse === 'rateC' && activeBatch.rateC) rateValue = activeBatch.rateC;
        else if (rateTierToUse === 'ptr' && activeBatch.ptr) rateValue = activeBatch.ptr;

        const unitRate = rateValue / unitsPerPack;
        const gross = unitRate * totalUnits;
        const afterTrade = gross * (1 - discount / 100);
        const netRate = unitRate * (1 - discount / 100);

        let schemeDiscountAmt = 0;
        if (schemeMode === 'free_qty') {
            schemeDiscountAmt = schemeQty * netRate;
        } else if (schemeMode === 'qty_ratio' && schemeTotalQty > 0) {
            const effectivePercent = (schemeQty / schemeTotalQty);
            schemeDiscountAmt = afterTrade * effectivePercent;
        } else if (schemeMode === 'percent') {
            schemeDiscountAmt = afterTrade * (schemeValue / 100);
        } else if (schemeMode === 'flat') {
            schemeDiscountAmt = schemeQty * schemeValue;
        } else if (schemeMode === 'price_override') {
            const overrideUnitRate = schemeValue / unitsPerPack;
            schemeDiscountAmt = (netRate - overrideUnitRate) * schemeQty;
        }

        const net = afterTrade - schemeDiscountAmt - itemFlatDiscount;

        return { gross, afterTrade, schemeDiscount: schemeDiscountAmt, net, units: totalUnits };
    }, [activeBatch, packs, loose, discount, itemFlatDiscount, schemeMode, schemeValue, schemeQty, schemeTotalQty, customer, globalDefaultRateTier, allowLooseForBatch]);

    const handleConfirm = useCallback(() => {
        if (!activeBatch || isReadOnly) return;
        
        if (lineTotals.units <= 0) {
            alert("Quantity must be greater than zero.");
            return;
        }


        if (shouldPreventNegativeStock && (currentAvailableStock <= 0 || lineTotals.units > currentAvailableStock)) {
            alert('Insufficient stock in selected batch. Billing not allowed due to Strict Stock Enforcement.');
            return;
        }

        let rateTierToUse = customer?.defaultRateTier !== 'none' ? customer?.defaultRateTier : globalDefaultRateTier;
        let rateValue = activeBatch.mrp;

        if (rateTierToUse === 'rateA' && activeBatch.rateA) rateValue = activeBatch.rateA;
        else if (rateTierToUse === 'rateB' && activeBatch.rateB) rateValue = activeBatch.rateB;
        else if (rateTierToUse === 'rateC' && activeBatch.rateC) rateValue = activeBatch.rateC;
        else if (rateTierToUse === 'ptr' && activeBatch.ptr) rateValue = activeBatch.ptr;

        const item: BillItem = {
            id: initialItem?.id || crypto.randomUUID(),
            inventoryItemId: activeBatch.id,
            name: activeBatch.name,
            brand: activeBatch.brand,
            mrp: activeBatch.mrp,
            quantity: packs,
            looseQuantity: allowLooseForBatch ? loose : 0,
            freeQuantity: freePacks,
            unit: 'pack',
            gstPercent: activeBatch.gstPercent,
            discountPercent: discount,
            itemFlatDiscount: itemFlatDiscount,
            batch: activeBatch.batch,
            expiry: activeBatch.expiry,
            rate: rateValue,
            unitsPerPack: resolveUnitsPerStrip(activeBatch.unitsPerPack, activeBatch.packType),
            schemeMode: schemeMode === 'No Scheme' ? undefined : schemeMode,
            schemeValue,
            schemeQty,
            schemeTotalQty,
            schemeDiscountAmount: lineTotals.schemeDiscount,
            schemeDiscountPercent: (lineTotals.schemeDiscount / (lineTotals.afterTrade || 1)) * 100
        };

        onConfirm(item);
        onClose();
    }, [activeBatch, packs, loose, freePacks, discount, itemFlatDiscount, schemeMode, schemeValue, schemeQty, schemeTotalQty, initialItem, onConfirm, onClose, isReadOnly, shouldPreventNegativeStock, currentAvailableStock, customer, globalDefaultRateTier, lineTotals, allowLooseForBatch]);

    const handleGlobalKeyDown = (e: React.KeyboardEvent) => {
        // Only trigger batch cycling if we are not in a select dropdown
        if (document.activeElement?.tagName === 'SELECT') return;

        if (e.key === 'ArrowDown') {
            e.preventDefault();
            setSelectedBatchIndex(prev => (prev + 1) % sortedBatches.length);
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setSelectedBatchIndex(prev => (prev - 1 + sortedBatches.length) % sortedBatches.length);
        }
    };

    const handleInputKeyDown = (e: React.KeyboardEvent, nextRef: React.RefObject<any>) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            if (nextRef && nextRef.current) {
                nextRef.current.focus();
                if (nextRef.current instanceof HTMLInputElement) nextRef.current.select();
            } else {
                handleConfirm();
            }
        }
    };

    useEffect(() => {
        if (!isOpen) return;

        const handleEscape = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                e.preventDefault();
                e.stopPropagation();
                onClose();
            }
        };

        window.addEventListener('keydown', handleEscape, true);
        return () => window.removeEventListener('keydown', handleEscape, true);
    }, [isOpen, onClose]);

    if (!isOpen) return null;

    return (
        createPortal(
            <div className="fixed inset-0 z-[150] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
                <div 
                    className="w-full max-w-5xl bg-white dark:bg-gray-900 rounded-none shadow-[0_30px_70px_rgba(0,0,0,0.4)] overflow-hidden flex flex-col md:flex-row animate-in zoom-in-95 duration-200 border border-white/10" 
                    onClick={e => e.stopPropagation()}
                    onKeyDown={handleGlobalKeyDown}
                >
                    {/* Left: Batch Selection (Blue Sidebar) */}
                    <div className="w-full md:w-[32%] bg-primary/5 dark:bg-slate-800/50 border-r border-app-border flex flex-col">
                        <div className="p-8 border-b border-app-border bg-white dark:bg-slate-900/50 rounded-none">
                            <h3 className="text-[11px] font-black text-primary uppercase tracking-[0.3em] mb-2">Inventory Locator</h3>
                            <h2 className="text-2xl font-black text-gray-950 dark:text-white uppercase leading-tight">{productName}</h2>
                            <p className="text-xs font-bold text-gray-400 mt-1 uppercase tracking-wider">{brandName || 'No Brand Set'}</p>
                        </div>
                        <div className="flex-1 overflow-y-auto p-4 space-y-2.5 custom-scrollbar" ref={batchListRef}>
                            {sortedBatches.map((b, idx) => {
                                const avail = b.stock - (cartUnitsByBatchId[b.id] || 0);
                                return (
                                    <button
                                        key={b.id}
                                        ref={selectedBatchIndex === idx ? activeBatchRef : null}
                                        onClick={() => setSelectedBatchIndex(idx)}
                                        className={`w-full p-5 rounded-none text-left transition-all border-2 group ${selectedBatchIndex === idx ? 'bg-primary border-primary text-white shadow-2xl scale-[1.03] -translate-y-1 z-10' : 'bg-white dark:bg-gray-800 border-app-border hover:border-primary/40'}`}
                                    >
                                        <div className="flex justify-between items-start mb-2">
                                            <span className={`font-mono font-black text-base ${selectedBatchIndex === idx ? 'text-white' : 'text-gray-900 dark:text-white'}`}>{b.batch}</span>
                                            <span className={`text-[9px] font-black uppercase px-2 py-1 rounded-none ${selectedBatchIndex === idx ? 'bg-white/20 text-white' : 'bg-blue-50 text-blue-700'}`}>Exp: {b.expiry}</span>
                                        </div>
                                        <div className="flex justify-between items-center mt-4">
                                            <div className="flex flex-col">
                                                <span className={`text-[10px] font-black uppercase tracking-widest ${selectedBatchIndex === idx ? 'text-white/70' : 'text-gray-400'}`}>Availability</span>
                                                <span className={`font-black text-sm ${selectedBatchIndex === idx ? 'text-white' : (avail <= 0 ? 'text-red-500' : 'text-emerald-600')}`}>
                                                    {avail} Units
                                                </span>
                                            </div>
                                            <div className="text-right">
                                                <span className={`text-[10px] font-black uppercase tracking-widest ${selectedBatchIndex === idx ? 'text-white/70' : 'text-gray-400'}`}>M.R.P</span>
                                                <span className={`font-black text-sm block ${selectedBatchIndex === idx ? 'text-white' : 'text-gray-950 dark:text-white'}`}>₹{b.mrp.toFixed(2)}</span>
                                            </div>
                                        </div>
                                    </button>
                                );
                            })}
                        </div>
                        <div className="p-4 bg-gray-100 dark:bg-gray-900 border-t border-app-border text-center rounded-none">
                            <p className="text-[10px] font-black text-gray-400 uppercase tracking-tighter">Use ↑ ↓ Arrow Keys to Cycle Batches</p>
                        </div>
                    </div>

                    {/* Right: Entry Form (Main Panel) */}
                    <div className="flex-1 flex flex-col bg-white dark:bg-gray-900 overflow-hidden rounded-none">
                        <div className="flex-1 p-10 overflow-y-auto custom-scrollbar">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
                                {/* Quantity Column */}
                                <div className="space-y-8">
                                    <div className="flex items-center gap-3">
                                        <div className="w-8 h-8 rounded-none bg-primary/10 flex items-center justify-center text-primary font-black text-xs">01</div>
                                        <h4 className="text-[11px] font-black text-gray-400 uppercase tracking-[0.25em]">Billing Quantity</h4>
                                    </div>
                                    
                                    <div className="flex items-end gap-6 bg-slate-50 dark:bg-slate-800/50 p-6 rounded-none border-2 border-app-border shadow-inner">
                                        <div className="flex-1">
                                            <label className="block text-[10px] font-black text-gray-400 uppercase mb-2 ml-1 tracking-widest">Packs</label>
                                            <input 
                                                ref={packsInputRef}
                                                type="number" 
                                                value={packs === 0 ? '' : packs} 
                                                onChange={e => setPacks(parseInt(e.target.value) || 0)}
                                                onKeyDown={e => handleInputKeyDown(e, looseInputRef)}
                                                className="w-full p-4 text-4xl font-black border-2 border-app-border rounded-none bg-white focus:border-primary focus:ring-8 focus:ring-primary/5 outline-none transition-all no-spinner shadow-sm"
                                            />
                                        </div>
                                        {allowLooseForBatch && <span className="text-4xl font-black text-gray-200 mb-5">:</span>}
                                        {allowLooseForBatch && (
                                            <div className="flex-1">
                                                <label className="block text-[10px] font-black text-gray-400 uppercase mb-2 ml-1 tracking-widest">Loose</label>
                                                <input 
                                                    ref={looseInputRef}
                                                    type="number" 
                                                    value={loose === 0 ? '' : loose} 
                                                    onChange={e => setLoose(parseInt(e.target.value) || 0)}
                                                    onKeyDown={e => handleInputKeyDown(e, discInputRef)}
                                                    className="w-full p-4 text-4xl font-black border-2 border-app-border rounded-none bg-white focus:border-primary focus:ring-8 focus:ring-primary/5 outline-none transition-all no-spinner shadow-sm"
                                                />
                                            </div>
                                        )}
                                    </div>

                                    <div className="space-y-4">
                                        <div className="flex items-center gap-3">
                                            <div className="w-8 h-8 rounded-none bg-blue-50 flex items-center justify-center text-blue-600 font-black text-xs">02</div>
                                            <h4 className="text-[11px] font-black text-gray-400 uppercase tracking-[0.25em]">Standard Discounts</h4>
                                        </div>
                                        <div className="grid grid-cols-2 gap-4">
                                            <div className="bg-blue-50/30 p-4 rounded-none border border-blue-100">
                                                <label className="block text-[9px] font-black text-blue-400 uppercase mb-1.5 ml-1 tracking-widest">Trade Disc %</label>
                                                <input 
                                                    ref={discInputRef}
                                                    type="number" 
                                                    value={discount === 0 ? '' : discount} 
                                                    onChange={e => setDiscount(parseFloat(e.target.value) || 0)}
                                                    onKeyDown={e => handleInputKeyDown(e, flatInputRef)}
                                                    className="w-full p-3 text-2xl font-black border-2 border-blue-100 rounded-none bg-white text-blue-600 focus:border-blue-400 outline-none no-spinner"
                                                />
                                            </div>
                                            <div className="bg-red-50/30 p-4 rounded-none border border-red-100">
                                                <label className="block text-[9px] font-black text-red-400 uppercase mb-1.5 ml-1 tracking-widest">Flat Off (₹)</label>
                                                <input 
                                                    ref={flatInputRef}
                                                    type="number" 
                                                    value={itemFlatDiscount === 0 ? '' : itemFlatDiscount} 
                                                    onChange={e => setItemFlatDiscount(parseFloat(e.target.value) || 0)}
                                                    onKeyDown={e => handleInputKeyDown(e, schemeModeRef)}
                                                    className="w-full p-3 text-2xl font-black border-2 border-red-100 rounded-none bg-white text-red-600 focus:border-red-400 outline-none no-spinner"
                                                />
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* Scheme Column */}
                                <div className="space-y-8">
                                    <div className="flex items-center gap-3">
                                        <div className="w-8 h-8 rounded-none bg-emerald-50 flex items-center justify-center text-emerald-600 font-black text-xs">03</div>
                                        <h4 className="text-[11px] font-black text-gray-400 uppercase tracking-[0.25em]">Promotional Schemes</h4>
                                    </div>

                                    <div className="p-6 bg-emerald-50/30 dark:bg-emerald-900/10 border-2 border-emerald-100 dark:border-emerald-800 rounded-none space-y-6 shadow-sm">
                                        <div>
                                            <label className="block text-[10px] font-black text-emerald-800 dark:text-emerald-300 uppercase mb-2 ml-1 tracking-widest">Pricing Strategy</label>
                                            <select 
                                                ref={schemeModeRef}
                                                value={schemeMode} 
                                                onChange={e => setSchemeMode(e.target.value as any)}
                                                onKeyDown={e => handleInputKeyDown(e, schemeMode !== 'No Scheme' ? schemeValRef : confirmBtnRef)}
                                                className="w-full p-4 text-base font-black border-2 border-emerald-100 rounded-none bg-white focus:ring-8 focus:ring-emerald-500/10 outline-none"
                                            >
                                                <option value="No Scheme">Standard Pricing</option>
                                                <option value="qty_ratio">Ratio Benefit (e.g. 1 in 5)</option>
                                                <option value="free_qty">100% Off (Specific Free Units)</option>
                                                <option value="percent">Bonus Percentage (%)</option>
                                                <option value="flat">Bonus Flat Discount (₹)</option>
                                                <option value="price_override">Manual Net Unit Rate (₹)</option>
                                            </select>
                                        </div>

                                        {schemeMode !== 'No Scheme' && (
                                            <div className="grid grid-cols-2 gap-4 animate-in slide-in-from-top-4 duration-300">
                                                <div className={schemeMode === 'qty_ratio' ? 'col-span-1' : 'col-span-2'}>
                                                    <label className="block text-[9px] font-black text-emerald-700 uppercase mb-2 ml-1 tracking-widest">
                                                        {schemeMode === 'qty_ratio' ? 'Free Units' : schemeMode === 'price_override' ? 'Target Unit Rate (₹)' : 'Scheme Value'}
                                                    </label>
                                                    <input 
                                                        ref={schemeValRef}
                                                        type="number" 
                                                        value={schemeMode === 'qty_ratio' || schemeMode === 'free_qty' || schemeMode === 'flat' ? schemeQty : schemeValue}
                                                        onChange={e => {
                                                            const val = parseFloat(e.target.value) || 0;
                                                            if (schemeMode === 'qty_ratio' || schemeMode === 'free_qty' || schemeMode === 'flat') setSchemeQty(val);
                                                            else setSchemeValue(val);
                                                        }}
                                                        onKeyDown={e => handleInputKeyDown(e, schemeMode === 'qty_ratio' ? schemeTotalQtyRef : confirmBtnRef)}
                                                        className="w-full p-4 text-2xl font-black border-2 border-emerald-100 rounded-none bg-white shadow-sm outline-none no-spinner"
                                                    />
                                                </div>
                                                {schemeMode === 'qty_ratio' && (
                                                    <div>
                                                        <label className="block text-[9px] font-black text-emerald-700 uppercase mb-2 ml-1 tracking-widest">In Total Units</label>
                                                        <input 
                                                            ref={schemeTotalQtyRef}
                                                            type="number" 
                                                            value={schemeTotalQty}
                                                            onChange={e => setSchemeTotalQty(parseFloat(e.target.value) || 0)}
                                                            onKeyDown={e => handleInputKeyDown(e, confirmBtnRef)}
                                                            className="w-full p-4 text-2xl font-black border-2 border-emerald-100 rounded-none bg-white shadow-sm outline-none no-spinner"
                                                        />
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                        
                                        <div className="bg-white/40 dark:bg-black/20 p-4 rounded-none border border-emerald-100/50">
                                            <div className="flex justify-between text-[10px] font-black text-emerald-800/60 uppercase tracking-widest mb-2">
                                                <span>Recap & Projections</span>
                                            </div>
                                            <div className="space-y-1.5">
                                                <div className="flex justify-between text-xs font-bold text-gray-500">
                                                    <span>Gross (Before Disc)</span>
                                                    <span>₹{lineTotals.gross.toFixed(2)}</span>
                                                </div>
                                                <div className="flex justify-between text-xs font-black text-emerald-600">
                                                    <span>Total Benefit (-)</span>
                                                    <span>₹{(lineTotals.schemeDiscount + itemFlatDiscount + (lineTotals.gross - lineTotals.afterTrade)).toFixed(2)}</span>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Sticky Footer */}
                        <div className="p-8 bg-gray-50 dark:bg-gray-950 border-t border-app-border flex justify-between items-center shadow-[0_-20px_50px_rgba(0,0,0,0.05)] rounded-none">
                            <div className="flex flex-col">
                                <span className="text-[10px] font-black text-gray-400 uppercase tracking-[0.3em] mb-1 opacity-60">Net Billing Value</span>
                                <span className="text-5xl font-black text-primary tracking-tighter">
                                    ₹{lineTotals.net.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                </span>
                            </div>
                            <div className="flex gap-4">
                                <button onClick={onClose} className="px-10 py-5 text-xs font-black uppercase tracking-[0.2em] text-gray-400 hover:text-gray-700 transition-all transform active:scale-95">Discard</button>
                                <button 
                                    ref={confirmBtnRef}
                                    onClick={handleConfirm}
                                    disabled={isReadOnly}
                                    className="px-16 py-5 bg-primary text-white font-black rounded-none shadow-2xl shadow-primary/30 hover:bg-primary-dark transition-all transform active:scale-95 uppercase tracking-[0.2em] text-lg disabled:bg-gray-300 disabled:shadow-none"
                                >
                                    {initialItem ? 'Update Item' : 'Add to Invoice'}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>,
            document.body
        )
    );
};

export default SalesLineModal;
