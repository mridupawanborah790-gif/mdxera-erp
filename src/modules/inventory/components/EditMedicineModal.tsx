import React, { useState, useCallback, useEffect } from 'react';
import Modal from '../../../core/components/Modal';
import type { Medicine } from '../../../core/types/types';
import { getResolvedMedicinePolicy, MATERIAL_TYPE_RULES, type MaterialMasterType } from '../../../core/utils/materialType';

interface EditMedicineModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: (updatedMedicine: Medicine) => void;
    medicine: Medicine | null;
}

const EditMedicineModal: React.FC<EditMedicineModalProps> = ({ isOpen, onClose, onSave, medicine }) => {
    const [formState, setFormState] = useState<Medicine | null>(null);
    const [errors, setErrors] = useState<Partial<Record<keyof Medicine, string>>>({});

    useEffect(() => {
        if (isOpen && medicine) {
            setFormState({ ...medicine });
            setErrors({});
        }
    }, [isOpen, medicine]);

    const validate = useCallback(() => {
        if (!formState) return false;
        const newErrors: Partial<Record<keyof Medicine, string>> = {};
        if (!formState.name.trim()) newErrors.name = "Product Name is required.";
        if (!formState.materialCode?.trim()) newErrors.materialCode = "Material Code is required.";
        
        setErrors(newErrors);
        return Object.keys(newErrors).length === 0;
    }, [formState]);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (formState && validate()) {
            onSave(formState);
            onClose();
        }
    };
    
    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
        if (!formState) return;
        const { name, value, type } = e.target;
        if (name === 'materialMasterType') {
            const policy = getResolvedMedicinePolicy({ materialMasterType: value as MaterialMasterType });
            setFormState(prev => prev ? ({
                ...prev,
                materialMasterType: value as MaterialMasterType,
                isInventorised: policy.inventorised,
                isSalesEnabled: policy.salesEnabled,
                isPurchaseEnabled: policy.purchaseEnabled,
                isProductionEnabled: policy.productionEnabled,
                isInternalIssueEnabled: policy.internalIssueEnabled,
            }) : null);
            return;
        }
        const isNumber = type === 'number';
        setFormState(prev => prev ? ({ ...prev, [name]: isNumber ? parseFloat(value) || 0 : value }) : null);
    };

    if (!formState) return null;

    const materialPolicy = getResolvedMedicinePolicy(formState);

    const renderInput = (name: keyof Medicine, label: string, type = 'text', isOptional = true) => (
        <div>
            <label className="block text-[10px] font-black uppercase text-gray-500 mb-1 ml-1">{label} {!isOptional && '*'}</label>
            <input 
                type={type} 
                name={name} 
                value={(formState[name] as string | number) ?? ''} 
                onChange={handleChange} 
                className={`mt-1 block w-full p-2 border border-gray-400 font-bold text-sm bg-input-bg text-app-text-primary ${errors[name] ? 'border-red-500' : 'focus:bg-yellow-50 outline-none'}`} 
            />
            {errors[name] && <p className="text-[10px] text-red-500 mt-1 uppercase font-bold">{errors[name]}</p>}
        </div>
    );

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={`Alter Material Record: ${medicine?.name}`} widthClass="max-w-6xl">
            <form onSubmit={handleSubmit} className="flex flex-col h-full overflow-hidden">
                <div className="p-6 overflow-y-auto space-y-6 flex-1 bg-[var(--modal-bg-light)] dark:bg-[var(--modal-bg-dark)]">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        {renderInput('name', 'Product Name', 'text', false)}
                        {renderInput('materialCode', 'Material Code', 'text', false)}
                        {renderInput('barcode', 'Barcode')}
                        {renderInput('brand', 'Brand Name')}
                        {renderInput('manufacturer', 'Manufacturer')}
                        {renderInput('marketer', 'Marketer')}
                        {renderInput('pack', 'Pack (e.g. 10s, 100ml)')}
                        <div>
                            <label className="block text-[10px] font-black uppercase text-gray-500 mb-1 ml-1">Material Master Type *</label>
                            <select
                                name="materialMasterType"
                                value={formState.materialMasterType || 'trading_goods'}
                                onChange={handleChange}
                                className="mt-1 block w-full p-2 border border-gray-400 font-bold text-sm bg-white text-app-text-primary focus:bg-yellow-50 outline-none"
                            >
                                {Object.entries(MATERIAL_TYPE_RULES).map(([value, rule]) => (
                                    <option key={value} value={value}>{rule.label}</option>
                                ))}
                            </select>
                        </div>
                        {renderInput('hsnCode', 'HSN Code')}
                        {renderInput('countryOfOrigin', 'Country of Origin')}
                    </div>

                    <div className="bg-blue-50 p-4 border border-blue-100 grid grid-cols-1 md:grid-cols-3 gap-3">
                        <div className="text-xs font-bold uppercase text-blue-900">Inventorised: {materialPolicy.inventorised ? 'Yes' : 'No'}</div>
                        <div className="text-xs font-bold uppercase text-blue-900">Sales Enabled: {materialPolicy.salesEnabled ? 'Yes' : 'No'}</div>
                        <div className="text-xs font-bold uppercase text-blue-900">Purchase Enabled: {materialPolicy.purchaseEnabled ? 'Yes' : 'No'}</div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="md:col-span-1">
                            <label className="block text-[10px] font-black uppercase text-gray-500 mb-1 ml-1">Chemical Composition</label>
                            <textarea name="composition" value={formState.composition || ''} onChange={handleChange} rows={2} className="w-full p-2 border border-gray-400 font-bold text-sm bg-input-bg focus:bg-yellow-50 outline-none" />
                        </div>
                        <div className="md:col-span-1">
                            <label className="block text-[10px] font-black uppercase text-gray-500 mb-1 ml-1">Description</label>
                            <textarea name="description" value={formState.description || ''} onChange={handleChange} rows={2} className="w-full p-2 border border-gray-400 font-bold text-sm bg-input-bg focus:bg-yellow-50 outline-none" />
                        </div>
                        <div className="md:col-span-2">
                            <label className="block text-[10px] font-black uppercase text-gray-500 mb-1 ml-1">Usage Directions</label>
                            <textarea name="directions" value={formState.directions || ''} onChange={handleChange} rows={2} className="w-full p-2 border border-gray-400 font-bold text-sm bg-input-bg focus:bg-yellow-50 outline-none" />
                        </div>
                    </div>

                    <div className="bg-gray-50 p-4 border border-gray-200">
                        <p className="text-[11px] font-black text-primary uppercase tracking-widest mb-4">Pricing & Taxes</p>
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-[10px] font-black uppercase text-gray-500 mb-1 ml-1">GST Rate (%)</label>
                                <select name="gstRate" value={formState.gstRate} onChange={handleChange} className="w-full p-2 border border-gray-400 font-bold text-sm bg-white outline-none">
                                    <option value={0}>0%</option>
                                    <option value={5}>5%</option>
                                    <option value={12}>12%</option>
                                    <option value={18}>18%</option>
                                    <option value={28}>28%</option>
                                </select>
                            </div>
                        </div>
                    </div>

                    <div className="pt-4 border-t border-gray-100 flex gap-4">
                        <div className="flex items-center gap-2 bg-blue-50 p-3 border border-blue-100 flex-1">
                            <input type="checkbox" id="prescReqEdit" checked={formState.isPrescriptionRequired} onChange={e => setFormState(p => p ? ({ ...p, isPrescriptionRequired: e.target.checked }) : null)} className="w-4 h-4 text-primary" />
                            <label htmlFor="prescReqEdit" className="text-xs font-bold text-blue-900 uppercase">Prescription Required</label>
                        </div>
                        <div className="flex items-center gap-2 bg-gray-50 p-3 border border-gray-100 flex-1">
                            <input type="checkbox" id="isActiveEdit" checked={formState.is_active} onChange={e => setFormState(p => p ? ({ ...p, is_active: e.target.checked }) : null)} className="w-4 h-4 text-primary" />
                            <label htmlFor="isActiveEdit" className="text-xs font-bold text-gray-700 uppercase">Active Record</label>
                        </div>
                    </div>
                </div>
                <div className="p-4 bg-[var(--modal-footer-bg-light)] dark:bg-[var(--modal-footer-bg-dark)] border-t border-[var(--modal-footer-border-light)] dark:border-[var(--modal-footer-border-dark)] flex justify-end gap-3 flex-shrink-0">
                    <button type="button" onClick={onClose} className="px-8 py-2 text-[10px] font-black uppercase tracking-widest text-gray-500 hover:text-black">Cancel</button>
                    <button type="submit" className="px-12 py-3 bg-[var(--modal-header-bg-light)] dark:bg-[var(--modal-header-bg-dark)] text-white text-[11px] font-black uppercase tracking-[0.2em] shadow-xl hover:bg-primary-dark transition-all transform active:scale-95">Update Master Record</button>
                </div>
            </form>
        </Modal>
    );
};

export default EditMedicineModal;
