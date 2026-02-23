import React, { useState, useEffect, useRef, useCallback, useMemo, useImperativeHandle, forwardRef } from 'react';
import Card from '../components/Card';
import AddMedicineModal from '../components/AddMedicineModal';
import { AddDistributorModal } from '../components/AddDistributorModal';
import { extractPurchaseDetailsFromBill } from '../services/geminiService';
import type { Purchase, InventoryItem, Distributor, PurchaseItem, ModuleConfig, RegisteredPharmacy, PurchaseOrder, PurchaseOrderItem, DistributorProductMap, Medicine, AppConfigurations, SupplierProductMap, Supplier, FileInput } from '../types';
import { handleEnterToNextField } from '../utils/navigation';
import WebcamCaptureModal from '../components/WebcamCaptureModal';
import MobileSyncModal from '../components/MobileSyncModal';
import LinkToMasterModal from '../components/LinkToMasterModal';
import { fuzzyMatch } from '../utils/search';
import { fetchSupplierProductMaps, generateUUID, saveData } from '../services/storageService';
import { parseNumber, normalizeImportDate, getOutstandingBalance } from '../utils/helpers';
import SupplierLedgerModal from '../components/SupplierLedgerModal';
import { generateNewInvoiceId } from '../utils/invoice';
import { parseNetworkAndApiError } from '../utils/error';

const UploadIcon = (props: React.SVGProps<SVGSVGElement>) => <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>;
const CameraIcon = (props: React.SVGProps<SVGSVGElement>) => <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}><path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z" /><circle cx="12" cy="13" r="4" /></svg>;
const SmartphoneIcon = (props: React.SVGProps<SVGSVGElement>) => <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}><rect x="5" y="2" width="14" height="20" rx="2" ry="2" /><line x1="12" ry="18" x2="12.01" y2="18" /></svg>;

const Spinner = () => (
    <svg className="animate-spin h-4 w-4 text-current" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
    </svg>
);

// Fix: Added missing createBlankItem helper function to initialize empty purchase items
const createBlankItem = (): PurchaseItem => ({
    id: crypto.randomUUID(),
    name: '',
    brand: '',
    category: 'General',
    batch: '',
    expiry: '',
    quantity: 0,
    looseQuantity: 0,
    freeQuantity: 0,
    purchasePrice: 0,
    mrp: 0,
    gstPercent: 5,
    hsnCode: '',
    discountPercent: 0,
    schemeDiscountPercent: 0,
    schemeDiscountAmount: 0,
    matchStatus: 'pending'
});

interface PurchaseFormProps {
    onAddPurchase: (purchase: any, supplierGst: string, nextCounter?: number) => Promise<void>;
    onUpdatePurchase: (purchase: Purchase, supplierGst?: string) => Promise<void>;
    inventory: InventoryItem[];
    distributors: Distributor[];
    medicines?: Medicine[];
    mappings: DistributorProductMap[];
    purchases: Purchase[];
    sourcePO?: PurchaseOrder | null;
    purchaseToEdit: Purchase | null;
    draftItems: PurchaseOrderItem[] | null;
    draftSupplier?: string;
    linkedChallans?: string[];
    onClearDraft: () => void;
    currentUser: RegisteredPharmacy | null;
    onAddInventoryItem?: (item: Omit<InventoryItem, 'id'>) => Promise<InventoryItem>;
    onAddMedicineMaster: (med: Omit<Medicine, 'id'>) => Promise<Medicine>;
    onAddDistributor: (data: Omit<Distributor, 'id' | 'ledger' | 'organization_id'>, balance: number, date: string) => Promise<Distributor>;
    onAddInventoryItemDirectly?: (item: Omit<InventoryItem, 'id'>) => Promise<InventoryItem>;
    onSaveMapping: (map: Partial<SupplierProductMap>) => Promise<void>;
    setIsDirty: (isDirty: boolean) => void;
    addNotification: (message: string, type?: 'success' | 'error' | 'warning') => void;
    title: string;
    className?: string;
    configurations: AppConfigurations;
    isReadOnly?: boolean;
    isManualEntry?: boolean;
    isChallan?: boolean;
    disableAIInput?: boolean;
    mobileSyncSessionId: string | null;
    setMobileSyncSessionId: (id: string | null) => void;
    config?: ModuleConfig;
    onCancel?: () => void;
    organizationId: string;
}

const PurchaseForm = forwardRef<any, PurchaseFormProps>(({
    onAddPurchase, onUpdatePurchase, inventory, distributors, medicines = [], mappings = [], purchases, purchaseToEdit, draftItems, draftSupplier, onClearDraft, currentUser, onAddMedicineMaster, onAddDistributor, onSaveMapping, onCancel, title, className, configurations, addNotification, isReadOnly = false,
    isManualEntry = false, isChallan = false, disableAIInput = false, mobileSyncSessionId, setMobileSyncSessionId,
    organizationId,
}, ref) => {
    const isEditing = !!purchaseToEdit;
    const isFieldVisible = useCallback((fieldId: string) => configurations.modules?.purchase?.fields?.[fieldId] !== false, [configurations.modules]);

    // Standard State
    const [supplier, setSupplier] = useState('');
    const [supplierGst, setSupplierGst] = useState('');
    const [invoiceNumber, setInvoiceNumber] = useState('');
    const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
    // Fix: createBlankItem now defined
    const [items, setItems] = useState<PurchaseItem[]>([createBlankItem()]);
    const [activeRowId, setActiveRowId] = useState<string | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isUploading, setIsUploading] = useState(false);

    // Modal States
    const [isWebcamModalOpen, setIsWebcamModalOpen] = useState(false);
    const [isAddSupplierModalOpen, setIsAddSupplierModalOpen] = useState(false);
    const [isAddMedicineMasterModalOpen, setIsAddMedicineMasterModalOpen] = useState(false);
    const [isLinkModalOpen, setIsLinkModalOpen] = useState(false);
    const [isSupplierDropdownOpen, setIsSupplierDropdownOpen] = useState(false);
    const [selectedSupplierIndex, setSelectedSupplierIndex] = useState(0);
    const [isSupplierLedgerModalOpen, setIsSupplierLedgerModalOpen] = useState(false);
    const [supplierForLedger, setSupplierForLedger] = useState<Distributor | null>(null);
    const [supplierNameError, setSupplierNameError] = useState<string | null>(null);
    const [invoiceNumberError, setInvoiceNumberError] = useState<string | null>(null);

    const fileInputRef = useRef<HTMLInputElement>(null);
    const supplierNameInputRef = useRef<HTMLInputElement>(null);
    const invoiceNumberInputRef = useRef<HTMLInputElement>(null);
    const dateInputRef = useRef<HTMLInputElement>(null);
    const lastSourceRef = useRef<string | null>(null);

    const currentDistributor = useMemo(() => {
        const lowerSupplier = (supplier || '').toLowerCase().trim();
        if (!lowerSupplier) return null;
        return distributors.find(d => (d.name || '').toLowerCase().trim() === lowerSupplier) ?? null;
    }, [distributors, supplier]);

    const attemptAutoLink = useCallback((itemList: PurchaseItem[], targetDistributor: Distributor | null) => {
        if (!medicines.length) return itemList;

        return itemList.map(item => {
            if (item.inventoryItemId) return item;

            if (targetDistributor) {
                const mapping = mappings.find(m =>
                    m.supplier_id === targetDistributor.id &&
                    m.supplier_product_name.toLowerCase().trim() === item.name.toLowerCase().trim()
                );
                if (mapping) {
                    const foundMed = medicines.find(m => m.id === mapping.master_medicine_id);
                    if (foundMed) {
                        return {
                            ...item,
                            inventoryItemId: foundMed.id,
                            matchStatus: 'matched' as const,
                            name: foundMed.name,
                            hsnCode: foundMed.hsnCode || item.hsnCode,
                            gstPercent: foundMed.gstRate || item.gstPercent,
                            brand: foundMed.brand || item.brand,
                            mrp: Number(foundMed.mrp || item.mrp)
                        };
                    }
                }
            }

            const directMatch = medicines.find(m => m.name.toLowerCase().trim() === item.name.toLowerCase().trim());
            if (directMatch) {
                return {
                    ...item,
                    inventoryItemId: directMatch.id,
                    matchStatus: 'matched' as const,
                    hsnCode: directMatch.hsnCode || item.hsnCode,
                    gstPercent: directMatch.gstRate || item.gstPercent,
                    brand: directMatch.brand || item.brand,
                    mrp: Number(directMatch.mrp || item.mrp)
                };
            }
            return item;
        });
    }, [medicines, mappings]);

    useEffect(() => {
        const sourceId = purchaseToEdit?.id || (draftItems ? 'draft' : 'new');
        if (lastSourceRef.current === sourceId && sourceId !== 'new') return;
        lastSourceRef.current = sourceId;

        if (purchaseToEdit) {
            setSupplier(purchaseToEdit.supplier || '');
            setInvoiceNumber(purchaseToEdit.invoiceNumber || '');
            setDate(purchaseToEdit.date ? purchaseToEdit.date.split('T')[0] : new Date().toISOString().split('T')[0]);

            const matchedDist = distributors.find(d => (d.name || '').toLowerCase().trim() === (purchaseToEdit.supplier || '').toLowerCase().trim());
            if (matchedDist) setSupplierGst(matchedDist.gst_number || '');
            else setSupplierGst('');

            const pItems = Array.isArray(purchaseToEdit.items) ? purchaseToEdit.items : [];
            const mappedItems = pItems.map(item => ({
                // Fix: createBlankItem now defined
                ...createBlankItem(),
                ...item,
                quantity: Number(item.quantity || 0),
                purchasePrice: Number(item.purchasePrice || 0),
                mrp: Number(item.mrp || 0),
                gstPercent: Number(item.gstPercent || 0),
                discountPercent: Number(item.discountPercent || 0),
                matchStatus: (item.inventoryItemId) ? 'matched' as const : 'pending' as const
            }));

            const linked = attemptAutoLink(mappedItems as PurchaseItem[], matchedDist || null);
            // Fix: createBlankItem now defined
            setItems(linked.length > 0 ? [...linked, createBlankItem()] : [createBlankItem()]);
        } else if (draftItems) {
            setSupplier(draftSupplier || '');
            const matchedDist = distributors.find(d => (d.name || '').toLowerCase().trim() === (draftSupplier || '').toLowerCase().trim());
            const newItems = Array.isArray(draftItems) ? draftItems.map(item => ({
                // Fix: createBlankItem now defined
                ...createBlankItem(), ...item, quantity: item.quantity, freeQuantity: item.freeQuantity || 0, purchasePrice: item.purchasePrice, matchStatus: 'pending' as const
            })) : [];
            const linked = attemptAutoLink(newItems as PurchaseItem[], matchedDist || null);
            // Fix: createBlankItem now defined
            setItems([...linked, createBlankItem()]);
        } else {
            // Fix: createBlankItem now defined
            setSupplier(''); setSupplierGst(''); setInvoiceNumber(''); setDate(new Date().toISOString().split('T')[0]); setItems([createBlankItem()]);
        }
    }, [purchaseToEdit, draftItems, distributors, draftSupplier, attemptAutoLink]);

    const calculatedTotals = useMemo(() => {
        let subtotal = 0;
        let totalGst = 0;
        let totalItemDiscount = 0;
        let totalItemSchemeDiscount = 0;

        const validItems = items.filter(p => (p.name || '').trim() !== '');
        const itemsWithCalculations = validItems.map(p => {
            const gross = (p.purchasePrice || 0) * (p.quantity || 0);
            const tradeDisc = gross * ((p.discountPercent || 0) / 100);
            const afterTrade = gross - tradeDisc;
            const schemeDisc = (p.schemeDiscountAmount || 0);
            const taxable = afterTrade - schemeDisc;
            const gst = taxable * ((p.gstPercent || 0) / 100);
            const total = taxable + gst;

            subtotal += taxable;
            totalGst += gst;
            totalItemDiscount += tradeDisc;
            totalItemSchemeDiscount += schemeDisc;

            return {
                ...p,
                taxableValue: taxable,
                gstAmount: gst,
                itemGrossValue: gross,
                itemTradeDiscount: tradeDisc,
                itemSchemeDiscount: schemeDisc,
                lineTotal: total
            };
        });

        return {
            itemsWithCalculations,
            subtotal,
            totalGst,
            totalAmount: subtotal + totalGst,
            totalItemDiscount,
            totalItemSchemeDiscount
        };
    }, [items]);

    const handleSubmit = async () => {
        if (isSubmitting) return;
        if (!supplier.trim()) { setSupplierNameError("Supplier name is required."); return; }
        if (!invoiceNumber.trim()) { setInvoiceNumberError("Invoice number is required."); return; }
        const activeItems = items.filter(p => (p.name || '').trim() !== '');
        if (activeItems.length === 0) { addNotification("At least one item is required.", "error"); return; }

        setIsSubmitting(true);
        try {
            let purchaseSerialId = purchaseToEdit?.purchaseSerialId;
            let nextExternalNumber;

            if (!purchaseToEdit) {
                const { id: generatedSerialId, nextExternalNumber: nextNum } = generateNewInvoiceId(configurations.purchaseConfig, 'purchase-bill');
                purchaseSerialId = generatedSerialId;
                nextExternalNumber = nextNum;
            }

            const payload = {
                purchaseSerialId: purchaseSerialId!,
                supplier,
                invoiceNumber: invoiceNumber.trim(),
                date,
                items: calculatedTotals.itemsWithCalculations,
                subtotal: calculatedTotals.subtotal,
                totalGst: calculatedTotals.totalGst,
                totalAmount: calculatedTotals.totalAmount,
                totalItemDiscount: calculatedTotals.totalItemDiscount,
                totalItemSchemeDiscount: calculatedTotals.totalItemSchemeDiscount,
                status: 'completed' as const,
                organization_id: organizationId,
                roundOff: 0,
                schemeDiscount: 0
            };

            if (purchaseToEdit) {
                await onUpdatePurchase({ ...purchaseToEdit, ...payload } as any, supplierGst);
            } else {
                await onAddPurchase(payload, supplierGst, nextExternalNumber);
            }
            onClearDraft(); if (onCancel) onCancel();
        } catch (e: any) {
            addNotification(`Error: ${parseNetworkAndApiError(e)}`, "error");
        } finally { setIsSubmitting(false); }
    };

    useImperativeHandle(ref, () => ({
        handleSubmit,
        items
    }));

    const handleUpdateItem = (id: string, field: keyof PurchaseItem, value: any) => {
        if (isReadOnly || !supplier.trim()) return;
        setItems(prev => {
            const index = prev.findIndex(p => p.id === id); if (index === -1) return prev;
            let updatedItem = { ...prev[index], [field]: value };
            if (field === 'name') { updatedItem.matchStatus = 'pending'; updatedItem.inventoryItemId = undefined; }
            if (['quantity', 'freeQuantity', 'purchasePrice', 'mrp', 'discountPercent', 'schemeDiscountPercent'].includes(field)) { (updatedItem as any)[field] = value === '' ? 0 : (parseFloat(value) || 0); }
            const updated = prev.map(p => p.id === id ? updatedItem : p);
            // Fix: createBlankItem now defined
            if (field === 'name' && (value || '').trim() !== '' && index === prev.length - 1) return [...updated, createBlankItem()];
            return updated;
        });
    };

    const processAiExtraction = useCallback(async (fileInputs: FileInput[]) => {
        if (!fileInputs || fileInputs.length === 0) return;

        setIsUploading(true);
        try {
            const bill = await extractPurchaseDetailsFromBill(fileInputs, currentUser?.pharmacy_name || '');
            if (bill.error) {
                addNotification(bill.error, 'error');
                return;
            }

            if (bill.supplier) setSupplier(bill.supplier);
            if (bill.invoiceNumber) setInvoiceNumber(bill.invoiceNumber);
            if (bill.date) setDate(normalizeImportDate(bill.date) || date);
            if (bill.items && bill.items.length > 0) {
                const newItems = bill.items.map(item => ({
                    ...createBlankItem(),
                    ...item,
                    quantity: parseNumber(item.quantity),
                    purchasePrice: parseNumber(item.purchasePrice),
                    mrp: parseNumber(item.mrp),
                    gstPercent: parseNumber(item.gstPercent) || 5,
                    discountPercent: parseNumber(item.discountPercent),
                    matchStatus: 'pending' as const
                }));
                const linked = attemptAutoLink(newItems as PurchaseItem[], currentDistributor);
                setItems([...linked, createBlankItem()]);
            }
            addNotification("AI Extracted bill details successfully.", "success");
        } catch (err: any) {
            addNotification(`AI Extraction failed: ${parseNetworkAndApiError(err)}`, "error");
        } finally {
            setIsUploading(false);
        }
    }, [addNotification, attemptAutoLink, currentDistributor, currentUser?.pharmacy_name, date]);

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = e.target.files;
        if (!files || files.length === 0) return;

        const fileInputs: FileInput[] = [];
        for (let i = 0; i < files.length; i++) {
            const base64 = await new Promise<string>((resolve) => {
                const reader = new FileReader();
                reader.onloadend = () => resolve((reader.result as string).split(',')[1]);
                reader.readAsDataURL(files[i]);
            });
            fileInputs.push({ mimeType: files[i].type || 'image/jpeg', data: base64 });
        }

        await processAiExtraction(fileInputs);
        if (fileInputRef.current) fileInputRef.current.value = '';
    };

    const handleWebcamCapture = async (data: string, mimeType: string) => {
        await processAiExtraction([{ data, mimeType }]);
    };

    const handleSupplierSelect = (d: Distributor) => {
        setSupplier(d.name);
        setSupplierGst(d.gst_number || '');
        setIsSupplierDropdownOpen(false);
        setSelectedSupplierIndex(0);
        setSupplierNameError(null);
        invoiceNumberInputRef.current?.focus();
    };

    const handleSupplierKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            const filtered = distributors.filter(d => fuzzyMatch(d.name, supplier)).slice(0, 10);
            setSelectedSupplierIndex(prev => (prev + 1) % Math.max(1, filtered.length));
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            const filtered = distributors.filter(d => fuzzyMatch(d.name, supplier)).slice(0, 10);
            setSelectedSupplierIndex(prev => (prev - 1 + filtered.length) % Math.max(1, filtered.length));
        } else if (e.key === 'Enter') {
            const filtered = distributors.filter(d => fuzzyMatch(d.name, supplier)).slice(0, 10);
            if (filtered[selectedSupplierIndex]) {
                handleSupplierSelect(filtered[selectedSupplierIndex]);
            }
        } else if (e.key === 'Escape') {
            setIsSupplierDropdownOpen(false);
        }
    };

    return (
        <div className={`flex flex-col h-full bg-app-bg overflow-hidden relative ${className || ''}`} onKeyDown={handleEnterToNextField}>
            <div className="bg-primary text-white h-7 flex items-center px-4 justify-between border-b border-gray-600 shadow-md flex-shrink-0">
                <div className="flex items-center gap-3">
                    <span className="text-[10px] font-black uppercase tracking-widest">{isChallan ? 'Delivery Challan Entry' : 'Purchase Voucher Creation'}</span>
                </div>
                <span className="text-[10px] font-black uppercase text-accent">No. {isEditing ? purchaseToEdit?.purchaseSerialId : 'New'}</span>
            </div>
            <div className="p-4 flex-1 flex flex-col gap-4 overflow-hidden">
                <div className="p-3 bg-white dark:bg-card-bg border border-app-border rounded-none grid grid-cols-1 md:grid-cols-4 gap-4 items-end flex-shrink-0">
                    <div className="md:col-span-2 relative">
                        <label className="block text-[10px] font-black uppercase text-gray-500 mb-1 ml-1">Particulars (Supplier Name)</label>
                        <input
                            ref={supplierNameInputRef}
                            type="text"
                            value={supplier}
                            autoComplete="off"
                            onChange={e => { setSupplier(e.target.value); setIsSupplierDropdownOpen(true); }}
                            onKeyDown={handleSupplierKeyDown}
                            className={`w-full border p-2 text-sm font-bold uppercase outline-none ${supplierNameError ? 'border-red-500' : 'border-gray-400 focus:border-primary'}`}
                            placeholder="Type to search Ledger..."
                        />
                        {isSupplierDropdownOpen && supplier.length > 0 && (
                            <div className="absolute top-full left-0 w-full bg-white border border-primary shadow-2xl z-[200] overflow-hidden rounded-none">
                                {distributors.filter(d => fuzzyMatch(d.name, supplier)).slice(0, 10).map((d, sIdx) => (
                                    <div
                                        key={d.id}
                                        onClick={() => handleSupplierSelect(d)}
                                        onMouseEnter={() => setSelectedSupplierIndex(sIdx)}
                                        className={`p-3 cursor-pointer flex justify-between items-center border-b border-gray-100 ${sIdx === selectedSupplierIndex ? 'bg-primary text-white' : 'hover:bg-gray-50'}`}
                                    >
                                        <span className="text-xs font-bold uppercase">{d.name}</span>
                                        <span className={`text-[9px] font-black ${sIdx === selectedSupplierIndex ? 'text-white' : 'text-primary opacity-50'}`}>Balance: ₹{(getOutstandingBalance(d) || 0).toFixed(2)}</span>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                    <div>
                        <label className="text-[10px] font-bold text-gray-500 uppercase block mb-1">Invoice #</label>
                        <input
                            ref={invoiceNumberInputRef}
                            type="text"
                            value={invoiceNumber}
                            onChange={e => setInvoiceNumber(e.target.value)}
                            className={`w-full border p-2 text-sm font-bold outline-none ${invoiceNumberError ? 'border-red-500' : 'border-gray-400 focus:border-primary'}`}
                        />
                    </div>
                    <div>
                        <label className="block text-[10px] font-bold text-gray-500 uppercase block mb-1">Date</label>
                        <input
                            ref={dateInputRef}
                            type="date"
                            value={date}
                            onChange={(e) => setDate(e.target.value)}
                            className="w-full border border-gray-400 p-2 text-sm font-bold outline-none"
                        />
                    </div>
                </div>

                {!isEditing && !disableAIInput && !isManualEntry && (
                    <div className="flex space-x-2 flex-shrink-0 px-2">
                        <button onClick={() => setIsWebcamModalOpen(true)} className="px-3 py-1.5 text-[10px] font-black uppercase bg-white text-primary border border-primary flex items-center gap-2 hover:bg-primary/5 transition-colors"><CameraIcon /> Webcam Scan</button>
                        <button onClick={() => setMobileSyncSessionId(generateUUID())} className="px-3 py-1.5 text-[10px] font-black uppercase bg-white text-primary border border-primary flex items-center gap-2 hover:bg-primary/5 transition-colors"><SmartphoneIcon /> Mobile Sync</button>
                        <button onClick={() => fileInputRef.current?.click()} className="px-3 py-1.5 text-[10px] font-black uppercase bg-white text-primary border border-primary flex items-center gap-2 hover:bg-primary/5 transition-colors"><UploadIcon /> {isUploading ? <Spinner /> : 'Import Document'}</button>
                        <input type="file" ref={fileInputRef} onChange={handleFileUpload} className="hidden" accept=".csv,image/*,application/pdf" />
                    </div>
                )}

                <Card className="flex-1 flex flex-col p-0 tally-border !rounded-none overflow-hidden shadow-inner bg-white dark:bg-zinc-800">
                    <div className="flex-1 overflow-auto">
                        <table className="min-w-full border-collapse text-sm">
                            <thead className="sticky top-0 bg-gray-100 dark:bg-zinc-900 border-b border-gray-400">
                                <tr className="text-[10px] font-black uppercase text-gray-600">
                                    <th className="p-1 border-r border-gray-400 text-left w-8">Sl.</th>
                                    <th className="p-1 border-r border-gray-400 text-left min-w-[200px]">Name of Item</th>
                                    <th className="p-1 border-r border-gray-400 text-left w-20">MFR</th>
                                    <th className="p-1 border-r border-gray-400 text-center w-16">Pack</th>
                                    <th className="p-1 border-r border-gray-400 text-center w-20">Batch</th>
                                    <th className="p-1 border-r border-gray-400 text-center w-16">Exp.</th>
                                    <th className="p-1 border-r border-gray-400 text-right w-24">MRP</th>
                                    <th className="p-1 border-r border-gray-400 text-center w-16">Qty</th>
                                    <th className="p-1 border-r border-gray-400 text-center w-16">Free</th>
                                    <th className="p-1 border-r border-gray-400 text-right w-24">Rate</th>
                                    {isFieldVisible('colDisc') && <th className="p-1 border-r border-gray-400 text-center w-16">Disc%</th>}
                                    <th className="p-1 border-r border-gray-400 text-center w-16">Sch%</th>
                                    <th className="p-1 text-right w-32">Amount</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-200">
                                {items.map((p, idx) => (
                                    <tr key={p.id} className="hover:bg-gray-50 group">
                                        <td className="p-1 border-r border-gray-200 font-bold text-gray-400 text-center">{idx + 1}</td>
                                        <td className="p-1 border-r border-gray-200 font-bold text-primary uppercase relative">
                                            <input type="text" id={`name-${p.id}`} value={p.name} autoComplete="off" onChange={e => handleUpdateItem(p.id, 'name', e.target.value)} onFocus={() => setActiveRowId(p.id)} className="w-full bg-transparent outline-none focus:bg-yellow-50" />
                                        </td>
                                        <td className="p-1 border-r border-gray-400"><input type="text" id={`mfr-${p.id}`} value={p.brand} onChange={e => handleUpdateItem(p.id, 'brand', e.target.value)} className="w-full bg-transparent text-[10px] outline-none" /></td>
                                        <td className="p-1 border-r border-gray-200 text-center"><input type="text" value={p.packType} onChange={e => handleUpdateItem(p.id, 'packType', e.target.value)} className="w-full text-center bg-transparent text-[10px] outline-none" /></td>
                                        <td className="p-1 border-r border-gray-200 text-center font-mono text-[10px] uppercase"><input type="text" id={`batch-${p.id}`} value={p.batch} onChange={e => handleUpdateItem(p.id, 'batch', e.target.value.toUpperCase())} className="w-full text-center bg-transparent outline-none" /></td>
                                        <td className="p-1 border-r border-gray-200 text-center text-[10px]"><input type="text" id={`expiry-${p.id}`} value={p.expiry} onChange={e => handleUpdateItem(p.id, 'expiry', e.target.value)} className="w-full text-center bg-transparent outline-none" /></td>
                                        <td className="p-1 border-r border-gray-400 text-right text-[11px] font-mono whitespace-nowrap"><input type="number" id={`mrp-${p.id}`} value={p.mrp || ''} onChange={e => handleUpdateItem(p.id, 'mrp', e.target.value)} className="w-full text-right bg-transparent outline-none no-spinner" /></td>
                                        <td className="p-1 border-r border-gray-400 text-center font-black"><input type="number" id={`qty-${p.id}`} value={p.quantity || ''} onChange={e => handleUpdateItem(p.id, 'quantity', e.target.value)} className="w-full text-center bg-transparent no-spinner outline-none font-mono" /></td>
                                        <td className="p-1 border-r border-gray-400 text-center text-emerald-600 font-bold"><input type="number" value={p.freeQuantity || ''} onChange={e => handleUpdateItem(p.id, 'freeQuantity', e.target.value)} className="w-full text-center bg-transparent no-spinner outline-none font-mono" /></td>
                                        <td className="p-1 border-r border-gray-400 text-right font-bold text-blue-900"><input type="number" id={`rate-${p.id}`} value={p.purchasePrice || ''} onChange={e => handleUpdateItem(p.id, 'purchasePrice', e.target.value)} className="w-full text-right bg-transparent outline-none no-spinner font-mono" /></td>
                                        {isFieldVisible('colDisc') && <td className="p-1 border-r border-gray-400 text-center text-red-600"><input type="number" value={p.discountPercent || ''} onChange={e => handleUpdateItem(p.id, 'discountPercent', e.target.value)} className="w-full text-center bg-transparent no-spinner outline-none font-mono" /></td>}
                                        <td className="p-1 border-r border-gray-400 text-center text-red-600"><input type="number" value={p.schemeDiscountPercent || ''} onChange={e => handleUpdateItem(p.id, 'schemeDiscountPercent', e.target.value)} className="w-full text-center bg-transparent no-spinner outline-none font-mono" /></td>
                                        <td className="p-1 text-right font-black font-mono text-gray-950 whitespace-nowrap">₹{((p.purchasePrice || 0) * (p.quantity || 0) * (1 - (p.discountPercent || 0) / 100) * (1 - (p.schemeDiscountPercent || 0) / 100)).toFixed(2)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </Card>

                <div className="flex justify-end gap-6">
                    <div className="w-full md:w-1/3 bg-[#e5f0f0] p-4 tally-border !rounded-none shadow-md">
                        <div className="space-y-1.5 font-bold text-xs uppercase tracking-tight">
                            <div className="flex justify-between text-gray-500"><span>Subtotal</span> <span className="font-mono">₹{calculatedTotals.subtotal.toFixed(2)}</span></div>
                            <div className="flex justify-between text-blue-700"><span>Tax (GST)</span> <span className="font-mono">+₹{calculatedTotals.totalGst.toFixed(2)}</span></div>
                            <div className="border-t border-gray-400 pt-2 flex justify-between text-xl font-black text-primary"><span>TOTAL</span><span className="font-mono">₹{calculatedTotals.totalAmount.toFixed(2)}</span></div>
                        </div>
                    </div>
                </div>

                <div className="flex justify-end gap-3 pb-2">
                    <button onClick={onCancel} className="px-6 py-2 bg-white font-bold hover:bg-gray-100 text-gray-700 tally-border uppercase tracking-widest text-[10px] shadow-sm">Discard</button>
                    <button onClick={handleSubmit} disabled={isSubmitting} className="px-10 py-2 tally-button-primary shadow-lg uppercase text-[10px] font-black tracking-widest">
                        {isSubmitting ? <Spinner /> : (isEditing ? 'Update Entry' : 'Accept (Enter)')}
                    </button>
                </div>
            </div>

            {isWebcamModalOpen && <WebcamCaptureModal isOpen={isWebcamModalOpen} onClose={() => setIsWebcamModalOpen(false)} onCapture={handleWebcamCapture} />}
            {isAddSupplierModalOpen && <AddDistributorModal isOpen={isAddSupplierModalOpen} onClose={() => setIsAddSupplierModalOpen(false)} onAdd={onAddDistributor} organizationId={organizationId} />}
            {isAddMedicineMasterModalOpen && <AddMedicineModal isOpen={isAddMedicineMasterModalOpen} onClose={() => setIsAddMedicineMasterModalOpen(false)} onAddMedicine={onAddMedicineMaster} organizationId={organizationId} />}
            {isLinkModalOpen && currentDistributor && (
                <LinkToMasterModal
                    isOpen={isLinkModalOpen} onClose={() => setIsLinkModalOpen(false)} supplier={currentDistributor as any} medicines={medicines} mappings={mappings}
                    onLink={onSaveMapping} scannedItems={items} onFinalize={(reconciled) => setItems(reconciled)} onAddMedicineMaster={onAddMedicineMaster} organizationId={organizationId}
                />
            )}
            {isSupplierLedgerModalOpen && supplierForLedger && <SupplierLedgerModal isOpen={isSupplierLedgerModalOpen} onClose={() => setIsSupplierLedgerModalOpen(false)} supplier={supplierForLedger} />}
            <MobileSyncModal isOpen={!!mobileSyncSessionId} onClose={() => setMobileSyncSessionId(null)} sessionId={mobileSyncSessionId} orgId={organizationId} />
        </div>
    );
});

export default PurchaseForm;
