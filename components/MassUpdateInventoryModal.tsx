import React, { useState } from 'react';
import Modal from './Modal';

interface MassUpdateInventoryModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: (updates: { 
        name?: string;
        packType?: string;
        batch?: string; 
        expiry?: string; 
        supplierName?: string; 
        rackNumber?: string 
    }) => void;
    selectedCount: number;
}

const MassUpdateInventoryModal: React.FC<MassUpdateInventoryModalProps> = ({ isOpen, onClose, onSave, selectedCount }) => {
    const [name, setName] = useState('');
    const [packType, setPackType] = useState('');
    const [batch, setBatch] = useState('');
    const [expiry, setExpiry] = useState('');
    const [supplierName, setSupplierName] = useState('');
    const [rackNumber, setRackNumber] = useState('');

    const handleSave = () => {
        const updates: any = {};
        if (name.trim()) updates.name = name.trim();
        if (packType.trim()) updates.packType = packType.trim();
        if (batch.trim()) updates.batch = batch.trim();
        if (expiry.trim()) updates.expiry = expiry.trim();
        if (supplierName.trim()) updates.supplierName = supplierName.trim();
        if (rackNumber.trim()) updates.rackNumber = rackNumber.trim();

        if (Object.keys(updates).length > 0) {
            onSave(updates);
        } else {
            onClose();
        }
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Mass Update Inventory Items" widthClass="max-w-md">
            <div className="p-6 space-y-4">
                <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-800 p-3 rounded-lg">
                    <p className="text-xs text-blue-800 dark:text-blue-200">
                        Updating <strong>{selectedCount}</strong> items. Only fields with values will be updated. Leave blank to keep existing values.
                    </p>
                </div>

                <div className="grid grid-cols-1 gap-4">
                    <div>
                        <label className="block text-sm font-medium text-app-text-secondary">New Product Name</label>
                        <input 
                            type="text" 
                            value={name} 
                            onChange={e => setName(e.target.value)} 
                            className="mt-1 block w-full p-2 border border-app-border rounded-md bg-input-bg text-app-text-primary"
                            placeholder="e.g. New Product Name"
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-app-text-secondary">New Pack Type</label>
                        <input 
                            type="text" 
                            value={packType} 
                            onChange={e => setPackType(e.target.value)} 
                            className="mt-1 block w-full p-2 border border-app-border rounded-md bg-input-bg text-app-text-primary"
                            placeholder="e.g. 10's or 100ML"
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-app-text-secondary">New Batch Number</label>
                        <input 
                            type="text" 
                            value={batch} 
                            onChange={e => setBatch(e.target.value)} 
                            className="mt-1 block w-full p-2 border border-app-border rounded-md bg-input-bg text-app-text-primary"
                            placeholder="e.g. B-999"
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-app-text-secondary">New Expiry Date</label>
                        <input 
                            type="date" 
                            value={expiry} 
                            onChange={e => setExpiry(e.target.value)} 
                            className="mt-1 block w-full p-2 border border-app-border rounded-md bg-input-bg text-app-text-primary"
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-app-text-secondary">New Supplier Name</label>
                        <input 
                            type="text" 
                            value={supplierName} 
                            onChange={e => setSupplierName(e.target.value)} 
                            className="mt-1 block w-full p-2 border border-app-border rounded-md bg-input-bg text-app-text-primary"
                            placeholder="Distributor Name"
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-app-text-secondary">New Rack Number</label>
                        <input 
                            type="text" 
                            value={rackNumber} 
                            onChange={e => setRackNumber(e.target.value)} 
                            className="mt-1 block w-full p-2 border border-app-border rounded-md bg-input-bg text-app-text-primary"
                            placeholder="e.g. A-12"
                        />
                    </div>
                </div>
            </div>
            <div className="flex justify-end p-4 bg-hover border-t border-app-border space-x-3">
                <button onClick={onClose} className="px-4 py-2 text-sm font-semibold bg-card-bg border border-app-border rounded-lg hover:bg-gray-100">Cancel</button>
                <button onClick={handleSave} className="px-6 py-2 text-sm font-bold text-white bg-primary rounded-lg shadow-md hover:bg-primary-dark shadow-md shadow-primary/20">Apply Changes</button>
            </div>
        </Modal>
    );
};

export default MassUpdateInventoryModal;
