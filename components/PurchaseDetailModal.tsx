
import React, { useMemo } from 'react';
import Modal from './Modal';
import type { Purchase } from '../types';

interface PurchaseDetailModalProps {
    isOpen: boolean;
    onClose: () => void;
    purchase: Purchase | null;
}

const PurchaseDetailModal: React.FC<PurchaseDetailModalProps> = ({ isOpen, onClose, purchase }) => {
    const items = useMemo(() => {
        if (!purchase || !purchase.items) return [];
        let rawItems: any[] = [];
        if (Array.isArray(purchase.items)) {
            rawItems = purchase.items;
        } else if (typeof purchase.items === 'string') {
            try {
                rawItems = JSON.parse(purchase.items);
            } catch (e) {
                console.error("PurchaseDetailModal: Failed to parse items string", e);
                return [];
            }
        }

        // Standardize item properties for the table
        return rawItems.map(item => ({
            id: item.id || Math.random().toString(36),
            name: item.name || item.itemName || 'Unnamed Product',
            brand: item.brand || item.itemBrand || 'N/A',
            batch: item.batch || item.itemBatch || '—',
            expiry: item.expiry || item.itemExpiry || '—',
            quantity: Number(item.quantity || item.itemQuantity || 0),
            freeQuantity: Number(item.freeQuantity || item.itemFreeQuantity || 0),
            purchasePrice: Number(item.purchasePrice || item.purchase_price || item.itemPurchasePrice || 0),
            mrp: Number(item.mrp || item.itemMrp || 0),
            gstPercent: Number(item.gstPercent || item.gst_percent || item.itemGstPercent || 0),
            discountPercent: Number(item.discountPercent || item.itemDiscountPercent || 0),
            schemeDiscountAmount: Number(item.schemeDiscountAmount || item.itemSchemeDiscountAmount || 0)
        }));
    }, [purchase]);

    if (!isOpen || !purchase) return null;

    const totalAmount = purchase.totalAmount ?? (purchase as any).total_amount ?? 0;
    const subtotal = purchase.subtotal ?? 0;
    const totalGst = purchase.totalGst ?? (purchase as any).total_gst ?? 0;
    const roundOff = purchase.roundOff ?? (purchase as any).round_off ?? 0;

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={`Review Inward Bill #${purchase.purchaseSerialId}`} widthClass="max-w-4xl">
            <div className="flex-1 flex flex-col bg-[var(--modal-content-bg-light)] dark:bg-[var(--modal-content-bg-dark)] overflow-hidden">
                {purchase.status === 'cancelled' && (
                    <div className="bg-red-600 text-white p-2 font-black text-center text-xs uppercase tracking-widest shadow-inner">
                        STATUS: CANCELLED / REVERSED
                    </div>
                )}
                <div className="p-8 overflow-y-auto flex-1">
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8 text-sm text-black">
                        <div className="bg-white dark:bg-gray-800/50 p-4 rounded-xl border border-app-border shadow-sm">
                            <span className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1.5 opacity-60">System ID</span>
                            <span className="font-mono font-black text-primary text-base">{purchase.purchaseSerialId}</span>
                        </div>
                        <div className="bg-white dark:bg-gray-800/50 p-4 rounded-xl border border-app-border shadow-sm">
                            <span className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5 opacity-60">Supplier Invoice ID</span>
                            <span className="font-bold text-gray-900 dark:text-white text-base">{purchase.invoiceNumber}</span>
                        </div>
                        <div className="bg-white dark:bg-gray-800/50 p-4 rounded-xl border border-app-border shadow-sm">
                            <span className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5 opacity-60">Supplier Name</span>
                            <span className="font-black text-gray-950 dark:text-white text-base truncate block" title={purchase.supplier}>{purchase.supplier}</span>
                        </div>
                        <div className="bg-white dark:bg-gray-800/50 p-4 rounded-xl border border-app-border shadow-sm">
                            <span className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5 opacity-60">Inward Date</span>
                            <span className="font-bold text-gray-900 dark:text-white text-base">{new Date(purchase.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</span>
                        </div>
                    </div>

                    <div className="overflow-hidden border border-app-border rounded-2xl mb-6 shadow-md bg-white">
                      <table className="min-w-full divide-y divide-gray-200 text-sm">
                          <thead className="bg-slate-50 sticky top-0"><tr>
                              <th className="py-4 px-4 text-left font-black uppercase text-[10px] tracking-[0.2em] text-gray-400">Product Item</th>
                              <th className="py-4 px-2 text-center font-black uppercase text-[10px] tracking-[0.2em] text-gray-400">Batch/Exp</th>
                              <th className="py-4 px-2 text-center font-black uppercase text-[10px] tracking-[0.2em] text-gray-400 w-24">Qty</th>
                              <th className="py-4 px-2 text-right font-black uppercase text-[10px] tracking-[0.2em] text-gray-400 w-28">Pur. Rate</th>
                              <th className="py-4 px-2 text-center font-black uppercase text-[10px] tracking-[0.2em] text-gray-400 w-20">Tax%</th>
                              <th className="py-4 px-4 text-right font-black uppercase text-[10px] tracking-[0.2em] text-gray-900 w-40">Total Val</th>
                          </tr></thead>
                          <tbody className="divide-y divide-gray-200 bg-white">
                              {items.map((item, idx) => {
                                  const qty = item.quantity;
                                  const rate = item.purchasePrice;
                                  const disc = item.discountPercent;
                                  const schDisc = item.schemeDiscountAmount;
                                  const lineTotal = (qty * rate * (1 - disc/100)) - schDisc;

                                  return (
                                    <tr key={item.id || idx} className="hover:bg-slate-50 transition-colors">
                                        <td className="p-4">
                                            <span className="font-black text-gray-950 block text-sm leading-none mb-1 uppercase">{item.name}</span>
                                            <span className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">{item.brand || 'NO BRAND'}</span>
                                        </td>
                                        <td className="p-2 text-center">
                                            <span className="font-mono font-bold text-gray-700 block text-xs">{item.batch}</span>
                                            <span className="text-[10px] text-gray-400 font-black uppercase">{item.expiry}</span>
                                        </td>
                                        <td className="p-2 text-center">
                                            <span className="font-black text-base text-gray-900">{qty}</span>
                                            {item.freeQuantity > 0 && <span className="block text-[10px] font-black text-emerald-600 uppercase">+{item.freeQuantity} FREE</span>}
                                        </td>
                                        <td className="p-2 text-right font-bold text-gray-600 text-base">₹{rate.toFixed(2)}</td>
                                        <td className="p-2 text-center font-black text-blue-600 text-sm">{item.gstPercent}%</td>
                                        <td className="p-4 text-right font-black text-lg text-gray-950">
                                            ₹{lineTotal.toFixed(2)}
                                        </td>
                                    </tr>
                                  );
                              })}
                              {items.length === 0 && (
                                  <tr>
                                      <td colSpan={6} className="p-12 text-center text-gray-400 font-bold uppercase tracking-widest italic">No items recorded for this purchase bill</td>
                                  </tr>
                              )}
                          </tbody>
                      </table>
                    </div>
                </div>

                <div className="flex flex-col md:flex-row justify-between items-center p-8 bg-[var(--modal-footer-bg-light)] dark:bg-[var(--modal-footer-bg-dark)] border-t border-[var(--modal-footer-border-light)] dark:border-[var(--modal-footer-border-dark)] gap-8 flex-shrink-0 z-20 shadow-[0_-10px_40px_-20px_rgba(0,0,0,0.1)]">
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-y-2 gap-x-12 w-full md:w-auto">
                        <div><span className="block text-[10px] font-black text-gray-400 uppercase tracking-widest leading-none mb-1.5 opacity-60">Taxable Value</span><span className="font-bold text-gray-900 dark:text-white text-lg">₹{Number(subtotal || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span></div>
                        <div><span className="block text-[10px] font-black text-gray-400 uppercase tracking-widest leading-none mb-1.5 opacity-60">Total Tax</span><span className="font-bold text-gray-900 dark:text-white text-lg">₹{Number(totalGst || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span></div>
                        <div><span className="block text-[10px] font-black text-gray-400 uppercase tracking-widest leading-none mb-1.5 opacity-60">Round Off</span><span className="font-bold text-gray-500 text-lg">{roundOff >= 0 ? '+' : ''}₹{Math.abs(roundOff || 0).toFixed(2)}</span></div>
                        <div className="flex items-baseline gap-4 md:col-span-1 pt-0"><span className="text-[10px] font-black text-gray-400 uppercase tracking-widest opacity-60">Bill Total</span><span className="text-4xl font-black text-indigo-700 leading-none tracking-tighter">₹{Number(totalAmount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span></div>
                    </div>
                    <div className="flex items-center space-x-3 w-full md:w-auto flex-shrink-0">
                        <button onClick={onClose} className="flex-1 md:flex-none px-12 py-4 text-xs font-black uppercase tracking-[0.2em] text-white bg-gray-900 rounded-2xl shadow-xl hover:bg-black transition-all transform active:scale-95">Close Summary</button>
                    </div>
                </div>
            </div>
        </Modal>
    );
};

export default PurchaseDetailModal;
