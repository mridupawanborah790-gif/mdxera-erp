import React, { useState, useEffect, useMemo } from 'react';
import Modal from './Modal';
import { Transaction, BillItem, InventoryItem, Customer } from '../types';
import { getOutstandingBalance } from '../utils/helpers';
import { fuzzyMatch } from '../utils/search';

interface SalesBillImportPreviewModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: (data: any[]) => void;
    isSaving?: boolean;
    data: any[];
    inventory: InventoryItem[];
    customers: Customer[];
}

const SalesBillImportPreviewModal: React.FC<SalesBillImportPreviewModalProps> = ({ isOpen, onClose, onSave, isSaving = false, data, inventory, customers }) => {
    const [previewData, setPreviewData] = useState<any[]>([]);

    useEffect(() => {
        if (!isOpen) return;

        const processed = data.map(row => {
            const errors: string[] = [];
            const warnings: string[] = [];
            let customerId: string | undefined;
            let inventoryItemId: string | undefined;

            // Validate Customer
            const customerMatch = customers.find(c => 
                (c.name || '').toLowerCase() === String(row.customerName || '').toLowerCase() || // FIX: Explicitly cast row.customerName to string
                (c.phone && c.phone === row.customerPhone)
            );
            if (customerMatch) {
                customerId = customerMatch.id;
            } else if (row.customerName && String(row.customerName || '').toLowerCase() !== 'walking customer') { // FIX: Explicitly cast row.customerName to string
                warnings.push('Customer not found in master list.');
            }

            // Validate Item
            const inventoryMatch = inventory.find(i => 
                fuzzyMatch(i.name, String(row.itemName || '')) || // FIX: Explicitly cast row.itemName to string
                (i.barcode && i.barcode === row.itemBarcode) ||
                (i.batch && i.batch === row.itemBatch)
            );
            if (inventoryMatch) {
                inventoryItemId = inventoryMatch.id;
            } else {
                errors.push('Product not found in inventory.');
            }

            // Basic field validation
            if (!row.id) errors.push('Invoice ID is missing.');
            if (!row.date) errors.push('Date is missing.');
            if (!row.itemName) errors.push('Item Name is missing.');
            if (isNaN(row.itemQuantity) || row.itemQuantity <= 0) errors.push('Quantity must be a positive number.');
            if (isNaN(row.itemMrp) || row.itemMrp <= 0) errors.push('MRP must be a positive number.');

            return {
                ...row,
                customerId,
                inventoryItemId,
                errors,
                warnings,
                isValid: errors.length === 0,
            };
        });
        setPreviewData(processed);
    }, [isOpen, data, inventory, customers]);

    const handleSave = () => {
        const validData = previewData.filter(row => row.isValid);
        if (validData.length === 0) {
            alert("No valid sales bill entries to import. Please correct errors.");
            return;
        }
        onSave(validData);
    };

    const hasErrors = useMemo(() => previewData.some(row => !row.isValid), [previewData]);

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Sales Bill Import Preview" widthClass="max-w-7xl">
            <div className="flex flex-col flex-1 min-h-0 overflow-hidden bg-card-bg relative">
                <div className="p-4 border-b border-app-border bg-yellow-50 dark:bg-yellow-900/10 text-sm text-app-text-secondary flex-shrink-0">
                    <p>
                        Previewing <strong>{previewData.length}</strong> sales bill entries.
                        Review any errors/warnings before importing. Valid rows will be imported.
                    </p>
                    {hasErrors && (
                        <p className="text-red-600 mt-2 font-semibold">
                            Some rows have errors and will not be imported. Please correct the CSV and re-upload.
                        </p>
                    )}
                </div>
                
                <div className="flex-1 overflow-auto relative">
                    <table className="min-w-full divide-y divide-app-border text-sm">
                        <thead className="sticky top-0 z-20 shadow-sm bg-gray-50 dark:bg-gray-800 ring-1 ring-black ring-opacity-5">
                            <tr>
                                <th className="px-4 py-3 text-left font-semibold text-app-text-secondary whitespace-nowrap bg-gray-50 dark:bg-gray-800">Status</th>
                                <th className="px-4 py-3 text-left font-semibold text-app-text-secondary whitespace-nowrap bg-gray-50 dark:bg-gray-800">Invoice ID</th>
                                <th className="px-4 py-3 text-left font-semibold text-app-text-secondary whitespace-nowrap bg-gray-50 dark:bg-gray-800">Date</th>
                                <th className="px-4 py-3 text-left font-semibold text-app-text-secondary whitespace-nowrap bg-gray-50 dark:bg-gray-800">Customer</th>
                                <th className="px-4 py-3 text-left font-semibold text-app-text-secondary whitespace-nowrap bg-gray-50 dark:bg-gray-800">Item Name</th>
                                <th className="px-4 py-3 text-right font-semibold text-app-text-secondary whitespace-nowrap bg-gray-50 dark:bg-gray-800">Qty</th>
                                <th className="px-4 py-3 text-right font-semibold text-app-text-secondary whitespace-nowrap bg-gray-50 dark:bg-gray-800">MRP</th>
                                <th className="px-4 py-3 text-right font-semibold text-app-text-secondary whitespace-nowrap bg-gray-50 dark:bg-gray-800">Disc%</th>
                                <th className="px-4 py-3 text-right font-semibold text-app-text-secondary whitespace-nowrap bg-gray-50 dark:bg-gray-800">GST%</th>
                                <th className="px-4 py-3 text-left font-semibold text-app-text-secondary whitespace-nowrap bg-gray-50 dark:bg-gray-800">Batch</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-app-border bg-card-bg">
                            {previewData.map((row, index) => (
                                <tr key={index} className={row.isValid ? 'hover:bg-hover transition-colors' : 'bg-red-50/50'}>
                                    <td className="px-4 py-2">
                                        {row.isValid ? (
                                            <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">Valid</span>
                                        ) : (
                                            <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">Error</span>
                                        )}
                                    </td>
                                    <td className="px-4 py-2 font-medium text-app-text-primary whitespace-nowrap">{row.id}</td>
                                    <td className="px-4 py-2 text-app-text-secondary whitespace-nowrap">{row.date}</td>
                                    <td className="px-4 py-2 text-app-text-primary whitespace-nowrap">
                                        {row.customerName}
                                        {row.customerId && <span className="text-[10px] text-gray-500 block">ID: {row.customerId.slice(-6)}</span>}
                                    </td>
                                    <td className="px-4 py-2 text-app-text-primary whitespace-nowrap">
                                        {row.itemName}
                                        {row.inventoryItemId && <span className="text-[10px] text-gray-500 block">Inv ID: {row.inventoryItemId.slice(-6)}</span>}
                                    </td>
                                    <td className="px-4 py-2 text-right text-app-text-secondary whitespace-nowrap">{row.itemQuantity}</td>
                                    <td className="px-4 py-2 text-right text-app-text-secondary whitespace-nowrap">₹{row.itemMrp.toFixed(2)}</td>
                                    <td className="px-4 py-2 text-right text-app-text-secondary whitespace-nowrap">{row.itemDiscountPercent}%</td>
                                    <td className="px-4 py-2 text-right text-app-text-secondary whitespace-nowrap">{row.itemGstPercent}%</td>
                                    <td className="px-4 py-2 text-app-text-secondary whitespace-nowrap">{row.itemBatch}</td>
                                </tr>
                            ))}
                            {previewData.length === 0 && (
                                <tr>
                                    <td colSpan={10} className="py-20 text-center text-app-text-tertiary bg-white dark:bg-card-bg">
                                        No sales bill data to preview. Please upload a CSV file.
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>

                <div className="flex justify-end items-center p-4 bg-gray-50 dark:bg-gray-800/90 border-t border-app-border flex-shrink-0 gap-3 z-30 sticky bottom-0">
                    <button 
                        onClick={onClose} 
                        disabled={isSaving}
                        className="px-4 py-2 text-sm font-semibold text-app-text-secondary bg-card-bg border border-app-border rounded-lg shadow-sm hover:bg-hover transition-colors"
                    >
                        Cancel Import
                    </button>
                    <button 
                        onClick={handleSave} 
                        disabled={hasErrors || previewData.length === 0 || isSaving}
                        className="px-6 py-2 text-sm font-semibold text-white bg-primary rounded-lg shadow-sm hover:bg-primary-dark transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {isSaving ? 'Processing…' : `Save ${previewData.filter(row => row.isValid).length} Sales Bills`}
                    </button>
                </div>
            </div>
        </Modal>
    );
};

export default SalesBillImportPreviewModal;
