
import React, { useState, useMemo, useEffect, useRef } from 'react';
import Card from '../components/Card';
import Modal from '../components/Modal';
import type { Distributor, InventoryItem, PurchaseOrderItem, PurchaseOrder } from '../types';
import { PurchaseOrderStatus } from '../types';
import ConfirmModal from '../components/ConfirmModal';
import SharePurchaseOrderModal from '../components/SharePurchaseOrderModal';

interface PurchaseOrdersProps {
  distributors: Distributor[];
  inventory: InventoryItem[];
  purchaseOrders: PurchaseOrder[];
  onAddPurchaseOrder: (po: Omit<PurchaseOrder, 'id' | 'serialId'>) => void;
  onUpdatePurchaseOrder: (po: PurchaseOrder) => void;
  onCreatePurchaseEntry: (po: PurchaseOrder) => void;
  onPrintPurchaseOrder: (po: PurchaseOrder) => void;
  onCancelPurchaseOrder: (poId: string) => void;
  draftItems: PurchaseOrderItem[] | null;
  onClearDraft: () => void;
  initialStatusFilter?: PurchaseOrderStatus | 'all';
  setIsDirty: (isDirty: boolean) => void;
  currentUserPharmacyName: string; 
  currentUserEmail: string; 
  currentUserOrgId?: string;
}

const PurchaseOrdersPage = React.forwardRef<any, PurchaseOrdersProps>(({ 
    distributors, 
    inventory, 
    purchaseOrders, 
    onAddPurchaseOrder, 
    onUpdatePurchaseOrder, 
    onCreatePurchaseEntry, 
    onPrintPurchaseOrder, 
    onCancelPurchaseOrder, 
    draftItems, 
    onClearDraft, 
    initialStatusFilter = 'all', 
    setIsDirty, 
    currentUserPharmacyName, 
    currentUserEmail,
    currentUserOrgId
}, ref) => {
    const [view, setView] = useState<'list' | 'create'>('list');

    // List State
    const [statusFilter, setStatusFilter] = useState<PurchaseOrderStatus | 'all'>(initialStatusFilter);
    const [selectedPO, setSelectedPO] = useState<PurchaseOrder | null>(null);
    const [isShareModalOpen, setIsShareModalOpen] = useState(false);

    // Create Form State
    const [selectedDistributorId, setSelectedDistributorId] = useState('');
    const [orderDate, setOrderDate] = useState(new Date().toISOString().split('T')[0]);
    const [items, setItems] = useState<PurchaseOrderItem[]>([]);
    const [remarks, setRemarks] = useState('');
    const [searchTerm, setSearchTerm] = useState('');
    const [isSaving, setIsSaving] = useState(false);
    const [isSearchDropdownOpen, setIsSearchDropdownOpen] = useState(false);
    const [selectedSearchIndex, setSelectedSearchIndex] = useState(0);

    React.useImperativeHandle(ref, () => ({
        isDirty: view === 'create' && (items.length > 0 || selectedDistributorId !== '' || remarks !== '')
    }));

    const supplierSelectRef = useRef<HTMLSelectElement>(null);
    const itemSearchRef = useRef<HTMLInputElement>(null);

    const filteredPOList = useMemo(() => {
        let list = [...purchaseOrders];
        if (statusFilter !== 'all') {
            list = list.filter(po => po.status === statusFilter);
        }
        return list.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    }, [purchaseOrders, statusFilter]);

    useEffect(() => {
        if (draftItems && draftItems.length > 0) {
            setItems(draftItems.map(item => ({ ...item, id: item.id || crypto.randomUUID() })));
            setView('create');
        }
    }, [draftItems]);

    useEffect(() => {
        if (view === 'create') {
            setTimeout(() => supplierSelectRef.current?.focus(), 150);
        }
    }, [view]);

    const handleAddItem = (invItem: InventoryItem) => {
        const existing = items.find(i => i.id === invItem.id);
        if (existing) {
            setItems(prev => prev.map(i => i.id === invItem.id ? { ...i, quantity: i.quantity + 1 } : i));
        } else {
            setItems(prev => [...prev, {
                id: invItem.id,
                name: invItem.name,
                brand: invItem.brand,
                quantity: 1,
                freeQuantity: 0,
                purchasePrice: invItem.purchasePrice,
                packType: invItem.packType,
                mrp: invItem.mrp,
                gstPercent: invItem.gstPercent,
                hsnCode: invItem.hsnCode,
                manufacturer: invItem.manufacturer
            }]);
        }
        setSearchTerm('');
        setIsSearchDropdownOpen(false);
        itemSearchRef.current?.focus();
    };

    const handleUpdateItem = (id: string, field: keyof PurchaseOrderItem, value: any) => {
        setItems(prev => prev.map(i => i.id === id ? { ...i, [field]: value } : i));
    };

    const handleRemoveItem = (id: string) => {
        setItems(prev => prev.filter(i => i.id !== id));
    };

    const totalAmount = useMemo(() => {
        return items.reduce((sum, item) => sum + (item.purchasePrice * item.quantity), 0);
    }, [items]);

    const handleSavePO = async () => {
        if (!selectedDistributorId) {
            alert("Please select a distributor.");
            return;
        }
        if (items.length === 0) {
            alert("Please add at least one item.");
            return;
        }

        setIsSaving(true);
        const distributor = distributors.find(d => d.id === selectedDistributorId);
        
        const newPO: Omit<PurchaseOrder, 'id' | 'serialId'> = {
            organization_id: currentUserOrgId || '',
            date: new Date(orderDate).toISOString(),
            distributorId: selectedDistributorId,
            distributorName: distributor?.name || 'Unknown',
            senderEmail: currentUserEmail,
            items: items,
            status: PurchaseOrderStatus.ORDERED,
            totalItems: items.length,
            totalAmount: totalAmount,
            remarks: remarks
        };

        try {
            await onAddPurchaseOrder(newPO);
            setIsDirty(false);
            setItems([]);
            setRemarks('');
            setSelectedDistributorId('');
            setView('list');
            onClearDraft();
        } catch (e) {
            console.error(e);
            alert("Failed to save PO.");
        } finally {
            setIsSaving(false);
        }
    };

    const searchResults = useMemo(() => {
        if (!searchTerm) return [];
        const lower = searchTerm.toLowerCase();
        return inventory.filter(i => 
            i.name.toLowerCase().includes(lower) || 
            i.brand.toLowerCase().includes(lower) ||
            (i.barcode && i.barcode.includes(lower))
        ).slice(0, 10);
    }, [searchTerm, inventory]);

    const handleSearchKeyDown = (e: React.KeyboardEvent) => {
        if (searchResults.length === 0) return;
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            setSelectedSearchIndex(prev => (prev + 1) % searchResults.length);
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setSelectedSearchIndex(prev => (prev - 1 + searchResults.length) % searchResults.length);
        } else if (e.key === 'Enter') {
            e.preventDefault();
            if (searchResults[selectedSearchIndex]) {
                handleAddItem(searchResults[selectedSearchIndex]);
            }
        }
    };

    const getStatusClass = (status: PurchaseOrderStatus) => {
        switch (status) {
            case PurchaseOrderStatus.ORDERED: return 'bg-blue-100 text-blue-800 border-blue-200';
            case PurchaseOrderStatus.RECEIVED: return 'bg-green-100 text-green-800 border-green-200';
            case PurchaseOrderStatus.CANCELLED: return 'bg-red-100 text-red-800 border-red-200';
            default: return 'bg-gray-100 text-gray-800';
        }
    };

    return (
        <main className="flex-1 overflow-hidden flex flex-col page-fade-in bg-app-bg">
            {/* Common Header */}
            <div className="bg-primary text-white h-7 flex items-center px-4 justify-between border-b border-gray-600 shadow-md flex-shrink-0">
                <span className="text-[10px] font-black uppercase tracking-widest">
                    {view === 'create' ? 'Purchase Order Voucher Creation' : 'Purchase Order Register'}
                </span>
                <span className="text-[10px] font-black uppercase text-accent">
                    {view === 'create' ? 'No. New' : `Total Orders: ${purchaseOrders.length}`}
                </span>
            </div>

            <div className="p-4 flex-1 flex flex-col gap-4 overflow-hidden">
                {/* Common Tab Switcher */}
                <div className="flex justify-between items-center mb-2 px-2">
                    <div className="flex items-center space-x-2 bg-white dark:bg-gray-800 p-1 border border-app-border shadow-sm">
                        <button 
                            onClick={() => setView('list')}
                            className={`px-4 py-1.5 text-[10px] font-black uppercase tracking-widest transition-all ${view === 'list' ? 'bg-primary text-white shadow-md' : 'text-app-text-secondary hover:bg-hover'}`}
                        >
                            History
                        </button>
                        <button 
                            onClick={() => setView('create')}
                            className={`px-4 py-1.5 text-[10px] font-black uppercase tracking-widest transition-all ${view === 'create' ? 'bg-primary text-white shadow-md' : 'text-app-text-secondary hover:bg-hover'}`}
                        >
                            New Order
                        </button>
                    </div>
                </div>

                {view === 'create' ? (
                    <div className="flex-1 flex flex-col overflow-hidden">
                        <Card className="p-3 bg-white dark:bg-card-bg border border-app-border rounded-none grid grid-cols-1 md:grid-cols-4 gap-4 items-end flex-shrink-0">
                            <div className="md:col-span-2">
                                <label className="text-[10px] font-bold text-gray-500 uppercase block mb-1">Particulars (Supplier Name)</label>
                                <select 
                                    ref={supplierSelectRef}
                                    value={selectedDistributorId} 
                                    onChange={e => setSelectedDistributorId(e.target.value)}
                                    className="w-full p-2 border border-gray-400 rounded-none bg-input-bg font-bold text-sm focus:bg-yellow-50 outline-none uppercase"
                                >
                                    <option value="">— Select Ledger —</option>
                                    {distributors.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                                </select>
                            </div>
                            <div>
                                <label className="text-[10px] font-bold text-gray-500 uppercase block mb-1">Date</label>
                                <input 
                                    type="date" 
                                    value={orderDate} 
                                    onChange={e => setOrderDate(e.target.value)} 
                                    className="w-full border border-gray-400 p-2 text-sm font-bold outline-none" 
                                />
                            </div>
                            <div className="flex-1"></div>
                        </Card>

                        <Card className="flex-1 flex flex-col p-0 tally-border !rounded-none overflow-hidden shadow-inner bg-white dark:bg-zinc-800 mt-4">
                            <div className="flex-1 overflow-auto">
                                <table className="min-w-full border-collapse text-sm">
                                    <thead className="sticky top-0 bg-gray-100 dark:bg-zinc-900 border-b border-gray-400">
                                        <tr className="text-[10px] font-black uppercase text-gray-600">
                                            <th className="p-2 border-r border-gray-400 text-left w-10">Sl.</th>
                                            <th className="p-2 border-r border-gray-400 text-left">Particulars</th>
                                            <th className="p-2 border-r border-gray-400 text-center w-24">Quantity</th>
                                            <th className="p-2 border-r border-gray-400 text-right w-32">Estimated Rate</th>
                                            <th className="p-2 text-right w-32">Amount</th>
                                            <th className="p-2 w-10"></th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-200">
                                        {items.map((item, idx) => (
                                            <tr key={item.id} className="hover:bg-gray-50 group">
                                                <td className="p-2 border-r border-gray-200 font-bold text-gray-400 text-center">{idx + 1}</td>
                                                <td className="p-2 border-r border-gray-200">
                                                    <p className="font-bold text-primary uppercase leading-none">{item.name}</p>
                                                    <p className="text-[9px] text-gray-400 font-bold uppercase mt-1">{item.brand}</p>
                                                </td>
                                                <td className="p-2 border-r border-gray-200 text-center">
                                                    <input 
                                                        type="number" 
                                                        value={item.quantity} 
                                                        onChange={e => handleUpdateItem(item.id, 'quantity', parseInt(e.target.value) || 0)}
                                                        className="w-full bg-transparent text-center font-black no-spinner outline-none"
                                                    />
                                                </td>
                                                <td className="p-2 border-r border-gray-200 text-right font-bold">
                                                    <input 
                                                        type="number" 
                                                        value={item.purchasePrice} 
                                                        onChange={e => handleUpdateItem(item.id, 'purchasePrice', parseFloat(e.target.value) || 0)}
                                                        className="w-full bg-transparent text-right font-bold no-spinner outline-none text-blue-900"
                                                    />
                                                </td>
                                                <td className="p-2 text-right font-black text-gray-900">
                                                    ₹{(item.purchasePrice * item.quantity).toFixed(2)}
                                                </td>
                                                <td className="p-2 text-center">
                                                    <button onClick={() => handleRemoveItem(item.id)} className="text-red-300 hover:text-red-600 transition-colors">
                                                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                                                    </button>
                                                </td>
                                            </tr>
                                        ))}
                                        <tr className="bg-yellow-50/30">
                                            <td className="p-2 border-r border-gray-200 font-bold text-gray-400 text-center">{items.length + 1}</td>
                                            <td className="p-2 border-r border-gray-200 relative">
                                                <input 
                                                    ref={itemSearchRef}
                                                    type="text" 
                                                    className="w-full bg-transparent font-bold uppercase outline-none" 
                                                    placeholder="Type item name to add..." 
                                                    value={searchTerm}
                                                    onChange={e => {setSearchTerm(e.target.value); setIsSearchDropdownOpen(true);}}
                                                    onFocus={() => setIsSearchDropdownOpen(true)}
                                                    onKeyDown={handleSearchKeyDown}
                                                    autoComplete="off"
                                                />
                                                {isSearchDropdownOpen && searchTerm && searchResults.length > 0 && (
                                                    <div className="absolute top-full left-0 w-[450px] bg-white border border-gray-400 shadow-2xl z-50 overflow-hidden">
                                                        {searchResults.map((i, sIdx) => (
                                                            <div 
                                                                key={i.id} 
                                                                onClick={() => handleAddItem(i)} 
                                                                onMouseEnter={() => setSelectedSearchIndex(sIdx)}
                                                                className={`p-2 cursor-pointer flex justify-between text-xs font-bold border-b border-gray-100 uppercase transition-colors ${sIdx === selectedSearchIndex ? 'bg-primary text-white' : 'hover:bg-gray-50'}`}
                                                            >
                                                                <div className="flex flex-col">
                                                                    <span>{i.name}</span>
                                                                    <span className={`text-[9px] ${sIdx === selectedSearchIndex ? 'text-white/60' : 'text-gray-400'}`}>{i.brand}</span>
                                                                </div>
                                                                <div className="text-right">
                                                                    <span className="opacity-50">Stock: {i.stock}</span>
                                                                    <div className="text-[9px] font-black">MRP: ₹{(i.mrp || 0).toFixed(2)}</div>
                                                                </div>
                                                            </div>
                                                        ))}
                                                    </div>
                                                )}
                                            </td>
                                            <td colSpan={4}></td>
                                        </tr>
                                    </tbody>
                                </table>
                            </div>
                        </Card>

                        <div className="flex justify-between items-stretch flex-shrink-0 gap-8 min-h-[140px] mt-4">
                            <div className="flex-1 bg-white p-4 tally-border !rounded-none shadow-sm flex flex-col">
                                <label className="text-[10px] font-bold text-gray-500 uppercase block mb-1.5 ml-1">Order Narration / Remarks</label>
                                <textarea 
                                    value={remarks} 
                                    onChange={e => setRemarks(e.target.value)}
                                    rows={3}
                                    placeholder="Enter special instructions for the supplier..."
                                    className="flex-1 w-full p-2 border border-gray-400 rounded-none bg-slate-50 text-xs font-bold uppercase resize-none outline-none focus:bg-white"
                                />
                            </div>

                            <div className="w-80 bg-[#e5f0f0] p-5 tally-border !rounded-none shadow-md flex flex-col justify-center">
                                <div className="space-y-2 font-bold text-xs uppercase tracking-tight">
                                    <div className="flex justify-between text-gray-500"><span>Estimated Subtotal</span> <span>₹{totalAmount.toFixed(2)}</span></div>
                                    <div className="flex justify-between text-blue-700"><span>Tax (Estimated GST)</span> <span>+₹{(totalAmount * 0.12).toFixed(2)}</span></div>
                                    <div className="border-t border-gray-400 pt-2 flex justify-between text-xl font-black text-primary">
                                        <span>TOTAL VALUE</span>
                                        <span>₹{(totalAmount * 1.12).toFixed(2)}</span>
                                    </div>
                                </div>
                            </div>

                            <div className="flex flex-col gap-3 w-56 self-stretch justify-end">
                                <button 
                                    onClick={() => { if(confirm("Discard order draft?")) { setItems([]); setView('list'); } }} 
                                    className="w-full py-3 tally-border bg-white font-black text-[11px] hover:bg-red-50 text-red-600 transition-colors uppercase tracking-[0.2em] shadow-sm"
                                >
                                    Discard
                                </button>
                                <button 
                                    onClick={handleSavePO} 
                                    disabled={isSaving || items.length === 0} 
                                    className="w-full py-6 tally-button-primary shadow-2xl active:translate-y-1 uppercase tracking-[0.3em] text-[12px] flex items-center justify-center gap-2"
                                >
                                    {isSaving ? (
                                        <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                                    ) : 'Accept Order'}
                                </button>
                            </div>
                        </div>
                    </div>
                ) : (
                    <Card className="flex-1 p-0 border-app-border overflow-hidden shadow-md bg-white">
                        <div className="p-4 border-b border-gray-400 bg-slate-50 flex justify-between items-center">
                            <div className="flex bg-white p-1 tally-border !rounded-none">
                                {['all', PurchaseOrderStatus.ORDERED, PurchaseOrderStatus.RECEIVED, PurchaseOrderStatus.CANCELLED].map(status => (
                                    <button 
                                        key={status}
                                        onClick={() => setStatusFilter(status as any)}
                                        className={`px-4 py-1.5 text-[10px] font-black uppercase tracking-tighter transition-all ${statusFilter === status ? 'bg-primary text-white shadow-md' : 'text-gray-400 hover:bg-hover'}`}
                                    >
                                        {status}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div className="overflow-x-auto">
                            <table className="min-w-full border-collapse">
                                <thead className="bg-gray-100 border-b border-gray-400">
                                    <tr>
                                        <th className="p-3 text-left text-[10px] font-black text-gray-600 uppercase border-r border-gray-400">PO Number</th>
                                        <th className="p-3 text-left text-[10px] font-black text-gray-600 uppercase border-r border-gray-400">Date</th>
                                        <th className="p-3 text-left text-[10px] font-black text-gray-600 uppercase border-r border-gray-400">Distributor</th>
                                        <th className="p-3 text-center text-[10px] font-black text-gray-600 uppercase border-r border-gray-400">Status</th>
                                        <th className="p-3 text-right text-[10px] font-black text-gray-600 uppercase border-r border-gray-400">Amount</th>
                                        <th className="p-3 text-right text-[10px] font-black text-gray-600 uppercase">Action</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-200 text-xs font-bold">
                                    {filteredPOList.map(po => (
                                        <tr key={po.id} className="hover:bg-accent transition-colors">
                                            <td className="p-3 border-r border-gray-200 font-mono font-black text-primary uppercase">{po.serialId}</td>
                                            <td className="p-3 border-r border-gray-200">{new Date(po.date).toLocaleDateString('en-GB')}</td>
                                            <td className="p-3 border-r border-gray-200 font-black text-gray-900 uppercase">{po.distributorName}</td>
                                            <td className="p-3 border-r border-gray-200 text-center">
                                                <span className={`px-2 py-0.5 rounded text-[10px] font-black uppercase border ${getStatusClass(po.status)}`}>
                                                    {po.status}
                                                </span>
                                            </td>
                                            <td className="p-3 border-r border-gray-200 text-right font-black">₹{po.totalAmount.toLocaleString('en-IN')}</td>
                                            <td className="p-3 text-right">
                                                <div className="flex justify-end gap-2">
                                                    <button onClick={() => onPrintPurchaseOrder(po)} className="text-gray-500 font-black uppercase text-[10px] hover:underline">Print</button>
                                                    {po.status === PurchaseOrderStatus.ORDERED && (
                                                        <>
                                                            <button onClick={() => onCreatePurchaseEntry(po)} className="text-emerald-700 font-black uppercase text-[10px] hover:underline">Receive</button>
                                                            <button onClick={() => onCancelPurchaseOrder(po.id)} className="text-red-600 font-black uppercase text-[10px] hover:underline">Cancel</button>
                                                        </>
                                                    )}
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </Card>
                )}
            </div>

            {selectedPO && (
                <SharePurchaseOrderModal 
                    isOpen={isShareModalOpen}
                    onClose={() => { setIsShareModalOpen(false); setSelectedPO(null); }}
                    purchaseOrder={selectedPO}
                    distributor={distributors.find(d => d.id === selectedPO.distributorId) || null}
                    pharmacyName={currentUserPharmacyName}
                    senderEmail={currentUserEmail}
                    senderOrgId={currentUserOrgId}
                />
            )}
        </main>
    );
});

export default PurchaseOrdersPage;
