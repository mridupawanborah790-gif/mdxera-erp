import React from 'react';
import Modal from '../../../core/components/Modal';
import { getOutstandingBalance } from '../../../core/utils/helpers'; // Assuming this helper exists

interface CustomerImportData {
    data: {
        name: string;
        phone?: string;
        email?: string;
        address?: string;
        area?: string;
        pincode?: string;
        district?: string;
        state?: string;
        gstNumber?: string;
        drugLicense?: string;
        panCard?: string;
        defaultDiscount?: number;
        customerType?: 'regular' | 'retail';
        isActive?: boolean;
        defaultRateTier?: 'none' | 'rateA' | 'rateB' | 'rateC';
        assignedStaffId?: string;
        assignedStaffName?: string;
    };
    openingBalance: number;
    asOfDate: string;
}

interface ImportPreviewModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: (data: CustomerImportData[]) => void;
    isSaving?: boolean;
    data: CustomerImportData[];
}

const CustomerImportPreviewModal: React.FC<ImportPreviewModalProps> = ({ isOpen, onClose, onSave, isSaving = false, data }) => {
    if (!isOpen) return null;

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Customer Import Preview" widthClass="max-w-7xl">
            <div className="flex flex-col flex-1 min-h-0 overflow-hidden bg-card-bg relative">
                <div className="p-4 border-b border-app-border bg-yellow-50 dark:bg-yellow-900/10 text-sm text-app-text-secondary flex-shrink-0">
                    <p>
                        Previewing <strong>{data.length}</strong> customers for import.
                        Existing customers with matching names will be updated. New ones will be created.
                    </p>
                </div>
                
                <div className="flex-1 overflow-auto relative">
                    <table className="min-w-full divide-y divide-app-border text-sm">
                        <thead className="sticky top-0 z-20 shadow-sm bg-gray-50 dark:bg-gray-800 ring-1 ring-black ring-opacity-5">
                            <tr>
                                <th className="px-4 py-3 text-left font-semibold text-app-text-secondary whitespace-nowrap bg-gray-50 dark:bg-gray-800">Name</th>
                                <th className="px-4 py-3 text-left font-semibold text-app-text-secondary whitespace-nowrap bg-gray-50 dark:bg-gray-800">Phone</th>
                                <th className="px-4 py-3 text-left font-semibold text-app-text-secondary whitespace-nowrap bg-gray-50 dark:bg-gray-800">Email</th>
                                <th className="px-4 py-3 text-left font-semibold text-app-text-secondary whitespace-nowrap bg-gray-50 dark:bg-gray-800">Address</th>
                                <th className="px-4 py-3 text-left font-semibold text-app-text-secondary whitespace-nowrap bg-gray-50 dark:bg-gray-800">Pincode</th>
                                <th className="px-4 py-3 text-left font-semibold text-app-text-secondary whitespace-nowrap bg-gray-50 dark:bg-gray-800">District</th>
                                <th className="px-4 py-3 text-left font-semibold text-app-text-secondary whitespace-nowrap bg-gray-50 dark:bg-gray-800">State</th>
                                <th className="px-4 py-3 text-left font-semibold text-app-text-secondary whitespace-nowrap bg-gray-50 dark:bg-gray-800">GSTIN</th>
                                <th className="px-4 py-3 text-left font-semibold text-app-text-secondary whitespace-nowrap bg-gray-50 dark:bg-gray-800">PAN</th>
                                <th className="px-4 py-3 text-right font-semibold text-app-text-secondary whitespace-nowrap bg-gray-50 dark:bg-gray-800">Opening Bal.</th>
                                <th className="px-4 py-3 text-left font-semibold text-app-text-secondary whitespace-nowrap bg-gray-50 dark:bg-gray-800">As of Date</th>
                                <th className="px-4 py-3 text-center font-semibold text-app-text-secondary whitespace-nowrap bg-gray-50 dark:bg-gray-800">Type</th>
                                <th className="px-4 py-3 text-center font-semibold text-app-text-secondary whitespace-nowrap bg-gray-50 dark:bg-gray-800">Status</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-app-border bg-card-bg">
                            {data.filter(Boolean).map((item, index) => (
                                <tr key={index} className="hover:bg-hover transition-colors bg-card-bg">
                                    <td className="px-4 py-2 font-medium text-app-text-primary whitespace-nowrap">{item.data?.name || 'N/A'}</td>
                                    <td className="px-4 py-2 text-app-text-secondary whitespace-nowrap">{item.data?.phone || 'N/A'}</td>
                                    <td className="px-4 py-2 text-app-text-secondary truncate max-w-[100px]">{item.data?.email || 'N/A'}</td>
                                    <td className="px-4 py-2 text-app-text-secondary truncate max-w-[150px]" title={item.data?.address}>{item.data?.address || 'N/A'}</td>
                                    <td className="px-4 py-2 text-app-text-secondary whitespace-nowrap">{item.data?.pincode || 'N/A'}</td>
                                    <td className="px-4 py-2 text-app-text-secondary whitespace-nowrap">{item.data?.district || 'N/A'}</td>
                                    <td className="px-4 py-2 text-app-text-secondary whitespace-nowrap">{item.data?.state || 'N/A'}</td>
                                    <td className="px-4 py-2 text-app-text-secondary whitespace-nowrap">{item.data?.gstNumber || 'N/A'}</td>
                                    <td className="px-4 py-2 text-app-text-secondary whitespace-nowrap">{item.data?.panCard || 'N/A'}</td>
                                    <td className="px-4 py-2 text-right text-app-text-primary whitespace-nowrap">₹{(item.openingBalance || 0).toFixed(2)}</td>
                                    <td className="px-4 py-2 text-app-text-secondary whitespace-nowrap">{item.asOfDate}</td>
                                    <td className="px-4 py-2 text-center">
                                        <span className={`px-2 py-0.5 rounded text-[10px] font-black uppercase ${item.data?.customerType === 'retail' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-700'}`}>
                                            {item.data?.customerType || 'Regular'}
                                        </span>
                                    </td>
                                    <td className="px-4 py-2 text-center">
                                        <span className={`px-2 py-0.5 rounded text-[10px] font-black uppercase ${item.data?.isActive !== false ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                                            {item.data?.isActive !== false ? 'Active' : 'Blocked'}
                                        </span>
                                    </td>
                                </tr>
                            ))}
                            {data.length === 0 && (
                                <tr>
                                    <td colSpan={13} className="py-20 text-center text-app-text-tertiary bg-white dark:bg-card-bg">
                                        No data to preview. Please upload a CSV file.
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
                        onClick={() => onSave(data)} 
                        disabled={data.length === 0 || isSaving}
                        className="px-6 py-2 text-sm font-semibold text-white bg-primary rounded-lg shadow-sm hover:bg-primary-dark transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {isSaving ? 'Processing…' : `Save ${data.length} Customers`}
                    </button>
                </div>
            </div>
        </Modal>
    );
};

export default CustomerImportPreviewModal;
