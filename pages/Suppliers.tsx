import React, { useState, useMemo, useEffect } from 'react';
import Card from '../components/Card';
import type { Supplier, RegisteredPharmacy } from '../types';
import type { SupplierQuickResult } from '../services/supplierService';
import { AddSupplierModal, EditSupplierModal } from '../components/AddSupplierModal';
import ExportSuppliersModal from '../components/ExportSuppliersModal';
import { fuzzyMatch } from '../utils/search';
import { shouldHandleScreenShortcut } from '../utils/screenShortcuts';

const uniformTextStyle = 'text-2xl font-normal tracking-tight uppercase leading-tight';

const displayValue = (value: unknown, fallback = 'N/A'): string => {
    if (value === null || value === undefined) return fallback;
    if (typeof value === 'string') {
        const trimmed = value.trim();
        return trimmed.length ? trimmed : fallback;
    }
    if (typeof value === 'number') return Number.isFinite(value) ? String(value) : fallback;
    if (typeof value === 'boolean') return value ? 'Yes' : 'No';
    if (Array.isArray(value)) {
        const normalized = value.map(item => displayValue(item, '')).filter(Boolean).join(', ');
        return normalized || fallback;
    }

    return fallback;
};

const addressFields: Array<{ label: string; key: 'address_line1' | 'address_line2' | 'area' | 'city' | 'district' | 'state' | 'pincode' | 'country' }> = [
    { label: 'Address Line 1', key: 'address_line1' },
    { label: 'Address Line 2', key: 'address_line2' },
    { label: 'Area / Locality', key: 'area' },
    { label: 'City', key: 'city' },
    { label: 'District', key: 'district' },
    { label: 'State', key: 'state' },
    { label: 'Pincode', key: 'pincode' },
    { label: 'Country', key: 'country' },
] as const;

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
    const [isExportModalOpen, setIsExportModalOpen] = useState(false);
    const [selectedSupplier, setSelectedSupplier] = useState<Supplier | null>(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'blocked'>('all');

    const filteredSuppliers = useMemo(() => {
        if (!Array.isArray(suppliers)) return [];
        return suppliers
            .filter(s => s && (statusFilter === 'all' || (statusFilter === 'active' ? s.is_active !== false : s.is_active === false)))
            .filter(s => fuzzyMatch(s.name || '', searchTerm) || fuzzyMatch(s.phone || '', searchTerm) || fuzzyMatch(s.mobile || '', searchTerm))
            .sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    }, [suppliers, searchTerm, statusFilter]);

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (!shouldHandleScreenShortcut(e, 'suppliers')) return;
            if (e.key === 'F2') {
                e.preventDefault();
                setIsAddModalOpen(true);
            } else if (e.key === 'F3') {
                e.preventDefault();
                if (Array.isArray(filteredSuppliers) && filteredSuppliers.length > 0) {
                    setIsExportModalOpen(true);
                }
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [filteredSuppliers]);

    const handleExportClick = () => {
        if (!Array.isArray(filteredSuppliers) || filteredSuppliers.length === 0) return;
        setIsExportModalOpen(true);
    };

    const handleDuplicateSupplier = (supplier: Supplier) => {
        if (!supplier) return;
        setSelectedSupplier(supplier);
        setIsEditModalOpen(true);
    };

    const selectedSupplierExtra = selectedSupplier as (Supplier & Record<string, any>) | null;

    const safeToNumber = (val: any) => {
        const n = Number(val);
        return isFinite(n) ? n : 0;
    };

    return (
        <main className="flex-1 overflow-hidden flex flex-col page-fade-in bg-app-bg">
            <div className="bg-primary text-white h-7 flex items-center px-4 justify-between border-b border-gray-600 shadow-md flex-shrink-0">
                <span className="text-[10px] font-black uppercase tracking-widest">Supplier Master (Accounts Payable)</span>
                <span className="text-[10px] font-black uppercase text-accent">Total: {suppliers.length}</span>
            </div>

            <div className="p-4 flex-1 flex gap-4 min-h-0 overflow-hidden">
                <Card className="w-1/3 flex flex-col p-0 tally-border overflow-hidden bg-white">
                    <div className="p-3 border-b border-gray-400 bg-gray-50 flex flex-col gap-2 flex-shrink-0">
                        <input type="text" placeholder="Find Supplier..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="w-full border border-gray-400 p-2 text-sm font-bold focus:bg-yellow-50 outline-none shadow-sm" />
                        <div className="flex justify-between items-center">
                            <select value={statusFilter} onChange={e => setStatusFilter(e.target.value as any)} className="text-[10px] font-black uppercase text-primary border-none bg-transparent outline-none">
                                <option value="all">All Status</option>
                                <option value="active">Active</option>
                                <option value="blocked">Blocked</option>
                            </select>
                        </div>
                    </div>
                    <div className="flex-1 overflow-y-auto divide-y divide-gray-200">
                        {filteredSuppliers.map(s => (
                            <button key={s.id} type="button" onClick={() => setSelectedSupplier(s)} className={`w-full text-left p-3 transition-all border-l-[6px] ${selectedSupplier?.id === s.id ? 'bg-accent text-black border-primary' : 'border-transparent hover:bg-gray-100'}`}>
                                <p className={`${uniformTextStyle} !text-xl truncate`}>{s.name}</p>
                                <p className="text-xs font-bold uppercase text-gray-500 truncate">GST: {s.gst_number || 'N/A'}</p>
                            </button>
                        ))}
                    </div>
                    <div className="p-3 border-t border-gray-400 bg-gray-50 flex gap-2 flex-shrink-0">
                        <button onClick={() => setIsAddModalOpen(true)} className="flex-1 py-2 tally-button-primary text-[10px] uppercase">F2: Create</button>
                        <button onClick={handleExportClick} className="flex-1 py-2 tally-border bg-white font-bold uppercase text-[10px]">F3: Export</button>
                    </div>
                </Card>

                <Card className="flex-1 p-0 tally-border bg-white overflow-hidden flex flex-col shadow-inner">
                    {(() => {
                        if (!selectedSupplier) {
                            return (
                                <div className="h-full flex items-center justify-center text-gray-300">
                                    <p className="text-xl font-black uppercase tracking-[0.2em]">Select Supplier</p>
                                </div>
                            );
                        }

                        try {
                            const openingBalance = safeToNumber(selectedSupplier.opening_balance);
                            
                            return (
                                <div className="flex flex-col h-full overflow-hidden">
                                    <div className="p-6 bg-gray-100 border-b border-gray-400 flex justify-between items-start flex-shrink-0">
                                        <div className="flex-1">
                                            <h3 className={`${uniformTextStyle} !text-4xl text-primary`}>{selectedSupplier.name || '—'}</h3>
                                            <div className="flex flex-wrap gap-x-8 gap-y-2 mt-3 text-sm font-bold text-gray-500 uppercase">
                                                <span>GSTIN: <span className="text-gray-900 tally-font-data-mono">{selectedSupplier.gst_number || 'N/A'}</span></span>
                                                <span>PH: <span className="text-gray-900 tally-font-data-mono">{selectedSupplier.mobile || selectedSupplier.phone || 'N/A'}</span></span>
                                                <span>Opening: <span className="text-gray-900 tally-font-data-mono">₹{openingBalance.toFixed(2)}</span></span>
                                            </div>
                                        </div>
                                        <button onClick={() => setIsEditModalOpen(true)} className="px-6 py-2 tally-border bg-white font-black text-[10px] uppercase shadow-sm">Alter</button>
                                    </div>

                                    <div className="p-4 border-b border-gray-300 bg-white">
                                        <p className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-500 mb-3">Address Details</p>
                                        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
                                            {addressFields.map(({ label, key }) => (
                                                <div key={key} className="min-w-0 border border-gray-200 p-3">
                                                    <p className="text-[10px] font-black uppercase tracking-widest text-gray-500">{label}</p>
                                                    <p className="text-sm font-bold text-gray-900 break-words">{displayValue(selectedSupplier[key as keyof Supplier])}</p>
                                                </div>
                                            ))}
                                        </div>
                                    </div>

                                    <div className="flex-1 overflow-auto p-4">
                                        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                                            <div className="p-3 border border-gray-200">
                                                <p className="text-[10px] font-black uppercase tracking-widest text-gray-500">Supplier Group</p>
                                                <p className="text-sm font-bold text-gray-900">{displayValue(selectedSupplier.supplier_group)}</p>
                                            </div>
                                            <div className="p-3 border border-gray-200">
                                                <p className="text-[10px] font-black uppercase tracking-widest text-gray-500">Supplier Category</p>
                                                <p className="text-sm font-bold text-gray-900">{displayValue(selectedSupplierExtra?.category)}</p>
                                            </div>
                                            <div className="p-3 border border-gray-200">
                                                <p className="text-[10px] font-black uppercase tracking-widest text-gray-500">Supplier Control GL</p>
                                                <p className="text-sm font-bold text-gray-900">{displayValue(selectedSupplier.control_gl_id)}</p>
                                            </div>
                                            <div className="p-3 border border-gray-200">
                                                <p className="text-[10px] font-black uppercase tracking-widest text-gray-500">Email</p>
                                                <p className="text-sm font-bold text-gray-900 break-all">{displayValue(selectedSupplier.email)}</p>
                                            </div>
                                            <div className="p-3 border border-gray-200">
                                                <p className="text-[10px] font-black uppercase tracking-widest text-gray-500">GSTIN</p>
                                                <p className="text-sm font-bold text-gray-900">{displayValue(selectedSupplier.gst_number)}</p>
                                            </div>
                                            <div className="p-3 border border-gray-200">
                                                <p className="text-[10px] font-black uppercase tracking-widest text-gray-500">Opening Balance</p>
                                                <p className="text-sm font-bold text-gray-900">₹{openingBalance.toFixed(2)}</p>
                                            </div>
                                            <div className="p-3 border border-gray-200">
                                                <p className="text-[10px] font-black uppercase tracking-widest text-gray-500">PAN</p>
                                                <p className="text-sm font-bold text-gray-900">{displayValue(selectedSupplier.pan_number)}</p>
                                            </div>
                                            <div className="p-3 border border-gray-200">
                                                <p className="text-[10px] font-black uppercase tracking-widest text-gray-500">Drug License</p>
                                                <p className="text-sm font-bold text-gray-900">{displayValue(selectedSupplier.drug_license)}</p>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            );
                        } catch (e) {
                            console.error('Render Error in Supplier Detail Pane:', e);
                            return (
                                <div className="h-full flex flex-col items-center justify-center text-red-500 p-10 text-center">
                                    <p className="text-xl font-black uppercase mb-2">Render Error</p>
                                    <p className="text-sm font-bold opacity-70">The system encountered an error while rendering this supplier's details. Please contact support.</p>
                                </div>
                            );
                        }
                    })()}
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
                <EditSupplierModal
                    isOpen={isEditModalOpen}
                    onClose={() => setIsEditModalOpen(false)}
                    onSave={onUpdateSupplier}
                    supplier={selectedSupplier}
                    defaultControlGlId={defaultSupplierControlGlId}
                />
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
