
import React from 'react';
import Modal from './Modal';
import type { DeliveryChallan } from '../types';
import { DeliveryChallanStatus } from '../types';

interface ChallanDetailModalProps {
    isOpen: boolean;
    onClose: () => void;
    challan: DeliveryChallan | null;
}

const ChallanDetailModal: React.FC<ChallanDetailModalProps> = ({ isOpen, onClose, challan }) => {
    if (!isOpen || !challan) return null;

    const { 
        totalAmount, 
        items = [], 
        subtotal, 
        totalGst,
        status,
        remarks 
    } = challan;

    const getStatusLabel = (s: DeliveryChallanStatus) => {
        switch (s) {
            case DeliveryChallanStatus.OPEN: return 'PENDING / OPEN';
            case DeliveryChallanStatus.CONVERTED: return 'COMPLETED / CONVERTED';
            case DeliveryChallanStatus.CANCELLED: return 'CANCELLED / REVERSED';
            default: return s;
        }
    };

    const getStatusColor = (s: DeliveryChallanStatus) => {
        switch (s) {
            case DeliveryChallanStatus.OPEN: return 'bg-blue-600';
            case DeliveryChallanStatus.CONVERTED: return 'bg-emerald-600';
            case DeliveryChallanStatus.CANCELLED: return 'bg-red-600';
            default: return 'bg-gray-600';
        }
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={`Inward Challan Audit: ${challan.challanSerialId}`} widthClass="max-w-4xl">
            <div className="flex flex-col h-full bg-slate-50 dark:bg-slate-950 overflow-hidden">
                <div className={`${getStatusColor(status)} text-white p-2 font-black text-center text-[10px] uppercase tracking-[0.25em] shadow-inner`}>
                    Challan Status: {getStatusLabel(status)}
                </div>
                
                <div className="p-8 overflow-y-auto flex-1">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8 text-sm">
                        <div className="bg-white dark:bg-gray-800/50 p-4 rounded-xl border border-app-border shadow-sm">
                            <span className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5 opacity-60">Supplier / Ledger</span>
                            <span className="font-black text-gray-950 dark:text-white text-base leading-none block truncate" title={challan.supplier}>{challan.supplier}</span>
                        </div>
                        <div className="bg-white dark:bg-gray-800/50 p-4 rounded-xl border border-app-border shadow-sm">
                            <span className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5 opacity-60">Supplier Ref No.</span>
                            <span className="font-mono font-bold text-gray-900 dark:text-white text-base leading-none block">{challan.challanNumber || 'N/A'}</span>
                        </div>
                        <div className="bg-white dark:bg-gray-800/50 p-4 rounded-xl border border-app-border shadow-sm">
                            <span className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5 opacity-60">Receipt Date</span>
                            <span className="font-bold text-gray-900 dark:text-white text-base leading-none block">
                                {new Date(challan.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                            </span>
                        </div>
                    </div>

                    {remarks && (
                        <div className="mb-8 p-4 bg-amber-50 dark:bg-amber-900/10 border border-amber-100 dark:border-amber-800 rounded-2xl">
                            <div className="flex items-center gap-2 mb-2">
                                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-amber-600"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
                                <span className="text-[10px] font-black text-amber-600 uppercase tracking-widest">Administrative Remarks</span>
                            </div>
                            <p className="text-sm text-amber-900 dark:text-amber-200 font-medium leading-relaxed">{remarks}</p>
                        </div>
                    )}

                    <div className="overflow-hidden border border-app-border rounded-2xl shadow-sm bg-white">
                      <table className="min-w-full divide-y divide-gray-200 text-sm">
                          <thead className="bg-slate-50 sticky top-0">
                            <tr>
                                <th className="py-4 px-6 text-left font-black uppercase text-[10px] tracking-[0.2em] text-gray-400">Goods Description</th>
                                <th className="py-4 px-2 text-center font-black uppercase text-[10px] tracking-[0.2em] text-gray-400 w-28">Batch / Exp</th>
                                <th className="py-4 px-2 text-center font-black uppercase text-[10px] tracking-[0.2em] text-gray-400 w-24">Quantity</th>
                                <th className="py-4 px-2 text-right font-black uppercase text-[10px] tracking-[0.2em] text-gray-400 w-28">Pur. Rate</th>
                                <th className="py-4 px-6 text-right font-black uppercase text-[10px] tracking-[0.2em] text-gray-900 w-40">Line Value</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-200 bg-white">
                              {items.map((item, idx) => (
                                  <tr key={idx} className="hover:bg-slate-50 transition-colors">
                                      <td className="p-6">
                                          <span className="font-black text-gray-950 block text-sm mb-1">{item.name}</span>
                                          <span className="text-[10px] text-gray-400 font-bold uppercase tracking-widest leading-none">{item.brand || 'No Manufacturer'}</span>
                                      </td>
                                      <td className="p-2 text-center">
                                          <span className="font-mono font-bold text-gray-700 block text-xs leading-none mb-1">{item.batch || '—'}</span>
                                          <span className="text-[10px] text-gray-400 font-black uppercase">{item.expiry || '—'}</span>
                                      </td>
                                      <td className="p-2 text-center font-black text-gray-950">
                                          <span className="text-base">{(item.quantity || 0) + (item.freeQuantity || 0)}</span>
                                      </td>
                                      <td className="p-2 text-right font-bold text-gray-600">₹{Number(item.purchasePrice || 0).toFixed(2)}</td>
                                      <td className="p-6 text-right font-black text-lg text-gray-950">
                                        ₹{(Number(item.purchasePrice || 0) * Number(item.quantity || 0)).toFixed(2)}
                                      </td>
                                  </tr>
                              ))}
                          </tbody>
                      </table>
                    </div>
                </div>

                <div className="flex flex-col md:flex-row justify-between items-center p-8 bg-[var(--modal-footer-bg-light)] dark:bg-[var(--modal-footer-bg-dark)] border-t border-[var(--modal-footer-border-light)] dark:border-[var(--modal-footer-border-dark)] gap-8 flex-shrink-0 z-20 shadow-[0_-10px_40px_-20px_rgba(0,0,0,0.1)]">
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-x-12 gap-y-2 w-full md:w-auto">
                        <div><span className="block text-[10px] font-black text-gray-400 uppercase tracking-widest leading-none mb-1.5 opacity-60">Assessment Value</span><span className="font-bold text-gray-900 dark:text-white text-lg">₹{Number(subtotal || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span></div>
                        <div><span className="block text-[10px] font-black text-gray-400 uppercase tracking-widest leading-none mb-1.5 opacity-60">Estimated GST</span><span className="font-bold text-gray-900 dark:text-white text-lg">₹{Number(totalGst || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span></div>
                        <div className="flex items-baseline gap-4 md:col-span-1 pt-0">
                            <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest opacity-60">Total Valuation</span>
                            <span className="text-4xl font-black text-primary leading-none tracking-tighter">₹{Number(totalAmount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                        </div>
                    </div>
                    <div className="flex items-center space-x-3 w-full md:w-auto flex-shrink-0">
                        <button onClick={onClose} className="flex-1 md:flex-none px-12 py-4 text-xs font-black uppercase tracking-[0.2em] text-white bg-gray-900 rounded-2xl shadow-xl hover:bg-black transition-all transform active:scale-95">Close Summary</button>
                    </div>
                </div>
            </div>
        </Modal>
    );
};

export default ChallanDetailModal;
