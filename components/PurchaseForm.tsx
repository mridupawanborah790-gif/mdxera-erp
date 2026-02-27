import React, { useState, useEffect, useRef, useCallback, useImperativeHandle, forwardRef, useMemo } from 'react';
import Card from './Card';
import Modal from './Modal';
import AddMedicineModal from './AddMedicineModal';
import { AddSupplierModal } from './AddSupplierModal';
import BatchSelectionModal from './BatchSelectionModal';
import { extractPurchaseDetailsFromBill } from '../services/geminiService';
import type { Purchase, InventoryItem, Supplier, PurchaseItem, ModuleConfig, RegisteredPharmacy, PurchaseOrder, PurchaseOrderItem, SupplierProductMap, Medicine, AppConfigurations, FileInput } from '../types';
import { handleEnterToNextField } from '../utils/navigation';
import WebcamCaptureModal from './WebcamCaptureModal';
import MobileSyncModal from './MobileSyncModal';
import LinkToMasterModal from './LinkToMasterModal';
import { fuzzyMatch } from '../utils/search';
import { fetchSupplierProductMaps, generateUUID, listenForSyncMessage, reserveVoucherNumber, saveData } from '../services/storageService';
import { parseNumber, normalizeImportDate, getOutstandingBalance } from '../utils/helpers';
import SupplierLedgerModal from './SupplierLedgerModal';
import SupplierSearchModal from './SupplierSearchModal';
import { generateNewInvoiceId } from '../utils/invoice';
import { parseNetworkAndApiError } from '../utils/error';
import { prepareCapturedImageForAiExtraction, prepareFilesForAiExtraction } from '../utils/aiImagePrep';

const UploadIcon = (props: React.SVGProps<SVGSVGElement>) => <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>;
const CameraIcon = (props: React.SVGProps<SVGSVGElement>) => <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}><path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z" /><circle cx="12" cy="13" r="4" /></svg>;
const SmartphoneIcon = (props: React.SVGProps<SVGSVGElement>) => <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}><rect x="5" y="2" width="14" height="20" rx="2" ry="2" /><line x1="12" ry="18" x2="12.01" y2="18" /></svg>;

const Spinner = () => (
    <svg className="animate-spin h-4 w-4 text-current" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
    </svg>
);

const uniformTextStyle = "text-2xl font-normal tracking-tight uppercase leading-tight";
const matrixRowTextStyle = "text-2xl font-normal tracking-tight uppercase leading-tight";
const EXPIRY_MM_YY_REGEX = /^(0[1-9]|1[0-2])\/\d{2}$/;
const currencyFormatter = new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
});

const formatCurrency = (value: number) => currencyFormatter.format(Number.isFinite(value) ? value : 0);

const formatSignedCurrency = (value: number, sign: '+' | '-') => {
    const normalizedValue = Math.abs(Number.isFinite(value) ? value : 0);
    return `${sign}${formatCurrency(normalizedValue)}`;
};

const formatRoundOffCurrency = (value: number) => {
    if (!Number.isFinite(value) || value === 0) return formatCurrency(0);
    return `${value > 0 ? '+' : '-'}${formatCurrency(Math.abs(value))}`;
};

const formatExpiryToMMYY = (value?: string | null): string => {
    if (!value || String(value).toUpperCase() === 'N/A') return '';
    const clean = String(value).trim();
    const slashMatch = clean.match(/^(\d{1,2})[/-](\d{2}|\d{4})$/);
    if (slashMatch) {
        const month = Number(slashMatch[1]);
        if (month < 1 || month > 12) return '';
        const yearPart = slashMatch[2].slice(-2);
        return `${String(month).padStart(2, '0')}/${yearPart}`;
    }

    const dateLike = clean.split('T')[0].match(/^(\d{4})-(\d{1,2})(?:-\d{1,2})?$/);
    if (dateLike) {
        const month = Number(dateLike[2]);
        if (month < 1 || month > 12) return '';
        return `${String(month).padStart(2, '0')}/${dateLike[1].slice(-2)}`;
    }

    return EXPIRY_MM_YY_REGEX.test(clean) ? clean : '';
};

const normalizeExpiryInput = (rawValue: string): string => {
    const cleaned = rawValue.replace(/[^\d/]/g, '');
    const digits = cleaned.replace(/\D/g, '').slice(0, 4);
    if (digits.length <= 2) return digits;
    return `${digits.slice(0, 2)}/${digits.slice(2)}`;
};

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

type MobileSyncStatus = 'pending' | 'uploading' | 'synced' | 'imported' | 'failed';

interface MobileSyncPage {
    image: string;
    mimeType: string;
    pageNumber: number;
    capturedAt?: string;
}

interface MobileSyncInvoicePayload {
    type?: 'invoice-upload';
    invoiceId?: string;
    pages?: MobileSyncPage[];
    image?: string;
    mimeType?: string;
}

const getSyncStatusLabel = (status: MobileSyncStatus) => {
    switch (status) {
        case 'pending': return 'Pending';
        case 'uploading': return 'Uploading';
        case 'synced': return 'Synced';
        case 'imported': return 'Imported';
        case 'failed': return 'Failed';
    }
};

interface PurchaseFormProps {
    onAddPurchase: (purchase: any, supplierGst: string, nextCounter?: number) => Promise<void>;
    onUpdatePurchase: (purchase: Purchase, supplierGst?: string) => Promise<void>;
    inventory: InventoryItem[];
    suppliers: Supplier[];
    medicines?: Medicine[];
    mappings: SupplierProductMap[];
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
    onAddsupplier: (data: Omit<Supplier, 'id' | 'ledger' | 'organization_id'>, balance: number, date: string) => Promise<Supplier>;
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
    onAddPurchase, onUpdatePurchase, inventory, suppliers, medicines = [], mappings = [], purchases, purchaseToEdit, draftItems, draftSupplier, onClearDraft, currentUser, onAddMedicineMaster, onAddsupplier, onSaveMapping, onCancel, title, className, configurations, addNotification, isReadOnly = false,
    isManualEntry = false, isChallan = false, disableAIInput = false, mobileSyncSessionId, setMobileSyncSessionId,
    organizationId,
}, ref) => {
    const isEditing = !!purchaseToEdit;
    const isFieldVisible = useCallback((fieldId: string) => configurations.modules?.purchase?.fields?.[fieldId] !== false, [configurations.modules]);

    // Standard State
    const [Supplier, setSupplier] = useState('');
    const [supplierGst, setSupplierGst] = useState('');
    const [invoiceNumber, setInvoiceNumber] = useState('');
    const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
    const [items, setItems] = useState<PurchaseItem[]>([createBlankItem()]);
    const [activeRowId, setActiveRowId] = useState<string | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isUploading, setIsUploading] = useState(false);

    // Matrix Props
    const [isSearchModalOpen, setIsSearchModalOpen] = useState(false);
    const [selectedSearchIndex, setSelectedSearchIndex] = useState(0);
    const [modalSearchTerm, setModalSearchTerm] = useState('');
    const [pendingBatchSelection, setPendingBatchSelection] = useState<{ item: InventoryItem; batches: InventoryItem[] } | null>(null);

    // Modal States
    const [isWebcamModalOpen, setIsWebcamModalOpen] = useState(false);
    const [isAddSupplierModalOpen, setIsAddSupplierModalOpen] = useState(false);
    const [isAddMedicineMasterModalOpen, setIsAddMedicineMasterModalOpen] = useState(false);
    const [isLinkModalOpen, setIsLinkModalOpen] = useState(false);
    const [isSupplierDropdownOpen, setIsSupplierDropdownOpen] = useState(false);
    const [selectedSupplierIndex, setSelectedSupplierIndex] = useState(0);
    const [isSupplierLedgerModalOpen, setIsSupplierLedgerModalOpen] = useState(false);
    const [supplierForLedger, setSupplierForLedger] = useState<Supplier | null>(null);
    const [supplierNameError, setSupplierNameError] = useState<string | null>(null);
    const [invoiceNumberError, setInvoiceNumberError] = useState<string | null>(null);
    const [isSupplierSearchModalOpen, setIsSupplierSearchModalOpen] = useState(false);
    const [isRateTierModalOpen, setIsRateTierModalOpen] = useState(false);
    const [activeRateTierRowId, setActiveRateTierRowId] = useState<string | null>(null);
    const [rateTierDraft, setRateTierDraft] = useState({ rateA: '', rateB: '', rateC: '' });
    const [rateTierHandledRows, setRateTierHandledRows] = useState<Set<string>>(new Set());
    const [selectedRateTierAction, setSelectedRateTierAction] = useState<'skip' | 'save'>('save');
    const [mobileSyncStatus, setMobileSyncStatus] = useState<MobileSyncStatus>('pending');
    const [mobileSyncError, setMobileSyncError] = useState<string | null>(null);
    const [mobileInvoiceId, setMobileInvoiceId] = useState<string | null>(null);
    const [mobilePageCount, setMobilePageCount] = useState(0);

    const fileInputRef = useRef<HTMLInputElement>(null);
    const supplierNameInputRef = useRef<HTMLInputElement>(null);
    const invoiceNumberInputRef = useRef<HTMLInputElement>(null);
    const dateInputRef = useRef<HTMLInputElement>(null);
    const modalSearchInputRef = useRef<HTMLInputElement>(null);
    const searchResultsRef = useRef<HTMLDivElement>(null);
    const lastSourceRef = useRef<string | null>(null);
    const rateAInputRef = useRef<HTMLInputElement>(null);
    const rateBInputRef = useRef<HTMLInputElement>(null);
    const rateCInputRef = useRef<HTMLInputElement>(null);
    const skipRateButtonRef = useRef<HTMLButtonElement>(null);
    const saveRateButtonRef = useRef<HTMLButtonElement>(null);

    const resetFormForNewEntry = useCallback(() => {
        setSupplier('');
        setSupplierGst('');
        setInvoiceNumber('');
        setDate(new Date().toISOString().split('T')[0]);
        setItems([createBlankItem()]);
        setRateTierHandledRows(new Set());
        setSupplierNameError(null);
        setInvoiceNumberError(null);
    }, []);

    const currentsupplier = useMemo(() => {
        const lowerSupplier = (Supplier || '').toLowerCase().trim();
        if (!lowerSupplier) return null;
        return suppliers.find(d => (d.name || '').toLowerCase().trim() === lowerSupplier);
    }, [suppliers, Supplier]);

    const attemptAutoLink = useCallback((itemList: PurchaseItem[], targetsupplier: Supplier | null) => {
        if (!medicines.length) return itemList;

        return itemList.map(item => {
            if (item.inventoryItemId) return item;

            if (targetsupplier) {
                const mapping = mappings.find(m =>
                    m.supplier_id === targetsupplier.id &&
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

            const matchedDist = suppliers.find(d => (d.name || '').toLowerCase().trim() === (purchaseToEdit.supplier || '').toLowerCase().trim());
            if (matchedDist) setSupplierGst(matchedDist.gst_number || '');
            else setSupplierGst('');

            const pItems = Array.isArray(purchaseToEdit.items) ? purchaseToEdit.items : [];
            const mappedItems = pItems.map(item => ({
                ...createBlankItem(),
                ...item,
                expiry: formatExpiryToMMYY(String(item.expiry || '')),
                quantity: Number(item.quantity || 0),
                purchasePrice: Number(item.purchasePrice || 0),
                mrp: Number(item.mrp || 0),
                gstPercent: Number(item.gstPercent || 0),
                discountPercent: Number(item.discountPercent || 0),
                matchStatus: (item.inventoryItemId) ? 'matched' as const : 'pending' as const
            }));

            const linked = attemptAutoLink(mappedItems as PurchaseItem[], matchedDist || null);
            setItems(linked.length > 0 ? [...linked, createBlankItem()] : [createBlankItem()]);
            setRateTierHandledRows(new Set());
        } else if (draftItems) {
            setSupplier(draftSupplier || '');
            const matchedDist = suppliers.find(d => (d.name || '').toLowerCase().trim() === (draftSupplier || '').toLowerCase().trim());
            const newItems = Array.isArray(draftItems) ? draftItems.map(item => ({
                ...createBlankItem(), ...item, expiry: formatExpiryToMMYY(String(item.expiry || '')), quantity: item.quantity, freeQuantity: item.freeQuantity || 0, purchasePrice: item.purchasePrice, matchStatus: 'pending' as const
            })) : [];
            const linked = attemptAutoLink(newItems as PurchaseItem[], matchedDist || null);
            setItems([...linked, createBlankItem()]);
            setRateTierHandledRows(new Set());
        } else {
            resetFormForNewEntry();
            // Focus Supplier name on new voucher
            setTimeout(() => supplierNameInputRef.current?.focus(), 200);
        }
    }, [purchaseToEdit, draftItems, suppliers, draftSupplier, attemptAutoLink, resetFormForNewEntry]);

    const calculatedTotals = useMemo(() => {
        const billDiscount = 0;
        let subtotal = 0;
        let totalGst = 0;
        let grossAmount = 0;
        let totalItemDiscount = 0;
        let totalItemSchemeDiscount = 0;

        const validItems = items.filter(p => (p.name || '').trim() !== '');
        const itemsWithCalculations = validItems.map(p => {
            const gross = (p.purchasePrice || 0) * (p.quantity || 0);
            const tradeDisc = gross * ((p.discountPercent || 0) / 100);
            const afterTrade = gross - tradeDisc;
            const schemeDiscPercentAmount = afterTrade * ((p.schemeDiscountPercent || 0) / 100);
            const schemeDisc = p.schemeDiscountAmount > 0 ? p.schemeDiscountAmount : schemeDiscPercentAmount;
            const taxable = afterTrade - schemeDisc;
            const gst = taxable * ((p.gstPercent || 0) / 100);
            const total = taxable + gst;

            grossAmount += gross;
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

        const preRoundTotal = subtotal + totalGst - billDiscount;
        const grandTotal = Math.round(preRoundTotal);
        const roundOff = Number((grandTotal - preRoundTotal).toFixed(2));

        return {
            itemsWithCalculations,
            grossAmount,
            subtotal,
            totalGst,
            billDiscount,
            preRoundTotal,
            roundOff,
            grandTotal,
            totalAmount: grandTotal,
            totalItemDiscount,
            totalItemSchemeDiscount
        };
    }, [items]);

    const hasDuplicateSupplierInvoice = useCallback(() => {
        const normalizedSupplier = Supplier.toLowerCase().trim();
        const normalizedInvoice = invoiceNumber.toLowerCase().trim();
        if (!normalizedSupplier || !normalizedInvoice) return false;

        const currentFy = (purchaseToEdit as any)?.fy;

        return purchases.some(p => {
            if (purchaseToEdit?.id && p.id === purchaseToEdit.id) return false;
            if ((p.organization_id || '').trim() !== (organizationId || '').trim()) return false;

            const sameSupplier = (p.supplier || '').toLowerCase().trim() === normalizedSupplier;
            const sameInvoice = (p.invoiceNumber || '').toLowerCase().trim() === normalizedInvoice;
            if (!sameSupplier || !sameInvoice) return false;

            const purchaseFy = (p as any).fy;
            if (currentFy && purchaseFy) return purchaseFy === currentFy;
            return true;
        });
    }, [Supplier, invoiceNumber, purchaseToEdit, purchases, organizationId]);

    const handleSubmit = async () => {
        if (isSubmitting) return;
        if (!Supplier.trim()) { setSupplierNameError("Supplier name is required."); return; }
        if (!invoiceNumber.trim()) { setInvoiceNumberError("Invoice number is required."); return; }
        if (hasDuplicateSupplierInvoice()) {
            const duplicateMessage = "Duplicate Supplier Invoice # already recorded. Please verify Purchase History.";
            setInvoiceNumberError(duplicateMessage);
            addNotification(duplicateMessage, "error");
            return;
        }
        const activeItems = items.filter(p => (p.name || '').trim() !== '');
        if (activeItems.length === 0) { addNotification("At least one item is required.", "error"); return; }

        const invalidExpiryItem = activeItems.find(item => {
            const expiryValue = (item.expiry || '').trim();
            return expiryValue !== '' && !EXPIRY_MM_YY_REGEX.test(expiryValue);
        });
        if (invalidExpiryItem) {
            addNotification(`Invalid expiry for ${invalidExpiryItem.name}. Use MM/YY format (e.g., 01/25).`, "error");
            return;
        }

        setIsSubmitting(true);
        try {
            let purchaseSerialId = purchaseToEdit?.purchaseSerialId;

            if (!purchaseToEdit && currentUser) {
                const reserved = await reserveVoucherNumber('purchase-entry', currentUser);
                purchaseSerialId = reserved.documentNumber;
            }

            const payload = {
                purchaseSerialId: purchaseSerialId!,
                supplier: Supplier,
                invoiceNumber: invoiceNumber.trim(),
                date,
                items: calculatedTotals.itemsWithCalculations.map(item => ({
                    ...item,
                    expiry: formatExpiryToMMYY(item.expiry)
                })),
                subtotal: calculatedTotals.subtotal,
                totalGst: calculatedTotals.totalGst,
                totalAmount: calculatedTotals.totalAmount,
                totalItemDiscount: calculatedTotals.totalItemDiscount,
                totalItemSchemeDiscount: calculatedTotals.totalItemSchemeDiscount,
                status: 'completed' as const,
                organization_id: organizationId,
                roundOff: calculatedTotals.roundOff,
                schemeDiscount: 0
            };

            if (purchaseToEdit) {
                await onUpdatePurchase({ ...purchaseToEdit, ...payload } as any, supplierGst);
            } else {
                await onAddPurchase(payload, supplierGst);
            }
            onClearDraft(); if (onCancel) onCancel();
        } catch (e: any) {
            addNotification(`Error: ${parseNetworkAndApiError(e)}`, "error");
        } finally { setIsSubmitting(false); }
    };

    const handleDiscard = useCallback(() => {
        resetFormForNewEntry();
        onClearDraft();
        if (onCancel) onCancel();
    }, [onCancel, onClearDraft, resetFormForNewEntry]);

    useImperativeHandle(ref, () => ({
        handleSubmit,
        items
    }));

    const deduplicatedSearchInventory = useMemo(() => {
        const grouped = new Map<string, { item: InventoryItem; batches: InventoryItem[] }>();
        const term = modalSearchTerm.toLowerCase().trim();

        inventory.forEach(i => {
            const name = i.name.toLowerCase();
            const code = (i.code || '').toLowerCase();
            if (!term || name.startsWith(term) || code.startsWith(term)) {
                const key = `${i.name.toLowerCase()}|${i.brand?.toLowerCase() || ''}`;
                if (!grouped.has(key)) grouped.set(key, { item: i, batches: [i] });
                else {
                    const existing = grouped.get(key)!;
                    existing.batches.push(i);
                    existing.item = {
                        ...existing.item,
                        stock: existing.batches.reduce((sum, batch) => sum + (batch.stock || 0), 0),
                    };
                }
            }
        });

        medicines.forEach(m => {
            const name = m.name.toLowerCase();
            const materialCode = (m.materialCode || '').toLowerCase();
            if (!term || name.startsWith(term) || materialCode.startsWith(term)) {
                const key = `${m.name.toLowerCase()}|${m.brand?.toLowerCase() || ''}`;
                if (!grouped.has(key)) {
                    const virtualItem: InventoryItem = {
                        id: m.id,
                        organization_id: m.organization_id || '',
                        name: m.name,
                        code: m.materialCode,
                        brand: m.brand || '',
                        category: 'Medicine',
                        manufacturer: m.manufacturer || '',
                        stock: 0,
                        unitsPerPack: parseInt(m.pack?.match(/\d+/)?.[0] || '10', 10),
                        packType: m.pack || '',
                        minStockLimit: 0,
                        batch: 'NEW-STOCK',
                        expiry: 'N/A',
                        purchasePrice: 0,
                        mrp: parseFloat(m.mrp || '0'),
                        gstPercent: m.gstRate || 0,
                        hsnCode: m.hsnCode || '',
                        composition: m.composition || '',
                        barcode: m.barcode || '',
                        is_active: true
                    };
                    grouped.set(key, { item: virtualItem, batches: [] });
                }
            }
        });

        return Array.from(grouped.values())
            .sort((a, b) => a.item.name.localeCompare(b.item.name))
            .slice(0, 30);
    }, [modalSearchTerm, inventory, medicines]);

    const activeIntelItem = useMemo(() => {
        if (isSearchModalOpen && deduplicatedSearchInventory.length > 0) {
            return deduplicatedSearchInventory[selectedSearchIndex]?.item;
        }
        return null;
    }, [isSearchModalOpen, deduplicatedSearchInventory, selectedSearchIndex]);

    const intelDetails = useMemo(() => {
        if (!activeIntelItem) return null;

        const matchingPurchases = (purchases || []).filter(p => {
            if (p.status === 'cancelled' || !p.items) return false;
            const items = Array.isArray(p.items) ? p.items : (typeof p.items === 'string' ? JSON.parse(p.items) : []);
            return Array.isArray(items) && items.some((i: any) => i.name === activeIntelItem.name);
        }).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

        const lastPurRate = matchingPurchases.length > 0
            ? (matchingPurchases[0].items.find((i: any) => i.name === activeIntelItem.name)?.purchasePrice || activeIntelItem.purchasePrice)
            : activeIntelItem.purchasePrice;

        const profitAmount = activeIntelItem.mrp - lastPurRate;
        const profitMargin = activeIntelItem.mrp > 0 ? (profitAmount / activeIntelItem.mrp) * 100 : 0;

        return { lastPurRate, profitAmount, profitMargin };
    }, [activeIntelItem, purchases]);

    const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
        if (deduplicatedSearchInventory.length === 0) return;

        if (e.key === 'ArrowDown') {
            e.preventDefault();
            setSelectedSearchIndex(prev => (prev + 1) % deduplicatedSearchInventory.length);
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setSelectedSearchIndex(prev => (prev - 1 + deduplicatedSearchInventory.length) % deduplicatedSearchInventory.length);
        } else if (e.key === 'Enter') {
            e.preventDefault();
            const selectedWrapper = deduplicatedSearchInventory[selectedSearchIndex];
            if (selectedWrapper) triggerBatchSelection(selectedWrapper);
        }
    };

    const triggerBatchSelection = (productWrapper: { item: InventoryItem; batches: InventoryItem[] }) => {
        if (productWrapper.batches.length === 0) {
            addSelectedBatchToGrid(productWrapper.item);
            return;
        }
        setPendingBatchSelection(productWrapper);
        setIsSearchModalOpen(false);
    };

    const addSelectedBatchToGrid = (batch: InventoryItem) => {
        const newItemId = crypto.randomUUID();
        const newItem: PurchaseItem = {
            id: newItemId,
            inventoryItemId: batch.id,
            name: batch.name,
            brand: batch.brand || '',
            category: batch.category || 'General',
            batch: batch.batch || 'NEW-BATCH',
            expiry: formatExpiryToMMYY(batch.expiry ? String(batch.expiry) : ''),
            quantity: 1,
            looseQuantity: 0,
            freeQuantity: 0,
            purchasePrice: batch.purchasePrice || 0,
            mrp: batch.mrp || 0,
            rateA: batch.rateA,
            rateB: batch.rateB,
            rateC: batch.rateC,
            gstPercent: batch.gstPercent || 5,
            hsnCode: batch.hsnCode || '',
            discountPercent: 0,
            schemeDiscountPercent: 0,
            schemeDiscountAmount: 0,
            matchStatus: 'matched'
        };

        setItems(prev => {
            const index = prev.findIndex(p => p.id === activeRowId);
            if (activeRowId && index > -1) {
                const next = [...prev];
                next[index] = newItem;
                if (index === prev.length - 1) return [...next, createBlankItem()];
                return next;
            }
            return [...prev, newItem, createBlankItem()];
        });

        setModalSearchTerm('');
        setIsSearchModalOpen(false);
        setPendingBatchSelection(null);
        setActiveRowId(null);

        setTimeout(() => {
            const qtyInput = document.getElementById(`qty-${newItemId}`);
            if (qtyInput) {
                (qtyInput as HTMLInputElement).focus();
                (qtyInput as HTMLInputElement).select();
            }
        }, 50);
    };

    const openSearchModal = useCallback((rowId: string, initialValue: string) => {
        if (isReadOnly) return;
        setActiveRowId(rowId);
        setModalSearchTerm(initialValue);
        setIsSearchModalOpen(true);
        setSelectedSearchIndex(0);
        setTimeout(() => modalSearchInputRef.current?.focus(), 150);
    }, [isReadOnly]);

    const handleUpdateItem = (id: string, field: keyof PurchaseItem, value: any) => {
        if (isReadOnly || !Supplier.trim()) return;
        setItems(prev => {
            const index = prev.findIndex(p => p.id === id); if (index === -1) return prev;
            let updatedItem = { ...prev[index], [field]: value };
            if (field === 'name') { updatedItem.matchStatus = 'pending'; updatedItem.inventoryItemId = undefined; }
            if (field === 'expiry') { updatedItem.expiry = normalizeExpiryInput(String(value)); }
            if (['quantity', 'freeQuantity', 'purchasePrice', 'mrp', 'discountPercent', 'schemeDiscountPercent'].includes(field)) { (updatedItem as any)[field] = value === '' ? 0 : (parseFloat(value) || 0); }
            const updated = prev.map(p => p.id === id ? updatedItem : p);
            if (field === 'name' && (value || '').trim() !== '' && index === prev.length - 1) return [...updated, createBlankItem()];
            return updated;
        });
    };

    const moveToNextProductSelection = useCallback((rowId: string) => {
        let nextRowId: string | null = null;

        setItems(prev => {
            const currentIndex = prev.findIndex(p => p.id === rowId);
            if (currentIndex === -1) return prev;

            let nextItems = prev;
            if (currentIndex === prev.length - 1 && (prev[currentIndex].name || '').trim() !== '') {
                nextItems = [...prev, createBlankItem()];
            }

            nextRowId = nextItems[currentIndex + 1]?.id || null;
            return nextItems;
        });

        setTimeout(() => {
            if (!nextRowId) return;
            const nameInput = document.getElementById(`name-${nextRowId}`) as HTMLInputElement | null;
            nameInput?.focus();
            nameInput?.select();
        }, 50);
    }, []);

    const openRateTierModal = useCallback((rowId: string) => {
        const row = items.find(p => p.id === rowId);
        if (!row) return;
        const linkedInventory = row.inventoryItemId ? inventory.find(inv => inv.id === row.inventoryItemId) : undefined;

        setActiveRateTierRowId(rowId);
        setRateTierDraft({
            rateA: row.rateA !== undefined ? String(row.rateA) : (linkedInventory?.rateA !== undefined ? String(linkedInventory.rateA) : ''),
            rateB: row.rateB !== undefined ? String(row.rateB) : (linkedInventory?.rateB !== undefined ? String(linkedInventory.rateB) : ''),
            rateC: row.rateC !== undefined ? String(row.rateC) : (linkedInventory?.rateC !== undefined ? String(linkedInventory.rateC) : ''),
        });
        setSelectedRateTierAction('save');
        setIsRateTierModalOpen(true);
    }, [inventory, items]);

    useEffect(() => {
        if (!isRateTierModalOpen) return;
        setTimeout(() => {
            rateAInputRef.current?.focus();
            rateAInputRef.current?.select();
        }, 0);
    }, [isRateTierModalOpen]);

    const focusSelectedRateTierAction = useCallback((action: 'skip' | 'save') => {
        if (action === 'skip') {
            skipRateButtonRef.current?.focus();
            return;
        }
        saveRateButtonRef.current?.focus();
    }, []);

    const handleRateInputEnter = (e: React.KeyboardEvent<HTMLInputElement>, nextField?: 'rateB' | 'rateC' | 'action') => {
        if (e.key !== 'Enter') return;
        e.preventDefault();
        e.stopPropagation();

        if (nextField === 'rateB') {
            rateBInputRef.current?.focus();
            rateBInputRef.current?.select();
            return;
        }
        if (nextField === 'rateC') {
            rateCInputRef.current?.focus();
            rateCInputRef.current?.select();
            return;
        }
        focusSelectedRateTierAction(selectedRateTierAction);
    };

    const handleRateActionKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>) => {
        if (e.key === 'ArrowLeft') {
            e.preventDefault();
            setSelectedRateTierAction('skip');
            focusSelectedRateTierAction('skip');
            return;
        }

        if (e.key === 'ArrowRight') {
            e.preventDefault();
            setSelectedRateTierAction('save');
            focusSelectedRateTierAction('save');
            return;
        }

        if (e.key === 'Enter') {
            e.preventDefault();
            e.stopPropagation();
            if (selectedRateTierAction === 'save') {
                saveTierRatesForRow();
            } else {
                skipTierRatesForRow();
            }
        }
    };

    const closeRateTierModal = () => {
        const currentRowId = activeRateTierRowId;
        setIsRateTierModalOpen(false);
        setActiveRateTierRowId(null);
        setTimeout(() => {
            if (!currentRowId) return;
            const schInput = document.getElementById(`sch-${currentRowId}`) as HTMLInputElement | null;
            schInput?.focus();
            schInput?.select();
        }, 50);
    };

    const saveTierRatesForRow = () => {
        if (!activeRateTierRowId) return;

        setItems(prev => prev.map(item => item.id === activeRateTierRowId ? {
            ...item,
            rateA: rateTierDraft.rateA === '' ? undefined : (parseFloat(rateTierDraft.rateA) || 0),
            rateB: rateTierDraft.rateB === '' ? undefined : (parseFloat(rateTierDraft.rateB) || 0),
            rateC: rateTierDraft.rateC === '' ? undefined : (parseFloat(rateTierDraft.rateC) || 0),
        } : item));
        setRateTierHandledRows(prev => new Set(prev).add(activeRateTierRowId));
        closeRateTierModal();
    };

    const skipTierRatesForRow = () => {
        if (activeRateTierRowId) {
            setRateTierHandledRows(prev => new Set(prev).add(activeRateTierRowId));
        }
        closeRateTierModal();
    };

    const handleRateTierLastFieldEnter = (e: React.KeyboardEvent<HTMLInputElement>, rowId: string) => {
        if (e.key !== 'Enter') return;
        e.preventDefault();
        e.stopPropagation();

        if (isReadOnly || !Supplier.trim()) return;
        if (!rateTierHandledRows.has(rowId)) {
            openRateTierModal(rowId);
            return;
        }

        moveToNextProductSelection(rowId);
    };

    const processAiExtraction = useCallback(async (fileInputs: FileInput[]) => {
        if (!fileInputs || fileInputs.length === 0) return;
        console.log(`MDXERA AI: Starting extraction for ${fileInputs.length} page(s).`);

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
                const linked = attemptAutoLink(newItems as PurchaseItem[], currentsupplier || null);
                setItems([...linked, createBlankItem()]);
                setRateTierHandledRows(new Set());
            }

            addNotification("AI Extracted bill details successfully.", "success");
        } catch (err: any) {
            addNotification(`AI Extraction failed: ${parseNetworkAndApiError(err)}`, "error");
        } finally {
            setIsUploading(false);
        }
    }, [addNotification, attemptAutoLink, currentUser?.pharmacy_name, currentsupplier, date]);


    const processMobileSyncPayload = useCallback(async (payload: MobileSyncInvoicePayload) => {
        const pages = Array.isArray(payload.pages) && payload.pages.length > 0
            ? payload.pages
            : (payload.image ? [{ image: payload.image, mimeType: payload.mimeType || 'image/jpeg', pageNumber: 1 }] : []);

        if (pages.length === 0) {
            setMobileSyncStatus('failed');
            setMobileSyncError('No bill pages found in mobile sync payload.');
            addNotification('Mobile sync failed: no pages received.', 'error');
            return;
        }

        const orderedPages = [...pages].sort((a, b) => (a.pageNumber || 0) - (b.pageNumber || 0));
        setMobilePageCount(orderedPages.length);
        setMobileInvoiceId(payload.invoiceId || null);
        setMobileSyncError(null);
        setMobileSyncStatus('synced');

        try {
            const fileInputs: FileInput[] = orderedPages.map((page, index) => ({
                data: page.image,
                mimeType: page.mimeType || 'image/jpeg',
                name: `mobile-${payload.invoiceId || 'invoice'}-page-${(page.pageNumber || index + 1)}.jpg`
            }));

            await processAiExtraction(fileInputs);
            setMobileSyncStatus('imported');
            addNotification(`Imported ${orderedPages.length} mobile page(s) into draft purchase voucher.`, 'success');
        } catch (err: any) {
            const message = parseNetworkAndApiError(err);
            setMobileSyncStatus('failed');
            setMobileSyncError(message);
            addNotification(`Mobile sync import failed: ${message}`, 'error');
        }
    }, [addNotification, processAiExtraction]);

    useEffect(() => {
        if (!mobileSyncSessionId) {
            setMobileSyncStatus('pending');
            setMobileSyncError(null);
            setMobileInvoiceId(null);
            setMobilePageCount(0);
            return;
        }

        setMobileSyncStatus('pending');
        setMobileSyncError(null);
        const channel = listenForSyncMessage(mobileSyncSessionId, (payload: MobileSyncInvoicePayload) => {
            setMobileSyncStatus('uploading');
            processMobileSyncPayload(payload);
        });

        return () => {
            if (channel && typeof (channel as any).unsubscribe === 'function') {
                (channel as any).unsubscribe();
            }
        };
    }, [mobileSyncSessionId, processMobileSyncPayload]);

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = e.target.files;
        if (!files || files.length === 0) return;

        try {
            const fileInputs = await prepareFilesForAiExtraction(files);
            await processAiExtraction(fileInputs);
        } catch (err: any) {
            addNotification(parseNetworkAndApiError(err), 'error');
        }
        if (fileInputRef.current) fileInputRef.current.value = '';
    };

    const handleWebcamCapture = async (data: string, mimeType: string) => {
        try {
            const optimized = await prepareCapturedImageForAiExtraction(data, mimeType);
            await processAiExtraction([optimized]);
        } catch (err: any) {
            addNotification(parseNetworkAndApiError(err), 'error');
        }
    };

    const handleSupplierSelect = (d: Supplier) => {
        setSupplier(d.name);
        setSupplierGst(d.gst_number || '');
        setIsSupplierDropdownOpen(false);
        setIsSupplierSearchModalOpen(false);
        setSelectedSupplierIndex(0);
        setSupplierNameError(null);
        invoiceNumberInputRef.current?.focus();
    };

    const handleSupplierKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            const filtered = suppliers.filter(d => fuzzyMatch(d.name, Supplier)).slice(0, 10);
            setSelectedSupplierIndex(prev => (prev + 1) % Math.max(1, filtered.length));
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            const filtered = suppliers.filter(d => fuzzyMatch(d.name, Supplier)).slice(0, 10);
            setSelectedSupplierIndex(prev => (prev - 1 + filtered.length) % Math.max(1, filtered.length));
        } else if (e.key === 'Enter') {
            e.preventDefault();
            setIsSupplierSearchModalOpen(true);
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
                            value={Supplier}
                            autoComplete="off"
                            onChange={e => { setSupplier(e.target.value); setSupplierNameError(null); setIsSupplierDropdownOpen(true); }}
                            onKeyDown={handleSupplierKeyDown}
                            className={`w-full border p-2 text-sm font-bold uppercase outline-none ${supplierNameError ? 'border-red-500' : 'border-gray-400 focus:border-primary'}`}
                            placeholder="Press Enter to Select Supplier..."
                        />
                        {isSupplierDropdownOpen && Supplier.length > 0 && (
                            <div className="absolute top-full left-0 w-full bg-white border border-primary shadow-2xl z-[200] overflow-hidden rounded-none">
                                {suppliers.filter(d => fuzzyMatch(d.name, Supplier)).slice(0, 10).map((d, sIdx) => (
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
                            onChange={e => { setInvoiceNumber(e.target.value); setInvoiceNumberError(null); }}
                            className={`w-full border p-2 text-sm font-bold outline-none ${invoiceNumberError ? 'border-red-500' : 'border-gray-400 focus:border-primary'}`}
                        />
                        {invoiceNumberError && <p className="mt-1 text-[10px] font-bold text-red-600">{invoiceNumberError}</p>}
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
                    <>
                    <div className="flex space-x-2 flex-shrink-0 px-2">
                        <button onClick={() => setIsWebcamModalOpen(true)} className="px-3 py-1.5 text-[10px] font-black uppercase bg-white text-primary border border-primary flex items-center gap-2 hover:bg-primary/5 transition-colors"><CameraIcon /> Webcam Scan</button>
                        <button onClick={() => { setMobileSyncStatus('pending'); setMobileSyncError(null); setMobilePageCount(0); setMobileInvoiceId(null); setMobileSyncSessionId(generateUUID()); }} className="px-3 py-1.5 text-[10px] font-black uppercase bg-white text-primary border border-primary flex items-center gap-2 hover:bg-primary/5 transition-colors"><SmartphoneIcon /> Mobile Sync</button>
                        <button onClick={() => fileInputRef.current?.click()} className="px-3 py-1.5 text-[10px] font-black uppercase bg-white text-primary border border-primary flex items-center gap-2 hover:bg-primary/5 transition-colors"><UploadIcon /> {isUploading ? <Spinner /> : 'Import Document'}</button>
                        <input type="file" ref={fileInputRef} onChange={handleFileUpload} className="hidden" accept="image/*,application/pdf" />
                    </div>

                    {!!mobileSyncSessionId && (
                        <div className="mx-2 mt-2 border border-primary/20 bg-primary/5 px-3 py-2 flex flex-wrap items-center gap-2 text-[10px] font-black uppercase">
                            <span className="text-gray-600">Mobile Sync Status:</span>
                            <span className="px-2 py-0.5 border border-primary text-primary bg-white">{getSyncStatusLabel(mobileSyncStatus)}</span>
                            {mobilePageCount > 0 && <span className="text-gray-500">Pages: {mobilePageCount}</span>}
                            {mobileInvoiceId && <span className="text-gray-500">Invoice ID: {mobileInvoiceId}</span>}
                            {mobileSyncError && <span className="text-red-600 normal-case">{mobileSyncError}</span>}
                        </div>
                    )}
                    </>
                )}

                <Card className="flex-1 min-h-[420px] md:min-h-[500px] flex flex-col p-0 tally-border !rounded-none overflow-hidden shadow-inner bg-white dark:bg-zinc-800">
                    <div className="flex-1 overflow-auto">
                        <table className="min-w-full border-collapse text-sm">
                            <thead className="sticky top-0 bg-gray-100 dark:bg-zinc-900 border-b border-gray-400 z-10">
                                <tr className="text-[10px] font-black uppercase text-gray-600 h-9">
                                    <th className="p-2 border-r border-gray-400 text-left w-10">Sl.</th>
                                    <th className="p-2 border-r border-gray-400 text-left w-72">Name of Item</th>
                                    <th className="p-2 border-r border-gray-400 text-left w-24">MFR</th>
                                    {isFieldVisible('colPack') && <th className="p-2 border-r border-gray-400 text-center w-16">Pack</th>}
                                    <th className="p-2 border-r border-gray-400 text-center w-24">Batch</th>
                                    <th className="p-2 border-r border-gray-400 text-center w-20">Exp.</th>
                                    <th className="p-2 border-r border-gray-400 text-right w-24">MRP</th>
                                    <th className="p-2 border-r border-gray-400 text-center w-16">Qty</th>
                                    {isFieldVisible('colFree') && <th className="p-2 border-r border-gray-400 text-center w-16">FREE</th>}
                                    <th className="p-2 border-r border-gray-400 text-right w-24">Rate</th>
                                    <th className="p-2 border-r border-gray-400 text-center w-16">Disc%</th>
                                    <th className="p-2 border-r border-gray-400 text-center w-16">Sch%</th>
                                    <th className="p-2 text-right w-32">Amount</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-200">
                                {items.map((p, idx) => (
                                    <tr key={p.id} className="hover:bg-gray-50 group h-10">
                                        <td className={`p-1 border-r border-gray-200 text-center text-gray-400 ${uniformTextStyle}`}>{idx + 1}</td>
                                        <td className={`p-1 border-r border-gray-200 text-primary uppercase relative min-w-[200px] ${uniformTextStyle}`}>
                                            <input
                                                type="text"
                                                id={`name-${p.id}`}
                                                value={p.name}
                                                autoComplete="off"
                                                onChange={e => {
                                                    const val = e.target.value;
                                                    handleUpdateItem(p.id, 'name', val);
                                                    openSearchModal(p.id, val);
                                                }}
                                                onFocus={() => {
                                                    setActiveRowId(p.id);
                                                    openSearchModal(p.id, p.name);
                                                }}
                                                className={`w-full bg-transparent outline-none focus:bg-yellow-50 ${uniformTextStyle}`}
                                                disabled={isReadOnly || !Supplier.trim()}
                                            />
                                        </td>
                                        <td className={`p-1 border-r border-gray-400 ${uniformTextStyle}`}><input type="text" id={`mfr-${p.id}`} value={p.brand} onChange={e => handleUpdateItem(p.id, 'brand', e.target.value)} className={`w-full bg-transparent outline-none ${uniformTextStyle}`} disabled={isReadOnly || !Supplier.trim()} /></td>
                                        {isFieldVisible('colPack') && (
                                            <td className={`p-1 border-r border-gray-200 text-center ${uniformTextStyle}`}><input type="text" value={p.packType} onChange={e => handleUpdateItem(p.id, 'packType', e.target.value)} className={`w-full text-center bg-transparent outline-none ${uniformTextStyle}`} disabled={isReadOnly || !Supplier.trim()} /></td>
                                        )}
                                        <td className={`p-1 border-r border-gray-200 text-center font-mono uppercase ${uniformTextStyle}`}><input type="text" id={`batch-${p.id}`} value={p.batch} onChange={e => handleUpdateItem(p.id, 'batch', e.target.value.toUpperCase())} className={`w-full text-center bg-transparent outline-none ${uniformTextStyle}`} disabled={isReadOnly || !Supplier.trim()} /></td>
                                        <td className={`p-1 border-r border-gray-200 text-center ${uniformTextStyle}`}><input type="text" id={`expiry-${p.id}`} value={p.expiry} onChange={e => handleUpdateItem(p.id, 'expiry', e.target.value)} placeholder="MM/YY" inputMode="numeric" maxLength={5} pattern="(0[1-9]|1[0-2])/[0-9]{2}" className={`w-full text-center bg-transparent outline-none ${uniformTextStyle}`} disabled={isReadOnly || !Supplier.trim()} /></td>
                                        <td className={`p-1 border-r border-gray-400 text-right font-mono whitespace-nowrap ${uniformTextStyle}`}><input type="number" id={`mrp-${p.id}`} value={p.mrp || ''} onChange={e => handleUpdateItem(p.id, 'mrp', e.target.value)} className={`w-full text-right bg-transparent outline-none no-spinner ${uniformTextStyle}`} disabled={isReadOnly || !Supplier.trim()} /></td>
                                        <td className={`p-1 border-r border-gray-400 text-center font-black ${uniformTextStyle}`}><input type="number" id={`qty-${p.id}`} value={p.quantity || ''} onChange={e => handleUpdateItem(p.id, 'quantity', e.target.value)} className={`w-full text-center bg-transparent no-spinner outline-none font-mono ${uniformTextStyle}`} disabled={isReadOnly || !Supplier.trim()} /></td>
                                        {isFieldVisible('colFree') && (
                                            <td className={`p-1 border-r border-gray-400 text-center text-emerald-600 font-bold ${uniformTextStyle}`}><input type="number" value={p.freeQuantity || ''} onChange={e => handleUpdateItem(p.id, 'freeQuantity', e.target.value)} className={`w-full text-center bg-transparent no-spinner outline-none font-mono ${uniformTextStyle}`} disabled={isReadOnly || !Supplier.trim()} /></td>
                                        )}
                                        <td className={`p-1 border-r border-gray-400 text-right font-bold text-blue-900 ${uniformTextStyle}`}><input type="number" id={`rate-${p.id}`} value={p.purchasePrice || ''} onChange={e => handleUpdateItem(p.id, 'purchasePrice', e.target.value)} className={`w-full text-right bg-transparent outline-none no-spinner font-mono ${uniformTextStyle}`} disabled={isReadOnly || !Supplier.trim()} /></td>
                                        <td className={`p-1 border-r border-gray-400 text-center text-red-600 ${uniformTextStyle}`}><input type="number" value={p.discountPercent || ''} onChange={e => handleUpdateItem(p.id, 'discountPercent', e.target.value)} className={`w-full text-center bg-transparent no-spinner outline-none font-mono ${uniformTextStyle}`} disabled={isReadOnly || !Supplier.trim()} /></td>
                                        <td className={`p-1 border-r border-gray-400 text-center text-red-600 ${uniformTextStyle}`}><input type="number" id={`sch-${p.id}`} value={p.schemeDiscountPercent || ''} onChange={e => handleUpdateItem(p.id, 'schemeDiscountPercent', e.target.value)} onKeyDown={(e) => handleRateTierLastFieldEnter(e, p.id)} className={`w-full text-center bg-transparent no-spinner outline-none font-mono ${uniformTextStyle}`} disabled={isReadOnly || !Supplier.trim()} /></td>
                                        <td className={`p-1 text-right font-black font-mono text-gray-950 whitespace-nowrap ${uniformTextStyle}`}>₹{((p.purchasePrice || 0) * (p.quantity || 0) * (1 - (p.discountPercent || 0) / 100) * (1 - (p.schemeDiscountPercent || 0) / 100)).toFixed(2)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </Card>

                <div className="sticky bottom-0 z-20 -mx-4 px-4 pb-1 pt-2 bg-app-bg/95 backdrop-blur supports-[backdrop-filter]:bg-app-bg/80">
                <div className="flex flex-col xl:flex-row justify-between items-stretch flex-shrink-0 gap-4 min-h-[184px]">
                    <div className="w-full xl:w-[390px] bg-[#e5f0f0] p-5 tally-border !rounded-none shadow-md flex flex-col justify-between gap-4">
                        <div>
                            <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-primary mb-2">Summary</h3>
                            <div className="space-y-2 text-[11px] font-bold uppercase tracking-tight">
                                <div className="flex items-center justify-between text-gray-700"><span>Gross</span><span className="font-mono">{formatCurrency(calculatedTotals.grossAmount)}</span></div>
                                <div className="flex items-center justify-between text-red-600"><span>Trade Discount</span><span className="font-mono">{formatSignedCurrency(calculatedTotals.totalItemDiscount, '-')}</span></div>
                                <div className="flex items-center justify-between text-emerald-700"><span>Scheme Benefit</span><span className="font-mono">{formatSignedCurrency(calculatedTotals.totalItemSchemeDiscount, '-')}</span></div>
                                <div className="flex items-center justify-between text-red-700"><span>Bill Discount</span><span className="font-mono">{formatSignedCurrency(calculatedTotals.billDiscount, '-')}</span></div>
                                <div className="flex items-center justify-between text-blue-700"><span>Tax (GST)</span><span className="font-mono">{formatSignedCurrency(calculatedTotals.totalGst, '+')}</span></div>
                                <div className="flex items-center justify-between text-gray-700"><span>Round Off</span><span className="font-mono">{formatRoundOffCurrency(calculatedTotals.roundOff)}</span></div>
                                <div className="border-t border-gray-400 pt-1.5 mt-1 flex items-center justify-between text-lg font-black text-primary"><span>Grand Total</span><span className="font-mono">{formatCurrency(calculatedTotals.grandTotal)}</span></div>
                            </div>
                        </div>
                    </div>

                    <div className="flex-1 min-w-0">
                        {activeIntelItem ? (
                            <div className="bg-slate-100 p-4 h-full tally-border !rounded-none shadow-md animate-in fade-in duration-200 flex flex-col">
                                <div className="flex justify-between items-center border-b border-gray-300 pb-2 mb-3 flex-shrink-0">
                                    <div className="flex items-center gap-2">
                                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="text-primary"><circle cx="12" cy="12" r="10" /><path d="M12 16v-4" /><path d="M12 8h.01" /></svg>
                                        <span className="text-xs font-black uppercase text-primary tracking-[0.2em]">Inventory Insight</span>
                                    </div>
                                    <span className="text-2xl font-black text-emerald-700 leading-none">QTY: {activeIntelItem.stock}</span>
                                </div>

                                <div className="flex-1 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 overflow-hidden">
                                    <div className="bg-white/60 p-2.5 border border-gray-200 rounded-none flex flex-col justify-center">
                                        <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest leading-none mb-1.5 opacity-60">Identity & Validity</p>
                                        <div className="flex flex-col gap-0.5">
                                            <p className="text-sm font-black text-primary uppercase font-mono truncate">{activeIntelItem.batch} | {activeIntelItem.code}</p>
                                            <p className="text-xs font-bold text-red-600 uppercase">Expires: {activeIntelItem.expiry}</p>
                                        </div>
                                    </div>

                                    <div className="bg-white/60 p-2.5 border border-gray-200 rounded-none flex flex-col justify-center">
                                        <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2 opacity-60">Pricing Vector</p>
                                        <div className="grid grid-cols-2 gap-2">
                                            <div>
                                                <p className="text-[10px] font-bold text-gray-500 uppercase">M.R.P</p>
                                                <p className="text-sm font-black text-gray-900">₹{(activeIntelItem.mrp || 0).toFixed(2)}</p>
                                            </div>
                                            <div>
                                                <p className="text-[10px] font-bold text-gray-500 uppercase">Pur Rate</p>
                                                <p className="text-sm font-black text-blue-800">₹{(intelDetails?.lastPurRate ?? 0).toFixed(2)}</p>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="bg-white/60 p-2.5 border border-gray-200 rounded-none flex flex-col justify-center">
                                        <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-3 opacity-70">Profit Quotient</p>
                                        <div className="flex justify-between items-center mb-2">
                                            <span className="text-[11px] font-bold text-gray-500 uppercase">Net Margin</span>
                                            <span className="text-xl font-black text-emerald-600">{(intelDetails?.profitMargin ?? 0).toFixed(1)}%</span>
                                        </div>
                                        <div className="flex justify-between items-center">
                                            <span className="text-[11px] font-bold text-gray-500 uppercase">Per Unit</span>
                                            <span className="text-xl font-black text-emerald-600">₹{(intelDetails?.profitAmount ?? 0).toFixed(2)}</span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        ) : (
                            <div className="h-full border-2 border-dashed border-gray-300 flex flex-col items-center justify-center p-4 rounded-none opacity-20">
                                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" className="mb-2"><path d="m21 21-4.3-4.3" /><circle cx="11" cy="11" r="8" /><path d="M11 8v6" /><path d="M8 11h6" /></svg>
                                <p className="text-[11px] font-black uppercase tracking-[0.4em] italic">Search item for live intel</p>
                            </div>
                        )}
                    </div>

                    <div className="w-full xl:w-56 flex flex-col xl:items-end xl:justify-end gap-2 xl:self-stretch">
                        <button onClick={handleDiscard} className="w-full px-6 py-2 bg-white font-bold hover:bg-gray-100 text-gray-700 tally-border uppercase tracking-widest text-[10px] shadow-sm">Discard</button>
                        <button onClick={handleSubmit} disabled={isSubmitting} className="w-full px-10 py-2 tally-button-primary shadow-lg uppercase text-[10px] font-black tracking-widest">
                            {isSubmitting ? <Spinner /> : (isEditing ? 'Update Entry' : 'Save')}
                        </button>
                    </div>
                </div>
            </div>

            </div>

            {isWebcamModalOpen && <WebcamCaptureModal isOpen={isWebcamModalOpen} onClose={() => setIsWebcamModalOpen(false)} onCapture={handleWebcamCapture} />}
            {isAddSupplierModalOpen && <AddSupplierModal isOpen={isAddSupplierModalOpen} onClose={() => setIsAddSupplierModalOpen(false)} onAdd={onAddsupplier} organizationId={organizationId} />}
            {isAddMedicineMasterModalOpen && <AddMedicineModal isOpen={isAddMedicineMasterModalOpen} onClose={() => setIsAddMedicineMasterModalOpen(false)} onAddMedicine={onAddMedicineMaster} organizationId={organizationId} />}
            {isLinkModalOpen && currentsupplier && (
                <LinkToMasterModal
                    isOpen={isLinkModalOpen} onClose={() => setIsLinkModalOpen(false)} supplier={currentsupplier as any} medicines={medicines} mappings={mappings}
                    onLink={onSaveMapping} scannedItems={items} onFinalize={(reconciled) => setItems(reconciled)} onAddMedicineMaster={onAddMedicineMaster} organizationId={organizationId}
                />
            )}
            {isSupplierLedgerModalOpen && supplierForLedger && <SupplierLedgerModal isOpen={isSupplierLedgerModalOpen} onClose={() => setIsSupplierLedgerModalOpen(false)} supplier={supplierForLedger} />}
            <MobileSyncModal isOpen={!!mobileSyncSessionId} onClose={() => setMobileSyncSessionId(null)} sessionId={mobileSyncSessionId} orgId={organizationId} status={mobileSyncStatus} errorMessage={mobileSyncError} pageCount={mobilePageCount} invoiceId={mobileInvoiceId} />

            <Modal
                isOpen={isSearchModalOpen}
                onClose={() => setIsSearchModalOpen(false)}
                title="Product selection Matrix"
            >
                <div className="flex flex-col h-full bg-[#fffde7] dark:bg-zinc-950 font-normal outline-none" onKeyDown={handleSearchKeyDown}>
                    <div className="py-1.5 px-4 bg-primary text-white flex-shrink-0 flex justify-between items-center">
                        <div className="flex items-center gap-3">
                            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" /></svg>
                            <span className="text-xs font-black uppercase tracking-[0.2em]">Material Discovery Engine</span>
                        </div>
                        <span className="text-[10px] font-bold uppercase opacity-70">↑/↓ Navigate | Enter Select</span>
                    </div>

                    <div className="flex flex-1 overflow-hidden">
                        <div className="flex-1 flex flex-col overflow-hidden">
                            <div className="p-2 bg-white dark:bg-zinc-900 border-b-2 border-primary/10">
                                <input
                                    ref={modalSearchInputRef}
                                    type="text"
                                    value={modalSearchTerm}
                                    onChange={e => setModalSearchTerm(e.target.value)}
                                    placeholder="Type medicine name or code..."
                                    className={`w-full p-2 border-2 border-primary/20 bg-white text-base font-black focus:border-primary outline-none shadow-inner uppercase tracking-tighter`}
                                />
                            </div>

                            <div className="flex-1 overflow-auto bg-white" ref={searchResultsRef}>
                                {deduplicatedSearchInventory.length > 0 ? (
                                    <table className="min-w-full border-collapse">
                                        <thead className="sticky top-0 z-10 bg-gray-100 border-b border-gray-400 shadow-sm">
                                            <tr className={`text-[10px] font-black uppercase text-gray-500 tracking-widest`}>
                                                <th className="p-1.5 px-3 text-left border-r border-gray-200">Description of Medicine</th>
                                                <th className="p-1.5 px-3 text-left border-r border-gray-200 w-32 text-center">Code</th>
                                                <th className="p-1.5 px-3 text-left border-r border-gray-200">MFR / Brand</th>
                                                <th className="p-1.5 px-3 text-center border-r border-gray-200">Strips Stock</th>
                                                <th className="p-1.5 px-3 text-center border-r border-gray-200">Loose Stock</th>
                                                <th className="p-1.5 px-3 text-center border-r border-gray-200">Total Stock</th>
                                                <th className="p-1.5 px-3 text-right">MRP</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {deduplicatedSearchInventory.map((res, sIdx) => {
                                                const isSelected = sIdx === selectedSearchIndex;
                                                const item = res.item;
                                                const totalStock = res.batches.reduce((sum, batch) => sum + (batch.stock || 0), 0);
                                                const unitsPerPack = item.unitsPerPack || 1;
                                                const stripsStock = Math.floor(totalStock / unitsPerPack);
                                                const looseStock = totalStock % unitsPerPack;
                                                return (
                                                    <tr
                                                        key={item.id}
                                                        data-index={sIdx}
                                                        onClick={() => triggerBatchSelection(res)}
                                                        onMouseEnter={() => setSelectedSearchIndex(sIdx)}
                                                        className={`cursor-pointer transition-all border-b border-gray-100 ${isSelected ? 'bg-primary text-white scale-[1.01] z-10 shadow-xl' : 'hover:bg-yellow-50'}`}
                                                    >
                                                        <td className="p-1.5 px-3 border-r border-gray-200">
                                                            <p className={`leading-none ${matrixRowTextStyle} ${isSelected ? 'text-white' : 'text-gray-950'}`}>{item.name}</p>
                                                        </td>
                                                        <td className={`p-1.5 px-3 border-r border-gray-200 text-center font-mono ${matrixRowTextStyle} ${isSelected ? 'text-white' : 'text-primary'}`}>
                                                            {item.code}
                                                        </td>
                                                        <td className={`p-1.5 px-3 border-r border-gray-200 ${matrixRowTextStyle} ${isSelected ? 'text-white/80' : 'text-gray-500'}`}>{item.manufacturer || item.brand}</td>
                                                        <td className={`p-1.5 px-3 border-r border-gray-200 text-center ${matrixRowTextStyle} ${isSelected ? 'text-white' : (totalStock <= 0 ? 'text-red-500' : 'text-emerald-700')}`}>{stripsStock}</td>
                                                        <td className={`p-1.5 px-3 border-r border-gray-200 text-center ${matrixRowTextStyle} ${isSelected ? 'text-white' : (totalStock <= 0 ? 'text-red-500' : 'text-emerald-700')}`}>{looseStock}</td>
                                                        <td className={`p-1.5 px-3 border-r border-gray-200 text-center ${matrixRowTextStyle} ${isSelected ? 'text-white' : (totalStock <= 0 ? 'text-red-500' : 'text-emerald-700')}`}>{totalStock}</td>
                                                        <td className={`p-1.5 px-3 text-right ${matrixRowTextStyle} ${isSelected ? 'text-white' : 'text-gray-900'}`}>₹{(item.mrp || 0).toFixed(2)}</td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                ) : (
                                    <div className="h-full flex flex-col items-center justify-center opacity-20 p-20 text-center">
                                        <svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" className="mb-6"><circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" /></svg>
                                        <p className="text-4xl font-black uppercase tracking-widest">No Matches</p>
                                    </div>
                                )}
                            </div>
                        </div>

                        <div className="w-80 bg-[#f9f7d9] dark:bg-zinc-900 border-l-2 border-primary/10 flex flex-col overflow-y-auto">
                            {activeIntelItem ? (
                                <div className="flex-1 flex flex-col p-6 animate-in slide-in-from-right-4 duration-300">
                                    <div className="mb-8 pb-4 border-b border-primary/10">
                                        <div className="flex items-center gap-2 mb-4">
                                            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="text-primary"><circle cx="12" cy="12" r="10" /><path d="M12 16v-4" /><path d="M12 8h.01" /></svg>
                                            <span className="text-xs font-black uppercase tracking-[0.25em] text-primary">Intelligence Hub</span>
                                        </div>
                                        <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Current Stock Level</p>
                                        <div className="flex items-baseline gap-2">
                                            <span className="text-6xl font-black text-emerald-700 tracking-tighter">{activeIntelItem.stock}</span>
                                            <span className="text-xs font-bold text-emerald-600 uppercase">Units</span>
                                        </div>
                                    </div>

                                    <div className="space-y-6">
                                        <div className="bg-white/50 dark:bg-zinc-800/50 p-4 border border-primary/5 shadow-sm">
                                            <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-2 opacity-60">Identity & Validity</p>
                                            <p className="text-lg font-black text-gray-900 dark:text-white font-mono leading-none truncate">{activeIntelItem.batch} | {activeIntelItem.code}</p>
                                            <p className="text-[10px] font-bold text-gray-500 uppercase mt-1">Batch: {activeIntelItem.batch}</p>
                                            <p className="text-xs font-bold text-red-600 uppercase mt-2">Exp: {activeIntelItem.expiry ? String(activeIntelItem.expiry) : 'N/A'}</p>
                                        </div>

                                        <div className="bg-white/50 dark:bg-zinc-800/50 p-4 border border-primary/5 shadow-sm">
                                            <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-2 opacity-60">Pricing Vector</p>
                                            <div className="flex justify-between items-end">
                                                <div>
                                                    <p className="text-[10px] font-bold text-gray-400 uppercase">Pur Rate</p>
                                                    <p className="text-xl font-black text-blue-700">₹{(intelDetails?.lastPurRate ?? 0).toFixed(2)}</p>
                                                </div>
                                                <div className="text-right">
                                                    <p className="text-[10px] font-bold text-gray-400 uppercase">M.R.P</p>
                                                    <p className="text-xl font-black text-gray-900 dark:text-white">₹{(activeIntelItem.mrp || 0).toFixed(2)}</p>
                                                </div>
                                            </div>
                                        </div>

                                        <div className="bg-white/50 dark:bg-zinc-800/50 p-4 border border-primary/5 shadow-sm">
                                            <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-3 opacity-70">Profit Quotient</p>
                                            <div className="flex justify-between items-center mb-2">
                                                <span className="text-[11px] font-bold text-gray-500 uppercase">Net Margin</span>
                                                <span className="text-xl font-black text-emerald-600">{(intelDetails?.profitMargin ?? 0).toFixed(1)}%</span>
                                            </div>
                                            <div className="flex justify-between items-center">
                                                <span className="text-[11px] font-bold text-gray-500 uppercase">Per Unit</span>
                                                <span className="text-xl font-black text-emerald-600">₹{(intelDetails?.profitAmount ?? 0).toFixed(2)}</span>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="mt-auto pt-6 opacity-40">
                                        <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest text-center italic">Updated in Real-time</p>
                                    </div>
                                </div>
                            ) : (
                                <div className="flex-1 flex flex-col items-center justify-center p-8 text-center opacity-20">
                                    <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="mb-4"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" /><polyline points="3.27 6.96 12 12.01 20.73 6.96" /><line x1="12" y1="22.08" x2="12" y2="12" /></svg>
                                    <p className="text-xs font-black uppercase tracking-widest">Select item for live intelligence</p>
                                </div>
                            )}
                        </div>
                    </div>

                    <div className="p-4 bg-slate-100 border-t border-app-border flex justify-end gap-3 flex-shrink-0">
                        <button onClick={() => setIsSearchModalOpen(false)} className="px-8 py-3 text-[11px] font-black uppercase tracking-widest text-gray-500 hover:text-black">Discard (Esc)</button>
                        <button
                            onClick={() => {
                                const selection = deduplicatedSearchInventory[selectedSearchIndex];
                                if (selection) triggerBatchSelection(selection);
                            }}
                            className="px-16 py-4 bg-primary text-white text-[12px] font-black uppercase tracking-[0.3em] shadow-2xl active:translate-y-1 transform transition-all"
                        >
                            Select Material (Enter)
                        </button>
                    </div>
                </div>
            </Modal>

            <Modal isOpen={isRateTierModalOpen} onClose={skipTierRatesForRow} title="Maintain Tier Rates" widthClass="max-w-md">
                <div className="space-y-4 p-2">
                    <p className="text-xs font-bold text-gray-600 uppercase">Maintain Tier A / B / C rates for this product.</p>
                    <div className="grid grid-cols-1 gap-3">
                        <div>
                            <label className="text-[11px] font-bold uppercase text-gray-500">Rate A</label>
                            <input
                                ref={rateAInputRef}
                                type="number"
                                value={rateTierDraft.rateA}
                                onChange={(e) => setRateTierDraft(prev => ({ ...prev, rateA: e.target.value }))}
                                onKeyDown={(e) => handleRateInputEnter(e, 'rateB')}
                                className="w-full border border-gray-400 p-2 outline-none"
                            />
                        </div>
                        <div>
                            <label className="text-[11px] font-bold uppercase text-gray-500">Rate B</label>
                            <input
                                ref={rateBInputRef}
                                type="number"
                                value={rateTierDraft.rateB}
                                onChange={(e) => setRateTierDraft(prev => ({ ...prev, rateB: e.target.value }))}
                                onKeyDown={(e) => handleRateInputEnter(e, 'rateC')}
                                className="w-full border border-gray-400 p-2 outline-none"
                            />
                        </div>
                        <div>
                            <label className="text-[11px] font-bold uppercase text-gray-500">Rate C</label>
                            <input
                                ref={rateCInputRef}
                                type="number"
                                value={rateTierDraft.rateC}
                                onChange={(e) => setRateTierDraft(prev => ({ ...prev, rateC: e.target.value }))}
                                onKeyDown={(e) => handleRateInputEnter(e, 'action')}
                                className="w-full border border-gray-400 p-2 outline-none"
                            />
                        </div>
                    </div>
                    <div className="flex justify-end gap-2">
                        <button
                            ref={skipRateButtonRef}
                            type="button"
                            onFocus={() => setSelectedRateTierAction('skip')}
                            onKeyDown={handleRateActionKeyDown}
                            onClick={skipTierRatesForRow}
                            className={`px-4 py-2 border text-xs font-black uppercase ${selectedRateTierAction === 'skip' ? 'border-primary text-primary' : 'border-gray-400 text-gray-700'}`}
                        >
                            Skip
                        </button>
                        <button
                            ref={saveRateButtonRef}
                            type="button"
                            onFocus={() => setSelectedRateTierAction('save')}
                            onKeyDown={handleRateActionKeyDown}
                            onClick={saveTierRatesForRow}
                            className={`px-4 py-2 text-xs font-black uppercase ${selectedRateTierAction === 'save' ? 'bg-primary text-white' : 'bg-gray-200 text-gray-700'}`}
                        >
                            Save Rates
                        </button>
                    </div>
                </div>
            </Modal>

            <BatchSelectionModal
                isOpen={!!pendingBatchSelection}
                onClose={() => { setPendingBatchSelection(null); }}
                productName={pendingBatchSelection?.item.name || ''}
                batches={pendingBatchSelection?.batches || []}
                onSelect={addSelectedBatchToGrid}
            />

            <SupplierSearchModal
                isOpen={isSupplierSearchModalOpen}
                onClose={() => setIsSupplierSearchModalOpen(false)}
                suppliers={suppliers}
                onSelect={handleSupplierSelect}
                initialSearch={Supplier}
            />
        </div>
    );
});

export default PurchaseForm;
