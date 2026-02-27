import React, { useState, useRef, useEffect, useMemo, useImperativeHandle, forwardRef, useCallback } from 'react';
import Card from '../components/Card';
import SchemeModal from '../components/SchemeModal';
import Modal from '../components/Modal';
import AddMedicineModal from '../components/AddMedicineModal';
import BatchSelectionModal from '../components/BatchSelectionModal';
import WebcamCaptureModal from '../components/WebcamCaptureModal';
import CustomerSearchModal from '../components/CustomerSearchModal';
import { extractPrescription } from '../services/geminiService';
import * as storage from '../services/storageService';
import { InventoryItem, Customer, Transaction, BillItem, AppConfigurations, RegisteredPharmacy, Medicine, Purchase, FileInput } from '../types';
import { generateNewInvoiceId } from '../utils/invoice';
import { handleEnterToNextField } from '../utils/navigation';
import { fuzzyMatch } from '../utils/search';
import { getOutstandingBalance, parseNumber } from '../utils/helpers';

interface POSProps {
    inventory: InventoryItem[];
    purchases: Purchase[];
    medicines: Medicine[];
    customers: Customer[];
    onSaveOrUpdateTransaction: (transaction: Transaction, isUpdate: boolean, nextCounter?: number) => Promise<void>;
    onPrintBill: (transaction: Transaction) => void;
    currentUser: RegisteredPharmacy | null;
    config: any;
    configurations: AppConfigurations;
    billType?: 'regular' | 'non-gst';
    addNotification: (message: string, type?: 'success' | 'error' | 'warning') => void;
    transactionToEdit?: Transaction | null;
    isReadOnly?: boolean;
    onCancel?: () => void;
    onAddMedicineMaster: (med: Omit<Medicine, 'id'>) => Promise<Medicine>;
}

interface UploadedFile {
    id: string;
    data: string;
    type: 'image' | 'pdf';
    name: string;
}

const uniformTextStyle = "text-2xl font-normal tracking-tight uppercase leading-tight";
const matrixRowTextStyle = "text-2xl font-normal tracking-tight uppercase leading-tight";

const createBlankItem = (): BillItem => ({
    id: crypto.randomUUID(),
    inventoryItemId: '',
    name: '',
    mrp: 0,
    quantity: 0,
    looseQuantity: 0,
    unit: 'pack',
    gstPercent: 0,
    discountPercent: 0,
    itemFlatDiscount: 0,
});

const POS = forwardRef<any, POSProps>(({
    inventory,
    purchases,
    medicines,
    customers,
    onSaveOrUpdateTransaction,
    onPrintBill,
    currentUser,
    config,
    configurations,
    billType = 'regular',
    addNotification,
    transactionToEdit,
    isReadOnly,
    onCancel,
    onAddMedicineMaster
}, ref) => {
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
    const [customerSearch, setCustomerSearch] = useState('');
    const [customerPhone, setCustomerPhone] = useState('');
    const billCategorySelectRef = useRef<HTMLSelectElement>(null);
    const customerSearchInputRef = useRef<HTMLInputElement>(null);
    const productSearchInputRef = useRef<HTMLInputElement>(null);
    const modalSearchInputRef = useRef<HTMLInputElement>(null);
    const searchResultsRef = useRef<HTMLDivElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const dateInputRef = useRef<HTMLInputElement>(null);
    const phoneInputRef = useRef<HTMLInputElement>(null);

    const [billCategory, setBillCategory] = useState<'Cash Bill' | 'Credit Bill'>('Cash Bill');
    const [billMode, setBillMode] = useState<'GST' | 'EST'>(billType === 'non-gst' ? 'EST' : 'GST');
    const [referredBy, setReferredBy] = useState('');
    const [invoiceDate, setInvoiceDate] = useState(new Date().toISOString().split('T')[0]);
    const [cartItems, setCartItems] = useState<BillItem[]>([]);
    const [prescriptions, setPrescriptions] = useState<UploadedFile[]>([]);
    const [isSaving, setIsSaving] = useState(false);
    const [isProcessingRx, setIsProcessingRx] = useState(false);
    const [isWebcamOpen, setIsWebcamOpen] = useState(false);
    const [lumpsumDiscount, setLumpsumDiscount] = useState<number>(0);
    const [isSearchModalOpen, setIsSearchModalOpen] = useState(false);
    const [selectedSearchIndex, setSelectedSearchIndex] = useState(0);
    const [modalSearchTerm, setModalSearchTerm] = useState('');
    const [isCustomerSearchModalOpen, setIsCustomerSearchModalOpen] = useState(false);
    const [pendingBatchSelection, setPendingBatchSelection] = useState<{ item: InventoryItem; batches: InventoryItem[] } | null>(null);
    const [schemeItem, setSchemeItem] = useState<BillItem | null>(null);

    const activeRowIdRef = useRef<string | null>(null);

    const isNonGst = billMode === 'EST';
    const strictStock = configurations.displayOptions?.strictStock ?? false;
    const enableNegativeStock = configurations.displayOptions?.enableNegativeStock ?? false;
    const shouldPreventNegativeStock = strictStock && !enableNegativeStock;

    const isFieldVisible = (fieldId: string) => config?.fields?.[fieldId] !== false;

    const totals = useMemo(() => {
        let gross = 0, tradeDiscount = 0, tax = 0, schemeTotal = 0;
        cartItems.forEach(item => {
            // Formula: Amount = (P.Qty / L.Qty) × Rate
            // P.Qty = item.quantity (pack quantity)
            // L.Qty = item.looseQuantity (loose quantity)
            const packQty = item.quantity || 0;
            const looseQty = item.looseQuantity || 1; // Use 1 as fallback to avoid division by zero
            const rate = item.rate || item.mrp || 0;
            const itemGross = (packQty / looseQty) * rate;
            const itemTradeDisc = itemGross * ((item.discountPercent || 0) / 100);
            const itemNet = itemGross - itemTradeDisc - (item.schemeDiscountAmount || 0);
            const taxableValue = itemNet / (1 + ((isNonGst ? 0 : item.gstPercent) / 100));

            gross += itemGross;
            tradeDiscount += itemTradeDisc;
            schemeTotal += (item.schemeDiscountAmount || 0);
            tax += (itemNet - taxableValue);
        });
        const net = gross - tradeDiscount - schemeTotal - lumpsumDiscount;
        const roundedNet = Math.round(net);
        return { gross, tradeDiscount, schemeTotal, tax, net, roundedNet, roundOff: roundedNet - net };
    }, [cartItems, lumpsumDiscount, isNonGst]);

    useEffect(() => {
        setBillMode(billType === 'non-gst' ? 'EST' : 'GST');
    }, [billType]);

    useEffect(() => {
        if (transactionToEdit) {
            setSelectedCustomer(customers.find(c => c.id === transactionToEdit.customerId) || null);
            setCustomerSearch(transactionToEdit.customerName || '');
            setCustomerPhone(transactionToEdit.customerPhone || '');
            setReferredBy(transactionToEdit.referredBy || '');
            setInvoiceDate(transactionToEdit.date.split('T')[0]);
            setCartItems(transactionToEdit.items || []);
            setLumpsumDiscount(transactionToEdit.schemeDiscount || 0);
        } else {
            setTimeout(() => dateInputRef.current?.focus(), 150);
        }
    }, [transactionToEdit, customers]);

    const currentInvoiceNo = useMemo(() => {
        if (transactionToEdit) return transactionToEdit.id;
        const configKey = isNonGst ? 'nonGstInvoiceConfig' : 'invoiceConfig';
        const typeKey = isNonGst ? 'non-gst' : 'regular';
        const { id } = generateNewInvoiceId(configurations[configKey], typeKey);
        return id;
    }, [transactionToEdit, isNonGst, configurations, billMode]);

    const handleSave = useCallback(async () => {
        if (isSaving || cartItems.length === 0) return;

        if (shouldPreventNegativeStock) {
            for (const item of cartItems) {
                const invItem = inventory.find(i => i.id === item.inventoryItemId);
                if (invItem) {
                    const unitsPerPack = invItem.unitsPerPack || 1;
                    const requiredUnits = (item.quantity * unitsPerPack) + (item.looseQuantity || 0);
                    if (invItem.stock <= 0 || invItem.stock < requiredUnits) {
                        addNotification(`Insufficient stock for ${item.name}. Available: ${invItem.stock}`, "error");
                        return;
                    }
                }
            }
        }

        setIsSaving(true);

        const generatedId = transactionToEdit
            ? transactionToEdit.id
            : (await storage.reserveVoucherNumber(isNonGst ? 'sales-non-gst' : 'sales-gst', currentUser!)).documentNumber;

        const finalPaymentMode = billCategory === 'Credit Bill' ? 'Credit' : 'Cash';

        const transaction: Transaction = {
            id: generatedId,
            organization_id: currentUser?.organization_id || '',
            date: new Date(invoiceDate).toISOString(),
            customerName: selectedCustomer?.name || customerSearch || 'Walking Customer',
            customerId: selectedCustomer?.id,
            customerPhone: customerPhone || selectedCustomer?.phone,
            referredBy: referredBy || '',
            items: cartItems,
            total: isNonGst ? totals.roundedNet : parseFloat((totals.roundedNet + totals.tax).toFixed(2)),
            subtotal: parseFloat((totals.net - totals.tax).toFixed(2)),
            totalItemDiscount: totals.tradeDiscount,
            totalGst: totals.tax,
            schemeDiscount: lumpsumDiscount,
            roundOff: totals.roundOff,
            status: 'completed',
            paymentMode: finalPaymentMode,
            billType: isNonGst ? 'non-gst' : 'regular',
            itemCount: cartItems.length,
            prescriptionImages: prescriptions.map(p => p.data),
        };

        try {
            await onSaveOrUpdateTransaction(transaction, !!transactionToEdit);
            if (onPrintBill) onPrintBill(transaction);
            setCartItems([]);
            setPrescriptions([]);
            setSelectedCustomer(null);
            setCustomerSearch('');
            setLumpsumDiscount(0);
            setReferredBy('');
            addNotification(`Bill saved successfully. Bill No: ${transaction.id}`, "success");
        } catch (e: any) {
            const errorMessage = e?.message || String(e) || "Unknown error";
            addNotification(`Failed to save bill: ${errorMessage}`, "error");
        } finally {
            setIsSaving(false);
        }
    }, [cartItems, totals, selectedCustomer, invoiceDate, configurations, isNonGst, isSaving, onSaveOrUpdateTransaction, transactionToEdit, currentUser, customerSearch, customerPhone, onPrintBill, addNotification, lumpsumDiscount, billCategory, referredBy, prescriptions, shouldPreventNegativeStock, inventory]);

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.ctrlKey && e.key.toLowerCase() === 's') {
                e.preventDefault();
                handleSave();
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [handleSave]);

    useImperativeHandle(ref, () => ({
        handleSave,
        setCartItems,
        cartItems
    }));

    const handleProcessPrescription = async (fileInput: FileInput, fileName: string) => {
        setIsProcessingRx(true);
        try {
            const result = await extractPrescription(fileInput, currentUser?.pharmacy_name || 'Medimart');
            if (result.error) throw new Error(result.error);

            if (result.customerName && !selectedCustomer) {
                setCustomerSearch(result.customerName);
            }

            if (result.items && result.items.length > 0) {
                const newBillItems: BillItem[] = [];
                for (const aiItem of result.items) {
                    const match = inventory.find(inv => fuzzyMatch(inv.name, aiItem.name));
                    if (match) {
                        const unitsPerPack = match.unitsPerPack || 1;
                        const qty = Math.floor((aiItem.quantity || 0) / unitsPerPack);
                        const loose = (aiItem.quantity || 0) % unitsPerPack;

                        newBillItems.push({
                            id: crypto.randomUUID(),
                            inventoryItemId: match.id,
                            name: match.name,
                            brand: match.brand,
                            mrp: match.mrp,
                            quantity: qty || 1,
                            looseQuantity: loose,
                            unit: 'pack',
                            gstPercent: match.gstPercent,
                            discountPercent: selectedCustomer?.defaultDiscount || 0,
                            itemFlatDiscount: 0,
                            batch: match.batch,
                            expiry: match.expiry,
                            rate: match.mrp,
                            unitsPerPack,
                            packType: match.packType
                        });
                    } else {
                        newBillItems.push({
                            ...createBlankItem(),
                            name: aiItem.name || 'Unknown Item',
                            quantity: aiItem.quantity || 1
                        });
                    }
                }
                setCartItems(prev => [...prev.filter(i => i.name !== ''), ...newBillItems]);
                addNotification(`Extracted ${result.items.length} items from prescription.`, "success");
            }

            setPrescriptions(prev => [...prev, {
                id: crypto.randomUUID(),
                data: fileInput.data,
                type: fileInput.mimeType.includes('pdf') ? 'pdf' : 'image',
                name: fileName
            }]);
        } catch (err: any) {
            addNotification("Prescription analysis failed. Adding as attachment only.", "warning");
            setPrescriptions(prev => [...prev, {
                id: crypto.randomUUID(),
                data: fileInput.data,
                type: fileInput.mimeType.includes('pdf') ? 'pdf' : 'image',
                name: fileName
            }]);
        } finally {
            setIsProcessingRx(false);
        }
    };

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const { files } = e.target;
        if (!files) return;
        Array.from(files).forEach((file: File) => {
            const reader = new FileReader();
            reader.onloadend = () => {
                const base64 = (reader.result as string).split(',')[1];
                handleProcessPrescription({ data: base64, mimeType: file.type }, file.name);
            };
            reader.readAsDataURL(file);
        });
        if (fileInputRef.current) fileInputRef.current.value = '';
    };

    const handleWebcamCapture = (data: string, mimeType: string) => {
        handleProcessPrescription({ data, mimeType }, `Camera_${Date.now()}.jpg`);
        setIsWebcamOpen(false);
    };

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

    const handleDateKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            customerSearchInputRef.current?.focus();
        }
    };

    const handleCustomerKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            setIsCustomerSearchModalOpen(true);
        } else if (e.key === 'Escape') {
            e.preventDefault();
            phoneInputRef.current?.focus();
        }
    };

    const handleSelectCustomer = (c: Customer) => {
        setSelectedCustomer(c);
        setCustomerSearch(c.name);
        setCustomerPhone(c.phone || '');
        setIsCustomerSearchModalOpen(false);
        setTimeout(() => {
            phoneInputRef.current?.focus();
        }, 100);
    };

    const triggerBatchSelection = (productWrapper: { item: InventoryItem; batches: InventoryItem[] }) => {
        const isValidBatch = (batchNo?: string) => {
            const normalized = (batchNo || '').trim().toUpperCase();
            return normalized !== '' && !['NEW-STOCK', 'NEW-BATCH', 'N/A', 'NA'].includes(normalized);
        };

        const candidateBatches = productWrapper.batches.filter(b => isValidBatch(b.batch));

        if (candidateBatches.length === 1) {
            addSelectedBatchToGrid(candidateBatches[0]);
            return;
        }

        if (candidateBatches.length > 1) {
            setPendingBatchSelection({ item: candidateBatches[0], batches: candidateBatches });
            setIsSearchModalOpen(false);
            return;
        }

        const itemName = (productWrapper.item.name || '').toLowerCase().trim();
        const itemBrand = (productWrapper.item.brand || '').toLowerCase().trim();
        const itemCode = (productWrapper.item.code || '').toLowerCase().trim();

        const fallbackBatches = inventory.filter(inv => {
            if (!isValidBatch(inv.batch)) return false;

            const invName = (inv.name || '').toLowerCase().trim();
            const invBrand = (inv.brand || '').toLowerCase().trim();
            const invCode = (inv.code || '').toLowerCase().trim();

            const codeMatch = itemCode !== '' && invCode !== '' && invCode === itemCode;
            const nameBrandMatch = invName === itemName && invBrand === itemBrand;

            return codeMatch || nameBrandMatch;
        });

        if (fallbackBatches.length === 1) {
            addSelectedBatchToGrid(fallbackBatches[0]);
            return;
        }

        if (fallbackBatches.length > 1) {
            setPendingBatchSelection({ item: fallbackBatches[0], batches: fallbackBatches });
            setIsSearchModalOpen(false);
            return;
        }

        addSelectedBatchToGrid(productWrapper.item);
    };

    const addSelectedBatchToGrid = (batch: InventoryItem) => {
        if (shouldPreventNegativeStock && Number(batch.stock || 0) <= 0) {
            addNotification(`Insufficient stock for ${batch.name}. Available: ${Number(batch.stock || 0)}`, 'error');
            return;
        }

        let rateValue = batch.mrp;
        const globalDefaultRateTier = configurations?.displayOptions?.defaultRateTier || 'mrp';
        let rateTierToUse = selectedCustomer?.defaultRateTier !== 'none' ? selectedCustomer?.defaultRateTier : globalDefaultRateTier;

        if (rateTierToUse === 'rateA' && batch.rateA) rateValue = batch.rateA;
        else if (rateTierToUse === 'rateB' && batch.rateB) rateValue = batch.rateB;
        else if (rateTierToUse === 'rateC' && batch.rateC) rateValue = batch.rateC;
        else if (rateTierToUse === 'ptr' && batch.ptr) rateValue = batch.ptr;

        const newItemId = crypto.randomUUID();
        const newItem: BillItem = {
            id: newItemId,
            inventoryItemId: batch.id,
            name: batch.name,
            brand: batch.brand,
            mrp: batch.mrp,
            quantity: 1,
            looseQuantity: 0,
            freeQuantity: 0,
            unit: 'pack',
            gstPercent: batch.gstPercent,
            discountPercent: selectedCustomer?.defaultDiscount || 0,
            itemFlatDiscount: 0,
            batch: ['NEW-STOCK', 'NEW-BATCH'].includes((batch.batch || '').trim().toUpperCase()) ? '' : (batch.batch || ''),
            expiry: batch.expiry ? String(batch.expiry) : 'N/A',
            rate: rateValue,
            unitsPerPack: batch.unitsPerPack || 1,
            packType: batch.packType
        };

        setCartItems(prev => {
            const index = prev.findIndex(p => p.id === activeRowIdRef.current);
            if (activeRowIdRef.current && index > -1) {
                const next = [...prev];
                next[index] = newItem;
                return next;
            }
            return [...prev, newItem];
        });

        setSearchTerm('');
        setIsSearchModalOpen(false);
        setPendingBatchSelection(null);
        activeRowIdRef.current = null;

        setTimeout(() => {
            const qtyInput = document.getElementById(`qty-p-${newItemId}`);
            if (qtyInput) {
                (qtyInput as HTMLInputElement).focus();
                (qtyInput as HTMLInputElement).select();
            }
        }, 50);
    };

    const handleUpdateCartItem = (id: string, field: keyof BillItem, value: any) => {
        setCartItems(prev => prev.map(item => {
            if (item.id === id) {
                const updated = { ...item, [field]: value };
                if (['quantity', 'looseQuantity', 'freeQuantity', 'discountPercent', 'rate', 'itemFlatDiscount', 'mrp', 'gstPercent'].includes(field as string)) {
                    (updated as any)[field] = value === '' ? 0 : (parseFloat(value) || 0);
                }
                return updated;
            }
            return item;
        }));
    };

    const handleApplyScheme = useCallback((itemId: string, schemeQty: number, mode: any, value: number, discountAmount: number, discountPercent: number, schemeTotalQty?: number) => {
        setCartItems(prev => prev.map(item => {
            if (item.id === itemId) {
                return {
                    ...item,
                    schemeQty,
                    schemeMode: mode,
                    schemeValue: value,
                    schemeDiscountAmount: discountAmount,
                    schemeDiscountPercent: discountPercent,
                    schemeTotalQty
                };
            }
            return item;
        }));
        setSchemeItem(null);
        setTimeout(() => productSearchInputRef.current?.focus(), 100);
    }, []);

    const handleClearScheme = useCallback((itemId: string) => {
        setCartItems(prev => prev.map(item => {
            if (item.id === itemId) {
                const { schemeQty, schemeMode, schemeValue, schemeDiscountAmount, schemeDiscountPercent, schemeTotalQty, ...rest } = item;
                return rest;
            }
            return item;
        }));
        setSchemeItem(null);
        setTimeout(() => productSearchInputRef.current?.focus(), 100);
    }, []);

    const openSearchModal = useCallback((rowId: string, initialValue: string) => {
        if (isReadOnly) return;
        activeRowIdRef.current = rowId;
        setModalSearchTerm(initialValue);
        setIsSearchModalOpen(true);
        setSelectedSearchIndex(0);
        setTimeout(() => modalSearchInputRef.current?.focus(), 150);
    }, [isReadOnly]);

    const handleDeleteRow = useCallback((id: string, index: number) => {
        if (isReadOnly) return;

        setCartItems(prev => {
            if (prev.length <= 1) {
                return [createBlankItem()];
            }
            const newItems = prev.filter(item => item.id !== id);
            const nextFocusIdx = index < newItems.length ? index : newItems.length - 1;
            const itemToFocus = newItems[nextFocusIdx];
            if (itemToFocus) {
                setTimeout(() => {
                    const qtyInput = document.getElementById(`qty-p-${itemToFocus.id}`);
                    qtyInput?.focus();
                    if (qtyInput instanceof HTMLInputElement) qtyInput.select();
                }, 10);
            }
            return newItems;
        });
    }, [isReadOnly]);

    const handleItemKeyDown = (e: React.KeyboardEvent, id: string, index: number) => {
        if (e.key === 'Delete') {
            e.preventDefault();
            handleDeleteRow(id, index);
        } else if (e.key === 'Backspace') {
            const target = e.target as HTMLInputElement;
            if (target.value === '') {
                e.preventDefault();
                handleDeleteRow(id, index);
            }
        }
    };

    const handleRowKeyNavigation = useCallback((e: React.KeyboardEvent, id: string) => {
        const fields = [
            `name-${id}`,
            `qty-p-${id}`,
            `qty-l-${id}`,
            `free-${id}`,
            `rate-${id}`,
            `disc-${id}`,
            `gst-${id}`,
            `scheme-${id}`
        ].filter(id => {
            const el = document.getElementById(id);
            return el && !el.hasAttribute('disabled');
        });

        const target = e.target as HTMLElement;
        const currentId = target.id;
        const currentIndex = fields.indexOf(currentId);

        if (currentIndex === -1) return;

        const moveNext = () => {
            if (currentIndex < fields.length - 1) {
                e.preventDefault();
                e.stopPropagation();
                const nextEl = document.getElementById(fields[currentIndex + 1]);
                nextEl?.focus();
                if (nextEl instanceof HTMLInputElement) nextEl.select();
            } else {
                if (e.key === 'Enter' || e.key === 'Tab' || e.key === 'ArrowRight') {
                    e.preventDefault();
                    e.stopPropagation();
                    const itemIdx = cartItems.findIndex(i => i.id === id);
                    if (itemIdx < cartItems.length - 1) {
                        const nextId = cartItems[itemIdx + 1].id;
                        const nextNameEl = document.getElementById(`name-${nextId}`);
                        nextNameEl?.focus();
                        if (nextNameEl instanceof HTMLInputElement) nextNameEl.select();
                    } else {
                        productSearchInputRef.current?.focus();
                    }
                }
            }
        };

        const movePrev = () => {
            if (currentIndex > 0) {
                e.preventDefault();
                e.stopPropagation();
                const prevEl = document.getElementById(fields[currentIndex - 1]);
                prevEl?.focus();
                if (prevEl instanceof HTMLInputElement) prevEl.select();
            } else {
                if (e.key === 'ArrowLeft' || (e.key === 'Tab' && e.shiftKey)) {
                    const itemIdx = cartItems.findIndex(i => i.id === id);
                    if (itemIdx > 0) {
                        e.preventDefault();
                        e.stopPropagation();
                        const prevId = cartItems[itemIdx - 1].id;
                        const prevLastField = `scheme-${prevId}`;
                        const prevLastEl = document.getElementById(prevLastField);
                        prevLastEl?.focus();
                    }
                }
            }
        };

        if ((e.key === 'Tab' && !e.shiftKey) || e.key === 'Enter' || e.key === 'ArrowRight') {
            moveNext();
        } else if (e.key === 'ArrowLeft' || (e.key === 'Tab' && e.shiftKey)) {
            movePrev();
        }
    }, [cartItems]);

    const handleReferredByKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            if (cartItems.length > 0) {
                const firstId = cartItems[0].id;
                document.getElementById(`name-${firstId}`)?.focus();
            } else {
                productSearchInputRef.current?.focus();
            }
        }
    };

    return (
        <div className="flex flex-col h-full bg-app-bg overflow-hidden" onKeyDown={handleEnterToNextField}>
            <div className="bg-primary text-white h-7 flex items-center px-4 justify-between border-b border-gray-600 shadow-md flex-shrink-0">
                <span className="text-[10px] font-black uppercase tracking-widest">
                    {isNonGst ? 'Estimate Billing (Non-GST)' : 'Accounting Voucher Creation (Sales)'}
                </span>
                <span className="text-[10px] font-black uppercase text-accent">No. {currentInvoiceNo}</span>
            </div>

            <div className="p-2 flex-1 flex flex-col gap-2 overflow-hidden">
                <Card className="p-1.5 bg-white dark:bg-card-bg border border-app-border rounded-none grid grid-cols-1 md:grid-cols-5 gap-2 items-end flex-shrink-0">
                    {isFieldVisible('colDate') && (
                        <div>
                            <label className="text-[9px] font-bold text-gray-500 uppercase block mb-0.5 ml-0.5">Date</label>
                            <input
                                ref={dateInputRef}
                                type="date"
                                value={invoiceDate}
                                onChange={e => setInvoiceDate(e.target.value)}
                                onKeyDown={handleDateKeyDown}
                                className="w-full h-8 border border-gray-400 p-1 text-xs font-bold outline-none focus:bg-yellow-50"
                                disabled={isReadOnly}
                            />
                        </div>
                    )}
                    {isFieldVisible('colCustomer') && (
                        <div className="md:col-span-2 relative">
                            <label className="text-[9px] font-bold text-gray-500 uppercase block mb-0.5 ml-0.5">Particulars (Customer Name)</label>
                            <input
                                ref={customerSearchInputRef}
                                type="text"
                                className="w-full h-8 border border-gray-400 p-1 text-xs font-bold uppercase focus:bg-yellow-50 outline-none"
                                value={customerSearch}
                                onChange={e => {
                                    setCustomerSearch(e.target.value);
                                    setSelectedCustomer(null);
                                }}
                                onKeyDown={handleCustomerKeyDown}
                                autoComplete="off"
                                placeholder="Enter for selection, Esc to skip..."
                                disabled={isReadOnly}
                            />
                        </div>
                    )}
                    {isFieldVisible('colPhone') && (
                        <div>
                            <label className="text-[9px] font-bold text-gray-500 uppercase block mb-0.5 ml-0.5">Phone Number</label>
                            <input
                                ref={phoneInputRef}
                                type="text"
                                value={customerPhone}
                                onChange={e => setCustomerPhone(e.target.value)}
                                className="w-full h-8 border border-gray-400 p-1 text-xs font-bold outline-none focus:bg-yellow-50"
                                placeholder="Customer Phone"
                                disabled={isReadOnly}
                            />
                        </div>
                    )}
                    {isFieldVisible('colReferred') && (
                        <div>
                            <label className="text-[9px] font-bold text-gray-500 uppercase block mb-0.5 ml-0.5">Referred By</label>
                            <input
                                type="text"
                                value={referredBy}
                                onChange={e => setReferredBy(e.target.value)}
                                onKeyDown={handleReferredByKeyDown}
                                className="w-full h-8 border border-gray-400 p-1 text-xs font-bold outline-none uppercase focus:bg-yellow-50"
                                placeholder="Doctor Name"
                                disabled={isReadOnly}
                            />
                        </div>
                    )}
                </Card>

                <Card className="flex-1 flex flex-col p-0 tally-border !rounded-none overflow-hidden shadow-inner bg-white dark:bg-zinc-800">
                    <div className="flex-1 overflow-auto">
                        <table className="min-w-full border-collapse text-sm">
                            <thead className="sticky top-0 bg-gray-100 dark:bg-zinc-900 border-b border-gray-400 z-10">
                                <tr className="text-[10px] font-black uppercase text-gray-600 h-9">
                                    <th className="p-2 border-r border-gray-400 text-left w-10">Sl.</th>
                                    {isFieldVisible('colName') && <th className="p-2 border-r border-gray-400 text-left w-72">Name of Item</th>}
                                    {isFieldVisible('colBatch') && <th className="p-2 border-r border-gray-400 text-center w-24">Batch</th>}
                                    {isFieldVisible('colPack') && <th className="p-2 border-r border-gray-400 text-center w-16">Pack</th>}
                                    {isFieldVisible('colMrp') && <th className="p-2 border-r border-gray-400 text-right w-24">MRP</th>}
                                    {isFieldVisible('colPQty') && <th className="p-2 border-r border-gray-400 text-center w-16">P.Qty</th>}
                                    {isFieldVisible('colLQty') && <th className="p-2 border-r border-gray-400 text-center w-16">L.Qty</th>}
                                    {isFieldVisible('colFree') && <th className="p-2 border-r border-gray-400 text-center w-16">Free</th>}
                                    {isFieldVisible('colRate') && <th className="p-2 border-r border-gray-400 text-right w-24">Rate</th>}
                                    {isFieldVisible('colDisc') && <th className="p-2 border-r border-gray-400 text-center w-16">Disc%</th>}
                                    {isFieldVisible('colGst') && <th className="p-2 border-r border-gray-400 text-center w-16">GST%</th>}
                                    {isFieldVisible('colSch') && <th className="p-2 border-r border-gray-400 text-center w-20">Sch%</th>}
                                    {isFieldVisible('colAmount') && <th className="p-2 text-right w-32">Amount</th>}
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-200">
                                {cartItems.map((item, idx) => {
                                    // Formula: Amount = (P.Qty / L.Qty) × Rate
                                    // P.Qty = item.quantity (pack quantity)
                                    // L.Qty = item.looseQuantity (loose quantity)
                                    const packQty = item.quantity || 0;
                                    const looseQty = item.looseQuantity || 1; // Use 1 as fallback to avoid division by zero
                                    const rate = item.rate || item.mrp || 0;
                                    const lineGross = (packQty / looseQty) * rate;
                                    const tradeDiscAmt = lineGross * ((item.discountPercent || 0) / 100);
                                    const lineAmount = lineGross - tradeDiscAmt - (item.schemeDiscountAmount || 0);

                                    return (
                                        <tr key={item.id} className="hover:bg-gray-50 group h-10">
                                            <td className={`p-2 border-r border-gray-200 text-center text-gray-400 ${uniformTextStyle}`}>{idx + 1}</td>
                                            {isFieldVisible('colName') && (
                                                <td className={`p-2 border-r border-gray-200 text-primary uppercase w-72 truncate ${uniformTextStyle}`} title={item.name}>
                                                    <input
                                                        id={`name-${item.id}`}
                                                        type="text"
                                                        value={item.name}
                                                        onChange={e => handleUpdateCartItem(item.id, 'name', e.target.value)}
                                                        onKeyDown={e => {
                                                            handleItemKeyDown(e, item.id, idx);
                                                            handleRowKeyNavigation(e, item.id);
                                                        }}
                                                        className={`w-full bg-transparent border-none outline-none ${uniformTextStyle}`}
                                                        disabled={isReadOnly}
                                                    />
                                                </td>
                                            )}
                                            {isFieldVisible('colBatch') && <td className={`p-2 border-r border-gray-200 text-center font-mono ${uniformTextStyle}`}>{item.batch}</td>}
                                            {isFieldVisible('colPack') && <td className={`p-2 border-r border-gray-200 text-center font-mono ${uniformTextStyle}`}>{item.packType?.trim() || item.unitsPerPack || 1}</td>}
                                            {isFieldVisible('colMrp') && <td className={`p-2 border-r border-gray-200 text-right text-gray-600 ${uniformTextStyle}`}>₹{(item.mrp || 0).toFixed(2)}</td>}
                                            {isFieldVisible('colPQty') && (
                                                <td className={`p-2 border-r border-gray-200 text-center ${uniformTextStyle}`}>
                                                    <input
                                                        id={`qty-p-${item.id}`}
                                                        type="number"
                                                        value={item.quantity === 0 ? '' : item.quantity}
                                                        onChange={e => handleUpdateCartItem(item.id, 'quantity', e.target.value)}
                                                        onKeyDown={e => {
                                                            handleItemKeyDown(e, item.id, idx);
                                                            handleRowKeyNavigation(e, item.id);
                                                        }}
                                                        className="w-full text-center bg-transparent font-normal no-spinner outline-none"
                                                        placeholder="0"
                                                        disabled={isReadOnly}
                                                    />
                                                </td>
                                            )}
                                            {isFieldVisible('colLQty') && (
                                                <td className={`p-2 border-r border-gray-200 text-center ${uniformTextStyle}`}>
                                                    <input
                                                        id={`qty-l-${item.id}`}
                                                        type="number"
                                                        value={item.looseQuantity === 0 ? '' : item.looseQuantity}
                                                        onChange={e => handleUpdateCartItem(item.id, 'looseQuantity', e.target.value)}
                                                        onKeyDown={e => {
                                                            handleItemKeyDown(e, item.id, idx);
                                                            handleRowKeyNavigation(e, item.id);
                                                        }}
                                                        className="w-full text-center bg-transparent font-normal no-spinner outline-none text-gray-500"
                                                        placeholder="0"
                                                        disabled={isReadOnly}
                                                    />
                                                </td>
                                            )}
                                            {isFieldVisible('colFree') && (
                                                <td className={`p-2 border-r border-gray-200 text-center ${uniformTextStyle}`}>
                                                    <input
                                                        id={`free-${item.id}`}
                                                        type="number"
                                                        value={item.freeQuantity === 0 ? '' : item.freeQuantity}
                                                        onChange={e => handleUpdateCartItem(item.id, 'freeQuantity', e.target.value)}
                                                        onKeyDown={e => {
                                                            handleItemKeyDown(e, item.id, idx);
                                                            handleRowKeyNavigation(e, item.id);
                                                        }}
                                                        className="w-12 text-center bg-transparent font-normal no-spinner outline-none text-emerald-700"
                                                        disabled={isReadOnly}
                                                    />
                                                </td>
                                            )}
                                            {isFieldVisible('colRate') && (
                                                <td className={`p-2 border-r border-gray-200 text-right font-normal ${uniformTextStyle}`}>
                                                    <div className="flex items-center justify-end">
                                                        <span className="mr-0.5 text-[10px] opacity-40">₹</span>
                                                        <input
                                                            id={`rate-${item.id}`}
                                                            type="number"
                                                            value={item.rate === 0 ? '' : item.rate}
                                                            onChange={e => handleUpdateCartItem(item.id, 'rate', e.target.value)}
                                                            onKeyDown={e => {
                                                                handleItemKeyDown(e, item.id, idx);
                                                                handleRowKeyNavigation(e, item.id);
                                                            }}
                                                            className="w-16 text-right bg-transparent font-black no-spinner outline-none border-b border-dashed border-gray-300 focus:border-primary"
                                                            disabled={isReadOnly}
                                                        />
                                                    </div>
                                                </td>
                                            )}
                                            {isFieldVisible('colDisc') && (
                                                <td className={`p-2 border-r border-gray-200 text-center text-red-700 ${uniformTextStyle}`}>
                                                    <input
                                                        id={`disc-${item.id}`}
                                                        type="number"
                                                        value={item.discountPercent === 0 ? '' : item.discountPercent}
                                                        onChange={e => handleUpdateCartItem(item.id, 'discountPercent', e.target.value)}
                                                        onKeyDown={e => {
                                                            handleItemKeyDown(e, item.id, idx);
                                                            handleRowKeyNavigation(e, item.id);
                                                        }}
                                                        className="w-12 text-center bg-transparent font-normal no-spinner outline-none"
                                                        disabled={isReadOnly}
                                                    />
                                                </td>
                                            )}
                                            {isFieldVisible('colGst') && (
                                                <td className={`p-2 border-r border-gray-200 text-center text-gray-600 ${uniformTextStyle}`}>
                                                    <input
                                                        id={`gst-${item.id}`}
                                                        type="number"
                                                        value={item.gstPercent === 0 ? '' : item.gstPercent}
                                                        onChange={e => handleUpdateCartItem(item.id, 'gstPercent', e.target.value)}
                                                        onKeyDown={e => {
                                                            handleItemKeyDown(e, item.id, idx);
                                                            handleRowKeyNavigation(e, item.id);
                                                        }}
                                                        className="w-12 text-center bg-transparent font-normal no-spinner outline-none"
                                                        disabled={isReadOnly}
                                                    />
                                                </td>
                                            )}
                                            {isFieldVisible('colSch') && (
                                                <td className={`p-2 border-r border-gray-400 text-center ${uniformTextStyle}`}>
                                                    <button
                                                        id={`scheme-${item.id}`}
                                                        onClick={() => !isReadOnly && setSchemeItem(item)}
                                                        onKeyDown={e => {
                                                            if (e.key === 'Enter') {
                                                                e.preventDefault();
                                                                e.stopPropagation();
                                                                setSchemeItem(item);
                                                            } else {
                                                                handleItemKeyDown(e, item.id, idx);
                                                                handleRowKeyNavigation(e, item.id);
                                                            }
                                                        }}
                                                        className={`px-2 py-0.5 text-[10px] font-normal uppercase rounded border border-dashed transition-all ${item.schemeMode ? 'bg-emerald-50 text-emerald-700 border-emerald-300' : 'bg-gray-50 text-gray-400 border-gray-300 hover:text-primary hover:border-primary'}`}
                                                        disabled={isReadOnly}
                                                    >
                                                        {item.schemeDiscountPercent ? `${item.schemeDiscountPercent.toFixed(1)}%` : 'Apply'}
                                                    </button>
                                                </td>
                                            )}
                                            {isFieldVisible('colAmount') && <td className={`p-2 text-right text-gray-900 ${uniformTextStyle}`}>₹{(lineAmount || 0).toFixed(2)}</td>}
                                        </tr>
                                    );
                                })}
                                {!isReadOnly && (
                                    <tr className="bg-yellow-50/30 h-10">
                                        <td className={`p-2 border-r border-gray-200 text-center text-gray-400 ${uniformTextStyle}`}>{cartItems.length + 1}</td>
                                        <td className="p-2 border-r border-gray-200 relative w-72">
                                            <input
                                                ref={productSearchInputRef}
                                                type="text"
                                                className={`w-full bg-transparent outline-none ${uniformTextStyle}`}
                                                placeholder="Type item name or code..."
                                                value={searchTerm}
                                                onChange={e => {
                                                    const val = e.target.value;
                                                    setSearchTerm(val);
                                                    if (!activeRowIdRef.current) {
                                                        const tempId = crypto.randomUUID();
                                                        activeRowIdRef.current = tempId;
                                                        setCartItems(prev => [...prev, { ...createBlankItem(), id: tempId, name: val }]);
                                                        openSearchModal(tempId, val);
                                                    } else {
                                                        openSearchModal(activeRowIdRef.current, val);
                                                    }
                                                }}
                                                onFocus={(e) => {
                                                    const val = e.target.value;
                                                    const tempId = crypto.randomUUID();
                                                    activeRowIdRef.current = tempId;
                                                    openSearchModal(tempId, val);
                                                }}
                                                autoComplete="off"
                                            />
                                        </td>
                                        <td colSpan={11} className="border-r border-gray-200"></td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </Card>

                <div className="flex justify-between items-stretch flex-shrink-0 gap-4 min-h-[140px]">
                    <div className="w-80 bg-[#e5f0f0] p-4 tally-border !rounded-none shadow-md flex flex-col justify-center">
                        <div className="space-y-1.5 font-bold text-[11px] uppercase tracking-tight">
                            <div className="flex justify-between text-gray-500"><span>Gross</span> <span className="text-sm">₹{(totals.gross || 0).toFixed(2)}</span></div>
                            <div className="flex justify-between text-red-600"><span>Trade Discount</span> <span className="text-sm">-₹{(totals.tradeDiscount || 0).toFixed(2)}</span></div>
                            <div className="flex justify-between text-emerald-600"><span>Scheme Benefit</span> <span className="text-sm">-₹{(totals.schemeTotal || 0).toFixed(2)}</span></div>
                            <div className="flex justify-between text-indigo-700 items-center">
                                <span>Bill Discount</span>
                                <input
                                    type="number"
                                    value={lumpsumDiscount === 0 ? '' : lumpsumDiscount}
                                    onChange={e => setLumpsumDiscount(parseFloat(e.target.value) || 0)}
                                    className="w-20 text-right bg-white border border-gray-300 font-normal no-spinner outline-none px-1 py-0.5"
                                    disabled={isReadOnly}
                                />
                            </div>
                            {!isNonGst && <div className="flex justify-between text-blue-700"><span>Tax (GST)</span> <span className="text-sm">+₹{(totals.tax || 0).toFixed(2)}</span></div>}
                            <div className="border-t border-gray-400 pt-2 mt-1 flex justify-between text-2xl font-black text-primary">
                                <span>TOTAL</span>
                                <span>₹{((totals.roundedNet + (isNonGst ? 0 : totals.tax)) || 0).toFixed(2)}</span>
                            </div>
                        </div>
                    </div>

                    <div className="flex-1">
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
                                    {isFieldVisible('intelIdentity') && (
                                        <div className="bg-white/60 p-2.5 border border-gray-200 rounded-none flex flex-col justify-center">
                                            <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest leading-none mb-1.5 opacity-60">Identity & Validity</p>
                                            <div className="flex flex-col gap-0.5">
                                                <p className="text-sm font-black text-primary uppercase font-mono truncate">{activeIntelItem.batch} | {activeIntelItem.code}</p>
                                                <p className="text-xs font-bold text-red-600 uppercase">Expires: {activeIntelItem.expiry}</p>
                                            </div>
                                        </div>
                                    )}

                                    {isFieldVisible('intelPricing') && (
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
                                    )}

                                    {isFieldVisible('intelProfit') && (
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
                                    )}
                                </div>
                            </div>
                        ) : (
                            <div className="h-full border-2 border-dashed border-gray-300 flex flex-col items-center justify-center p-4 rounded-none">
                                <div className="flex flex-col items-center flex-1 justify-center w-full">
                                    {isFieldVisible('optPrescription') && (
                                        <>
                                            <h4 className="text-[10px] font-black text-primary uppercase tracking-[0.2em] mb-4 text-center">Prescription Management</h4>

                                            <div className="w-full flex flex-wrap justify-center gap-3 mb-6">
                                                {prescriptions.map((p) => (
                                                    <div key={p.id} className="relative group">
                                                        <div className="w-16 h-16 border-2 border-primary/20 rounded-none overflow-hidden bg-white shadow-md">
                                                            {p.type === 'image' ? (
                                                                <img src={p.data.startsWith('data:') ? p.data : `data:image/jpeg;base64,${p.data}`} alt={p.name} className="w-full h-full object-cover" />
                                                            ) : (
                                                                <div className="w-full h-full flex items-center justify-center text-red-500">
                                                                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" /><polyline points="14 2 14 8 20 8" /></svg>
                                                                </div>
                                                            )}
                                                        </div>
                                                        <button
                                                            onClick={() => setPrescriptions(prev => prev.filter(x => x.id !== p.id))}
                                                            className="absolute -top-2 -right-2 bg-red-600 text-white rounded-full w-5 h-5 flex items-center justify-center shadow-lg transition-opacity group-hover:opacity-100 opacity-100"
                                                        >
                                                            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                                                        </button>
                                                    </div>
                                                ))}

                                                {!isReadOnly && (
                                                    <>
                                                        <button
                                                            onClick={() => fileInputRef.current?.click()}
                                                            disabled={isProcessingRx}
                                                            className="w-16 h-16 border-2 border-dashed border-primary/20 rounded-none flex flex-col items-center justify-center text-primary/40 hover:bg-primary/5 hover:border-primary/40 transition-all disabled:opacity-50"
                                                        >
                                                            {isProcessingRx ? <div className="w-4 h-4 border-2 border-primary/20 border-t-primary rounded-full animate-spin"></div> : <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>}
                                                            <span className="text-[8px] font-black mt-1 uppercase">{isProcessingRx ? 'SCAN' : 'ADD Rx'}</span>
                                                        </button>
                                                        <button
                                                            onClick={() => setIsWebcamOpen(true)}
                                                            className="w-16 h-16 border-2 border-dashed border-primary/20 rounded-none flex flex-col items-center justify-center text-primary/40 hover:bg-primary/5 hover:border-primary/40 transition-all"
                                                        >
                                                            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z" /><circle cx="12" cy="13" r="4" /></svg>
                                                            <span className="text-[8px] font-black mt-1 uppercase">CAMERA</span>
                                                        </button>
                                                    </>
                                                )}
                                            </div>
                                        </>
                                    )}

                                    <div className="flex flex-col items-center text-gray-300">
                                        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" className="mb-2 opacity-30"><path d="m21 21-4.3-4.3" /><circle cx="11" cy="11" r="8" /><path d="M11 8v6" /><path d="M8 11h6" /></svg>
                                        <p className="text-[11px] font-black uppercase tracking-[0.4em] italic">Scan Rx or type name for live intel</p>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>

                    <div className="flex flex-col gap-2 w-56 self-stretch justify-end">
                        {isFieldVisible('optBillingCategory') && (
                            <div className="bg-white p-2 tally-border shadow-sm">
                                <label className="text-[9px] font-bold text-gray-500 uppercase block mb-1">Billing Category</label>
                                <select
                                    ref={billCategorySelectRef}
                                    value={billCategory}
                                    onChange={e => setBillCategory(e.target.value as any)}
                                    className="w-full border border-gray-300 p-1.5 text-xs font-black uppercase outline-none focus:bg-yellow-50 h-8"
                                    disabled={isReadOnly}
                                >
                                    <option value="Cash Bill">Cash Bill</option>
                                    <option value="Credit Bill">Credit Bill</option>
                                </select>
                            </div>
                        )}
                        <button
                            onClick={() => { if (confirm("Discard current voucher?")) { setCartItems([]); if (onCancel) onCancel(); } }}
                            className="w-full py-3 tally-border bg-white font-black text-[11px] hover:bg-red-50 text-red-600 transition-colors uppercase tracking-[0.2em] shadow-sm"
                        >
                            Discard
                        </button>
                        <button
                            onClick={handleSave}
                            disabled={isSaving || isReadOnly || cartItems.length === 0}
                            className="w-full py-6 tally-button-primary shadow-2xl active:translate-y-1 uppercase tracking-widest text-[12px] flex items-center justify-center gap-2"
                        >
                            {isSaving ? (
                                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                            ) : null}
                            {isSaving ? 'Saving' : 'Accept (Ent)'}
                        </button>
                    </div>
                </div>
            </div>

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
                                    {isFieldVisible('intelHub') && (
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
                                    )}

                                    <div className="space-y-6">
                                        {isFieldVisible('intelIdentity') && (
                                            <div className="bg-white/50 dark:bg-zinc-800/50 p-4 border border-primary/5 shadow-sm">
                                                <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-2 opacity-60">Identity & Validity</p>
                                                <p className="text-lg font-black text-gray-900 dark:text-white font-mono leading-none truncate">{activeIntelItem.batch} | {activeIntelItem.code}</p>
                                                <p className="text-[10px] font-bold text-gray-500 uppercase mt-1">Batch: {activeIntelItem.batch}</p>
                                                <p className="text-xs font-bold text-red-600 uppercase mt-2">Exp: {activeIntelItem.expiry ? String(activeIntelItem.expiry) : 'N/A'}</p>
                                            </div>
                                        )}

                                        {isFieldVisible('intelPricing') && (
                                            <div className="bg-white/50 dark:bg-zinc-800/50 p-4 border border-primary/5 shadow-sm">
                                                <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-2 opacity-60">Pricing Vector</p>
                                                <div className="flex justify-between items-end">
                                                    <div>
                                                        <p className="text-[10px] font-bold text-gray-400 uppercase">Pur Rate</p>
                                                        <p className="text-sm font-black text-blue-700">₹{(intelDetails?.lastPurRate ?? 0).toFixed(2)}</p>
                                                    </div>
                                                    <div className="text-right">
                                                        <p className="text-[10px] font-bold text-gray-400 uppercase">M.R.P</p>
                                                        <p className="text-xl font-black text-gray-900 dark:text-white">₹{(activeIntelItem.mrp || 0).toFixed(2)}</p>
                                                    </div>
                                                </div>
                                            </div>
                                        )}

                                        {isFieldVisible('intelProfit') && (
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
                                        )}
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

            <CustomerSearchModal
                isOpen={isCustomerSearchModalOpen}
                onClose={() => {
                    setIsCustomerSearchModalOpen(false);
                    setTimeout(() => phoneInputRef.current?.focus(), 100);
                }}
                customers={customers}
                onSelect={handleSelectCustomer}
                initialSearch={customerSearch}
            />

            {schemeItem && (
                <SchemeModal
                    isOpen={!!schemeItem}
                    onClose={() => { setSchemeItem(null); setTimeout(() => productSearchInputRef.current?.focus(), 100); }}
                    item={schemeItem}
                    onApply={handleApplyScheme}
                    onClear={handleClearScheme}
                />
            )}

            <BatchSelectionModal
                isOpen={!!pendingBatchSelection}
                onClose={() => { setPendingBatchSelection(null); setTimeout(() => productSearchInputRef.current?.focus(), 100); }}
                productName={pendingBatchSelection?.item.name || ''}
                batches={pendingBatchSelection?.batches || []}
                onSelect={addSelectedBatchToGrid}
            />

            <WebcamCaptureModal
                isOpen={isWebcamOpen}
                onClose={() => setIsWebcamOpen(false)}
                onCapture={handleWebcamCapture}
            />

            <input
                ref={fileInputRef}
                type="file"
                className="hidden"
                multiple
                accept="image/*,application/pdf"
                onChange={handleFileChange}
            />
        </div>
    );
});

export default POS;