import React, { useState, useEffect, useMemo } from 'react';
import Modal from './Modal';
import { Purchase, PurchaseItem, InventoryItem, Distributor } from '../types';
import { fuzzyMatch } from '../utils/search';

interface PurchaseBillImportPreviewModalProps {
    isOpen: boolean;
    onClose: () => void;
    // FIX: Change onSave prop type to accept Purchase[]
    onSave: (data: Purchase[]) => void;
    data: Purchase[]; // FIX: Changed data prop type to Purchase[]
    inventory: InventoryItem[];
    distributors: Distributor[];
}

const PurchaseBillImportPreviewModal: React.FC<PurchaseBillImportPreviewModalProps> = ({ isOpen, onClose, onSave, data, inventory, distributors }) => {
    // Processed data now holds full Purchase objects with validation status
    const [processedPurchases, setProcessedPurchases] = useState<(Purchase & { isValid: boolean; errors: string[] })[]>([]);

    useEffect(() => {
        if (!isOpen) return;

        const processed = data.map(purchase => {
            const errors: string[] = [];
            
            // Validate Supplier
            const supplierMatch = distributors.find(d => 
                (d.name || '').toLowerCase() === String(purchase.supplier || '').toLowerCase()
            );
            if (!supplierMatch) {
                errors.push(`Supplier '${purchase.supplier}' not found in master list.`);
            }

            // Basic purchase header validation
            if (!purchase.invoiceNumber) errors.push('Invoice Number is missing.');
            if (!purchase.date) errors.push('Date is missing.');
            if (isNaN(new Date(purchase.date).getTime())) errors.push('Invalid Date format.');
            if (!purchase.items || purchase.items.length === 0) errors.push('No items found in this purchase.');

            const itemErrors: string[] = [];
            (purchase.items || []).forEach(item => {
                // Validate Item details
                const inventoryMatch = inventory.find(i => 
                    (i.name || '').toLowerCase() === String(item.name || '').toLowerCase() ||
                    (item.batch && i.batch === item.batch) // Assuming batch can identify a unique inventory item for linking
                );
                if (!inventoryMatch) {
                    itemErrors.push(`Item '${item.name}' (Batch: ${item.batch}) not found in inventory.`);
                }
                if (!item.name) itemErrors.push('Item Name is missing.');
                if (isNaN(item.quantity) || item.quantity <= 0) itemErrors.push(`Item '${item.name}': Quantity must be a positive number.`);
                if (isNaN(item.purchasePrice) || item.purchasePrice <= 0) itemErrors.push(`Item '${item.name}': Purchase Price must be a positive number.`);
                if (isNaN(item.mrp) || item.mrp <= 0) itemErrors.push(`Item '${item.name}': MRP must be a positive number.`);
            });

            if (itemErrors.length > 0) {
                errors.push(`Item specific issues: ${itemErrors.join('; ')}`);
            }

            return {
                ...purchase,
                isValid: errors.length === 0,
                errors: errors,
            };
        });
        setProcessedPurchases(processed);
    }, [isOpen, data, inventory, distributors]);

    const handleSave = () => {
        const validPurchases = processedPurchases.filter(p => p.isValid);
        if (validPurchases.length === 0) {
            alert("No valid purchase bill entries to import. Please correct errors.");
            return;
        }
        onSave(validPurchases); // Pass the array of valid Purchase objects
    };

    const hasErrors = useMemo(() => processedPurchases.some(p => !p.isValid), [processedPurchases]);

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Purchase Bill Import Preview" widthClass="max-w-7xl">
            <div className="flex flex-col flex-1 min-h-0 overflow-hidden bg-card-bg relative">
                <div className="p-4 border-b border-app-border bg-yellow-50 dark:bg-yellow-900/10 text-sm text-app-text-secondary flex-shrink-0">
                    <p>
                        Previewing <strong>{processedPurchases.length}</strong> purchase bill entries.
                        Review any errors before importing. Valid rows will be imported.
                    </p>
                    {hasErrors && (
                        <p className="text-red-600 mt-2 font-semibold">
                            Some purchase bills have errors and will not be imported. Please correct the CSV and re-upload.
                        </p>
                    )}
                </div>
                
                <div className="flex-1 overflow-auto relative">
                    {processedPurchases.length === 0 ? (
                        <div className="py-20 text-center text-app-text-tertiary bg-white dark:bg-card-bg">
                            No purchase bill data to preview. Please upload a CSV file.
                        </div>
                    ) : (
                        <div className="space-y-4 p-4">
                            {processedPurchases.map((purchase, pIdx) => (
                                <div key={purchase.id} className={`border ${purchase.isValid ? 'border-green-300 bg-green-50/20' : 'border-red-300 bg-red-50/20'} rounded-lg shadow-sm overflow-hidden`}>
                                    <div className={`p-3 flex justify-between items-center ${purchase.isValid ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'} font-bold text-sm`}>
                                        <span>
                                            Purchase Bill #{purchase.invoiceNumber} from {purchase.supplier} ({new Date(purchase.date).toLocaleDateString()})
                                        </span>
                                        {purchase.isValid ? (
                                            <span className="px-2 py-0.5 rounded-full text-xs bg-green-500 text-white">Valid</span>
                                        ) : (
                                            <span className="px-2 py-0.5 rounded-full text-xs bg-red-500 text-white">Errors ({purchase.errors.length})</span>
                                        )}
                                    </div>
                                    {!purchase.isValid && (
                                        <div className="p-3 bg-red-50 text-red-700 text-xs">
                                            {purchase.errors.map((err, i) => <p key={i}>• {err}</p>)}
                                        </div>
                                    )}
                                    <div className="p-3">
                                        <h4 className="font-semibold text-xs mb-2">Items:</h4>
                                        <table className="min-w-full text-xs divide-y divide-gray-200">
                                            <thead>
                                                <tr className="bg-gray-50">
                                                    <th className="px-2 py-1 text-left font-semibold text-app-text-secondary">Item Name</th>
                                                    <th className="px-2 py-1 text-right font-semibold text-app-text-secondary">Qty</th>
                                                    <th className="px-2 py-1 text-right font-semibold text-app-text-secondary">Pur. Price</th>
                                                    <th className="px-2 py-1 text-right font-semibold text-app-text-secondary">MRP</th>
                                                    <th className="px-2 py-1 text-right font-semibold text-app-text-secondary">GST%</th>
                                                    <th className="px-2 py-1 text-left font-semibold text-app-text-secondary">Batch</th>
                                                </tr>
                                            </thead>
                                            <tbody className="bg-white divide-y divide-gray-100">
                                                {(purchase.items || []).map((item, itemIdx) => (
                                                    <tr key={itemIdx} className="hover:bg-gray-50">
                                                        <td className="px-2 py-1 font-medium">{item.name}</td>
                                                        <td className="px-2 py-1 text-right">{item.quantity}</td>
                                                        <td className="px-2 py-1 text-right">₹{item.purchasePrice.toFixed(2)}</td>
                                                        <td className="px-2 py-1 text-right">₹{item.mrp.toFixed(2)}</td>
                                                        <td className="px-2 py-1 text-right">{item.gstPercent}%</td>
                                                        <td className="px-2 py-1">{item.batch}</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                <div className="flex justify-end items-center p-4 bg-gray-50 dark:bg-gray-800/90 border-t border-app-border flex-shrink-0 gap-3 z-30 sticky bottom-0">
                    <button 
                        onClick={onClose} 
                        className="px-4 py-2 text-sm font-semibold text-app-text-secondary bg-card-bg border border-app-border rounded-lg shadow-sm hover:bg-hover transition-colors"
                    >
                        Cancel Import
                    </button>
                    <button 
                        onClick={handleSave} 
                        disabled={hasErrors || processedPurchases.length === 0}
                        className="px-6 py-2 text-sm font-semibold text-white bg-primary rounded-lg shadow-sm hover:bg-primary-dark transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        Save {processedPurchases.filter(p => p.isValid).length} Purchase Bills
                    </button>
                </div>
            </div>
        </Modal>
    );
};

export default PurchaseBillImportPreviewModal;