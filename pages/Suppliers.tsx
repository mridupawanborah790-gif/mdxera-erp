
import React, { useState, useMemo, useEffect, useCallback } from 'react';
import Card from '../components/Card';
import type { Supplier, RegisteredPharmacy } from '../types';
import type { SupplierQuickResult } from '../services/supplierService';
import { AddSupplierModal, EditSupplierModal } from '../components/AddSupplierModal';
import PrintLedgerModal from '../components/PrintLedgerModal';
import ExportSuppliersModal from '../components/ExportSuppliersModal';
import { getOutstandingBalance } from '../utils/helpers';
import { getDataById } from '../services/storageService';

const uniformTextStyle = "text-2xl font-normal tracking-tight uppercase leading-tight";


const normalizeSupplier = (supplier: Supplier): Supplier => {
    const fallbackName = typeof supplier.name === 'string' && supplier.name.trim() ? supplier.name : 'Unnamed Supplier';
    const safeLedger = Array.isArray(supplier.ledger)
        ? supplier.ledger.filter((item): item is Supplier['ledger'][number] => Boolean(item && typeof item === 'object')).map((item, index) => ({
            id: typeof item.id === 'string' && item.id.trim() ? item.id : `${supplier.id || 'supplier'}-entry-${index}`,
            date: typeof item.date === 'string' && item.date.trim() ? item.date : '-',
            type: item.type || 'purchase',
            description: typeof item.description === 'string' ? item.description : '',
            debit: Number.isFinite(Number(item.debit)) ? Number(item.debit) : 0,
            credit: Number.isFinite(Number(item.credit)) ? Number(item.credit) : 0,
            balance: Number.isFinite(Number(item.balance)) ? Number(item.balance) : 0,
        }))
        : [];

    return {
        ...supplier,
        name: fallbackName,
        ledger: safeLedger,
        payment_details: (supplier.payment_details && typeof supplier.payment_details === 'object')
            ? supplier.payment_details
            : {},
    };
};

interface SuppliersProps {
    suppliers: Supplier[];
    onAddSupplier: (data: Omit<Supplier, 'ledger' | 'organization_id'>, balance: number, date: string) => Promise<SupplierQuickResult>;
    onBulkAddSuppliers: (suppliers: any[]) => void;
    onRecordPayment: (supplierId: string, paymentAmount: number, paymentDate: string, description: string) => void;
    onUpdateSupplier: (supplier: Supplier) => void;
    config: any;
    currentUser: RegisteredPharmacy | null;
    defaultSupplierControlGlId?: string;
}

const Suppliers: React.FC<SuppliersProps> = ({ suppliers, onAddSupplier, onBulkAddSuppliers, onRecordPayment, onUpdateSupplier, config, currentUser, defaultSupplierControlGlId }) => {
    const [isAddModalOpen, setIsAddModalOpen] = useState(false);
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);
    const [isPrintModalOpen, setIsPrintModalOpen] = useState(false);
    const [isExportModalOpen, setIsExportModalOpen] = useState(false);
    const [selectedSupplier, setSelectedSupplier] = useState<Supplier | null>(null);
    const [selectedSupplierId, setSelectedSupplierId] = useState<string | null>(null);
    const [isLoadingDetails, setIsLoadingDetails] = useState(false);
    const [detailsError, setDetailsError] = useState<string | null>(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'blocked'>('all');

    const filteredSuppliers = useMemo(() => {
        const lowercasedFilter = searchTerm.toLowerCase();
        return suppliers
            .filter(d => {
                if (statusFilter === 'active') return d.is_active !== false;
                if (statusFilter === 'blocked') return d.is_active === false;
                return true;
            })
            .filter(d => (d.name || '').toLowerCase().includes(lowercasedFilter))
            .sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    }, [suppliers, searchTerm, statusFilter]);

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'F2') {
                e.preventDefault();
                setIsAddModalOpen(true);
            } else if (e.key === 'F3') {
                e.preventDefault();
                if (filteredSuppliers.length > 0) {
                    setIsExportModalOpen(true);
                }
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [filteredSuppliers]);

    const handleExportClick = () => {
        if (filteredSuppliers.length === 0) return;
        setIsExportModalOpen(true);
    };

    const handleSelectSupplier = useCallback(async (supplierId: string) => {
        if (!supplierId) {
            setSelectedSupplier(null);
            setSelectedSupplierId(null);
            setDetailsError('Supplier details not found');
            return;
        }

        setSelectedSupplierId(supplierId);
        setIsLoadingDetails(true);
        setDetailsError(null);

        try {
            const supplier = await getDataById<Supplier>('suppliers', supplierId, currentUser, { forceRefresh: true });

            if (!supplier) {
                setSelectedSupplier(null);
                setDetailsError('Supplier details not found');
                return;
            }

            setSelectedSupplier(normalizeSupplier(supplier));
        } catch (error) {
            console.error('Failed to load supplier details:', error);
            setSelectedSupplier(null);
            setDetailsError('Unable to load supplier details');
        } finally {
            setIsLoadingDetails(false);
        }
    }, [currentUser]);


    const handleDuplicateSupplier = (supplier: Supplier) => {
        setSelectedSupplier(normalizeSupplier(supplier));
        setIsEditModalOpen(true);
    };
    const handleEditSubmit = (updated: Supplier) => {
        onUpdateSupplier(updated);
        setSelectedSupplier(normalizeSupplier(updated));
        setSelectedSupplierId(updated.id);
        setIsEditModalOpen(false);
    };

    const toAmount = (value: unknown): number => {
        const parsed = Number(value);
        return Number.isFinite(parsed) ? parsed : 0;
    };

    const toDisplay = (value: unknown): string => {
        if (value === null || value === undefined) return 'N/A';
        if (typeof value === 'string') {
            const text = value.trim();
            return text.length > 0 ? text : 'N/A';
        }
        return String(value);
    };

    const selectedSupplierSafe = selectedSupplier as (Supplier & Record<string, unknown>) | null;
    const paymentDetails = (selectedSupplierSafe?.payment_details || {}) as Record<string, unknown>;
    const ledgerEntries: Record<string, unknown>[] = Array.isArray(selectedSupplierSafe?.ledger)
        ? (selectedSupplierSafe.ledger as unknown[]).filter((item) => Boolean(item && typeof item === 'object')) as Record<string, unknown>[]
        : [];
    const openingDate =
        selectedSupplierSafe?.created_at ||
        selectedSupplierSafe?.updated_at ||
        selectedSupplierSafe?.opening_date;
    const detailRows: { label: string; value: string }[] = selectedSupplierSafe
        ? [
            { label: 'Supplier Name / Trade Name', value: toDisplay(selectedSupplierSafe.name || selectedSupplierSafe.trade_name) },
            { label: 'Contact Person', value: toDisplay(selectedSupplierSafe.contact_person) },
            { label: 'Supplier Category', value: toDisplay(selectedSupplierSafe.category) },
            { label: 'Supplier Group', value: toDisplay(selectedSupplierSafe.supplier_group) },
            { label: 'Supplier Control GL', value: toDisplay(selectedSupplierSafe.control_gl_id) },
            { label: 'Office Phone', value: toDisplay(selectedSupplierSafe.phone) },
            { label: 'Mobile No.', value: toDisplay(selectedSupplierSafe.mobile) },
            { label: 'Email ID', value: toDisplay(selectedSupplierSafe.email) },
            { label: 'GSTIN', value: toDisplay(selectedSupplierSafe.gst_number) },
            { label: 'Address Line 1', value: toDisplay(selectedSupplierSafe.address_line1 || selectedSupplierSafe.address) },
            { label: 'Address Line 2', value: toDisplay(selectedSupplierSafe.address_line2) },
            { label: 'Area / Locality', value: toDisplay(selectedSupplierSafe.area) },
            { label: 'Pincode', value: toDisplay(selectedSupplierSafe.pincode) },
            { label: 'District', value: toDisplay(selectedSupplierSafe.district) },
            { label: 'State', value: toDisplay(selectedSupplierSafe.state) },
            { label: 'UPI ID', value: toDisplay(paymentDetails.upi_id) },
            { label: 'Bank Name', value: toDisplay(paymentDetails.bank_name) },
            { label: 'A/C Number', value: toDisplay(paymentDetails.account_number) },
            { label: 'IFSC Code', value: toDisplay(paymentDetails.ifsc_code) },
            { label: 'Opening Amount', value: `₹${toAmount(selectedSupplierSafe.opening_balance).toFixed(2)}` },
            { label: 'Opening Date', value: toDisplay(openingDate) },
            { label: 'Ledger / Current Balance', value: `₹${toAmount(getOutstandingBalance(selectedSupplierSafe as Supplier)).toFixed(2)}` },
        ]
        : [];

    return (
        <main className="flex-1 overflow-hidden flex flex-col page-fade-in bg-app-bg">
            <div className="bg-primary text-white h-7 flex items-center px-4 justify-between border-b border-gray-600 shadow-md flex-shrink-0">
                <span className="text-[10px] font-black uppercase tracking-widest">Supplier Master (Accounts Payable)</span>
                <span className="text-[10px] font-black uppercase text-accent">Total: {suppliers.length}</span>
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
                        {filteredSuppliers.map(s => (
                            <div key={s.id} onClick={() => handleSelectSupplier(s.id)} className={`p-4 cursor-pointer transition-all border-l-[8px] ${selectedSupplierId === s.id ? 'bg-accent text-black' : 'border-transparent hover:bg-gray-100'}`}>
                                <div className="flex justify-between items-center">
                                    <p className={`${uniformTextStyle} truncate pr-2`}>{s.name}</p>
                                    <p className={`${uniformTextStyle} whitespace-nowrap ${getOutstandingBalance(s) > 0 ? 'text-red-700' : 'text-emerald-700'}`}>
                                        ₹{(getOutstandingBalance(s) || 0).toFixed(2)}
                                    </p>
                                </div>
                            </div>
                        ))}
                    </div>
                    <div className="p-3 border-t border-gray-400 bg-gray-50 flex gap-2 flex-shrink-0">
                        <button onClick={() => setIsAddModalOpen(true)} className="flex-1 py-2 tally-button-primary text-[10px] uppercase">F2: Create</button>
                        <button onClick={handleExportClick} className="flex-1 py-2 tally-border bg-white font-bold uppercase text-[10px]">F3: Export</button>
                    </div>
                </Card>

                <Card className="flex-1 p-0 tally-border bg-white overflow-hidden flex flex-col shadow-inner">
                    {isLoadingDetails ? (
                        <div className="h-full flex items-center justify-center text-gray-400">
                            <p className="text-xl font-black uppercase tracking-[0.2em]">Loading Supplier Details...</p>
                        </div>
                    ) : detailsError ? (
                        <div className="h-full flex items-center justify-center text-gray-400">
                            <p className="text-xl font-black uppercase tracking-[0.2em]">{detailsError}</p>
                        </div>
                    ) : selectedSupplier ? (
                        <div className="flex flex-col h-full overflow-hidden">
                            <div className="p-6 bg-gray-100 border-b border-gray-400 flex justify-between items-start flex-shrink-0">
                                <div className="flex-1">
                                    <h3 className={`${uniformTextStyle} !text-4xl text-primary`}>{selectedSupplier.name}</h3>
                                    <div className="flex flex-wrap gap-x-8 gap-y-2 mt-3 text-sm font-bold text-gray-500 uppercase">
                                        <span>GSTIN: <span className="text-gray-900 tally-font-data-mono">{selectedSupplier.gst_number || 'N/A'}</span></span>
                                        <span>PH: <span className="text-gray-900 tally-font-data-mono">{selectedSupplier.mobile || selectedSupplier.phone || 'N/A'}</span></span>
                                        <span>Opening: <span className="text-gray-900 tally-font-data-mono">₹{(selectedSupplier.opening_balance || 0).toFixed(2)}</span></span>
                                    </div>
                                </div>
                                <div className="flex gap-2">
                                    <button onClick={() => setIsPrintModalOpen(true)} className="px-6 py-2 tally-border bg-white font-black text-[10px] uppercase flex items-center gap-2 shadow-sm">
                                        Print
                                    </button>
                                    <button onClick={() => setIsEditModalOpen(true)} className="px-6 py-2 tally-border bg-white font-black text-[10px] uppercase shadow-sm">Alter</button>
                                </div>
                            </div>
                            
                            <div className="flex-1 overflow-auto">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-0 border-b border-gray-300">
                                    {detailRows.map((row) => (
                                        <div key={row.label} className="p-3 border-t border-r border-gray-200 even:border-r-0">
                                            <p className="text-[10px] font-black uppercase tracking-widest text-gray-500">{row.label}</p>
                                            <p className="text-sm font-bold text-gray-900 break-words">{row.value}</p>
                                        </div>
                                    ))}
                                </div>
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
                                        {ledgerEntries.map((item, index) => (
                                            <tr key={String(item.id || `${selectedSupplier.id}-${index}`)} className="hover:bg-gray-50 transition-colors">
                                                <td className={`${uniformTextStyle} p-4 border-r border-gray-100`}>{toDisplay(item.date)}</td>
                                                <td className={`${uniformTextStyle} p-4 border-r border-gray-100 text-gray-700`}>{toDisplay(item.description)}</td>
                                                <td className={`${uniformTextStyle} p-4 border-r border-gray-100 text-right text-emerald-700`}>{toAmount(item.debit) > 0 ? toAmount(item.debit).toFixed(2) : ''}</td>
                                                <td className={`${uniformTextStyle} p-4 border-r border-gray-200 text-right text-red-700`}>{toAmount(item.credit) > 0 ? toAmount(item.credit).toFixed(2) : ''}</td>
                                                <td className={`${uniformTextStyle} p-4 text-right ${toAmount(item.balance) > 0 ? 'text-red-700' : 'text-emerald-700'} bg-slate-50/30`}>₹{toAmount(item.balance).toFixed(2)}</td>
                                            </tr>
                                        ))}
                                        {ledgerEntries.length === 0 && (
                                            <tr>
                                                <td className="p-4 text-center text-sm font-bold text-gray-500" colSpan={5}>No ledger entries found for this supplier.</td>
                                            </tr>
                                        )}
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
                <AddSupplierModal 
                    isOpen={isAddModalOpen} 
                    onClose={() => setIsAddModalOpen(false)} 
                    onAdd={onAddSupplier} 
                    onDuplicate={handleDuplicateSupplier}
                    defaultControlGlId={defaultSupplierControlGlId}
                    organizationId={currentUser?.organization_id || ''} 
                />
            )}

            {selectedSupplier && (
                <>
                    <EditSupplierModal 
                        isOpen={isEditModalOpen} 
                        onClose={() => setIsEditModalOpen(false)} 
                        onSave={handleEditSubmit} 
                        supplier={selectedSupplier} 
                    />
                    <PrintLedgerModal 
                        isOpen={isPrintModalOpen}
                        onClose={() => setIsPrintModalOpen(false)}
                        distributor={selectedSupplier as any}
                        pharmacy={currentUser}
                    />
                </>
            )}

            {isExportModalOpen && (
                <ExportSuppliersModal
                    isOpen={isExportModalOpen}
                    onClose={() => setIsExportModalOpen(false)}
                    data={filteredSuppliers}
                    pharmacyName={currentUser?.pharmacy_name || 'MDXERA ERP'}
                />
            )}
        </main>
    );
};

export default Suppliers;
