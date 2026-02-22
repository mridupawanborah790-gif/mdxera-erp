
import React, { useMemo } from 'react';
import Modal from './Modal';
import { Purchase, PurchaseItem } from '../types';

interface ProductPurchaseHistoryModalProps {
    isOpen: boolean;
    onClose: () => void;
    productName: string | null;
    inventoryItemId?: string | null; // Optional: for more specific matching
    purchases: Purchase[];
}

const ProductPurchaseHistoryModal: React.FC<ProductPurchaseHistoryModalProps> = ({ 
    isOpen, 
    onClose, 
    productName, 
    inventoryItemId, 
    purchases 
}) => {
    
    const productHistoryData = useMemo(() => {
        if (!productName && !inventoryItemId) return { history: [], stats: null };

        const history: (PurchaseItem & {
            purchaseSerialId: string;
            invoiceNumber: string;
            supplier: string;
            purchaseDate: string;
        })[] = [];

        const normalizedSearchName = (productName || '').toLowerCase().trim();

        purchases.forEach(purchase => {
            purchase.items.forEach(item => {
                let isMatch = false;
                
                // Priority 1: Match by Inventory Item ID (Master ID)
                if (inventoryItemId && item.inventoryItemId === inventoryItemId) {
                    isMatch = true;
                } 
                // Priority 2: Match by exact name (if no ID provided or ID didn't match)
                else if (productName && (item.name || '').toLowerCase().trim() === normalizedSearchName) {
                    isMatch = true;
                }
                // Priority 3: Fuzzy match (only if we have a name and it's not a short string)
                else if (productName && normalizedSearchName.length > 3 && (item.name || '').toLowerCase().includes(normalizedSearchName)) {
                    isMatch = true;
                }

                if (isMatch) {
                    history.push({
                        ...item,
                        purchaseSerialId: purchase.purchaseSerialId,
                        invoiceNumber: purchase.invoiceNumber,
                        supplier: purchase.supplier,
                        purchaseDate: purchase.date,
                    });
                }
            });
        });

        // Sort by date descending
        const sortedHistory = history.sort((a, b) => new Date(b.purchaseDate).getTime() - new Date(a.purchaseDate).getTime());

        if (sortedHistory.length === 0) return { history: [], stats: null };

        // Calculate Stats
        const rates = sortedHistory.map(h => h.purchasePrice).filter(r => r > 0);
        const lastRate = sortedHistory[0].purchasePrice;
        const maxRate = rates.length > 0 ? Math.max(...rates) : 0;
        const minRate = rates.length > 0 ? Math.min(...rates) : 0;
        const avgRate = rates.length > 0 ? (rates.reduce((a, b) => a + b, 0) / rates.length) : 0;

        return {
            history: sortedHistory,
            stats: { lastRate, maxRate, minRate, avgRate }
        };
    }, [productName, inventoryItemId, purchases]);

    if (!isOpen || (!productName && !inventoryItemId)) return null;

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={`Product Purchase History`} widthClass="max-w-5xl">
            <div className="flex flex-col h-[80vh] bg-app-bg overflow-hidden">
                {/* Product Info Header */}
                <div className="bg-white dark:bg-card-bg p-6 border-b-2 border-app-border flex-shrink-0">
                    <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                        <div>
                            <p className="text-[10px] font-black uppercase text-app-text-tertiary mb-1 tracking-widest">Historical Audit for:</p>
                            <h2 className="text-2xl font-black text-primary uppercase tracking-tight leading-none">{productName || 'Unknown Product'}</h2>
                            {inventoryItemId && <p className="text-[9px] font-mono text-gray-400 mt-1 uppercase">ID: {inventoryItemId}</p>}
                        </div>
                        
                        {productHistoryData.stats && (
                            <div className="flex gap-4">
                                <div className="bg-emerald-50 dark:bg-emerald-900/10 border border-emerald-100 dark:border-emerald-800 p-3 rounded-xl text-center min-w-[100px]">
                                    <p className="text-[9px] font-black text-emerald-600 uppercase mb-1">Last Rate</p>
                                    <p className="text-lg font-black text-emerald-700 dark:text-emerald-400">₹{(productHistoryData.stats.lastRate || 0).toFixed(2)}</p>
                                </div>
                                <div className="bg-blue-50 dark:bg-blue-900/10 border border-blue-100 dark:border-blue-800 p-3 rounded-xl text-center min-w-[100px]">
                                    <p className="text-[9px] font-black text-blue-600 uppercase mb-1">Avg Rate</p>
                                    <p className="text-lg font-black text-blue-700 dark:text-blue-400">₹{(productHistoryData.stats.avgRate || 0).toFixed(2)}</p>
                                </div>
                                <div className="bg-indigo-50 dark:bg-indigo-900/10 border border-indigo-100 dark:border-indigo-800 p-3 rounded-xl text-center min-w-[100px]">
                                    <p className="text-[9px] font-black text-indigo-600 uppercase mb-1">Max Rate</p>
                                    <p className="text-lg font-black text-indigo-700 dark:text-indigo-400">₹{(productHistoryData.stats.maxRate || 0).toFixed(2)}</p>
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                {/* Main Content Area */}
                <div className="flex-1 overflow-auto p-4 custom-scrollbar">
                    <div className="bg-white dark:bg-card-bg border border-app-border rounded-xl shadow-sm overflow-hidden">
                        <table className="min-w-full text-xs divide-y divide-app-border">
                            <thead className="bg-gray-100 dark:bg-gray-800 sticky top-0 z-10 shadow-sm">
                                <tr>
                                    <th className="px-4 py-3 text-left font-black uppercase text-[10px] tracking-widest text-gray-500">Pur. Date</th>
                                    <th className="px-4 py-3 text-left font-black uppercase text-[10px] tracking-widest text-gray-500">Supplier Name</th>
                                    <th className="px-4 py-3 text-left font-black uppercase text-[10px] tracking-widest text-gray-500">Bill Details</th>
                                    <th className="px-4 py-3 text-left font-black uppercase text-[10px] tracking-widest text-gray-500">Batch / Expiry</th>
                                    <th className="px-4 py-3 text-right font-black uppercase text-[10px] tracking-widest text-gray-500">Quantity</th>
                                    <th className="px-4 py-3 text-right font-black uppercase text-[10px] tracking-widest text-gray-500">Pur. Rate</th>
                                    <th className="px-4 py-3 text-right font-black uppercase text-[10px] tracking-widest text-gray-500">Net Val</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-app-border">
                                {productHistoryData.history.length > 0 ? (
                                    productHistoryData.history.map((item, idx) => (
                                        <tr key={idx} className="hover:bg-primary-extralight/20 transition-colors group">
                                            <td className="px-4 py-4 whitespace-nowrap text-app-text-secondary font-medium">
                                                {new Date(item.purchaseDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                                            </td>
                                            <td className="px-4 py-4 font-black text-app-text-primary uppercase truncate max-w-[150px]" title={item.supplier}>
                                                {item.supplier}
                                            </td>
                                            <td className="px-4 py-4">
                                                <p className="font-bold text-gray-900 dark:text-white uppercase leading-none">{item.invoiceNumber}</p>
                                                <p className="text-[9px] font-black text-primary uppercase mt-1 opacity-60">ID: {item.purchaseSerialId}</p>
                                            </td>
                                            <td className="px-4 py-4">
                                                <div className="font-mono font-black text-gray-700 dark:text-gray-300 text-[11px] leading-none">{item.batch || 'NO BATCH'}</div>
                                                <div className="text-[9px] font-black text-red-500 uppercase mt-1">EXP: {item.expiry || 'N/A'}</div>
                                            </td>
                                            <td className="px-4 py-4 text-right">
                                                <span className="font-black text-app-text-primary text-sm">
                                                    {item.quantity}
                                                    {(item.looseQuantity || 0) > 0 && <span className="text-gray-400 font-bold ml-1">:{item.looseQuantity}</span>}
                                                </span>
                                                {(item.freeQuantity || 0) > 0 && (
                                                    <p className="text-[9px] font-black text-emerald-600 uppercase mt-0.5">+{item.freeQuantity} Free</p>
                                                )}
                                            </td>
                                            <td className="px-4 py-4 text-right font-black text-primary text-sm">
                                                ₹{(item.purchasePrice || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                                            </td>
                                            <td className="px-4 py-4 text-right font-black text-gray-900 dark:text-white text-sm bg-slate-50/50 dark:bg-slate-900/30">
                                                ₹{(item.quantity * (item.purchasePrice || 0)).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                                            </td>
                                        </tr>
                                    ))
                                ) : (
                                    <tr>
                                        <td colSpan={7} className="py-32 text-center text-app-text-tertiary">
                                            <div className="flex flex-col items-center opacity-30">
                                                <svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" className="mb-4"><path d="M12 20v-6M6 20V10M18 20V4"/></svg>
                                                <p className="font-black uppercase tracking-[0.2em] text-sm">No Purchase History Found</p>
                                                <p className="text-xs mt-1 lowercase">We couldn't find any recorded purchase entries matching this product nomenclature.</p>
                                            </div>
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>

                {/* Footer Tip */}
                <div className="p-4 bg-gray-50 dark:bg-gray-800 border-t border-app-border flex justify-between items-center px-8 flex-shrink-0">
                    <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest italic">Inventory Intelligence Module v3.1</span>
                    <button 
                        onClick={onClose}
                        className="px-8 py-2.5 bg-gray-900 text-white font-black rounded-xl uppercase tracking-widest text-xs hover:bg-black transition-all active:scale-95 shadow-lg shadow-black/20"
                    >
                        Close History [ESC]
                    </button>
                </div>
            </div>
        </Modal>
    );
};

export default ProductPurchaseHistoryModal;
