import React, { useState, useMemo, useEffect, useRef } from 'react';
import Card from '../components/Card';
import Modal from '../components/Modal';
import type { Distributor, InventoryItem, PurchaseOrderItem, PurchaseOrder, Medicine, SupplierProductMap } from '../types';
import { PurchaseOrderStatus } from '../types';
import SharePurchaseOrderModal from '../components/SharePurchaseOrderModal';
import { parseNetworkAndApiError } from '../utils/error';

interface PurchaseOrdersProps {
  distributors: Distributor[];
  inventory: InventoryItem[];
  medicines: Medicine[];
  mappings: SupplierProductMap[];
  purchaseOrders: PurchaseOrder[];
  onAddPurchaseOrder: (po: Omit<PurchaseOrder, 'id' | 'serialId'>, serialId: string) => void;
  onReservePONumber: () => Promise<string>;
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

type SearchCatalogItem = {
  id: string;
  name: string;
  code?: string;
  sku?: string;
  supplierItemName?: string;
  source: 'inventory' | 'material';
  inventoryItem?: InventoryItem;
  medicine?: Medicine;
  mappedSupplierIds: string[];
};

type GridColumnKey =
    | 'name'
    | 'itemCode'
    | 'supplierItemName'
    | 'packType'
    | 'unitOfMeasurement'
    | 'quantity'
    | 'estimatedRate'
    | 'discountPercent'
    | 'gstPercent'
    | 'expectedDeliveryDate'
    | 'notes';

const GRID_COLUMN_ORDER: GridColumnKey[] = [
    'name',
    'itemCode',
    'supplierItemName',
    'packType',
    'unitOfMeasurement',
    'quantity',
    'estimatedRate',
    'discountPercent',
    'gstPercent',
    'expectedDeliveryDate',
    'notes'
];

const getDefaultOrderDate = () => new Date().toISOString().split('T')[0];

const createEmptyLineItem = (): PurchaseOrderItem => ({
  id: crypto.randomUUID(),
  name: '',
  brand: '',
  quantity: 0,
  freeQuantity: 0,
  purchasePrice: 0,
  estimatedRate: 0,
  discountPercent: 0,
  gstPercent: 0,
  lineAmount: 0,
  discountAmount: 0,
  gstAmount: 0,
  estimatedAmount: 0,
  expectedDeliveryDate: '',
  notes: ''
});

const isLineItemEmpty = (line: PurchaseOrderItem): boolean => {
    const hasText = [
        line.name,
        line.brand,
        line.itemCode,
        line.sku,
        line.supplierItemName,
        line.packType,
        line.unitOfMeasurement,
        line.expectedDeliveryDate,
        line.notes
    ].some(value => (value || '').toString().trim().length > 0);

    const hasNumbers = [
        Number(line.quantity || 0),
        Number(line.freeQuantity || 0),
        Number(line.estimatedRate ?? line.purchasePrice ?? 0),
        Number(line.discountPercent || 0),
        Number(line.gstPercent || 0),
        Number(line.mrp || 0)
    ].some(value => value > 0);

    return !hasText && !hasNumbers && !line.inventoryItemId && !line.medicineId;
};

const isLineItemComplete = (line: PurchaseOrderItem): boolean => {
    if (!line.name?.trim()) return false;
    if (Number(line.quantity || 0) <= 0) return false;
    const rate = Number(line.estimatedRate ?? line.purchasePrice ?? 0);
    return Number.isFinite(rate) && rate >= 0;
};

const normalizeLineItems = (rows: PurchaseOrderItem[]): PurchaseOrderItem[] => {
    const nonEmptyRows = rows.filter(row => !isLineItemEmpty(row));
    return [...nonEmptyRows, createEmptyLineItem()];
};

const PurchaseOrdersPage = React.forwardRef<any, PurchaseOrdersProps>(({ 
    distributors, 
    inventory,
    medicines,
    mappings,
    purchaseOrders, 
    onAddPurchaseOrder, 
    onReservePONumber,
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

    const [statusFilter, setStatusFilter] = useState<PurchaseOrderStatus | 'all'>(initialStatusFilter);
    const [selectedPO, setSelectedPO] = useState<PurchaseOrder | null>(null);
    const [isShareModalOpen, setIsShareModalOpen] = useState(false);

    const [selectedDistributorId, setSelectedDistributorId] = useState('');
    const [orderDate, setOrderDate] = useState(getDefaultOrderDate());
    const [items, setItems] = useState<PurchaseOrderItem[]>([]);
    const [remarks, setRemarks] = useState('');
    const [poSerialId, setPoSerialId] = useState('NO.NEW');
    const [isSaving, setIsSaving] = useState(false);
    const [isMatrixOpen, setIsMatrixOpen] = useState(false);
    const [matrixSearchTerm, setMatrixSearchTerm] = useState('');
    const [selectedMatrixIndex, setSelectedMatrixIndex] = useState(0);
    const [activeMatrixRowId, setActiveMatrixRowId] = useState<string | null>(null);
    const [activeCell, setActiveCell] = useState<{ rowId: string; column: GridColumnKey } | null>(null);

    const supplierSelectRef = useRef<HTMLSelectElement>(null);
    const matrixSearchRef = useRef<HTMLInputElement>(null);
    const cellInputRefs = useRef<Record<string, Partial<Record<GridColumnKey, HTMLInputElement | null>>>>({});

    const setCellRef = (rowId: string, column: GridColumnKey, node: HTMLInputElement | null) => {
        if (!cellInputRefs.current[rowId]) cellInputRefs.current[rowId] = {};
        cellInputRefs.current[rowId][column] = node;
    };

    const isEditableCell = (node: HTMLInputElement | null | undefined) => Boolean(node && !node.disabled && !node.readOnly);

    const focusCell = (rowId: string, column: GridColumnKey): boolean => {
        const node = cellInputRefs.current[rowId]?.[column];
        if (!isEditableCell(node)) return false;
        node!.focus();
        node!.select?.();
        return true;
    };

    const focusFirstEditableCellInRow = (rowId: string): boolean => {
        for (const column of GRID_COLUMN_ORDER) {
            if (focusCell(rowId, column)) return true;
        }
        return false;
    };

    const getCellClassName = (rowId: string, column: GridColumnKey, base: string) =>
        `${base} ${activeCell?.rowId === rowId && activeCell.column === column ? 'bg-blue-50 ring-2 ring-blue-500 ring-inset' : ''}`;

    const resetCreateForm = () => {
        setSelectedDistributorId('');
        setOrderDate(getDefaultOrderDate());
        setItems([createEmptyLineItem()]);
        setRemarks('');
        setPoSerialId('NO.NEW');
        onClearDraft();
    };

    const ensurePONumber = async (): Promise<string> => {
        if (poSerialId && poSerialId !== 'NO.NEW') return poSerialId;
        const nextNumber = (await onReservePONumber())?.trim();
        if (!nextNumber) throw new Error('PO number / serial id could not be generated.');
        setPoSerialId(nextNumber);
        return nextNumber;
    };

    const filteredPOList = useMemo(() => {
        let list = [...purchaseOrders];
        if (statusFilter !== 'all') {
            list = list.filter(po => po.status === statusFilter);
        }
        return list.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    }, [purchaseOrders, statusFilter]);

    useEffect(() => {
        if (draftItems && draftItems.length > 0) {
            setItems(normalizeLineItems(draftItems.map(item => ({ ...createEmptyLineItem(), ...item, id: item.id || crypto.randomUUID() }))));
            setView('create');
        }
    }, [draftItems]);

    useEffect(() => {
        if (view === 'create' && items.length === 0) {
            setItems([createEmptyLineItem()]);
        }
    }, [view, items.length]);

    useEffect(() => {
        if (view !== 'create') return;
        if (poSerialId !== 'NO.NEW') return;
        ensurePONumber().catch((error) => {
            console.error('Failed to pre-generate PO number.', error);
        });
    }, [view, poSerialId]);

    useEffect(() => {
        if (view === 'create') {
            setTimeout(() => supplierSelectRef.current?.focus(), 120);
        }
    }, [view]);

    const catalog = useMemo(() => {
        const byKey = new Map<string, SearchCatalogItem>();
        const mappedByMedicine = new Map<string, SupplierProductMap[]>();

        for (const map of mappings) {
            if (!mappedByMedicine.has(map.master_medicine_id)) mappedByMedicine.set(map.master_medicine_id, []);
            mappedByMedicine.get(map.master_medicine_id)!.push(map);
        }

        for (const inv of inventory) {
            const key = (inv.code || inv.name).trim().toUpperCase();
            const existing = byKey.get(key);
            const mappedSupplierIds = mappings
              .filter(m => (m.supplier_product_name || '').trim().toUpperCase() === inv.name.trim().toUpperCase())
              .map(m => m.supplier_id);

            if (existing) {
                existing.inventoryItem = inv;
                existing.mappedSupplierIds = [...new Set([...(existing.mappedSupplierIds || []), ...mappedSupplierIds])];
                continue;
            }

            byKey.set(key, {
                id: key,
                name: inv.name,
                code: inv.code,
                sku: inv.code,
                source: 'inventory',
                inventoryItem: inv,
                mappedSupplierIds
            });
        }

        for (const med of medicines) {
            const key = (med.materialCode || med.name).trim().toUpperCase();
            const medMappings = mappedByMedicine.get(med.id) || [];
            const mappedSupplierIds = medMappings.map(m => m.supplier_id);
            const supplierItemName = medMappings[0]?.supplier_product_name;
            const existing = byKey.get(key);
            if (existing) {
                existing.medicine = med;
                existing.mappedSupplierIds = [...new Set([...(existing.mappedSupplierIds || []), ...mappedSupplierIds])];
                if (!existing.supplierItemName && supplierItemName) existing.supplierItemName = supplierItemName;
                continue;
            }

            byKey.set(key, {
                id: key,
                name: med.name,
                code: med.materialCode,
                sku: med.materialCode,
                supplierItemName,
                source: 'material',
                medicine: med,
                mappedSupplierIds
            });
        }

        return Array.from(byKey.values());
    }, [inventory, medicines, mappings]);

    const matrixResults = useMemo(() => {
        const lower = matrixSearchTerm.trim().toLowerCase();
        const source = lower
            ? catalog.filter(c =>
                c.name.toLowerCase().includes(lower) ||
                (c.code || '').toLowerCase().includes(lower) ||
                (c.sku || '').toLowerCase().includes(lower) ||
                (c.supplierItemName || '').toLowerCase().includes(lower)
            )
            : catalog;

        return source
            .map(c => ({
                ...c,
                supplierBoost: selectedDistributorId && c.mappedSupplierIds.includes(selectedDistributorId) ? 100 : 0
            }))
            .sort((a, b) => b.supplierBoost - a.supplierBoost || a.name.localeCompare(b.name))
            .slice(0, 50);
    }, [catalog, matrixSearchTerm, selectedDistributorId]);

    const recalculateLine = (line: PurchaseOrderItem): PurchaseOrderItem => {
        const qty = Number(line.quantity || 0);
        const rate = Number(line.estimatedRate ?? line.purchasePrice ?? 0);
        const discPct = Number(line.discountPercent || 0);
        const gstPct = Number(line.gstPercent || 0);

        const lineAmount = qty * rate;
        const discountAmount = lineAmount * (discPct / 100);
        const taxable = lineAmount - discountAmount;
        const gstAmount = taxable * (gstPct / 100);
        const estimatedAmount = taxable + gstAmount;

        return {
            ...line,
            purchasePrice: rate,
            lineAmount,
            discountAmount,
            gstAmount,
            estimatedAmount
        };
    };

    const pickCatalogItemForRow = (picked: SearchCatalogItem, rowId: string) => {
        const inv = picked.inventoryItem;
        const med = picked.medicine;
        setItems(prev => {
            const updated = prev.map(line => {
                if (line.id !== rowId) return line;
                return recalculateLine({
                    ...line,
                    inventoryItemId: inv?.id,
                    medicineId: med?.id,
                    name: picked.name,
                    itemCode: picked.code || inv?.code || med?.materialCode || line.itemCode,
                    sku: picked.sku || inv?.code || med?.materialCode || line.sku,
                    supplierItemName: picked.supplierItemName || line.supplierItemName,
                    brand: inv?.brand || med?.brand || line.brand || '',
                    quantity: line.quantity > 0 ? line.quantity : 1,
                    estimatedRate: Number(inv?.purchasePrice || med?.rateA || line.estimatedRate || line.purchasePrice || 0),
                    purchasePrice: Number(inv?.purchasePrice || med?.rateA || line.purchasePrice || 0),
                    packType: inv?.packType || med?.pack || line.packType || '',
                    unitOfMeasurement: inv?.unitOfMeasurement || inv?.packUnit || line.unitOfMeasurement || 'Unit',
                    manufacturer: inv?.manufacturer || med?.manufacturer || line.manufacturer,
                    hsnCode: inv?.hsnCode || med?.hsnCode || line.hsnCode || '',
                    mrp: Number(inv?.mrp || med?.mrp || line.mrp || 0),
                    gstPercent: Number(inv?.gstPercent || med?.gstRate || line.gstPercent || 0),
                    expectedDeliveryDate: line.expectedDeliveryDate || orderDate,
                });
            });
            return normalizeLineItems(updated);
        });
        setIsMatrixOpen(false);
        setSelectedMatrixIndex(0);
        setActiveMatrixRowId(null);
        requestAnimationFrame(() => {
            const currentColIndex = GRID_COLUMN_ORDER.indexOf('name');
            let moved = false;
            for (let col = currentColIndex + 1; col < GRID_COLUMN_ORDER.length; col++) {
                if (focusCell(rowId, GRID_COLUMN_ORDER[col])) {
                    moved = true;
                    break;
                }
            }
            if (!moved) {
                focusFirstEditableCellInRow(rowId);
            }
        });
    };

    const openMatrixForRow = (rowId: string, initialTerm = '') => {
        setActiveMatrixRowId(rowId);
        setMatrixSearchTerm(initialTerm);
        setSelectedMatrixIndex(0);
        setIsMatrixOpen(true);
        requestAnimationFrame(() => matrixSearchRef.current?.focus());
    };

    const handleUpdateItem = (id: string, field: keyof PurchaseOrderItem, value: any) => {
        setItems(prev => {
            const updated = prev.map(i => i.id === id ? recalculateLine({ ...i, [field]: value }) : i);
            return normalizeLineItems(updated);
        });
    };

    const handleRemoveItem = (id: string, preferredColumn?: GridColumnKey) => {
        const currentRows = [...items];
        const removedIndex = currentRows.findIndex(row => row.id === id);
        setItems(prev => normalizeLineItems(prev.filter(i => i.id !== id)));
        requestAnimationFrame(() => {
            const nextRow = currentRows[removedIndex + 1] || currentRows[Math.max(removedIndex - 1, 0)];
            const targetRowId = nextRow?.id;
            if (!targetRowId) return;
            if (preferredColumn && focusCell(targetRowId, preferredColumn)) return;
            focusFirstEditableCellInRow(targetRowId);
        });
    };

    const handleInsertBlankRow = (_afterIndex?: number) => {
        let focusRowId: string | null = null;
        setItems(prev => {
            const trailingBlank = prev.find(line => isLineItemEmpty(line)) || prev[prev.length - 1];
            focusRowId = trailingBlank?.id || null;
            return normalizeLineItems(prev);
        });
        if (focusRowId) {
            requestAnimationFrame(() => focusFirstEditableCellInRow(focusRowId!));
        }
    };

    const handleGridNavigation = (
        e: React.KeyboardEvent<HTMLInputElement>,
        rowId: string,
        column: GridColumnKey
    ) => {
        const rowIndex = items.findIndex(r => r.id === rowId);
        if (rowIndex < 0) return;
        const colIndex = GRID_COLUMN_ORDER.indexOf(column);
        if (colIndex < 0) return;

        const focusByLinearStep = (step: 1 | -1) => {
            const maxIndex = items.length * GRID_COLUMN_ORDER.length - 1;
            let linearIndex = rowIndex * GRID_COLUMN_ORDER.length + colIndex;
            while (true) {
                linearIndex += step;
                if (linearIndex < 0 || linearIndex > maxIndex) break;
                const targetRow = items[Math.floor(linearIndex / GRID_COLUMN_ORDER.length)];
                const targetColumn = GRID_COLUMN_ORDER[linearIndex % GRID_COLUMN_ORDER.length];
                if (targetRow && focusCell(targetRow.id, targetColumn)) break;
            }
        };

        const focusVertical = (direction: 1 | -1) => {
            let targetRowIndex = rowIndex + direction;
            while (targetRowIndex >= 0 && targetRowIndex < items.length) {
                if (focusCell(items[targetRowIndex].id, column)) return;
                targetRowIndex += direction;
            }
        };

        if (e.key === 'ArrowUp') {
            e.preventDefault();
            focusVertical(-1);
            return;
        }
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            focusVertical(1);
            return;
        }
        if (e.key === 'ArrowLeft') {
            e.preventDefault();
            focusByLinearStep(-1);
            return;
        }
        if (e.key === 'ArrowRight') {
            e.preventDefault();
            focusByLinearStep(1);
            return;
        }
        if (e.key === 'Enter') {
            e.preventDefault();
            if (column === 'name') {
                openMatrixForRow(rowId, items[rowIndex]?.name || '');
                return;
            }
            focusByLinearStep(1);
        }
    };

    const estimatedSubtotal = useMemo(() => items.reduce((sum, item) => sum + Number(item.lineAmount || 0), 0), [items]);
    const estimatedDiscount = useMemo(() => items.reduce((sum, item) => sum + Number(item.discountAmount || 0), 0), [items]);
    const estimatedTax = useMemo(() => items.reduce((sum, item) => sum + Number(item.gstAmount || 0), 0), [items]);
    const totalAmount = useMemo(() => items.reduce((sum, item) => sum + Number(item.estimatedAmount || 0), 0), [items]);

    const isValidUuid = (value?: string) =>
        typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);

    const isPlaceholderDate = (value?: string) => {
        if (!value) return false;
        const normalized = value.trim().toLowerCase();
        return normalized === 'dd-mm-yyyy' || normalized === 'dd/mm/yyyy' || normalized === 'mm/dd/yyyy';
    };

    const isParsableDate = (value?: string) => {
        if (!value || isPlaceholderDate(value)) return false;
        const parsed = new Date(value);
        return !Number.isNaN(parsed.getTime());
    };

    const validateBeforeSave = (reservedSerialId: string, enteredItems: PurchaseOrderItem[]) => {
        if (!selectedDistributorId) return 'Supplier is required.';
        if (!isValidUuid(selectedDistributorId)) return 'Invalid supplier/distributor id. Please reselect supplier.';
        if (!isParsableDate(orderDate)) return 'Invalid PO date.';
        if (!currentUserOrgId?.trim()) return 'Organization id is missing.';
        if (!reservedSerialId?.trim() || reservedSerialId === 'NO.NEW') return 'PO number / serial id is not generated.';
        if (enteredItems.length === 0) return 'Please add at least one item.';

        for (let i = 0; i < enteredItems.length; i++) {
            const row = enteredItems[i];
            if (!row.name?.trim()) return `Item name is missing in row ${i + 1}.`;
            if (!row.quantity || Number(row.quantity) <= 0) return `Quantity should be greater than zero in row ${i + 1}.`;
            const rate = Number(row.estimatedRate ?? row.purchasePrice ?? 0);
            if (!Number.isFinite(rate) || rate < 0) return `Estimated rate should be zero or greater in row ${i + 1}.`;
            if (isPlaceholderDate(row.expectedDeliveryDate)) return `Expected date is placeholder only in row ${i + 1}.`;
            if (row.expectedDeliveryDate && !isParsableDate(row.expectedDeliveryDate)) return `Expected date is invalid in row ${i + 1}.`;
        }

        return null;
    };

    const handleSavePO = async () => {
        setIsSaving(true);
        try {
            const reservedSerialId = await ensurePONumber();
            const distributor = distributors.find(d => d.id === selectedDistributorId);
            if (!distributor) {
                throw new Error('Invalid supplier/distributor id: selected supplier was not found.');
            }

            const cleanItems = items
                .filter(item => !isLineItemEmpty(item))
                .map(recalculateLine)
                .filter(item => isLineItemComplete(item));

            const validationError = validateBeforeSave(reservedSerialId, cleanItems);
            if (validationError) {
                console.warn('PO validation failed.', { validationError, selectedDistributorId, orderDate, poSerialId: reservedSerialId, cleanItems });
                alert(validationError);
                return;
            }

            const normalizedItems = cleanItems.map(item => ({
                ...item,
                expectedDeliveryDate: isParsableDate(item.expectedDeliveryDate)
                    ? new Date(item.expectedDeliveryDate as string).toISOString()
                    : undefined
            }));

            const computedSubtotal = normalizedItems.reduce((sum, item) => sum + Number(item.lineAmount || 0), 0);
            const computedDiscount = normalizedItems.reduce((sum, item) => sum + Number(item.discountAmount || 0), 0);
            const computedTax = normalizedItems.reduce((sum, item) => sum + Number(item.gstAmount || 0), 0);
            const computedTotalAmount = normalizedItems.reduce((sum, item) => sum + Number(item.estimatedAmount || 0), 0);

            const newPO: Omit<PurchaseOrder, 'id' | 'serialId'> = {
                organization_id: currentUserOrgId || '',
                date: new Date(orderDate).toISOString(),
                distributorId: distributor.id,
                distributorName: distributor.name,
                senderEmail: currentUserEmail,
                items: normalizedItems,
                status: PurchaseOrderStatus.ORDERED,
                totalItems: normalizedItems.length,
                totalAmount: computedTotalAmount,
                remarks: remarks
            };

            console.info('PO save payload prepared.', {
                serialId: reservedSerialId,
                payload: { ...newPO, serialId: reservedSerialId },
                totals: {
                    subtotal: computedSubtotal,
                    discount: computedDiscount,
                    tax: computedTax,
                    totalAmount: computedTotalAmount,
                    totalItems: normalizedItems.length
                }
            });

            await onAddPurchaseOrder(newPO, reservedSerialId);
            console.info('PO save completed successfully.', { serialId: reservedSerialId });
            setIsDirty(false);
            resetCreateForm();
            setView('list');
        } catch (e: any) {
            const parsedError = parseNetworkAndApiError(e);
            const exactMessage = e?.message || parsedError || 'Unknown save error.';
            console.error('PO save failed.', {
                error: e,
                exactMessage,
                selectedDistributorId,
                orderDate,
                poSerialId
            });
            alert(`Failed to save PO: ${exactMessage}`);
        } finally {
            setIsSaving(false);
        }
    };

    React.useImperativeHandle(ref, () => ({
        handleSubmit: handleSavePO,
        resetForm: () => {
            resetCreateForm();
            setView('create');
        },
        isDirty: view === 'create' && (items.length > 0 || selectedDistributorId !== '' || remarks !== '')
    }), [view, items, selectedDistributorId, remarks]);

    const handleMatrixKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
        if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
            e.preventDefault();
            if (matrixResults.length === 0 && activeMatrixRowId) {
                const pendingName = matrixSearchTerm.trim();
                if (pendingName) {
                    handleUpdateItem(activeMatrixRowId, 'name', pendingName);
                }
                alert('No item found. Please register a new Material Master record from the Material Master screen.');
                setIsMatrixOpen(false);
                requestAnimationFrame(() => focusCell(activeMatrixRowId, 'name'));
            }
            return;
        }

        if (matrixResults.length === 0) return;
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            setSelectedMatrixIndex(prev => (prev + 1) % matrixResults.length);
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setSelectedMatrixIndex(prev => (prev - 1 + matrixResults.length) % matrixResults.length);
        } else if (e.key === 'Enter') {
            e.preventDefault();
            if (activeMatrixRowId && matrixResults[selectedMatrixIndex]) {
                pickCatalogItemForRow(matrixResults[selectedMatrixIndex], activeMatrixRowId);
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
            <div className="bg-primary text-white h-7 flex items-center px-4 justify-between border-b border-gray-600 shadow-md flex-shrink-0">
                <span className="text-[10px] font-black uppercase tracking-widest">
                    {view === 'create' ? 'Purchase Order Voucher Creation' : 'Purchase Order Register'}
                </span>
                <span className="text-[10px] font-black uppercase text-accent">
                    {view === 'create' ? `No. ${poSerialId}` : `Total Orders: ${purchaseOrders.length}`}
                </span>
            </div>

            <div className="p-4 flex-1 flex flex-col gap-4 overflow-hidden">
                <div className="flex justify-between items-center mb-2 px-2">
                    <div className="flex items-center space-x-2 bg-white dark:bg-gray-800 p-1 border border-app-border shadow-sm">
                        <button
                            onClick={() => setView('list')}
                            className={`px-4 py-1.5 text-[10px] font-black uppercase tracking-widest transition-all ${view === 'list' ? 'bg-primary text-white shadow-md' : 'text-app-text-secondary hover:bg-hover'}`}
                        >
                            History
                        </button>
                        <button
                            onClick={() => { resetCreateForm(); setView('create'); }}
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
                            <div className="flex justify-end">
                                <button onClick={() => handleInsertBlankRow()} className="px-4 py-2 text-[10px] font-black uppercase bg-slate-100 border border-slate-300">+ Add Row</button>
                            </div>
                        </Card>

                        <Card className="flex-1 flex flex-col p-0 tally-border !rounded-none overflow-hidden shadow-inner bg-white dark:bg-zinc-800 mt-4">
                            <div className="flex-1 overflow-auto">
                                <table className="min-w-[1700px] border-collapse text-sm">
                                    <thead className="sticky top-0 bg-gray-100 dark:bg-zinc-900 border-b border-gray-400">
                                        <tr className="text-[10px] font-black uppercase text-gray-600">
                                            <th className="p-2 border-r border-gray-400">Sl.</th>
                                            <th className="p-2 border-r border-gray-400 text-left">Item Name</th>
                                            <th className="p-2 border-r border-gray-400">Item Code / SKU</th>
                                            <th className="p-2 border-r border-gray-400">Supplier Item</th>
                                            <th className="p-2 border-r border-gray-400">Pack</th>
                                            <th className="p-2 border-r border-gray-400">Unit</th>
                                            <th className="p-2 border-r border-gray-400">Qty</th>
                                            <th className="p-2 border-r border-gray-400">Est. Rate</th>
                                            <th className="p-2 border-r border-gray-400">Disc %</th>
                                            <th className="p-2 border-r border-gray-400">GST %</th>
                                            <th className="p-2 border-r border-gray-400">Est. Amount</th>
                                            <th className="p-2 border-r border-gray-400">Expected Date</th>
                                            <th className="p-2 border-r border-gray-400">Remarks</th>
                                            <th className="p-2">Action</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {items.map((item, idx) => (
                                            <tr key={item.id} className="border-b border-gray-200 hover:bg-gray-50 focus-within:bg-blue-50/40">
                                                <td className="p-1 border-r text-center text-xs font-bold">{idx + 1}</td>
                                                <td className="p-1 border-r">
                                                    <input
                                                        ref={el => setCellRef(item.id, 'name', el)}
                                                        value={item.name || ''}
                                                        onChange={e => handleUpdateItem(item.id, 'name', e.target.value)}
                                                        onFocus={() => setActiveCell({ rowId: item.id, column: 'name' })}
                                                        onKeyDown={e => handleGridNavigation(e, item.id, 'name')}
                                                        className={getCellClassName(item.id, 'name', 'w-full bg-transparent p-1 outline-none font-semibold')}
                                                    />
                                                </td>
                                                <td className="p-1 border-r"><input ref={el => setCellRef(item.id, 'itemCode', el)} value={item.itemCode || item.sku || ''} onFocus={() => setActiveCell({ rowId: item.id, column: 'itemCode' })} onKeyDown={e => handleGridNavigation(e, item.id, 'itemCode')} onChange={e => { handleUpdateItem(item.id, 'itemCode', e.target.value); handleUpdateItem(item.id, 'sku', e.target.value); }} className={getCellClassName(item.id, 'itemCode', 'w-full bg-transparent p-1 outline-none')} /></td>
                                                <td className="p-1 border-r"><input ref={el => setCellRef(item.id, 'supplierItemName', el)} value={item.supplierItemName || ''} onFocus={() => setActiveCell({ rowId: item.id, column: 'supplierItemName' })} onKeyDown={e => handleGridNavigation(e, item.id, 'supplierItemName')} onChange={e => handleUpdateItem(item.id, 'supplierItemName', e.target.value)} className={getCellClassName(item.id, 'supplierItemName', 'w-full bg-transparent p-1 outline-none')} /></td>
                                                <td className="p-1 border-r"><input ref={el => setCellRef(item.id, 'packType', el)} value={item.packType || ''} onFocus={() => setActiveCell({ rowId: item.id, column: 'packType' })} onKeyDown={e => handleGridNavigation(e, item.id, 'packType')} onChange={e => handleUpdateItem(item.id, 'packType', e.target.value)} className={getCellClassName(item.id, 'packType', 'w-full bg-transparent p-1 outline-none')} /></td>
                                                <td className="p-1 border-r"><input ref={el => setCellRef(item.id, 'unitOfMeasurement', el)} value={item.unitOfMeasurement || ''} onFocus={() => setActiveCell({ rowId: item.id, column: 'unitOfMeasurement' })} onKeyDown={e => handleGridNavigation(e, item.id, 'unitOfMeasurement')} onChange={e => handleUpdateItem(item.id, 'unitOfMeasurement', e.target.value)} className={getCellClassName(item.id, 'unitOfMeasurement', 'w-full bg-transparent p-1 outline-none')} /></td>
                                                <td className="p-1 border-r"><input ref={el => setCellRef(item.id, 'quantity', el)} type="number" min={0} value={item.quantity} onFocus={() => setActiveCell({ rowId: item.id, column: 'quantity' })} onKeyDown={e => handleGridNavigation(e, item.id, 'quantity')} onChange={e => handleUpdateItem(item.id, 'quantity', Number(e.target.value) || 0)} className={getCellClassName(item.id, 'quantity', 'w-24 bg-transparent p-1 outline-none text-right')} /></td>
                                                <td className="p-1 border-r"><input ref={el => setCellRef(item.id, 'estimatedRate', el)} type="number" min={0} value={item.estimatedRate ?? item.purchasePrice ?? 0} onFocus={() => setActiveCell({ rowId: item.id, column: 'estimatedRate' })} onKeyDown={e => handleGridNavigation(e, item.id, 'estimatedRate')} onChange={e => handleUpdateItem(item.id, 'estimatedRate', Number(e.target.value) || 0)} className={getCellClassName(item.id, 'estimatedRate', 'w-28 bg-transparent p-1 outline-none text-right')} /></td>
                                                <td className="p-1 border-r"><input ref={el => setCellRef(item.id, 'discountPercent', el)} type="number" min={0} value={item.discountPercent || 0} onFocus={() => setActiveCell({ rowId: item.id, column: 'discountPercent' })} onKeyDown={e => handleGridNavigation(e, item.id, 'discountPercent')} onChange={e => handleUpdateItem(item.id, 'discountPercent', Number(e.target.value) || 0)} className={getCellClassName(item.id, 'discountPercent', 'w-20 bg-transparent p-1 outline-none text-right')} /></td>
                                                <td className="p-1 border-r"><input ref={el => setCellRef(item.id, 'gstPercent', el)} type="number" min={0} value={item.gstPercent || 0} onFocus={() => setActiveCell({ rowId: item.id, column: 'gstPercent' })} onKeyDown={e => handleGridNavigation(e, item.id, 'gstPercent')} onChange={e => handleUpdateItem(item.id, 'gstPercent', Number(e.target.value) || 0)} className={getCellClassName(item.id, 'gstPercent', 'w-20 bg-transparent p-1 outline-none text-right')} /></td>
                                                <td className="p-1 border-r text-right font-bold">₹{Number(item.estimatedAmount || 0).toFixed(2)}</td>
                                                <td className="p-1 border-r"><input ref={el => setCellRef(item.id, 'expectedDeliveryDate', el)} type="date" value={item.expectedDeliveryDate || ''} onFocus={() => setActiveCell({ rowId: item.id, column: 'expectedDeliveryDate' })} onKeyDown={e => handleGridNavigation(e, item.id, 'expectedDeliveryDate')} onChange={e => handleUpdateItem(item.id, 'expectedDeliveryDate', e.target.value)} className={getCellClassName(item.id, 'expectedDeliveryDate', 'w-36 bg-transparent p-1 outline-none')} /></td>
                                                <td className="p-1 border-r"><input ref={el => setCellRef(item.id, 'notes', el)} value={item.notes || ''} onFocus={() => setActiveCell({ rowId: item.id, column: 'notes' })} onKeyDown={e => handleGridNavigation(e, item.id, 'notes')} onChange={e => handleUpdateItem(item.id, 'notes', e.target.value)} className={getCellClassName(item.id, 'notes', 'w-full bg-transparent p-1 outline-none')} /></td>
                                                <td className="p-1 text-center">
                                                    <button onClick={() => handleInsertBlankRow(idx)} className="mr-2 text-xs text-blue-700">+row</button>
                                                    <button onClick={() => handleRemoveItem(item.id, activeCell?.column)} className="text-xs text-red-600">del</button>
                                                </td>
                                            </tr>
                                        ))}
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

                            <div className="w-96 bg-[#e5f0f0] p-5 tally-border !rounded-none shadow-md flex flex-col justify-center">
                                <div className="space-y-2 font-bold text-xs uppercase tracking-tight">
                                    <div className="flex justify-between text-gray-500"><span>Estimated Subtotal</span> <span>₹{estimatedSubtotal.toFixed(2)}</span></div>
                                    <div className="flex justify-between text-gray-500"><span>Discount</span> <span>-₹{estimatedDiscount.toFixed(2)}</span></div>
                                    <div className="flex justify-between text-blue-700"><span>Tax (Estimated GST)</span> <span>+₹{estimatedTax.toFixed(2)}</span></div>
                                    <div className="border-t border-gray-400 pt-2 flex justify-between text-xl font-black text-primary">
                                        <span>TOTAL VALUE</span>
                                        <span>₹{totalAmount.toFixed(2)}</span>
                                    </div>
                                </div>
                            </div>

                            <div className="flex flex-col gap-3 w-56 self-stretch justify-end">
                                <button
                                    onClick={() => { if (confirm('Discard order draft?')) { resetCreateForm(); setView('list'); } }}
                                    className="w-full py-3 tally-border bg-white font-black text-[11px] hover:bg-red-50 text-red-600 transition-colors uppercase tracking-[0.2em] shadow-sm"
                                >
                                    Discard
                                </button>
                                <button
                                    onClick={handleSavePO}
                                    disabled={isSaving}
                                    className="w-full py-6 tally-button-primary shadow-2xl active:translate-y-1 uppercase tracking-[0.3em] text-[12px] flex items-center justify-center gap-2"
                                >
                                    {isSaving ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div> : 'Accept Order'}
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
                                    {filteredPOList.map(po => {
                                        const isSelected = selectedPO?.id === po.id;
                                        return (
                                            <tr
                                                key={po.id}
                                                className={`transition-colors group cursor-pointer hover:bg-primary hover:text-white ${isSelected ? 'bg-primary text-white shadow-md' : ''}`}
                                                onClick={() => setSelectedPO(po)}
                                            >
                                                <td className={`p-3 border-r border-gray-200 font-mono font-black uppercase ${isSelected ? 'text-white' : 'group-hover:text-white text-primary'}`}>{po.serialId}</td>
                                                <td className={`p-3 border-r border-gray-200 ${isSelected ? 'text-white' : 'group-hover:text-white'}`}>{new Date(po.date).toLocaleDateString('en-GB')}</td>
                                                <td className={`p-3 border-r border-gray-200 font-black uppercase ${isSelected ? 'text-white' : 'group-hover:text-white text-gray-900'}`}>{po.distributorName}</td>
                                                <td className="p-3 border-r border-gray-200 text-center">
                                                    <span className={`px-2 py-0.5 rounded text-[10px] font-black uppercase border ${isSelected ? 'bg-white/20 text-white border-white/30' : getStatusClass(po.status)}`}>
                                                        {po.status}
                                                    </span>
                                                </td>
                                                <td className={`p-3 border-r border-gray-200 text-right font-black ${isSelected ? 'text-white' : 'group-hover:text-white'}`}>₹{po.totalAmount.toLocaleString('en-IN')}</td>
                                                <td className="p-3 text-right">
                                                    <div className="flex justify-end gap-2">
                                                        <button onClick={(e) => { e.stopPropagation(); onPrintPurchaseOrder(po); }} className={`font-black uppercase text-[10px] hover:underline ${isSelected ? 'text-white' : 'text-gray-500 group-hover:text-white'}`}>Print</button>
                                                        {po.status === PurchaseOrderStatus.ORDERED && (
                                                            <>
                                                                <button onClick={(e) => { e.stopPropagation(); onCreatePurchaseEntry(po); }} className={`font-black uppercase text-[10px] hover:underline ${isSelected ? 'text-white' : 'text-emerald-700 group-hover:text-white'}`}>Receive</button>
                                                                <button onClick={(e) => { e.stopPropagation(); onCancelPurchaseOrder(po.id); }} className={`font-black uppercase text-[10px] hover:underline ${isSelected ? 'text-white' : 'text-red-600 group-hover:text-white'}`}>Cancel</button>
                                                            </>
                                                        )}
                                                    </div>
                                                </td>
                                            </tr>
                                        );
                                    })}
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

            <Modal
                isOpen={isMatrixOpen}
                onClose={() => {
                    setIsMatrixOpen(false);
                    if (activeMatrixRowId) {
                        requestAnimationFrame(() => focusCell(activeMatrixRowId, 'name'));
                    }
                }}
                title="Product Selection Matrix"
            >
                <div className="flex flex-col h-full bg-[#fffde7]" onKeyDown={handleMatrixKeyDown}>
                    <div className="py-1.5 px-4 bg-primary text-white flex justify-between items-center">
                        <span className="text-xs font-black uppercase tracking-[0.2em]">Material / Inventory Lookup</span>
                        <span className="text-[10px] font-bold uppercase opacity-80">↑/↓ Navigate | Enter Select | Ctrl+Enter Register Material</span>
                    </div>
                    <div className="p-2 border-b border-gray-300 bg-white">
                        <input
                            ref={matrixSearchRef}
                            type="text"
                            value={matrixSearchTerm}
                            onChange={e => {
                                setMatrixSearchTerm(e.target.value);
                                setSelectedMatrixIndex(0);
                            }}
                            placeholder="Search item name, code, SKU, supplier item..."
                            className="w-full border border-gray-400 p-2 text-sm font-black uppercase outline-none focus:bg-yellow-50"
                        />
                        {matrixResults.length === 0 && (
                            <p className="mt-2 text-[10px] font-black uppercase text-amber-700">No item found. Press Ctrl + Enter to register new Material Master record.</p>
                        )}
                    </div>
                    <div className="flex-1 overflow-auto bg-white">
                        <table className="min-w-full border-collapse text-xs">
                            <thead className="sticky top-0 bg-gray-100 border-b border-gray-400">
                                <tr className="text-[10px] font-black uppercase text-gray-500">
                                    <th className="p-2 text-left border-r border-gray-300">Item Name</th>
                                    <th className="p-2 text-left border-r border-gray-300">Item Code / SKU</th>
                                    <th className="p-2 text-left border-r border-gray-300">Pack</th>
                                    <th className="p-2 text-left border-r border-gray-300">Unit</th>
                                    <th className="p-2 text-left border-r border-gray-300">Supplier Item</th>
                                    <th className="p-2 text-left border-r border-gray-300">Est. Rate</th>
                                    <th className="p-2 text-left">GST %</th>
                                </tr>
                            </thead>
                            <tbody>
                                {matrixResults.map((result, idx) => {
                                    const inv = result.inventoryItem;
                                    const med = result.medicine;
                                    const isSelected = idx === selectedMatrixIndex;
                                    return (
                                        <tr
                                            key={`${result.id}-${idx}`}
                                            onMouseEnter={() => setSelectedMatrixIndex(idx)}
                                            onClick={() => activeMatrixRowId && pickCatalogItemForRow(result, activeMatrixRowId)}
                                            className={`cursor-pointer border-b border-gray-100 ${isSelected ? 'bg-primary text-white' : 'hover:bg-yellow-50'}`}
                                        >
                                            <td className="p-2 border-r border-gray-200 font-bold uppercase">{result.name}</td>
                                            <td className="p-2 border-r border-gray-200 font-mono">{result.code || result.sku || '-'}</td>
                                            <td className="p-2 border-r border-gray-200 uppercase">{inv?.packType || med?.pack || '-'}</td>
                                            <td className="p-2 border-r border-gray-200 uppercase">{inv?.unitOfMeasurement || inv?.packUnit || 'Unit'}</td>
                                            <td className="p-2 border-r border-gray-200 uppercase">{result.supplierItemName || '-'}</td>
                                            <td className="p-2 border-r border-gray-200 text-right">₹{Number(inv?.purchasePrice || med?.rateA || 0).toFixed(2)}</td>
                                            <td className="p-2 text-right">{Number(inv?.gstPercent || med?.gstRate || 0).toFixed(2)}</td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </div>
            </Modal>
        </main>
    );
});

export default PurchaseOrdersPage;
