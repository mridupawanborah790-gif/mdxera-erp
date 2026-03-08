import React, { useState, useMemo, useEffect } from 'react';
import Card from '../components/Card';
import Modal from '../components/Modal';
// Fix: Corrected named import for PurchaseForm to default import
import PurchaseForm from '../components/PurchaseForm';
import type { Purchase, Distributor, InventoryItem, RegisteredPharmacy, Medicine, DistributorProductMap } from '../types';
import { downloadCsv, arrayToCsvRow } from '../utils/csv';
import ConfirmModal from '../components/ConfirmModal';
import InfoTooltip from '../components/InfoTooltip';
import ExportPurchasesModal from '../components/ExportPurchasesModal';
import JournalEntryViewerModal from '../components/JournalEntryViewerModal';
import { shouldHandleScreenShortcut } from '../utils/screenShortcuts';

type SortableKeys = 'purchaseSerialId' | 'date' | 'totalAmount';

interface PurchaseHistoryProps {
    purchases: Purchase[];
    distributors: Distributor[];
    onViewDetails: (purchase: Purchase) => void;
    onCancelPurchase: (purchaseId: string) => void;
    onEditPurchase?: (purchase: Purchase) => void; 
    inventory: InventoryItem[];
    medicines: Medicine[];
    onUpdatePurchase: (purchase: Purchase, supplierGst?: string) => Promise<void>;
    onAddInventoryItem: (item: Omit<InventoryItem, 'id'>) => Promise<InventoryItem>;
    currentUser: RegisteredPharmacy | null;
    onSaveMapping: (map: DistributorProductMap) => Promise<void>;
}

const PurchaseHistory: React.FC<PurchaseHistoryProps> = ({ 
    purchases, distributors, onViewDetails, onCancelPurchase, 
    inventory, medicines, onUpdatePurchase, onAddInventoryItem, currentUser,
    onSaveMapping, onEditPurchase 
}) => {
    const [searchTerm, setSearchTerm] = useState('');
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    const [distributorFilter, setDistributorFilter] = useState('all');
    const [statusFilter, setStatusFilter] = useState<'all' | 'completed' | 'cancelled'>('completed');
    const [sortConfig, setSortConfig] = useState<{ key: SortableKeys; direction: 'ascending' | 'descending' }>({ key: 'date', direction: 'descending' });
    const [isConfirmOpen, setIsConfirmOpen] = useState(false);
    const [isExportModalOpen, setIsExportModalOpen] = useState(false);
    const [purchaseToCancel, setPurchaseToCancel] = useState<string | null>(null);
    const [journalPurchase, setJournalPurchase] = useState<Purchase | null>(null);
    
    const filteredAndSortedPurchases = useMemo(() => {
        let filtered = (purchases || []).filter(Boolean);

        if (startDate) {
            const start = new Date(startDate); start.setHours(0, 0, 0, 0);
            filtered = filtered.filter(p => new Date(p.date) >= start);
        }
        if (endDate) {
            const end = new Date(endDate); end.setHours(23, 59, 59, 999);
            filtered = filtered.filter(p => new Date(p.date) <= end);
        }
        if (distributorFilter !== 'all') filtered = filtered.filter(p => p.supplier === distributorFilter);
        if (statusFilter !== 'all') filtered = filtered.filter(p => p.status === statusFilter);
        
        if (searchTerm) {
            const lowercasedFilter = searchTerm.toLowerCase();
            filtered = filtered.filter(p =>
                (p.purchaseSerialId || '').toLowerCase().includes(lowercasedFilter) ||
                (p.invoiceNumber || '').toLowerCase().includes(lowercasedFilter) ||
                (p.supplier || '').toLowerCase().includes(lowercasedFilter)
            );
        }

        return filtered.sort((a, b) => {
            const aVal = new Date(a.date).getTime();
            const bVal = new Date(b.date).getTime();
            return sortConfig.direction === 'descending' ? bVal - aVal : aVal - bVal;
        });
    }, [purchases, searchTerm, startDate, endDate, distributorFilter, statusFilter, sortConfig]);

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (!shouldHandleScreenShortcut(e, 'purchaseHistory')) return;
            if (e.key === 'F3') {
                e.preventDefault();
                if (filteredAndSortedPurchases.length > 0) {
                    setIsExportModalOpen(true);
                }
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [filteredAndSortedPurchases]);

    const handleExport = () => {
        if (filteredAndSortedPurchases.length === 0) return;
        setIsExportModalOpen(true);
    };

    const handleCancelClick = (id: string) => {
        setPurchaseToCancel(id);
        setIsConfirmOpen(true);
    };

    const handleConfirmCancel = () => {
        if (purchaseToCancel) {
            onCancelPurchase(purchaseToCancel);
            setPurchaseToCancel(null);
        }
        setIsConfirmOpen(false);
    };

    const totalValue = useMemo(() => filteredAndSortedPurchases.reduce((sum, p) => sum + (p.status !== 'cancelled' ? p.totalAmount : 0), 0), [filteredAndSortedPurchases]);

    return (
        <main className="flex-1 page-fade-in flex flex-col overflow-hidden bg-app-bg">
            <div className="bg-primary text-white h-7 flex items-center px-4 justify-between border-b border-gray-600 shadow-md flex-shrink-0">
                <span className="text-[10px] font-black uppercase tracking-widest">Purchase Register (Inward Bills)</span>
                <span className="text-[10px] font-black uppercase text-accent">Total Purchase: ₹{totalValue.toLocaleString()}</span>
            </div>

            <div className="p-4 flex-1 flex flex-col gap-4 overflow-hidden">
                <Card className="p-3 tally-border !rounded-none grid grid-cols-1 md:grid-cols-5 gap-4 items-end bg-white">
                    <div className="md:col-span-2">
                        <label className="text-[10px] font-bold text-gray-500 uppercase block mb-1">Search Bills</label>
                        <input type="text" placeholder="Bill No, Supplier..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="w-full border border-gray-400 p-2 text-sm font-bold focus:bg-yellow-50 outline-none" />
                    </div>
                    <div>
                        <label className="text-[10px] font-bold text-gray-500 uppercase block mb-1">Status</label>
                        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value as any)} className="w-full border border-gray-400 p-2 text-sm font-bold outline-none">
                            <option value="completed">Completed</option>
                            <option value="cancelled">Cancelled</option>
                            <option value="all">All</option>
                        </select>
                    </div>
                    <div className="flex gap-2 md:col-span-2">
                        <button onClick={handleExport} className="flex-1 py-2 tally-button-primary text-[10px]">F3: Export</button>
                    </div>
                </Card>

                <Card className="flex-1 flex flex-col p-0 tally-border !rounded-none overflow-hidden shadow-inner bg-white">
                    <div className="flex-1 overflow-auto">
                        <table className="min-w-full border-collapse text-sm">
                            <thead className="sticky top-0 bg-gray-100 border-b border-gray-400">
                                <tr className="text-[10px] font-black uppercase text-gray-600">
                                    <th className="p-2 border-r border-gray-400 text-left w-10">Sl.</th>
                                    <th className="p-2 border-r border-gray-400 text-left">System ID</th>
                                    <th className="p-2 border-r border-gray-400 text-left">Supplier Bill ID</th>
                                    <th className="p-2 border-r border-gray-400 text-left">Date</th>
                                    <th className="p-2 border-r border-gray-400 text-left">Supplier</th>
                                    <th className="p-2 border-r border-gray-400 text-right w-32">Amount</th>
                                    <th className="p-2 text-right">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-200">
                                {filteredAndSortedPurchases.map((p, idx) => (
                                    <tr key={p.id} className={`hover:bg-accent transition-colors ${p.status === 'cancelled' ? 'line-through text-red-500 bg-red-50/50' : ''}`}>
                                        <td className="p-2 border-r border-gray-200 font-bold text-gray-400 text-center">{idx + 1}</td>
                                        <td className="p-2 border-r border-gray-200 font-mono font-bold text-primary">{p.purchaseSerialId}</td>
                                        <td className="p-2 border-r border-gray-200 font-bold uppercase">{p.invoiceNumber}</td>
                                        <td className="p-2 border-r border-gray-200">{new Date(p.date).toLocaleDateString('en-IN')}</td>
                                        <td className="p-2 border-r border-gray-200 font-bold uppercase">{p.supplier}</td>
                                        <td className="p-2 border-r border-gray-200 text-right font-black">₹{(p.totalAmount || 0).toFixed(2)}</td>
                                        <td className="p-2 text-right">
                                            <div className="flex justify-end gap-2">
                                                <button onClick={() => onViewDetails(p)} className="text-primary font-black uppercase text-[10px] hover:underline">View</button>
                                                <button onClick={() => setJournalPurchase(p)} className="text-indigo-700 font-black uppercase text-[10px] hover:underline">View Journal Entry</button>
                                                {p.status !== 'cancelled' && onEditPurchase && (
                                                    <button onClick={() => onEditPurchase(p)} className="text-blue-700 font-black uppercase text-[10px] hover:underline">Edit</button>
                                                )}
                                                {p.status !== 'cancelled' && <button onClick={() => handleCancelClick(p.id)} className="text-red-600 font-black uppercase text-[10px] hover:underline">Cancel</button>}
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </Card>
            </div>
            <ConfirmModal isOpen={isConfirmOpen} onClose={() => setIsConfirmOpen(false)} onConfirm={handleConfirmCancel} title="Cancel Purchase" message="Are you sure you want to cancel this inward entry? Stock levels will be reduced." />
            
            {isExportModalOpen && (
                <ExportPurchasesModal
                    isOpen={isExportModalOpen}
                    onClose={() => setIsExportModalOpen(false)}
                    data={filteredAndSortedPurchases}
                    pharmacyName={currentUser?.pharmacy_name || 'MDXERA ERP'}
                />
            )}

            <JournalEntryViewerModal
                isOpen={!!journalPurchase}
                onClose={() => setJournalPurchase(null)}
                invoiceId={journalPurchase?.id}
                invoiceNumber={journalPurchase?.invoiceNumber || journalPurchase?.purchaseSerialId}
                documentType="PURCHASE"
                currentUser={currentUser}
                isPosted={(journalPurchase?.status || '') === 'completed'}
            />
        </main>
    );
};

export default PurchaseHistory;
