
import React, { useState, useMemo, useEffect, useRef } from 'react';
import Card from '../components/Card';
import Modal from '../components/Modal';
import SendReminderModal from '../components/SendReminderModal';
import CustomerImportPreviewModal from '../components/CustomerImportPreviewModal';
import PriceListManagementModal from '../components/PriceListManagementModal';
import PriceListImportModal from '../components/PriceListImportModal';
import AddCustomerModal from '../components/AddCustomerModal'; 
import { EditCustomerModal } from '../components/EditCustomerModal'; 
import PrintCustomerLedgerModal from '../components/PrintCustomerLedgerModal';
import ExportCustomersModal from '../components/ExportCustomersModal';
import type { Customer, RegisteredPharmacy, ModuleConfig, InventoryItem, CustomerPriceListEntry, OrganizationMember } from '../types';
import { downloadCsv, arrayToCsvRow } from '../utils/csv';
import { handleEnterToNextField } from '../utils/navigation';
import { fetchCustomerPriceList, saveCustomerPriceList, fetchInventory } from '../services/storageService';
import { getOutstandingBalance } from '../utils/helpers';
import { fuzzyMatch } from '../utils/search';

const uniformTextStyle = "text-2xl font-normal tracking-tight uppercase leading-tight";

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

interface CustomersProps {
    customers: Customer[];
    teamMembers?: OrganizationMember[]; 
    onAddCustomer: (data: Omit<Customer, 'id' | 'ledger' | 'organization_id'>, openingBalance: number, asOfDate: string) => void;
    onBulkAddCustomers: (customers: any[]) => void;
    onRecordPayment: (customerId: string, paymentAmount: number, paymentDate: string, description: string) => void;
    onUpdateCustomer: (customer: Customer) => void;
    currentUser: RegisteredPharmacy | null;
    config: ModuleConfig;
    inventory: InventoryItem[];
    defaultCustomerControlGlId?: string;
}

const CustomersPage: React.FC<CustomersProps> = ({ customers, teamMembers = [], onAddCustomer, onBulkAddCustomers, onRecordPayment, onUpdateCustomer, currentUser, config, inventory, defaultCustomerControlGlId }) => {
    const [isAddModalOpen, setIsAddModalOpen] = useState(false);
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);
    const [isPrintModalOpen, setIsPrintModalOpen] = useState(false);
    const [isExportModalOpen, setIsExportModalOpen] = useState(false);
    const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'blocked'>('all');
    const [isPriceListModalOpen, setIsPriceListModalOpen] = useState(false);

    const filteredCustomers = useMemo(() => {
        return customers
            .filter(c => {
                if (statusFilter === 'active') return c.is_active !== false;
                if (statusFilter === 'blocked') return c.is_active === false;
                return true;
            })
            .filter(c => fuzzyMatch(c.name, searchTerm) || fuzzyMatch(c.phone, searchTerm))
            .sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    }, [customers, searchTerm, statusFilter]);

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'F2') {
                e.preventDefault();
                setIsAddModalOpen(true);
            } else if (e.key === 'F3') {
                e.preventDefault();
                if (filteredCustomers.length > 0) {
                    setIsExportModalOpen(true);
                }
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [filteredCustomers]);

    const handleExportClick = () => {
        if (filteredCustomers.length === 0) return;
        setIsExportModalOpen(true);
    };

    return (
        <main className="flex-1 overflow-hidden flex flex-col page-fade-in bg-app-bg">
            <div className="bg-primary text-white h-7 flex items-center px-4 justify-between border-b border-gray-600 shadow-md flex-shrink-0">
                <span className="text-[10px] font-black uppercase tracking-widest">Customer Master (Accounts Receivable)</span>
                <span className="text-[10px] font-black uppercase text-accent">Total: {customers.length}</span>
            </div>

            <div className="p-4 flex-1 flex gap-4 min-h-0 overflow-hidden">
                <Card className="w-1/3 flex flex-col p-0 tally-border overflow-hidden bg-white">
                    <div className="p-3 border-b border-gray-400 bg-gray-50 flex flex-col gap-2 flex-shrink-0">
                        <input type="text" placeholder="Find Customer..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="w-full border border-gray-400 p-2 text-sm font-bold focus:bg-yellow-50 outline-none shadow-sm" />
                        <div className="flex justify-between items-center">
                            <select value={statusFilter} onChange={e => setStatusFilter(e.target.value as any)} className="text-[10px] font-black uppercase text-primary border-none bg-transparent outline-none">
                                <option value="all">All Status</option>
                                <option value="active">Active</option>
                                <option value="blocked">Blocked</option>
                            </select>
                        </div>
                    </div>
                    <div className="flex-1 overflow-y-auto divide-y divide-gray-200">
                        {filteredCustomers.map(cust => (
                            <div key={cust.id} onClick={() => setSelectedCustomer(cust)} className={`p-4 cursor-pointer transition-all border-l-[8px] ${selectedCustomer?.id === cust.id ? 'bg-accent border-primary' : 'border-transparent hover:bg-gray-100'}`}>
                                <div className="flex justify-between items-center">
                                    <div className="flex-1 min-w-0 pr-2">
                                        <p className={`${uniformTextStyle} truncate`}>{cust.name}</p>
                                        <p className={`${uniformTextStyle} !text-base mt-1 ${selectedCustomer?.id === cust.id ? 'opacity-60' : 'text-gray-500'}`}>{cust.phone || 'N/A'}</p>
                                    </div>
                                    <p className={`${uniformTextStyle} whitespace-nowrap ${(getOutstandingBalance(cust) || 0) > 0 ? 'text-red-700' : 'text-emerald-700'}`}>
                                        ₹{(getOutstandingBalance(cust) || 0).toFixed(2)}
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
                    {selectedCustomer ? (
                        <div className="flex flex-col h-full overflow-hidden">
                            <div className="p-6 bg-gray-100 border-b border-gray-400 flex justify-between items-start flex-shrink-0">
                                <div className="flex-1 min-w-0">
                                    <h3 className={`${uniformTextStyle} !text-4xl text-primary truncate`}>{selectedCustomer.name}</h3>
                                    <p className="text-sm font-bold text-gray-500 uppercase mt-3">Contact: {selectedCustomer.phone || 'N/A'} | Area: {selectedCustomer.area || 'N/A'}</p>
                                </div>
                                <div className="w-full mt-5 p-4 bg-white border border-gray-300 rounded">
                                    <p className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-500 mb-3">Address Details</p>
                                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
                                        {addressFields.map(({ label, key }) => (
                                            <div key={key} className="min-w-0">
                                                <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">{label}</p>
                                                <p className={`${uniformTextStyle} !text-base text-gray-900 break-words`}>{selectedCustomer[key] || '—'}</p>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                                <div className="flex gap-2 ml-4">
                                    <button onClick={() => setIsPrintModalOpen(true)} className="px-4 py-2 tally-border bg-white font-black text-[10px] uppercase flex items-center gap-2 shadow-sm">
                                        Print
                                    </button>
                                    <button onClick={() => setIsPriceListModalOpen(true)} className="px-4 py-2 tally-border bg-white font-black text-[10px] uppercase shadow-sm">Price List</button>
                                    <button onClick={() => setIsEditModalOpen(true)} className="px-4 py-2 tally-border bg-white font-black text-[10px] uppercase shadow-sm">Alter</button>
                                </div>
                            </div>
                            
                            <div className="flex-1 overflow-auto">
                                <table className="min-w-full border-collapse">
                                    <thead className="bg-gray-50 sticky top-0 border-b border-gray-400 z-10">
                                        <tr className={`${uniformTextStyle} text-gray-600`}>
                                            <th className="p-4 border-r border-gray-400 text-left">Date</th>
                                            <th className="p-4 border-r border-gray-400 text-left">Description</th>
                                            <th className="p-4 border-r border-gray-400 text-right">Debit (+)</th>
                                            <th className="p-4 border-r border-gray-400 text-right">Credit (-)</th>
                                            <th className="p-4 text-right">Balance</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-100 tally-font-data-mono">
                                        {(selectedCustomer.ledger || []).map(item => (
                                            <tr key={item.id} className="hover:bg-gray-50 transition-colors">
                                                <td className={`${uniformTextStyle} p-4 border-r border-gray-100`}>{new Date(item.date).toLocaleDateString('en-IN')}</td>
                                                <td className={`${uniformTextStyle} p-4 border-r border-gray-100 text-gray-700`}>{item.description}</td>
                                                <td className={`${uniformTextStyle} p-4 border-r border-gray-100 text-red-700`}>{(item.debit || 0) > 0 ? (item.debit || 0).toFixed(2) : ''}</td>
                                                <td className={`${uniformTextStyle} p-4 border-r border-gray-200 text-emerald-700`}>{(item.credit || 0) > 0 ? (item.credit || 0).toFixed(2) : ''}</td>
                                                <td className={`${uniformTextStyle} p-4 text-right ${(item.balance || 0) > 0 ? 'text-red-700' : 'text-emerald-700'} bg-slate-50/30`}>₹{(item.balance || 0).toFixed(2)}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    ) : (
                        <div className="h-full flex items-center justify-center text-gray-300">
                            <p className="text-xl font-black uppercase tracking-[0.2em]">Select Customer Ledger</p>
                        </div>
                    )}
                </Card>
            </div>
            
            {isAddModalOpen && (
                <AddCustomerModal 
                    isOpen={isAddModalOpen} 
                    onClose={() => setIsAddModalOpen(false)} 
                    onAdd={onAddCustomer} 
                    defaultControlGlId={defaultCustomerControlGlId}
                    teamMembers={teamMembers}
                    organizationId={currentUser?.organization_id || ''} 
                />
            )}

            {selectedCustomer && (
                <>
                    <EditCustomerModal 
                        isOpen={isEditModalOpen} 
                        onClose={() => setIsEditModalOpen(false)} 
                        onSave={onUpdateCustomer} 
                        customer={selectedCustomer} 
                        config={config}
                        teamMembers={teamMembers}
                        defaultControlGlId={defaultCustomerControlGlId}
                    />
                    <PrintCustomerLedgerModal 
                        isOpen={isPrintModalOpen}
                        onClose={() => setIsPrintModalOpen(false)}
                        customer={selectedCustomer}
                        pharmacy={currentUser}
                    />
                    <PriceListManagementModal 
                        isOpen={isPriceListModalOpen}
                        onClose={() => setIsPriceListModalOpen(false)}
                        customers={customers.filter(c => c.customerType === 'retail')}
                        inventory={inventory}
                        priceListEntries={[]} 
                        onSaveEntries={async (entries) => {
                            for (const entry of entries) {
                                await saveCustomerPriceList(entry, currentUser!);
                            }
                            alert("Price list entries saved/updated.");
                        }}
                        onImportClick={() => {}}
                        currentUser={currentUser}
                    />
                </>
            )}

            {isExportModalOpen && (
                <ExportCustomersModal
                    isOpen={isExportModalOpen}
                    onClose={() => setIsExportModalOpen(false)}
                    data={filteredCustomers}
                    pharmacyName={currentUser?.pharmacy_name || 'MDXERA ERP'}
                />
            )}
        </main>
    );
};

export default CustomersPage;
