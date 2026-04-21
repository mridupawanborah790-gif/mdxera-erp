import React, { useState, useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import Modal from '../../../core/components/Modal';
import type { PurchaseItem, InventoryItem, ModuleConfig } from '../../../core/types/types';
import { normalizeImportDate, parseNumber } from '../../../core/utils/helpers';

interface RawRow {
    [key: string]: string;
}

interface PreviewItem {
    id: string; // for react key
    originalData: RawRow;
    processedData: Partial<PurchaseItem>;
    validation: {
        errors: { field: string; message: string }[];
        warnings: { field: string; message: string }[];
    };
    match: {
        status: 'unmatched' | 'matched' | 'pending';
        matchedItem: InventoryItem | null;
    };
}

interface PurchaseImportPreviewModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: (data: { items: PurchaseItem[], header: { supplier?: string, invoiceNumber?: string, supplierGst?: string, date?: string } }) => void;
    rawCsvData: string[][];
    inventory: InventoryItem[];
    onAddNewInventoryItem: (name: string, onSuccess: (newItem: InventoryItem) => void) => void;
    config: ModuleConfig;
}

const PurchaseImportPreviewModal: React.FC<PurchaseImportPreviewModalProps> = ({ isOpen, onClose, onSave, rawCsvData, inventory, onAddNewInventoryItem, config }) => {
    const [previewItems, setPreviewItems] = useState<PreviewItem[]>([]);
    const [extractedHeader, setExtractedHeader] = useState<{ supplier?: string, invoiceNumber?: string, supplierGst?: string, date?: string }>({});
    const [parsingError, setParsingError] = useState<string | null>(null);

    const isFieldVisible = (fieldId: string) => config?.fields?.[fieldId] !== false;

    useEffect(() => {
        if (!isOpen || rawCsvData.length === 0) {
            setPreviewItems([]);
            setExtractedHeader({});
            setParsingError(null);
            return;
        };
        
        setParsingError(null);

        const headerData: { [key: string]: string } = {};
        let itemDataStartIndex = -1;

        const headerKeywords = [
            'product', 'itemname', 'item name', 'particulars', 'description', 
            'batch', 'batchno', 'expiry', 'exp', 'qty', 'quantity', 
            'mrp', 'rate', 'price', 'hsn', 'gst', 'tax', 'pack'
        ];

        let maxMatches = 0;
        let bestHeaderIndex = -1;

        for (let i = 0; i < Math.min(rawCsvData.length, 50); i++) {
            const row = rawCsvData[i];
            
            if (bestHeaderIndex === -1 || i < bestHeaderIndex) {
                if (row.length >= 2 && row[0] && (row[0].trim().endsWith(':') || row[0].includes('Date') || row[0].includes('Invoice'))) {
                    const key = (row[0] || '').trim().replace(/[:\s]/g, '').toLowerCase();
                    const value = (row[1] || '').trim();
                    if (key.includes('supplier') || key.includes('party')) headerData.supplier = value;
                    else if (key.includes('invoiceno') || key.includes('invoicenumber') || key.includes('billno')) headerData.invoiceNumber = value;
                    else if (key.includes('gstin') || key.includes('gstno')) headerData.supplierGst = value;
                    else if (key.includes('date')) headerData.date = normalizeImportDate(value) || value;
                }
            }

            const lowerRow = row.map(cell => (cell || '').toLowerCase().trim().replace(/[^a-z0-9]/g, ''));
            let matches = 0;
            headerKeywords.forEach(kw => {
                if (lowerRow.some(cell => cell.includes(kw))) matches++;
            });

            if (matches > maxMatches && matches >= 2) {
                maxMatches = matches;
                bestHeaderIndex = i;
            }
        }
        
        if (bestHeaderIndex === -1 && rawCsvData.length > 0) {
             if (rawCsvData[0].length > 3) bestHeaderIndex = 0;
        }

        if (itemDataStartIndex === -1) {
            itemDataStartIndex = bestHeaderIndex;
        }

        setExtractedHeader(headerData);

        if (itemDataStartIndex === -1) {
            setParsingError("Could not detect the item table in your CSV.");
            setPreviewItems([]);
            return;
        }

        const headers = rawCsvData[itemDataStartIndex].map(h => (h || '').trim().toLowerCase().replace(/[^a-z0-9%]/g, ''));
        const dataRows = rawCsvData.slice(itemDataStartIndex + 1);
        
        const getIndex = (aliases: string[]): number => {
            for (const alias of aliases) {
                const normalizedAlias = alias.toLowerCase().replace(/[^a-z0-9%]/g, '');
                const index = headers.findIndex(h => h === normalizedAlias || h.includes(normalizedAlias));
                if (index !== -1) return index;
            }
            return -1;
        };

        const colIndices = {
            product: getIndex(['product', 'product name', 'item name', 'item', 'description', 'particulars']),
            pack: getIndex(['pack', 'packing', 'size']),
            batch: getIndex(['batch', 'batch no', 'lot']),
            expiry: getIndex(['expiry', 'exp', 'exp date']),
            qty: getIndex(['qty', 'quantity', 'billed qty']),
            freeqty: getIndex(['free qty', 'free', 'scheme', 'bonus']),
            mrp: getIndex(['mrp', 'm.r.p.']),
            purRate: getIndex(['pur. rate', 'rate', 'price', 'ptr', 'pts']),
            discPercent: getIndex(['disc%', 'discount%']),
            gst: getIndex(['gst%', 'gst', 'tax%', 'tax']),
            hsn: getIndex(['hsn', 'hsn code']),
            brand: getIndex(['brand', 'company']), 
        };

        const validDataRows = dataRows.filter(row => {
            if (row.every(cell => !cell || cell.trim() === '')) return false;
            return true;
        });

        const newPreviewItems: PreviewItem[] = validDataRows.map((row, index) => {
            const originalData: RawRow = {};
            headers.forEach((h, i) => {
                originalData[h] = row[i] || '';
            });
            const getValue = (idx: number) => idx !== -1 ? (row[idx] || '') : '';

            const processedData: Partial<PurchaseItem> = {
                id: crypto.randomUUID(),
                quantity: parseNumber(getValue(colIndices.qty)),
                freeQuantity: parseNumber(getValue(colIndices.freeqty)),
                name: getValue(colIndices.product),
                packType: getValue(colIndices.pack),
                batch: getValue(colIndices.batch),
                expiry: normalizeImportDate(getValue(colIndices.expiry)) || getValue(colIndices.expiry),
                mrp: parseNumber(getValue(colIndices.mrp)),
                purchasePrice: parseNumber(getValue(colIndices.purRate)),
                discountPercent: parseNumber(getValue(colIndices.discPercent)),
                gstPercent: parseNumber(getValue(colIndices.gst)),
                hsnCode: getValue(colIndices.hsn),
                brand: getValue(colIndices.brand),
            };

            const match = inventory.find(i => (i.name || '').toLowerCase().trim() === (processedData.name || '').toLowerCase().trim());

            const item: PreviewItem = {
                id: `preview-${index}`,
                originalData,
                processedData,
                validation: { errors: [], warnings: [] },
                match: {
                    status: match ? 'matched' : 'unmatched',
                    matchedItem: match || null,
                }
            };
            
            if (!item.processedData.name) item.validation.errors.push({ field: 'name', message: 'Product name is required.' });
            
            return item;
        });
        setPreviewItems(newPreviewItems);

    }, [isOpen, rawCsvData, inventory]);

    const handleItemUpdate = (id: string, field: keyof PurchaseItem, value: any) => {
        setPreviewItems(prev => prev.map(item => {
            if (item.id === id) {
                return {
                    ...item,
                    processedData: { ...item.processedData, [field]: value }
                };
            }
            return item;
        }));
    };

    const handleSaveAndImport = () => {
        const finalItems: PurchaseItem[] = previewItems
            .filter(p => p.validation.errors.length === 0)
            .map(p => ({
                id: crypto.randomUUID(),
                name: p.processedData.name ?? '',
                brand: p.processedData.brand || '',
                category: 'General',
                batch: p.processedData.batch || '',
                expiry: p.processedData.expiry || '',
                quantity: p.processedData.quantity || 0,
                looseQuantity: 0,
                freeQuantity: p.processedData.freeQuantity || 0,
                purchasePrice: p.processedData.purchasePrice || 0,
                mrp: p.processedData.mrp || 0,
                gstPercent: p.processedData.gstPercent || 0,
                hsnCode: p.processedData.hsnCode || '',
                discountPercent: p.processedData.discountPercent || 0,
                schemeDiscountPercent: 0,
                schemeDiscountAmount: 0, 
                packType: p.processedData.packType || '',
                matchStatus: p.match.status === 'matched' ? 'matched' : 'unmatched',
                inventoryItemId: p.match.status === 'matched' ? (p.match.matchedItem?.id ?? undefined) : undefined
            }));
        
        onSave({ items: finalItems, header: extractedHeader });
        onClose();
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Purchase Import Preview" widthClass="max-w-7xl">
            <div className="flex flex-col h-[80vh]">
                <div className="p-4 bg-gray-50 border-b border-app-border">
                    {parsingError && <div className="bg-red-100 text-red-700 p-2 mb-2 rounded text-sm">{parsingError}</div>}
                    <p className="text-sm text-app-text-secondary">
                        Found <strong>{previewItems.length}</strong> items.
                    </p>
                </div>
                
                <div className="flex-1 overflow-auto p-4">
                    <table className="min-w-full text-xs divide-y divide-app-border border border-app-border">
                        <thead className="bg-gray-100 sticky top-0 z-10">
                            <tr>
                                <th className="p-2 text-left font-medium text-app-text-secondary">Product</th>
                                {isFieldVisible('colBrand') && <th className="p-2 text-left font-medium text-app-text-secondary">MFR</th>}
                                <th className="p-2 text-left font-medium text-app-text-secondary">Pack</th>
                                <th className="p-2 text-right font-medium text-app-text-secondary">MRP</th>
                                <th className="p-2 text-left font-medium text-app-text-secondary">Batch</th>
                                <th className="p-2 text-left font-medium text-app-text-secondary">Expiry</th>
                                <th className="p-2 text-center font-medium text-app-text-secondary">Qty</th>
                                <th className="p-2 text-right font-medium text-app-text-secondary">Rate</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-app-border bg-card-bg">
                            {previewItems.map((item) => (
                                <tr key={item.id} className={item.validation.errors.length > 0 ? 'bg-red-50' : ''}>
                                    <td className="p-1">
                                        <input
                                            type="text"
                                            value={item.processedData.name || ''}
                                            onChange={e => handleItemUpdate(item.id, 'name', e.target.value)}
                                            className="w-full p-1 border rounded text-xs"
                                        />
                                    </td>
                                    {isFieldVisible('colBrand') && <td className="p-1"><input type="text" value={item.processedData.brand || ''} onChange={(e) => handleItemUpdate(item.id, 'brand', e.target.value)} className="w-full p-1 border border-gray-300 rounded text-xs"/></td>}
                                    <td className="p-1"><input type="text" value={item.processedData.packType || ''} onChange={(e) => handleItemUpdate(item.id, 'packType', e.target.value)} className="w-16 p-1 border border-gray-300 rounded text-xs"/></td>
                                    <td className="p-1"><input type="number" value={item.processedData.mrp || ''} onChange={(e) => handleItemUpdate(item.id, 'mrp', parseFloat(e.target.value) || 0)} className="w-20 p-1 border border-gray-300 rounded text-right text-xs"/></td>
                                    <td className="p-1"><input type="text" value={item.processedData.batch || ''} onChange={(e) => handleItemUpdate(item.id, 'batch', e.target.value)} className="w-20 p-1 border border-gray-300 rounded text-xs"/></td>
                                    <td className="p-1"><input type="text" value={item.processedData.expiry || ''} onChange={(e) => handleItemUpdate(item.id, 'expiry', e.target.value)} className="w-32 p-1 border border-gray-300 rounded text-xs"/></td>
                                    <td className="p-1"><input type="number" value={item.processedData.quantity || ''} onChange={(e) => handleItemUpdate(item.id, 'quantity', parseInt(e.target.value, 10) || 0)} className="w-16 p-1 border border-gray-300 rounded text-center text-xs"/></td>
                                    <td className="p-1"><input type="number" value={item.processedData.purchasePrice || ''} onChange={(e) => handleItemUpdate(item.id, 'purchasePrice', parseFloat(e.target.value) || 0)} className="w-20 p-1 border border-gray-300 rounded text-right text-xs"/></td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                <div className="flex justify-end items-center p-4 bg-[var(--modal-footer-bg-light)] dark:bg-[var(--modal-footer-bg-dark)] border-t border-[var(--modal-footer-border-light)] dark:border-[var(--modal-footer-border-dark)]">
                    <button onClick={onClose} className="px-4 py-2 text-sm font-semibold bg-white border border-gray-300 rounded-lg shadow-sm hover:bg-gray-50 mr-3">Cancel</button>
                    <button onClick={handleSaveAndImport} disabled={previewItems.length === 0} className="px-4 py-2 text-sm font-semibold text-white bg-[var(--modal-header-bg-light)] dark:bg-[var(--modal-header-bg-dark)] rounded-lg hover:bg-primary-dark">
                        Save Items
                    </button>
                </div>
            </div>
        </Modal>
    );
};

export default PurchaseImportPreviewModal;
