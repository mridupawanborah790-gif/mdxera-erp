import React, { useState, useEffect, useRef } from 'react';
import Modal from './Modal';
import type { InventoryItem } from '../types';
import { renderBarcode, generateRandomBarcode } from '../utils/barcode';
import { handleEnterToNextField } from '../utils/navigation';
import { normalizeImportDate, formatExpiryToMMYY } from '../utils/helpers';
import { buildTotalStockFromBreakup, getStockBreakup } from '../utils/stock';
import { isStripBasedPack } from '../utils/pack';

interface EditProductModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: (updatedProduct: InventoryItem) => void;
    productToEdit: InventoryItem | null;
    onPrintBarcodeClick?: (item: InventoryItem) => void;
    onNext?: () => void;
    onPrevious?: () => void;
    hasNext?: boolean;
    hasPrevious?: boolean;
}

const matrixRowTextStyle = "text-2xl font-normal tracking-tight uppercase leading-tight";

const EditProductModal: React.FC<EditProductModalProps> = ({ 
    isOpen, 
    onClose, 
    onSave, 
    productToEdit, 
    onPrintBarcodeClick,
    onNext,
    onPrevious,
    hasNext,
    hasPrevious
}) => {
    const [product, setProduct] = useState<InventoryItem | null>(null);
    const [expiryDisplay, setExpiryDisplay] = useState('');
    const barcodeRef = useRef<SVGSVGElement>(null);

    useEffect(() => {
        if (isOpen && productToEdit) {
            setProduct({ ...productToEdit });
            setExpiryDisplay(formatExpiryToMMYY(productToEdit.expiry));
        }
    }, [isOpen, productToEdit]);

    useEffect(() => {
        if (isOpen && product?.barcode && barcodeRef.current) {
            renderBarcode(barcodeRef.current, product.barcode);
        }
    }, [product?.barcode, isOpen]);

    if (!isOpen || !product) return null;

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
        const { name, value, type } = e.target;
        
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
                setProduct(prev => prev ? ({ ...prev, expiry: normalized || '' }) : null);
            }
            return;
        }

        if (name === 'packType') {
            const inferredUnitsPerPack = parseInt(value.match(/\d+/)?.[0] || '1', 10);
            setProduct(prev => prev ? ({
                ...prev,
                packType: value,
                unitsPerPack: Number.isFinite(inferredUnitsPerPack) && inferredUnitsPerPack > 0 ? inferredUnitsPerPack : 1,
            }) : null);
            return;
        }

        setProduct(prev => prev ? ({
            ...prev,
            [name]: type === 'number' ? (parseFloat(value) || 0) : value,
        }) : null);
    };

    const handleSave = () => {
        if (product) {
            onSave(product);
            onClose();
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLElement>) => {
        if (e.altKey && e.key.toLowerCase() === 'n' && hasNext && onNext) {
            e.preventDefault();
            onNext();
        } else if (e.altKey && e.key.toLowerCase() === 'p' && hasPrevious && onPrevious) {
            e.preventDefault();
            onPrevious();
        } else {
            handleEnterToNextField(e);
        }
    };


    const unitsPerPack = Math.max(1, Number(product.unitsPerPack || 1));
    const isStripPack = isStripBasedPack(product.packType);
    const allowLooseStock = isStripPack && unitsPerPack > 1;
    const stockBreakup = getStockBreakup(product.stock, unitsPerPack);

    const handleStockBreakupChange = (field: 'pack' | 'loose', value: string) => {
        const numericValue = Math.max(0, Math.floor(Number(value || 0)));
        if (!allowLooseStock) {
            setProduct(prev => prev ? ({ ...prev, stock: numericValue }) : null);
            return;
        }
        const nextPack = field === 'pack' ? numericValue : stockBreakup.pack;
        const nextLoose = field === 'loose' ? numericValue : stockBreakup.loose;
        const totalUnits = buildTotalStockFromBreakup(nextPack, nextLoose, unitsPerPack, true);
        setProduct(prev => prev ? ({ ...prev, stock: totalUnits }) : null);
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={`Alter Inventory: ${product.name}`} widthClass="max-w-5xl">
            <div className="flex flex-col h-full bg-white dark:bg-zinc-950 overflow-hidden" onKeyDown={handleKeyDown}>
                {/* Navigation Bar */}
                {(onNext || onPrevious) && (
                    <div className="px-6 py-2 bg-gray-50 border-b border-app-border flex justify-between items-center no-print">
                        <div className="flex gap-2">
                            <button 
                                onClick={onPrevious} 
                                disabled={!hasPrevious}
                                className="px-4 py-1 text-[10px] font-black uppercase border border-gray-400 bg-white hover:bg-gray-50 disabled:opacity-30 transition-all"
                            >
                                ← Previous (Alt+P)
                            </button>
                            <button 
                                onClick={onNext} 
                                disabled={!hasNext}
                                className="px-4 py-1 text-[10px] font-black uppercase border border-gray-400 bg-white hover:bg-gray-50 disabled:opacity-30 transition-all"
                            >
                                Next (Alt+N) →
                            </button>
                        </div>
                        <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Navigation Control</span>
                    </div>
                )}

                <div className="flex-1 overflow-y-auto p-8 space-y-8 custom-scrollbar">
                    {/* Header: Core ID & Barcode */}
                    <div className="flex flex-col md:flex-row justify-between items-start gap-8 border-b border-gray-100 pb-8">
                        <div className="flex-1 space-y-4">
                            <div>
                                <label className="block text-[10px] font-black uppercase text-gray-400 tracking-widest mb-1.5 ml-1">Official Name</label>
                                <input 
                                    name="name" 
                                    value={product.name} 
                                    onChange={handleChange} 
                                    className="w-full text-3xl font-black uppercase border-b-2 border-primary focus:border-accent outline-none bg-transparent"
                                />
                            </div>
                            <div className="grid grid-cols-2 gap-6">
                                <div>
                                    <label className="block text-[10px] font-black uppercase text-gray-400 tracking-widest mb-1.5 ml-1">Brand / MFR</label>
                                    <input name="brand" value={product.brand || ''} onChange={handleChange} className="w-full tally-input" />
                                </div>
                                <div>
                                    <label className="block text-[10px] font-black uppercase text-gray-400 tracking-widest mb-1.5 ml-1">Category</label>
                                    <input name="category" value={product.category || ''} onChange={handleChange} className="w-full tally-input" />
                                </div>
                            </div>
                        </div>
                        <div className="w-full md:w-64 flex flex-col items-center">
                            <div className="bg-white p-4 border-2 border-gray-200 shadow-sm mb-4">
                                <svg ref={barcodeRef} className="w-full h-16"></svg>
                            </div>
                            <div className="flex gap-2 w-full">
                                <button onClick={() => setProduct(prev => prev ? ({...prev, barcode: generateRandomBarcode()}) : null)} className="flex-1 py-1.5 text-[9px] font-black uppercase border border-gray-400 hover:bg-gray-50">Generate</button>
                                <button onClick={() => onPrintBarcodeClick?.(product)} className="flex-1 py-1.5 text-[9px] font-black uppercase bg-primary text-white hover:bg-primary-dark">Print Labels</button>
                            </div>
                        </div>
                    </div>

                    {/* Stock & Batch Segment */}
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
                        <div className="bg-primary/5 p-4 border border-primary/10">
                            <label className="block text-[10px] font-black uppercase text-primary tracking-widest mb-2">Batch Number</label>
                            <input name="batch" value={product.batch} onChange={handleChange} className="w-full tally-input font-mono !text-lg uppercase" />
                        </div>
                        <div className="bg-red-50 p-4 border border-red-100">
                            <label className="block text-[10px] font-black uppercase text-red-600 tracking-widest mb-2">Expiry (MM/YY)</label>
                            <input name="expiry" value={expiryDisplay} onChange={handleChange} maxLength={5} placeholder="MM/YY" className="w-full tally-input !text-lg !text-red-700" />
                        </div>
                        <div className="bg-emerald-50 p-4 border border-emerald-100 md:col-span-2">
                            <label className="block text-[10px] font-black uppercase text-emerald-700 tracking-widest mb-2">Current Stock Breakup</label>
                            <div className={`grid gap-4 ${allowLooseStock ? 'grid-cols-2' : 'grid-cols-1'}`}>
                                <div>
                                    <label className="block text-[9px] font-black uppercase text-emerald-800 mb-1 ml-1">{allowLooseStock ? 'Current Stock (Strip)' : 'Current Stock (Pack/Unit)'}</label>
                                    <input
                                        type="number"
                                        min={0}
                                        value={allowLooseStock ? stockBreakup.pack : stockBreakup.totalUnits}
                                        onChange={(e) => handleStockBreakupChange('pack', e.target.value)}
                                        className="w-full tally-input !text-lg !text-emerald-800"
                                    />
                                </div>
                                {allowLooseStock && (
                                    <div>
                                        <label className="block text-[9px] font-black uppercase text-emerald-800 mb-1 ml-1">Current Stock (Loose)</label>
                                        <input
                                            type="number"
                                            min={0}
                                            max={Math.max(0, unitsPerPack - 1)}
                                            value={stockBreakup.loose}
                                            onChange={(e) => handleStockBreakupChange('loose', e.target.value)}
                                            className="w-full tally-input !text-lg !text-emerald-800"
                                        />
                                    </div>
                                )}
                            </div>
                            {allowLooseStock ? (
                                <p className="mt-2 text-[10px] font-black uppercase tracking-wider text-emerald-700">
                                    Total Units: {stockBreakup.totalUnits} = ({stockBreakup.pack} × {unitsPerPack}) + {stockBreakup.loose}
                                </p>
                            ) : (
                                <p className="mt-2 text-[10px] font-black uppercase tracking-wider text-emerald-700">
                                    Total Units: {stockBreakup.totalUnits}
                                </p>
                            )}
                        </div>
                        <div className="bg-gray-100 p-4 border border-gray-200">
                            <label className="block text-[10px] font-black uppercase text-gray-500 tracking-widest mb-2">Min. Limit</label>
                            <input type="number" name="minStockLimit" value={product.minStockLimit} onChange={handleChange} className="w-full tally-input !text-lg" />
                        </div>
                    </div>

                    {/* Pricing Structure */}
                    <div className="space-y-4">
                        <div className="flex items-center gap-2">
                            <span className="w-5 h-5 rounded-none bg-primary text-white flex items-center justify-center font-black text-[9px]">₹</span>
                            <h3 className="text-[11px] font-black uppercase tracking-[0.2em] text-primary">Pricing Structure (Per Pack)</h3>
                        </div>
                        <div className="grid grid-cols-2 md:grid-cols-5 gap-6">
                            <div>
                                <label className="block text-[9px] font-black uppercase text-gray-400 mb-1 ml-1">Landed Cost</label>
                                <input type="number" name="purchasePrice" value={product.purchasePrice} onChange={handleChange} className="w-full tally-input !text-base" />
                            </div>
                            <div>
                                <label className="block text-[9px] font-black uppercase text-gray-400 mb-1 ml-1">P.T.R</label>
                                <input type="number" name="ptr" value={product.ptr || 0} onChange={handleChange} className="w-full tally-input !text-base" />
                            </div>
                            <div className="bg-yellow-50/50 p-1">
                                <label className="block text-[9px] font-black uppercase text-yellow-700 mb-1 ml-1">M.R.P</label>
                                <input type="number" name="mrp" value={product.mrp} onChange={handleChange} className="w-full tally-input !text-lg border-yellow-400 !bg-white" />
                            </div>
                            <div>
                                <label className="block text-[9px] font-black uppercase text-gray-400 mb-1 ml-1">Tier A Rate</label>
                                <input type="number" name="rateA" value={product.rateA || 0} onChange={handleChange} className="w-full tally-input !text-base" />
                            </div>
                            <div>
                                <label className="block text-[9px] font-black uppercase text-gray-400 mb-1 ml-1">Tier B Rate</label>
                                <input type="number" name="rateB" value={product.rateB || 0} onChange={handleChange} className="w-full tally-input !text-base" />
                            </div>
                            <div>
                                <label className="block text-[9px] font-black uppercase text-gray-400 mb-1 ml-1">Tier C Rate</label>
                                <input type="number" name="rateC" value={product.rateC || 0} onChange={handleChange} className="w-full tally-input !text-base" />
                            </div>
                        </div>
                    </div>

                    {/* Packaging & Tax */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-8 pt-4">
                        <div className="space-y-4">
                            <h4 className="text-[10px] font-black uppercase text-gray-500 border-b border-gray-100 pb-1">Packaging Utility</h4>
                            <div>
                                <label className="block text-[9px] font-black uppercase text-gray-400 mb-1 ml-1">Pack</label>
                                <input name="packType" value={product.packType || ''} onChange={handleChange} placeholder="e.g. 10s, 100ml" className="w-full tally-input" />
                            </div>
                        </div>
                        <div className="space-y-4">
                            <h4 className="text-[10px] font-black uppercase text-gray-500 border-b border-gray-100 pb-1">Statutory Details</h4>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-[9px] font-black uppercase text-gray-400 mb-1 ml-1">G.S.T %</label>
                                    <input type="number" name="gstPercent" value={product.gstPercent} onChange={handleChange} className="w-full tally-input" />
                                </div>
                                <div>
                                    <label className="block text-[9px] font-black uppercase text-gray-400 mb-1 ml-1">H.S.N Code</label>
                                    <input name="hsnCode" value={product.hsnCode || ''} onChange={handleChange} className="w-full tally-input font-mono" />
                                </div>
                            </div>
                        </div>
                        <div className="space-y-4">
                            <h4 className="text-[10px] font-black uppercase text-gray-500 border-b border-gray-100 pb-1">Asset Monitoring</h4>
                            <div className="grid grid-cols-2 gap-4">
                                <div className="p-2 bg-gray-50 border border-gray-200">
                                    <p className="text-[8px] font-black text-gray-400 uppercase tracking-widest leading-none">Line Value</p>
                                    <p className="text-sm font-black mt-1">₹{(product.value || 0).toLocaleString()}</p>
                                </div>
                                <div className="p-2 bg-blue-50 border border-blue-100">
                                    <p className="text-[8px] font-black text-blue-400 uppercase tracking-widest leading-none">Unit Cost</p>
                                    <p className="text-sm font-black text-blue-900 mt-1">₹{(product.cost || 0).toFixed(2)}</p>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="p-4 bg-gray-50 border-t border-app-border flex justify-end gap-3 flex-shrink-0">
                    <button type="button" onClick={onClose} className="px-8 py-2 text-[10px] font-black uppercase tracking-widest text-gray-500 hover:text-black">Discard</button>
                    <button 
                        type="button"
                        onClick={handleSave}
                        className="px-16 py-4 bg-primary text-white text-[12px] font-black uppercase tracking-[0.3em] shadow-2xl hover:bg-primary-dark transition-all transform active:scale-95"
                    >
                        Accept Alteration (Enter)
                    </button>
                </div>
            </div>
        </Modal>
    );
};

export default EditProductModal;
