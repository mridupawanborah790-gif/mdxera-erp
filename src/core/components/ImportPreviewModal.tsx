
import React from 'react';
import Modal from './Modal';
import type { InventoryItem } from '../types/types';
import { parseNumber, normalizeImportDate } from '../utils/helpers';

interface ImportPreviewModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: () => void;
    isSaving?: boolean;
    data: Omit<InventoryItem, 'id'>[];
}

const ImportPreviewModal: React.FC<ImportPreviewModalProps> = ({ isOpen, onClose, onSave, isSaving = false, data }) => {
    if (!isOpen) return null;

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Inventory Import Preview" widthClass="max-w-7xl">
            {/* Main Content Wrapper - Flex column to take available space */}
            <div className="flex flex-col flex-1 min-h-0 overflow-hidden bg-card-bg relative">
                
                {/* Info Header */}
                <div className="p-4 border-b border-app-border bg-yellow-50 dark:bg-yellow-900/10 text-sm text-app-text-secondary flex-shrink-0">
                    <p>
                        Previewing <strong>{data.length}</strong> items for import. 
                        Please review the calculated <strong>Cost</strong> and <strong>Stock Value</strong> columns.
                        Duplicates based on Name/Batch will update existing stock.
                    </p>
                </div>
                
                {/* Scrollable Table Area */}
                <div className="flex-1 overflow-auto relative">
                    <table className="min-w-full text-sm divide-y divide-app-border">
                        <thead className="sticky top-0 z-20 shadow-sm bg-gray-50 dark:bg-gray-800 ring-1 ring-black ring-opacity-5">
                            <tr>
                                <th scope="col" className="px-4 py-3 text-left font-semibold text-app-text-secondary whitespace-nowrap bg-gray-50 dark:bg-gray-800">Name</th>
                                <th scope="col" className="px-4 py-3 text-left font-semibold text-app-text-secondary whitespace-nowrap bg-gray-50 dark:bg-gray-800">Brand</th>
                                <th scope="col" className="px-4 py-3 text-center font-semibold text-app-text-secondary whitespace-nowrap bg-gray-50 dark:bg-gray-800">Pack</th>
                                <th scope="col" className="px-4 py-3 text-left font-semibold text-app-text-secondary whitespace-nowrap bg-gray-50 dark:bg-gray-800">Batch</th>
                                <th scope="col" className="px-4 py-3 text-center font-semibold text-app-text-secondary whitespace-nowrap bg-gray-50 dark:bg-gray-800">Expiry</th>
                                <th scope="col" className="px-4 py-3 text-right font-semibold text-app-text-secondary whitespace-nowrap bg-gray-50 dark:bg-gray-800">Total Units</th>
                                <th scope="col" className="px-4 py-3 text-right font-semibold text-app-text-secondary whitespace-nowrap bg-gray-50 dark:bg-gray-800">Pur. Rate (Pack)</th>
                                <th scope="col" className="px-4 py-3 text-right font-semibold text-app-text-secondary whitespace-nowrap bg-gray-50 dark:bg-gray-800">PTR</th>
                                <th scope="col" className="px-4 py-3 text-right font-semibold text-app-text-secondary whitespace-nowrap bg-gray-50 dark:bg-gray-800">MRP (Pack)</th>
                                <th scope="col" className="px-4 py-3 text-right font-semibold text-app-text-secondary whitespace-nowrap bg-gray-50 dark:bg-gray-800">Unit Cost</th>
                                <th scope="col" className="px-4 py-3 text-right font-semibold text-app-text-secondary whitespace-nowrap bg-gray-50 dark:bg-gray-800">Stock Value</th>
                                <th scope="col" className="px-4 py-3 text-right font-semibold text-app-text-secondary whitespace-nowrap bg-gray-50 dark:bg-gray-800">GST %</th>
                                <th scope="col" className="px-4 py-3 text-left font-semibold text-app-text-secondary whitespace-nowrap bg-gray-50 dark:bg-gray-800">HSN</th>
                                <th scope="col" className="px-4 py-3 text-left font-semibold text-app-text-secondary whitespace-nowrap bg-gray-50 dark:bg-gray-800">Rack</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-app-border bg-card-bg">
                            {data.map((item, index) => {
                                // item.stock is total loose units
                                const stockInPacks = Math.floor(item.stock / (item.unitsPerPack || 1));
                                const stockInLoose = item.stock % (item.unitsPerPack || 1);
                                
                                return (
                                    <tr key={index} className="hover:bg-hover transition-colors bg-card-bg">
                                        <td className="px-4 py-2 font-medium text-app-text-primary whitespace-nowrap">{item.name}</td>
                                        <td className="px-4 py-2 text-app-text-secondary whitespace-nowrap">{item.brand}</td>
                                        <td className="px-4 py-2 text-center text-app-text-secondary whitespace-nowrap">{item.packType || 'N/A'}</td>
                                        <td className="px-4 py-2 text-app-text-primary whitespace-nowrap">{item.batch}</td>
                                        <td className="px-4 py-2 text-center text-app-text-secondary whitespace-nowrap">{item.expiry}</td>
                                        <td className="px-4 py-2 text-right text-app-text-primary whitespace-nowrap font-medium">
                                            {item.stock} <span className="text-xs font-normal text-gray-500">({stockInPacks}:{stockInLoose})</span>
                                        </td>
                                        <td className="px-4 py-2 text-right text-app-text-secondary whitespace-nowrap">₹{(item.purchasePrice || 0).toFixed(2)}</td>
                                        <td className="px-4 py-2 text-right text-app-text-secondary whitespace-nowrap">₹{(item.ptr || 0).toFixed(2)}</td>
                                        <td className="px-4 py-2 text-right text-app-text-secondary whitespace-nowrap">₹{(item.mrp || 0).toFixed(2)}</td>
                                        <td className="px-4 py-2 text-right text-blue-600 whitespace-nowrap">₹{(item.cost || 0).toFixed(2)}</td>
                                        <td className="px-4 py-2 text-right text-green-600 font-semibold whitespace-nowrap">₹{(item.value || 0).toFixed(2)}</td>
                                        <td className="px-4 py-2 text-right text-app-text-secondary whitespace-nowrap">{item.gstPercent}%</td>
                                        <td className="px-4 py-2 text-app-text-secondary whitespace-nowrap">{item.hsnCode}</td>
                                        <td className="px-4 py-2 text-app-text-secondary whitespace-nowrap">{item.rackNumber}</td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Footer Actions */}
            <div className="flex justify-end items-center p-4 bg-gray-50 dark:bg-gray-800/90 border-t border-app-border flex-shrink-0 gap-3 z-30 sticky bottom-0">
                <button 
                    onClick={onClose} 
                    disabled={isSaving}
                    className="px-4 py-2 text-sm font-semibold text-app-text-secondary bg-card-bg border border-app-border rounded-lg shadow-sm hover:bg-hover transition-colors"
                >
                    Cancel Import
                </button>
                <button 
                    onClick={onSave} 
                    disabled={data.length === 0 || isSaving}
                    className="px-6 py-2 text-sm font-semibold text-white bg-primary rounded-lg shadow-sm hover:bg-primary-dark transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    {isSaving ? 'Processing…' : `Save ${data.length} Items`}
                </button>
            </div>
        </Modal>
    );
};

export default ImportPreviewModal;
