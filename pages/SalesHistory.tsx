
import React, { useState, useMemo, useEffect, useCallback } from 'react';
import Card from '../components/Card';
import type { Transaction, RegisteredPharmacy, InventoryItem } from '../types';
import { downloadCsv, arrayToCsvRow } from '../utils/csv';
import ConfirmModal from '../components/ConfirmModal';
import JournalEntryViewerModal from '../components/JournalEntryViewerModal';
import { shouldHandleScreenShortcut } from '../utils/screenShortcuts';

type SortableKeys = 'date' | 'total' | 'createdAt' | 'profit';

interface SalesHistoryProps {
    transactions: Transaction[];
    inventory: InventoryItem[];
    onViewDetails: (transaction: Transaction) => void;
    onPrintBill: (transaction: Transaction) => void;
    onCancelTransaction: (transactionId: string) => void;
    initialFilters?: { startDate?: string; endDate?: string } | null;
    onFiltersChange?: () => void;
    currentUser: RegisteredPharmacy | null;
    onRefresh?: () => Promise<void>; 
    onViewSale: (transaction: Transaction) => void; 
    onEditSale: (transaction: Transaction) => void; 
}

const RefreshIcon = (props: React.SVGProps<SVGSVGElement>) => (
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" {...props}>
        <path d="M23 4v6h-6"/><path d="M1 20v-6h6"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
    </svg>
);

const SalesHistory: React.FC<SalesHistoryProps> = ({ transactions, inventory, onViewDetails, onPrintBill, onCancelTransaction, initialFilters, onFiltersChange, currentUser, onRefresh, onViewSale, onEditSale }) => {
    const [searchTerm, setSearchTerm] = useState('');
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    const [rmpFilter, setRmpFilter] = useState('all');
    const [paymentModeFilter, setPaymentModeFilter] = useState('all');
    const [statusFilter, setStatusFilter] = useState<'all' | 'completed' | 'cancelled'>('all');
    const [sortConfig, setSortConfig] = useState<{ key: SortableKeys; direction: 'ascending' | 'descending' }>({ key: 'date', direction: 'descending' });
    const [isConfirmOpen, setIsConfirmOpen] = useState(false);
    const [transactionToCancel, setTransactionToCancel] = useState<string | null>(null);
    const [isSyncing, setIsSyncing] = useState(false);
    const [journalTransaction, setJournalTransaction] = useState<Transaction | null>(null);
    const [selectedTransactionId, setSelectedTransactionId] = useState<string | null>(null);
    const [actionWarning, setActionWarning] = useState<string>('');

    const filteredAndSortedTransactions = useMemo(() => {
        let filtered = (transactions || []).filter(Boolean);

        if (startDate) {
            const start = new Date(startDate); start.setHours(0, 0, 0, 0);
            filtered = filtered.filter(t => new Date(t.date) >= start);
        }
        if (endDate) {
            const end = new Date(endDate); end.setHours(23, 59, 59, 999);
            filtered = filtered.filter(t => new Date(t.date) <= end);
        }
        if (rmpFilter !== 'all') filtered = filtered.filter(t => t.referredBy === rmpFilter);
        if (paymentModeFilter !== 'all') filtered = filtered.filter(t => (t.paymentMode || 'Cash') === paymentModeFilter);
        if (statusFilter !== 'all') filtered = filtered.filter(t => t.status === statusFilter);
        
        if (searchTerm) {
            const lowercasedFilter = searchTerm.toLowerCase();
            filtered = filtered.filter(t =>
                (t.id || '').toLowerCase().includes(lowercasedFilter) ||
                (t.customerName || '').toLowerCase().includes(lowercasedFilter) ||
                (t.customerPhone || '').toLowerCase().includes(lowercasedFilter)
            );
        }

        return filtered.sort((a, b) => {
            const aVal = new Date(a.date).getTime();
            const bVal = new Date(b.date).getTime();
            return sortConfig.direction === 'descending' ? bVal - aVal : aVal - bVal;
        });
    }, [transactions, searchTerm, startDate, endDate, rmpFilter, paymentModeFilter, statusFilter, sortConfig]);

    const selectedTransaction = useMemo(
        () => filteredAndSortedTransactions.find(tx => tx.id === selectedTransactionId) || null,
        [filteredAndSortedTransactions, selectedTransactionId]
    );

    useEffect(() => {
        if (selectedTransactionId && !selectedTransaction) {
            setSelectedTransactionId(null);
        }
    }, [selectedTransactionId, selectedTransaction]);

    const requireSelectedTransaction = useCallback(() => {
        if (!selectedTransaction) {
            setActionWarning('Please select an Invoice first.');
            return null;
        }
        setActionWarning('');
        return selectedTransaction;
    }, [selectedTransaction]);

    const handleSelectRow = (transactionId: string) => {
        setSelectedTransactionId(transactionId);
        setActionWarning('');
    };

    const handleViewSelected = useCallback(() => {
        const tx = requireSelectedTransaction();
        if (!tx) return;
        onViewSale(tx);
    }, [onViewSale, requireSelectedTransaction]);

    const handleViewJournalSelected = useCallback(() => {
        const tx = requireSelectedTransaction();
        if (!tx) return;
        setJournalTransaction(tx);
    }, [requireSelectedTransaction]);

    const handlePrintSelected = useCallback(() => {
        const tx = requireSelectedTransaction();
        if (!tx) return;
        onPrintBill(tx);
    }, [onPrintBill, requireSelectedTransaction]);

    const handleCancelSelected = useCallback(() => {
        const tx = requireSelectedTransaction();
        if (!tx) return;
        if (tx.status === 'cancelled') {
            setActionWarning('Selected invoice is already cancelled.');
            return;
        }
        handleCancelClick(tx.id);
    }, [requireSelectedTransaction]);

    const handleExportSelected = useCallback(() => {
        const tx = requireSelectedTransaction();
        if (!tx) return;

        const headers = ['Invoice ID', 'Date', 'Customer Name', 'Items', 'Amount', 'Status'];
        const row = [
            tx.id,
            new Date(tx.date).toLocaleDateString('en-IN'),
            tx.customerName,
            String((tx.items || []).length),
            (tx.total || 0).toFixed(2),
            tx.status,
        ];

        const csvContent = [arrayToCsvRow(headers), arrayToCsvRow(row)].join('\n');
        downloadCsv(`invoice-${tx.id}.csv`, csvContent);
    }, [requireSelectedTransaction]);

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (!shouldHandleScreenShortcut(e, 'salesHistory')) return;
            if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                e.preventDefault();
                if (filteredAndSortedTransactions.length === 0) return;

                const currentIndex = selectedTransaction
                    ? filteredAndSortedTransactions.findIndex(tx => tx.id === selectedTransaction.id)
                    : -1;
                const nextIndex = e.key === 'ArrowDown'
                    ? Math.min(currentIndex + 1, filteredAndSortedTransactions.length - 1)
                    : Math.max(currentIndex - 1, 0);
                const nextTransaction = filteredAndSortedTransactions[nextIndex];
                if (nextTransaction) {
                    handleSelectRow(nextTransaction.id);
                }
            } else if (e.key === 'Enter') {
                e.preventDefault();
                handleViewSelected();
            } else if (e.key === 'F7') {
                e.preventDefault();
                handleViewJournalSelected();
            } else if (e.key === 'F8') {
                e.preventDefault();
                handlePrintSelected();
            } else if (e.key === 'Delete') {
                e.preventDefault();
                handleCancelSelected();
            } else if (e.key === 'F3') {
                e.preventDefault();
                handleExportSelected();
            } else if (e.key === 'F5') {
                e.preventDefault();
                handleRefresh();
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [filteredAndSortedTransactions, selectedTransaction, handleViewSelected, handleViewJournalSelected, handlePrintSelected, handleCancelSelected, handleExportSelected]);

    const handleCancelClick = (id: string) => {
        setTransactionToCancel(id);
        setIsConfirmOpen(true);
    };

    const handleConfirmCancel = () => {
        if (transactionToCancel) {
            onCancelTransaction(transactionToCancel);
            setTransactionToCancel(null);
        }
        setIsConfirmOpen(false);
    };

    const handleRefresh = async () => {
        if (onRefresh) {
            setIsSyncing(true);
            try {
                await onRefresh();
            } finally {
                setIsSyncing(false);
            }
        }
    };

    const totalRevenue = useMemo(() => filteredAndSortedTransactions.reduce((sum, t) => sum + (t.status !== 'cancelled' ? t.total : 0), 0), [filteredAndSortedTransactions]);

    return (
        <main className="flex-1 page-fade-in flex flex-col overflow-hidden bg-app-bg">
            <div className="bg-primary text-white h-7 flex items-center px-4 justify-between border-b border-gray-600 shadow-md flex-shrink-0">
                <span className="text-[10px] font-black uppercase tracking-widest">Sales Register (Accounting)</span>
                <span className="text-[10px] font-black uppercase text-accent">Total Revenue: ₹{totalRevenue.toLocaleString()}</span>
            </div>

            <div className="p-4 flex-1 flex flex-col gap-4 overflow-hidden">
                <Card className="p-3 tally-border !rounded-none grid grid-cols-1 md:grid-cols-7 gap-4 items-end bg-white">
                    <div className="md:col-span-2">
                        <label className="text-[10px] font-bold text-gray-500 uppercase block mb-1">Search Vouchers</label>
                        <input type="text" placeholder="Bill ID, Customer..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="w-full border border-gray-400 p-2 text-sm font-bold focus:bg-yellow-50 outline-none" />
                    </div>
                    <div>
                        <label className="text-[10px] font-bold text-gray-500 uppercase block mb-1">From Date</label>
                        <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="w-full border border-gray-400 p-2 text-sm font-bold outline-none" />
                    </div>
                    <div>
                        <label className="text-[10px] font-bold text-gray-500 uppercase block mb-1">To Date</label>
                        <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="w-full border border-gray-400 p-2 text-sm font-bold outline-none" />
                    </div>
                    <div>
                        <label className="text-[10px] font-bold text-gray-500 uppercase block mb-1">Status</label>
                        <select
                            value={statusFilter}
                            onChange={e => setStatusFilter(e.target.value as 'all' | 'completed' | 'cancelled')}
                            className="w-full border border-gray-400 p-2 text-sm font-bold outline-none bg-white"
                        >
                            <option value="all">All Orders</option>
                            <option value="cancelled">Cancelled Orders</option>
                            <option value="completed">Completed Orders</option>
                        </select>
                    </div>
                    <div className="md:col-span-2">
                        <button 
                            onClick={handleRefresh} 
                            disabled={isSyncing}
                            className="w-full py-2 tally-button-primary text-[10px] flex items-center justify-center gap-2"
                        >
                            <RefreshIcon className={isSyncing ? 'animate-spin' : ''} />
                            {isSyncing ? 'Syncing...' : 'F5: Refresh'}
                        </button>
                    </div>
                </Card>

                <Card className="flex-1 flex flex-col p-0 tally-border !rounded-none overflow-hidden shadow-inner bg-white">
                    <div className="border-b border-gray-300 p-3 bg-gray-50 space-y-3">
                        <div className="text-[11px] font-bold text-gray-700">
                            Selected Invoice: <span className="font-mono text-primary">{selectedTransaction?.id || 'None'}</span>
                            {' '}| Customer: <span className="uppercase">{selectedTransaction?.customerName || '-'}</span>
                            {' '}| Voucher ID: <span className="font-mono">{selectedTransaction?.id || '-'}</span>
                            {' '}| Amount: <span className="font-black">₹{(selectedTransaction?.total || 0).toFixed(2)}</span>
                        </div>
                        {actionWarning && <div className="text-[11px] font-bold text-red-700 bg-red-100 border border-red-200 px-2 py-1">{actionWarning}</div>}
                        <div className="flex flex-wrap gap-2">
                            <button onClick={handleViewSelected} className="px-3 py-1.5 tally-border bg-white text-[10px] font-black uppercase">Enter: View</button>
                            <button onClick={handleViewJournalSelected} className="px-3 py-1.5 tally-border bg-white text-[10px] font-black uppercase">F7: View Journal Entry</button>
                            <button onClick={handlePrintSelected} className="px-3 py-1.5 tally-border bg-white text-[10px] font-black uppercase">F8: Print</button>
                            <button onClick={handleCancelSelected} className="px-3 py-1.5 tally-border bg-white text-[10px] font-black uppercase text-red-700">Delete: Cancel</button>
                            <button onClick={handleExportSelected} className="px-3 py-1.5 tally-border bg-white text-[10px] font-black uppercase">F3: Export</button>
                            <button onClick={handleRefresh} disabled={isSyncing} className="px-3 py-1.5 tally-button-primary text-[10px] font-black uppercase disabled:opacity-60">F5: Refresh</button>
                        </div>
                    </div>
                    <div className="flex-1 overflow-auto">
                        <table className="min-w-full border-collapse text-sm">
                            <thead className="sticky top-0 bg-gray-100 border-b border-gray-400">
                                <tr className="text-[10px] font-black uppercase text-gray-600">
                                    <th className="p-2 border-r border-gray-400 text-left w-10">Sl.</th>
                                    <th className="p-2 border-r border-gray-400 text-left">Invoice ID</th>
                                    <th className="p-2 border-r border-gray-400 text-left">Date</th>
                                    <th className="p-2 border-r border-gray-400 text-left">Customer Name</th>
                                    <th className="p-2 border-r border-gray-400 text-center w-24">Items</th>
                                    <th className="p-2 border-r border-gray-400 text-right w-32">Amount</th>
                                    <th className="p-2 border-r border-gray-400 text-center w-28">Status</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-200">
                                {filteredAndSortedTransactions.map((tx, idx) => (
                                    <tr
                                        key={tx.id}
                                        onClick={() => handleSelectRow(tx.id)}
                                        className={`cursor-pointer transition-colors ${selectedTransactionId === tx.id ? 'bg-lime-100' : 'hover:bg-accent'} ${tx.status === 'cancelled' ? 'line-through text-red-500 bg-red-50/50' : ''}`}
                                    >
                                        <td className="p-2 border-r border-gray-200 font-bold text-gray-400 text-center">{idx + 1}</td>
                                        <td className="p-2 border-r border-gray-200 font-mono font-bold text-primary">{tx.id}</td>
                                        <td className="p-2 border-r border-gray-200">{new Date(tx.date).toLocaleDateString('en-IN')}</td>
                                        <td className="p-2 border-r border-gray-200 font-bold uppercase">{tx.customerName}</td>
                                        <td className="p-2 border-r border-gray-200 text-center font-bold">{(tx.items || []).length}</td>
                                        <td className="p-2 border-r border-gray-400 text-right font-black">₹{(tx.total || 0).toFixed(2)}</td>
                                        <td className="p-2 border-r border-gray-200 text-center">
                                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase border ${tx.status === 'cancelled' ? 'bg-red-100 text-red-700 border-red-200' : 'bg-emerald-100 text-emerald-700 border-emerald-200'}`}>
                                                {tx.status === 'cancelled' ? 'Cancelled' : 'Completed'}
                                            </span>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </Card>
            </div>
            <ConfirmModal isOpen={isConfirmOpen} onClose={() => setIsConfirmOpen(false)} onConfirm={handleConfirmCancel} title="Cancel Invoice" message="Are you sure you want to cancel this invoice? Inventory will be reversed." />
            
            <JournalEntryViewerModal
                isOpen={!!journalTransaction}
                onClose={() => setJournalTransaction(null)}
                invoiceId={journalTransaction?.id}
                invoiceNumber={journalTransaction?.id}
                documentType="SALES"
                currentUser={currentUser}
                isPosted={(journalTransaction?.status || '') === 'completed'}
            />
        </main>
    );
};

export default SalesHistory;
