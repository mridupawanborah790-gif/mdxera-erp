import React, { useState, useRef, useEffect, useMemo } from 'react';
import Modal from './Modal';
import type { InventoryItem, Medicine } from '../types';
import { renderBarcode, generateRandomBarcode } from '../utils/barcode';
import { handleEnterToNextField } from '../utils/navigation';
import { normalizeImportDate, formatExpiryToMMYY } from '../utils/helpers';
import { fuzzyMatch } from '../utils/search';
import { extractPackMultiplier, resolveUnitsPerStrip } from '../utils/pack';

interface AddProductModalProps {
    isOpen: boolean;
    onClose: () => void;
    onAddProduct: (newProduct: Omit<InventoryItem, 'id'>) => void;
    initialData?: Partial<InventoryItem>;
    organizationId: string;
    medicines: Medicine[];
}

const AddProductModal: React.FC<AddProductModalProps> = ({ isOpen, onClose, onAddProduct, initialData, organizationId, medicines }) => {
    const initialState: Omit<InventoryItem, 'id'> = {
        name: '',
        brand: '',
        category: 'General',
        manufacturer: '',
        stock: 0,
        unitsPerPack: 10,
        packType: '',
        unitOfMeasurement: '',
        packUnit: 'Strip',
        baseUnit: 'Tablet',
        minStockLimit: 10,
        batch: '',
        expiry: '',
        purchasePrice: 0,
        ptr: 0,
        mrp: 0,
        rateA: 0,
        rateB: 0,
        rateC: 0,
        gstPercent: 12,
        hsnCode: '',
        composition: '',
        barcode: '',
        deal: 0,
        free: 0,
        supplierName: '',
        organization_id: organizationId,
        cost: 0,
        value: 0,
        is_active: true
    };

    const [product, setProduct] = useState<Omit<InventoryItem, 'id'>>(initialState);
    const [expiryDisplay, setExpiryDisplay] = useState('');
    const [errors, setErrors] = useState<Partial<Record<keyof typeof product, string>>>({});
    const barcodeRef = useRef<SVGSVGElement>(null);

    const [masterSearchTerm, setMasterSearchTerm] = useState('');
    const [isMasterSearchOpen, setIsMasterSearchOpen] = useState(false);
    const [selectedMasterIndex, setSelectedMasterIndex] = useState(0);
    const [selectedMasterId, setSelectedMasterId] = useState<string | null>(null);

    const [stockPacks, setStockPacks] = useState(0);
    const [stockLoose, setStockLoose] = useState(0);
    const [stockFree, setStockFree] = useState(0);

    const masterSearchResults = useMemo(() => {
        if (!masterSearchTerm.trim()) return [];
        return medicines.filter(m =>
            fuzzyMatch(m.name, masterSearchTerm) ||
            fuzzyMatch(m.composition, masterSearchTerm) ||
            fuzzyMatch(m.brand, masterSearchTerm) ||
            fuzzyMatch(m.materialCode, masterSearchTerm)
        ).slice(0, 10);
    }, [masterSearchTerm, medicines]);

    useEffect(() => {
        if (isOpen) {
            setProduct({ ...initialState, ...initialData, organization_id: organizationId });
            setExpiryDisplay(formatExpiryToMMYY(initialData?.expiry));
            setStockPacks(0);
            setStockLoose(0);
            setStockFree(0);
            setErrors({});
            setMasterSearchTerm('');
            setIsMasterSearchOpen(false);
            setSelectedMasterId(null);
        }
    }, [isOpen, initialData, organizationId]);

    useEffect(() => {
        if (isOpen && product.barcode && barcodeRef.current) {
            renderBarcode(barcodeRef.current, product.barcode);
        }
    }, [product.barcode, isOpen]);

    useEffect(() => {
        if (!isOpen) return;
        const unitsPerPack = product.unitsPerPack || 1;
        const freeUnits = stockFree * unitsPerPack;
        let total = (stockPacks * unitsPerPack) + stockLoose + freeUnits;

        const unitCost = unitsPerPack > 0 ? (product.purchasePrice / unitsPerPack) : product.purchasePrice;
        const totalValue = (total - freeUnits) * unitCost; // Valuation usually excludes free units

        setProduct(prev => ({
            ...prev,
            stock: total,
            purchaseFree: freeUnits,
            cost: unitCost,
            value: totalValue
        }));
    }, [stockPacks, stockLoose, stockFree, product.unitsPerPack, product.purchasePrice, isOpen]);

    const handleSelectMaster = (med: Medicine) => {
        const units = resolveUnitsPerStrip(extractPackMultiplier(med.pack) ?? 1, med.pack);

        setProduct(prev => ({
            ...prev,
            name: med.name,
            code: med.materialCode, // Essential for linking to Material Master
            brand: med.brand || '',
            category: med.composition ? "Medicine" : "General",
            manufacturer: med.manufacturer || med.marketer || '',
            composition: med.composition || '',
            hsnCode: med.hsnCode || '',
            gstPercent: med.gstRate || 0,
            mrp: parseFloat(med.mrp || '0'),
            rateA: med.rateA || 0,
            rateB: med.rateB || 0,
            rateC: med.rateC || 0,
            packType: med.pack || '',
            unitsPerPack: units,
            barcode: med.barcode || prev.barcode
        }));
        setMasterSearchTerm(med.name);
        setSelectedMasterId(med.id);
        setIsMasterSearchOpen(false);
        setErrors(prev => ({ ...prev, name: undefined }));

        setTimeout(() => document.getElementById('batch')?.focus(), 150);
    };

    const handleMasterKeyDown = (e: React.KeyboardEvent) => {
        if (!isMasterSearchOpen || masterSearchResults.length === 0) {
            if (e.key === 'Enter' && masterSearchTerm) {
                setIsMasterSearchOpen(true);
            }
            return;
        }
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            setSelectedMasterIndex(prev => (prev + 1) % masterSearchResults.length);
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setSelectedMasterIndex(prev => (prev - 1 + masterSearchResults.length) % masterSearchResults.length);
        } else if (e.key === 'Enter') {
            e.preventDefault();
            handleSelectMaster(masterSearchResults[selectedMasterIndex]);
        } else if (e.key === 'Escape') {
            setIsMasterSearchOpen(false);
        }
    };

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
        const { name, value, type } = e.target;
        if (name === 'stockPacksInput') {
            setStockPacks(parseInt(value, 10) || 0);
            return;
        }
        if (name === 'stockLooseInput') {
            setStockLoose(parseInt(value, 10) || 0);
            return;
        }
        if (name === 'stockFreeInput') {
            setStockFree(parseInt(value, 10) || 0);
            return;
        }
        if (name === 'expiry') {
            const cleaned = value.replace(/\D/g, '');
            let formatted = cleaned;
            if (cleaned.length === 0) {
                formatted = '';
            } else {
                let month = cleaned.slice(0, 2);
                let year = cleaned.slice(2, 4);
                if (month.length === 2) {
                    let m = parseInt(month);
                    if (m > 12) month = '12';
                    if (m === 0) month = '01';
                }
                if (cleaned.length > 2) formatted = `${month}/${year}`;
                else formatted = month;
            }
            setExpiryDisplay(formatted);
            if (formatted.length === 5) {
                const normalized = normalizeImportDate(formatted);
                setProduct(prev => ({ ...prev, expiry: normalized || '' }));
            }
            return;
        }

        setProduct(prev => ({
            ...prev,
            [name]: type === 'number' ? (parseFloat(value) || 0) : value,
        }));

        if (errors[name as keyof typeof errors]) {
            setErrors(prev => ({ ...prev, [name]: undefined }));
        }
    };

    const validate = () => {
        const newErrors: Partial<Record<keyof typeof product, string>> = {};
        if (!selectedMasterId) newErrors.name = "Selection from Master Catalog is required.";
        if (!product.name.trim()) newErrors.name = "Product name is required.";
        if (!product.batch.trim()) newErrors.batch = "Batch number is required.";
        if (!expiryDisplay || expiryDisplay.length < 5) newErrors.expiry = "Valid MM/YY expiry is required.";
        if (product.mrp <= 0) newErrors.mrp = "MRP must be positive.";

        setErrors(newErrors);

        if (Object.keys(newErrors).length > 0) {
            // Focus the first error field if possible
            const firstErrorKey = Object.keys(newErrors)[0];
            const element = document.getElementsByName(firstErrorKey)[0];
            if (element) (element as HTMLElement).focus();
        }

        return Object.keys(newErrors).length === 0;
    }

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (validate()) {
            onAddProduct({ ...product, organization_id: organizationId });
            onClose();
        }
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Add Inventory (From Master Catalog)" widthClass="max-w-4xl">
            <form onSubmit={handleSubmit} className="flex flex-col h-full bg-white dark:bg-zinc-950 overflow-hidden" onKeyDown={handleEnterToNextField}>
                <div className="p-4 bg-primary/5 border-b border-app-border relative">
                    <div className="flex items-center gap-2 mb-2">
                        <span className="w-5 h-5 rounded-none bg-primary text-white flex items-center justify-center font-black text-[9px]">01</span>
                        <h3 className="text-[11px] font-black uppercase tracking-widest text-primary">Select SKU from Medicine Master</h3>
                    </div>
                    <div className="relative">
                        <input
                            type="text"
                            autoFocus
                            placeholder="Type to search catalog (Name, Code...)"
                            value={masterSearchTerm}
                            onChange={e => {
                                setMasterSearchTerm(e.target.value);
                                setIsMasterSearchOpen(true);
                                setSelectedMasterId(null);
                                setSelectedMasterIndex(0);
                            }}
                            onFocus={() => setIsMasterSearchOpen(true)}
                            onKeyDown={handleMasterKeyDown}
                            className={`w-full p-2.5 pl-10 text-base font-bold border-2 rounded-none outline-none transition-all uppercase ${errors.name ? 'border-red-500 bg-red-50' : 'border-gray-300 bg-white focus:border-primary focus:bg-yellow-50'}`}
                        />
                        <svg className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"><circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" /></svg>

                        {isMasterSearchOpen && masterSearchResults.length > 0 && (
                            <ul className="absolute top-full left-0 w-full mt-1 bg-white border-2 border-primary shadow-2xl z-[100] divide-y divide-gray-100 overflow-hidden">
                                {masterSearchResults.map((med, idx) => (
                                    <li
                                        key={med.id}
                                        onClick={() => handleSelectMaster(med)}
                                        onMouseEnter={() => setSelectedMasterIndex(idx)}
                                        className={`p-3 cursor-pointer flex justify-between items-center ${idx === selectedMasterIndex ? 'bg-primary text-white' : 'hover:bg-yellow-50'}`}
                                    >
                                        <div className="flex flex-col">
                                            <span className="text-sm font-black uppercase">{med.name}</span>
                                            <span className={`text-[9px] font-bold uppercase ${idx === selectedMasterIndex ? 'text-white/60' : 'text-gray-400'}`}>{med.materialCode} | {med.brand} | {med.composition}</span>
                                        </div>
                                        <div className="text-right">
                                            <span className="text-xs font-black">₹{parseFloat(med.mrp || '0').toFixed(2)}</span>
                                        </div>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </div>
                </div>

                <div className={`flex-1 p-5 overflow-y-auto space-y-6 transition-opacity duration-300 ${selectedMasterId ? 'opacity-100' : 'opacity-20 pointer-events-none'}`}>
                    <div className="flex items-center gap-2">
                        <span className="w-5 h-5 rounded-none bg-emerald-600 text-white flex items-center justify-center font-black text-[9px]">02</span>
                        <h3 className="text-[11px] font-black uppercase tracking-widest text-emerald-700">Enter Batch & Stock Details</h3>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        <div>
                            <label className="block text-xs font-medium text-app-text-secondary">Batch Number *</label>
                            <input type="text" id="batch" name="batch" value={product.batch} onChange={handleChange} className="mt-1 block w-full border border-gray-400 p-2 bg-input-bg text-app-text-primary focus:bg-yellow-50 outline-none uppercase font-bold" />
                            {errors.batch && <p className="text-red-500 text-xs mt-1">{errors.batch}</p>}
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-app-text-secondary">Expiry (MM/YY) *</label>
                            <input type="text" name="expiry" value={expiryDisplay} onChange={handleChange} placeholder="MM/YY" maxLength={5} className="mt-1 block w-full border border-gray-400 p-2 bg-input-bg text-app-text-primary focus:bg-yellow-50 outline-none font-bold" />
                            {errors.expiry && <p className="text-red-500 text-xs mt-1">{errors.expiry}</p>}
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-app-text-secondary">Pack qty</label>
                            <input type="number" name="stockPacksInput" value={stockPacks} onChange={handleChange} className="mt-1 block w-full border border-gray-400 p-2 bg-input-bg text-app-text-primary focus:bg-yellow-50 outline-none font-bold no-spinner" />
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-app-text-secondary">Loose qty</label>
                            <input type="number" name="stockLooseInput" value={stockLoose} onChange={handleChange} className="mt-1 block w-full border border-gray-400 p-2 bg-input-bg text-app-text-primary focus:bg-yellow-50 outline-none font-bold no-spinner" />
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-app-text-secondary">Free Qty</label>
                            <input type="number" name="stockFreeInput" value={stockFree} onChange={handleChange} className="mt-1 block w-full border border-gray-400 p-2 bg-input-bg text-app-text-primary focus:bg-yellow-50 outline-none font-bold no-spinner" />
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-app-text-secondary">Units Per Pack</label>
                            <input type="number" name="unitsPerPack" value={product.unitsPerPack} onChange={handleChange} className="mt-1 block w-full border border-gray-400 p-2 bg-input-bg text-app-text-primary focus:bg-yellow-50 outline-none font-bold" />
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-app-text-secondary">Purchase Price (Pack)</label>
                            <input type="number" name="purchasePrice" value={product.purchasePrice} onChange={handleChange} className="mt-1 block w-full border border-gray-400 p-2 bg-input-bg text-app-text-primary focus:bg-yellow-50 outline-none font-bold" />
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-app-text-secondary">MRP (Pack) *</label>
                            <input type="number" name="mrp" value={product.mrp} onChange={handleChange} className={`mt-1 block w-full border p-2 bg-input-bg text-app-text-primary focus:bg-yellow-50 outline-none font-bold ${errors.mrp ? 'border-red-500 bg-red-50' : 'border-gray-400'}`} />
                            {errors.mrp && <p className="text-red-500 text-[9px] mt-0.5">{errors.mrp}</p>}
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-app-text-secondary">PTR (Pack)</label>
                            <input type="number" name="ptr" value={product.ptr} onChange={handleChange} className="mt-1 block w-full border border-gray-400 p-2 bg-input-bg text-app-text-primary focus:bg-yellow-50 outline-none font-bold" />
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-app-text-secondary">Sales Rate (Rate A)</label>
                            <input type="number" name="rateA" value={product.rateA} onChange={handleChange} className="mt-1 block w-full border border-gray-400 p-2 bg-input-bg text-app-text-primary focus:bg-yellow-50 outline-none font-bold" />
                        </div>
                    </div>

                    <div className="bg-slate-50 p-4 border border-gray-200">
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
                            <div className="flex flex-col">
                                <span className="text-[10px] font-black uppercase text-gray-400">Total Units</span>
                                <span className="text-xl font-black text-primary">{product.stock}</span>
                            </div>
                            <div className="flex flex-col">
                                <span className="text-[10px] font-black uppercase text-gray-400">Unit Cost</span>
                                <span className="text-xl font-black text-primary">₹{(product.cost || 0).toFixed(2)}</span>
                            </div>
                            <div className="flex flex-col md:col-span-2">
                                <span className="text-[10px] font-black uppercase text-gray-400">Inventory Value</span>
                                <span className="text-xl font-black text-emerald-700">₹{(product.value || 0).toFixed(2)}</span>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="p-4 bg-gray-50 border-t border-app-border flex justify-end gap-3 flex-shrink-0">
                    <button type="button" onClick={onClose} className="px-8 py-2 text-[10px] font-black uppercase tracking-widest text-gray-500 hover:text-black">Discard</button>
                    <button
                        type="submit"
                        disabled={!selectedMasterId}
                        className="px-16 py-4 bg-primary text-white text-[12px] font-black uppercase tracking-[0.3em] shadow-2xl hover:bg-primary-dark transition-all transform active:scale-95 disabled:opacity-30 disabled:shadow-none"
                    >
                        Accept & Save (Enter)
                    </button>
                </div>
            </form>
        </Modal>
    );
};

export default AddProductModal;
