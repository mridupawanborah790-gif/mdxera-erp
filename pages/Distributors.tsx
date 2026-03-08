
import React, { useState, useMemo, useEffect, useRef } from 'react';
import Card from '../components/Card';
import Modal from '../components/Modal';
import type { Distributor, TransactionLedgerItem, ModuleConfig, RegisteredPharmacy } from '../types';
import DistributorImportPreviewModal from '../components/DistributorImportPreviewModal';
import { downloadCsv, arrayToCsvRow, parseCsvLine } from '../utils/csv';
import { handleEnterToNextField } from '../utils/navigation';
import { STATE_DISTRICT_MAP } from '../constants';
import { AddDistributorModal, EditDistributorModal, RecordPaymentModal } from '../components/AddDistributorModal';
import PrintLedgerModal from '../components/PrintLedgerModal';
import { getOutstandingBalance } from '../utils/helpers';
import { shouldHandleScreenShortcut } from '../utils/screenShortcuts';

// Standardized typography matching POS screen "Product Selection Matrix"
const uniformTextStyle = "text-2xl font-normal tracking-tight uppercase leading-tight";

// Define missing DistributorsProps interface to fix compilation error
interface DistributorsProps {
    distributors: Distributor[];
    onAddDistributor: (data: Omit<Distributor, 'id' | 'ledger' | 'organization_id'>, balance: number, date: string) => void;
    onBulkAddDistributors: (distributors: any[]) => void;
    onRecordPayment: (distributorId: string, paymentAmount: number, paymentDate: string, description: string) => void;
    onUpdateDistributor: (distributor: Distributor) => void;
    config: { visible: boolean };
    currentUser: RegisteredPharmacy | null;
}

const DistributorsPage: React.FC<DistributorsProps> = ({ distributors, onAddDistributor, onBulkAddDistributors, onRecordPayment, onUpdateDistributor, config, currentUser }) => {
    const [isAddModalOpen, setIsAddModalOpen] = useState(false);
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);
    const [isPrintModalOpen, setIsPrintModalOpen] = useState(false);
    const [selectedDistributor, setSelectedDistributor] = useState<Distributor | null>(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'blocked'>('all');

    // Keyboard Shortcuts
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (!shouldHandleScreenShortcut(e, 'distributors')) return;
            if (e.key === 'F2') {
                e.preventDefault();
                setIsAddModalOpen(true);
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, []);

    const filteredDistributors = useMemo(() => {
        const lowercasedFilter = searchTerm.toLowerCase();
        return distributors
            .filter(d => {
                /* Fix: Rename d.isActive to d.is_active */
                if (statusFilter === 'active') return d.is_active !== false;
                /* Fix: Rename d.isActive to d.is_active */
                if (statusFilter === 'blocked') return d.is_active === false;
                return true;
            })
            .filter(d => (d.name || '').toLowerCase().includes(lowercasedFilter))
            .sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    }, [distributors, searchTerm, statusFilter]);

    const handleExportExcel = () => {
        if (filteredDistributors.length === 0) return;
        const headers = ['Name', 'Address', 'Phone', 'GSTIN', 'Balance', 'Status'];
        const rows = filteredDistributors.map(dist => arrayToCsvRow([
            /* Fix: Rename dist.gstNumber to dist.gst_number and dist.isActive to dist.is_active */
            dist.name, dist.address || '', dist.phone || '', dist.gst_number || '', getOutstandingBalance(dist), dist.is_active === false ? 'Blocked' : 'Active'
        ]));
        downloadCsv([arrayToCsvRow(headers), ...rows].join('\n'), `suppliers_${new Date().toISOString().split('T')[0]}.csv`);
    };

    const handleEditSubmit = (updatedDistributor: Distributor) => {
        onUpdateDistributor(updatedDistributor);
        setSelectedDistributor(updatedDistributor);
        setIsEditModalOpen(false);
    };

    const toAmount = (value: unknown): number => {
        const parsed = Number(value);
        return Number.isFinite(parsed) ? parsed : 0;
    };

    return (
        <main className="flex-1 overflow-hidden flex flex-col page-fade-in bg-app-bg">
            <div className="bg-primary text-white h-7 flex items-center px-4 justify-between border-b border-gray-600 shadow-md flex-shrink-0">
                <span className="text-[10px] font-black uppercase tracking-widest">Supplier Master (Accounts Payable)</span>
                <span className="text-[10px] font-black uppercase text-accent">Total: {distributors.length}</span>
            </div>

            <div className="p-4 flex-1 flex gap-4 min-h-0 overflow-hidden">
                <Card className="w-1/3 flex flex-col p-0 tally-border overflow-hidden bg-white">
                    <div className="p-3 border-b border-gray-400 flex flex-col gap-2 bg-gray-50 flex-shrink-0">
                        <input type="text" placeholder="Filter List..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="w-full border border-gray-400 p-2 text-sm font-bold focus:bg-yellow-50 outline-none shadow-sm" />
                        <div className="flex items-center gap-2">
                            <span className="text-[10px] font-bold text-gray-500 uppercase">Status:</span>
                            <select value={statusFilter} onChange={e => setStatusFilter(e.target.value as any)} className="text-[10px] font-black border-none bg-transparent outline-none uppercase text-primary">
                                <option value="all">All</option>
                                <option value="active">Active</option>
                                <option value="blocked">Blocked</option>
                            </select>
                        </div>
                    </div>
                    <div className="flex-1 overflow-y-auto divide-y divide-gray-200">
                        {filteredDistributors.map(dist => (
                            <div key={dist.id} onClick={() => setSelectedDistributor(dist)} className={`p-4 cursor-pointer transition-all border-l-[8px] ${selectedDistributor?.id === dist.id ? 'bg-accent text-black' : 'border-transparent hover:bg-gray-100'}`}>
                                <div className="flex justify-between items-center">
                                    <p className={`${uniformTextStyle} truncate pr-2`}>{dist.name}</p>
                                    <p className={`${uniformTextStyle} whitespace-nowrap ${getOutstandingBalance(dist) > 0 ? 'text-red-700' : 'text-emerald-700'}`}>
                                        ₹{(getOutstandingBalance(dist) || 0).toFixed(2)}
                                    </p>
                                </div>
                            </div>
                        ))}
                    </div>
                    <div className="p-3 border-t border-gray-400 bg-gray-50 flex gap-2 flex-shrink-0">
                        <button onClick={() => setIsAddModalOpen(true)} className="flex-1 py-2 tally-button-primary text-[10px] uppercase">F2: Create</button>
                        <button onClick={handleExportExcel} className="flex-1 py-2 tally-border bg-white font-bold uppercase text-[10px]">F3: Export</button>
                    </div>
                </Card>

                <Card className="flex-1 p-0 tally-border bg-white overflow-hidden flex flex-col shadow-inner">
                    {selectedDistributor ? (
                        <div className="flex flex-col h-full overflow-hidden">
                            <div className="p-6 bg-gray-100 border-b border-gray-400 flex justify-between items-start flex-shrink-0">
                                <div className="flex-1">
                                    <h3 className={`${uniformTextStyle} !text-4xl text-primary`}>{selectedDistributor.name}</h3>
                                    <div className="flex flex-wrap gap-x-8 gap-y-2 mt-3 text-sm font-bold text-gray-500 uppercase">
                                        {/* Fix: Rename selectedDistributor.gstNumber to selectedDistributor.gst_number */}
                                        <span>GSTIN: <span className="text-gray-900 tally-font-data-mono">{selectedDistributor.gst_number || 'N/A'}</span></span>
                                        <span>PH: <span className="text-gray-900 tally-font-data-mono">{selectedDistributor.phone || 'N/A'}</span></span>
                                        <span>Opening: <span className="text-gray-900 tally-font-data-mono">₹{toAmount(selectedDistributor.opening_balance).toFixed(2)}</span></span>
                                    </div>
                                </div>
                                <div className="flex gap-2">
                                    <button onClick={() => setIsPrintModalOpen(true)} className="px-6 py-2 tally-border bg-white font-black text-[10px] uppercase flex items-center gap-2 shadow-sm">
                                        <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>
                                        Print
                                    </button>
                                    <button onClick={() => setIsEditModalOpen(true)} className="px-6 py-2 tally-border bg-white font-black text-[10px] uppercase shadow-sm">Alter</button>
                                </div>
                            </div>
                            
                            <div className="flex-1 overflow-auto">
                                <table className="min-w-full border-collapse">
                                    <thead className="bg-gray-50 sticky top-0 border-b border-gray-400 z-10">
                                        <tr className={`${uniformTextStyle} text-gray-600`}>
                                            <th className="p-4 border-r border-gray-400 text-left">Date</th>
                                            <th className="p-4 border-r border-gray-400 text-left">Description</th>
                                            <th className="p-4 border-r border-gray-400 text-right">Debit (-)</th>
                                            <th className="p-4 border-r border-gray-400 text-right">Credit (+)</th>
                                            <th className="p-4 text-right">Balance</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-100 tally-font-data-mono">
                                        {(selectedDistributor.ledger || []).map(item => (
                                            <tr key={item.id} className="hover:bg-gray-50 transition-colors">
                                                <td className={`${uniformTextStyle} p-4 border-r border-gray-100`}>{item.date}</td>
                                                <td className={`${uniformTextStyle} p-4 border-r border-gray-100 text-gray-700`}>{item.description}</td>
                                                <td className={`${uniformTextStyle} p-4 border-r border-gray-100 text-right text-emerald-700`}>{toAmount(item.debit) > 0 ? toAmount(item.debit).toFixed(2) : ''}</td>
                                                <td className={`${uniformTextStyle} p-4 border-r border-gray-200 text-right text-red-700`}>{toAmount(item.credit) > 0 ? toAmount(item.credit).toFixed(2) : ''}</td>
                                                <td className={`${uniformTextStyle} p-4 text-right ${toAmount(item.balance) > 0 ? 'text-red-700' : 'text-emerald-700'} bg-slate-50/30`}>₹{toAmount(item.balance).toFixed(2)}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    ) : (
                        <div className="h-full flex items-center justify-center text-gray-300">
                            <p className="text-xl font-black uppercase tracking-[0.2em]">Select Supplier Ledger</p>
                        </div>
                    )}
                </Card>
            </div>

            {isAddModalOpen && (
                <AddDistributorModal 
                    isOpen={isAddModalOpen} 
                    onClose={() => setIsAddModalOpen(false)} 
                    onAdd={onAddDistributor} 
                    organizationId={currentUser?.organization_id || ''} 
                />
            )}

            {selectedDistributor && (
                <>
                    <EditDistributorModal 
                        isOpen={isEditModalOpen} 
                        onClose={() => setIsEditModalOpen(false)} 
                        onSave={handleEditSubmit} 
                        distributor={selectedDistributor} 
                    />
                    <PrintLedgerModal 
                        isOpen={isPrintModalOpen}
                        onClose={() => setIsPrintModalOpen(false)}
                        distributor={selectedDistributor}
                        pharmacy={currentUser}
                    />
                </>
            )}
        </main>
    );
};

export default DistributorsPage;
