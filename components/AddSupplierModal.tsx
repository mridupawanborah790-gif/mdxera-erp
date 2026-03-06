
import React, { useState, useEffect } from 'react';
import Modal from './Modal';
import type { Supplier } from '../types';
import type { SupplierQuickResult } from '../services/supplierService';
import { handleEnterToNextField } from '../utils/navigation';
import { STATE_DISTRICT_MAP } from '../constants';
import { getOutstandingBalance } from '../utils/helpers';
import { generateUUID } from '../services/storageService';

const states = Object.keys(STATE_DISTRICT_MAP).sort();
const supplierCategories = ["Wholesaler", "Manufacturer", "C&F", "Local Vendor", "Distributor", "Agency"];
const supplierGroupOptions = ["Sundry Creditors", "Import Vendors", "Service Vendors", "Local Vendors"];

const createInitialState = (): Omit<Supplier, 'ledger' | 'organization_id'> => ({
    id: generateUUID(),
    user_id: '',
    name: '',
    contact_person: '',
    category: 'Wholesaler',
    phone: '',
    mobile: '',
    email: '',
    website: '',
    address: '',
    address_line1: '',
    address_line2: '',
    area: '',
    pincode: '',
    district: '',
    state: '',
    gst_number: '',
    pan_number: '',
    drug_license: '',
    food_license: '',
    opening_balance: 0,
    payment_details: { 
        upi_id: '', 
        bank_name: '', 
        ifsc_code: '', 
        branch_name: '', 
        payment_terms: '30 Days', 
        account_number: '' 
    },
    is_active: true,
    is_blocked: false,
    remarks: '',
    supplier_group: 'Sundry Creditors',
    control_gl_id: ''
});

export const AddSupplierModal: React.FC<{
    isOpen: boolean; 
    onClose: () => void; 
    onAdd: (data: Omit<Supplier, 'ledger' | 'organization_id'>, balance: number, date: string) => Promise<SupplierQuickResult>;
    onDuplicate?: (supplier: Supplier) => void;
    organizationId: string;
    prefillData?: Partial<Supplier>;
    defaultControlGlId?: string;
}> = ({ isOpen, onClose, onAdd, onDuplicate, organizationId, prefillData, defaultControlGlId }) => {
    const [form, setForm] = useState(createInitialState());
    const [asOfDate, setAsOfDate] = useState(new Date().toISOString().split('T')[0]);
    const [isSaving, setIsSaving] = useState(false);

    useEffect(() => {
        if (isOpen) {
            setForm({
                ...createInitialState(),
                control_gl_id: defaultControlGlId || '',
                ...prefillData,
                address_line1: prefillData?.address_line1 || prefillData?.address || '',
                address: prefillData?.address_line1 || prefillData?.address || '',
            });
            setAsOfDate(new Date().toISOString().split('T')[0]);
        }
    }, [isOpen, prefillData, defaultControlGlId]);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
        const { name, value, type } = e.target;
        
        if (name.startsWith('payment_details.')) {
            const field = name.split('.')[1];
            setForm(prev => ({
                ...prev,
                payment_details: { ...prev.payment_details, [field]: value }
            }));
            return;
        }

        if (name === 'state') {
             setForm(prev => ({ ...prev, state: value, district: '' }));
        } else if (name === 'address_line1') {
             setForm(prev => ({ ...prev, address_line1: value, address: value }));
        } else {
             setForm(prev => ({ ...prev, [name]: type === 'number' ? parseFloat(value) || 0 : value } as any));
        }
    };

    const handleSubmit = async () => {
        if (!form.name.trim()) {
            alert('Supplier Name is required.');
            return;
        }
        if (!(form.supplier_group || '').trim()) {
            alert('Supplier Group is required.');
            return;
        }
        setIsSaving(true);
        try {
            const result = await onAdd(form, form.opening_balance || 0, asOfDate);
            if (result.status === 'duplicate') {
                onDuplicate?.(result.supplier);
            }
            onClose();
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Register New Supplier Ledger" widthClass="max-w-4xl">
            <div className="p-6 overflow-y-auto max-h-[75vh] space-y-6" onKeyDown={handleEnterToNextField}>
                <section className="space-y-4">
                    <h4 className="text-[11px] font-black text-primary uppercase tracking-[0.2em] border-b border-gray-200 pb-1 mb-4">Core Identity</h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="md:col-span-2">
                            <label className="block text-[10px] font-black uppercase text-gray-500 mb-1 ml-1">Supplier Trade Name *</label>
                            <input type="text" name="name" value={form.name} onChange={handleChange} autoFocus className="w-full border border-gray-400 p-2 font-bold text-sm uppercase focus:bg-yellow-50 outline-none" placeholder="e.g. GLOBAL PHARMA DISTRIBUTORS" />
                        </div>
                        <div>
                            <label className="block text-[10px] font-black uppercase text-gray-500 mb-1 ml-1">Contact Person</label>
                            <input type="text" name="contact_person" value={form.contact_person || ''} onChange={handleChange} className="w-full border border-gray-400 p-2 font-bold text-sm uppercase focus:bg-yellow-50 outline-none" />
                        </div>
                        <div>
                            <label className="block text-[10px] font-black uppercase text-gray-500 mb-1 ml-1">Supplier Category</label>
                            <select name="category" value={form.category} onChange={handleChange} className="w-full border border-gray-400 p-2 font-bold text-sm focus:bg-yellow-50 outline-none">
                                {supplierCategories.map(cat => <option key={cat} value={cat}>{cat}</option>)}
                            </select>
                        </div>
                        <div>
                            <label className="block text-[10px] font-black uppercase text-gray-500 mb-1 ml-1">Supplier Group *</label>
                            <select name="supplier_group" value={form.supplier_group || 'Sundry Creditors'} onChange={handleChange} className="w-full border border-gray-400 p-2 font-bold text-sm focus:bg-yellow-50 outline-none">
                                {supplierGroupOptions.map(group => <option key={group} value={group}>{group}</option>)}
                            </select>
                        </div>
                        <div>
                            <label className="block text-[10px] font-black uppercase text-gray-500 mb-1 ml-1">Supplier Control GL</label>
                            <input type="text" readOnly value={form.control_gl_id ? `Mapped (${form.control_gl_id})` : 'Auto-map from Set of Books'} className="w-full border border-gray-400 p-2 text-sm bg-gray-100" />
                        </div>
                    </div>
                </section>

                <section className="space-y-4">
                    <h4 className="text-[11px] font-black text-primary uppercase tracking-[0.2em] border-b border-gray-200 pb-1 mb-4">Contact & Communication</h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label className="block text-[10px] font-black uppercase text-gray-500 mb-1 ml-1">Office Phone</label>
                            <input type="text" name="phone" value={form.phone || ''} onChange={handleChange} className="w-full border border-gray-400 p-2 font-bold text-sm focus:bg-yellow-50 outline-none" />
                        </div>
                        <div>
                            <label className="block text-[10px] font-black uppercase text-gray-500 mb-1 ml-1">Mobile No.</label>
                            <input type="text" name="mobile" value={form.mobile || ''} onChange={handleChange} className="w-full border border-gray-400 p-2 font-bold text-sm focus:bg-yellow-50 outline-none" />
                        </div>
                        <div>
                            <label className="block text-[10px] font-black uppercase text-gray-500 mb-1 ml-1">Email ID</label>
                            <input type="email" name="email" value={form.email || ''} onChange={handleChange} className="w-full border border-gray-400 p-2 font-bold text-sm focus:bg-yellow-50 outline-none" />
                        </div>
                        <div>
                            <label className="block text-[10px] font-black uppercase text-gray-500 mb-1 ml-1">GSTIN</label>
                            <input type="text" name="gst_number" value={form.gst_number || ''} onChange={handleChange} className="w-full border border-gray-400 p-2 font-bold text-sm uppercase focus:bg-yellow-50 outline-none" />
                        </div>
                    </div>
                </section>

                <section className="space-y-4">
                    <h4 className="text-[11px] font-black text-primary uppercase tracking-[0.2em] border-b border-gray-200 pb-1 mb-4">Address Information</h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="md:col-span-2">
                            <label className="block text-[10px] font-black uppercase text-gray-500 mb-1 ml-1">Address Line 1</label>
                            <input type="text" name="address_line1" value={form.address_line1 || form.address || ''} onChange={handleChange} className="w-full border border-gray-400 p-2 font-bold text-sm uppercase focus:bg-yellow-50 outline-none" placeholder="Building / Street / Landmark" />
                        </div>
                        <div className="md:col-span-2">
                            <label className="block text-[10px] font-black uppercase text-gray-500 mb-1 ml-1">Address Line 2</label>
                            <input type="text" name="address_line2" value={form.address_line2 || ''} onChange={handleChange} className="w-full border border-gray-400 p-2 font-bold text-sm uppercase focus:bg-yellow-50 outline-none" placeholder="Additional address details" />
                        </div>
                        <div>
                            <label className="block text-[10px] font-black uppercase text-gray-500 mb-1 ml-1">Area / Locality</label>
                            <input type="text" name="area" value={form.area || ''} onChange={handleChange} className="w-full border border-gray-400 p-2 font-bold text-sm uppercase focus:bg-yellow-50 outline-none" placeholder="Area / Locality" />
                        </div>
                        <div>
                            <label className="block text-[10px] font-black uppercase text-gray-500 mb-1 ml-1">Pincode</label>
                            <input type="text" name="pincode" value={form.pincode || ''} onChange={handleChange} className="w-full border border-gray-400 p-2 font-bold text-sm focus:bg-yellow-50 outline-none" placeholder="6 digit pincode" />
                        </div>
                        <div>
                            <label className="block text-[10px] font-black uppercase text-gray-500 mb-1 ml-1">District</label>
                            <select name="district" value={form.district || ''} onChange={handleChange} disabled={!form.state} className="w-full border border-gray-400 p-2 font-bold text-sm focus:bg-yellow-50 outline-none disabled:bg-gray-100">
                                <option value="">Select District</option>
                                {form.state && STATE_DISTRICT_MAP[form.state]?.map(d => <option key={d} value={d}>{d}</option>)}
                            </select>
                        </div>
                        <div>
                            <label className="block text-[10px] font-black uppercase text-gray-500 mb-1 ml-1">State</label>
                            <select name="state" value={form.state || ''} onChange={handleChange} className="w-full border border-gray-400 p-2 font-bold text-sm focus:bg-yellow-50 outline-none">
                                <option value="">Select State</option>
                                {states.map(s => <option key={s} value={s}>{s}</option>)}
                            </select>
                        </div>
                    </div>
                </section>

                <section className="space-y-4">
                    <h4 className="text-[11px] font-black text-primary uppercase tracking-[0.2em] border-b border-gray-200 pb-1 mb-4">Banking & Settlements</h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label className="block text-[10px] font-black uppercase text-gray-500 mb-1 ml-1">UPI ID for QR</label>
                            <input type="text" name="payment_details.upi_id" value={form.payment_details.upi_id || ''} onChange={handleChange} placeholder="e.g. supplier@upi" className="w-full border border-gray-400 p-2 font-bold text-sm focus:bg-yellow-50 outline-none" />
                        </div>
                        <div>
                            <label className="block text-[10px] font-black uppercase text-gray-500 mb-1 ml-1">Bank Name</label>
                            <input type="text" name="payment_details.bank_name" value={form.payment_details.bank_name || ''} onChange={handleChange} className="w-full border border-gray-400 p-2 font-bold text-sm focus:bg-yellow-50 outline-none" />
                        </div>
                        <div>
                            <label className="block text-[10px] font-black uppercase text-gray-500 mb-1 ml-1">A/c Number</label>
                            <input type="text" name="payment_details.account_number" value={form.payment_details.account_number || ''} onChange={handleChange} className="w-full border border-gray-400 p-2 font-bold text-sm focus:bg-yellow-50 outline-none" />
                        </div>
                        <div>
                            <label className="block text-[10px] font-black uppercase text-gray-500 mb-1 ml-1">IFSC Code</label>
                            <input type="text" name="payment_details.ifsc_code" value={form.payment_details.ifsc_code || ''} onChange={handleChange} className="w-full border border-gray-400 p-2 font-bold text-sm uppercase focus:bg-yellow-50 outline-none" />
                        </div>
                    </div>
                </section>

                <section className="p-4 bg-primary/5 border border-primary/10">
                    <h4 className="text-[11px] font-black text-primary uppercase tracking-[0.2em] mb-4">Opening Balance Information</h4>
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-[10px] font-black uppercase text-gray-500 mb-1 ml-1">Opening Amount (₹)</label>
                            <input type="number" name="opening_balance" value={form.opening_balance || 0} onChange={handleChange} className="w-full border border-gray-400 p-2 font-black text-base text-red-700 outline-none focus:bg-yellow-50" />
                        </div>
                        <div>
                            <label className="block text-[10px] font-black uppercase text-gray-500 mb-1 ml-1">Opening Date</label>
                            <input type="date" value={asOfDate} onChange={e => setAsOfDate(e.target.value)} className="w-full border border-gray-400 p-2 font-bold text-sm outline-none" />
                        </div>
                    </div>
                </section>
            </div>
            <div className="flex justify-end p-5 bg-gray-100 border-t border-gray-300 gap-3">
                <button onClick={onClose} className="px-6 py-2 text-[10px] font-black uppercase border border-gray-400 bg-white hover:bg-red-50 text-red-600 transition-colors">Discard</button>
                <button onClick={handleSubmit} disabled={isSaving} className="px-14 py-2 tally-button-primary shadow-xl tracking-widest text-[11px] disabled:opacity-50">{isSaving ? 'Saving…' : 'Create Ledger'}</button>
            </div>
        </Modal>
    );
};

export const EditSupplierModal: React.FC<{
    isOpen: boolean;
    onClose: () => void;
    onSave: (supplier: Supplier) => void;
    supplier: Supplier;
}> = ({ isOpen, onClose, onSave, supplier }) => {
    const [form, setForm] = useState(supplier);
    const [asOfDate, setAsOfDate] = useState(new Date().toISOString().split('T')[0]);

    const resolveOpeningDate = (source: Supplier) => {
        const openingEntry = (source.ledger || []).find((entry) => entry.type === 'openingBalance');
        return openingEntry?.date || new Date().toISOString().split('T')[0];
    };

    useEffect(() => {
        if (isOpen) {
            setForm({
                ...supplier,
                address_line1: supplier.address_line1 || supplier.address || '',
                address: supplier.address_line1 || supplier.address || '',
                payment_details: { ...supplier.payment_details }
            });
            setAsOfDate(resolveOpeningDate(supplier));
        }
    }, [isOpen, supplier]);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
        const { name, value, type } = e.target;
        
        if (name.startsWith('payment_details.')) {
            const field = name.split('.')[1];
            setForm(prev => ({
                ...prev,
                payment_details: { ...prev.payment_details, [field]: value }
            }));
            return;
        }

        if (name === 'state') {
            setForm(prev => ({ ...prev, state: value, district: '' }));
        } else if (name === 'address_line1') {
            setForm(prev => ({ ...prev, address_line1: value, address: value }));
        } else {
            setForm(prev => ({ ...prev, [name]: type === 'number' ? parseFloat(value) || 0 : value } as any));
        }
    };

    const handleSubmit = () => {
        if (!form.name.trim()) {
            alert('Supplier Name is mandatory.');
            return;
        }
        if (!(form.supplier_group || '').trim()) {
            alert('Supplier Group is required.');
            return;
        }
        onSave(form);
        onClose();
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={`Alter Supplier: ${supplier.name}`} widthClass="max-w-4xl">
            <div className="p-6 overflow-y-auto max-h-[75vh] space-y-6" onKeyDown={handleEnterToNextField}>
                <section className="space-y-4">
                    <h4 className="text-[11px] font-black text-primary uppercase tracking-[0.2em] border-b border-gray-200 pb-1 mb-4">Core Identity</h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="md:col-span-2">
                            <label className="block text-[10px] font-black uppercase text-gray-500 mb-1 ml-1">Supplier Trade Name *</label>
                            <input type="text" name="name" value={form.name} onChange={handleChange} autoFocus className="w-full border border-gray-400 p-2 font-bold text-sm uppercase focus:bg-yellow-50 outline-none" placeholder="e.g. GLOBAL PHARMA DISTRIBUTORS" />
                        </div>
                        <div>
                            <label className="block text-[10px] font-black uppercase text-gray-500 mb-1 ml-1">Contact Person</label>
                            <input type="text" name="contact_person" value={form.contact_person || ''} onChange={handleChange} className="w-full border border-gray-400 p-2 font-bold text-sm uppercase focus:bg-yellow-50 outline-none" />
                        </div>
                        <div>
                            <label className="block text-[10px] font-black uppercase text-gray-500 mb-1 ml-1">Supplier Category</label>
                            <select name="category" value={form.category} onChange={handleChange} className="w-full border border-gray-400 p-2 font-bold text-sm focus:bg-yellow-50 outline-none">
                                {supplierCategories.map(cat => <option key={cat} value={cat}>{cat}</option>)}
                            </select>
                        </div>
                        <div>
                            <label className="block text-[10px] font-black uppercase text-gray-500 mb-1 ml-1">Supplier Group *</label>
                            <select name="supplier_group" value={form.supplier_group || 'Sundry Creditors'} onChange={handleChange} className="w-full border border-gray-400 p-2 font-bold text-sm focus:bg-yellow-50 outline-none">
                                {supplierGroupOptions.map(group => <option key={group} value={group}>{group}</option>)}
                            </select>
                        </div>
                        <div>
                            <label className="block text-[10px] font-black uppercase text-gray-500 mb-1 ml-1">Supplier Control GL</label>
                            <input type="text" readOnly value={form.control_gl_id ? `Mapped (${form.control_gl_id})` : 'Auto-map from Set of Books'} className="w-full border border-gray-400 p-2 text-sm bg-gray-100" />
                        </div>
                    </div>
                </section>

                <section className="space-y-4">
                    <h4 className="text-[11px] font-black text-primary uppercase tracking-[0.2em] border-b border-gray-200 pb-1 mb-4">Contact & Communication</h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label className="block text-[10px] font-black uppercase text-gray-500 mb-1 ml-1">Office Phone</label>
                            <input type="text" name="phone" value={form.phone || ''} onChange={handleChange} className="w-full border border-gray-400 p-2 font-bold text-sm focus:bg-yellow-50 outline-none" />
                        </div>
                        <div>
                            <label className="block text-[10px] font-black uppercase text-gray-500 mb-1 ml-1">Mobile No.</label>
                            <input type="text" name="mobile" value={form.mobile || ''} onChange={handleChange} className="w-full border border-gray-400 p-2 font-bold text-sm focus:bg-yellow-50 outline-none" />
                        </div>
                        <div>
                            <label className="block text-[10px] font-black uppercase text-gray-500 mb-1 ml-1">Email ID</label>
                            <input type="email" name="email" value={form.email || ''} onChange={handleChange} className="w-full border border-gray-400 p-2 font-bold text-sm focus:bg-yellow-50 outline-none" />
                        </div>
                        <div>
                            <label className="block text-[10px] font-black uppercase text-gray-500 mb-1 ml-1">GSTIN</label>
                            <input type="text" name="gst_number" value={form.gst_number || ''} onChange={handleChange} className="w-full border border-gray-400 p-2 font-bold text-sm uppercase focus:bg-yellow-50 outline-none" />
                        </div>
                    </div>
                </section>

                <section className="space-y-4">
                    <h4 className="text-[11px] font-black text-primary uppercase tracking-[0.2em] border-b border-gray-200 pb-1 mb-4">Address Information</h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="md:col-span-2">
                            <label className="block text-[10px] font-black uppercase text-gray-500 mb-1 ml-1">Address Line 1</label>
                            <input type="text" name="address_line1" value={form.address_line1 || form.address || ''} onChange={handleChange} className="w-full border border-gray-400 p-2 font-bold text-sm uppercase focus:bg-yellow-50 outline-none" />
                        </div>
                        <div className="md:col-span-2">
                            <label className="block text-[10px] font-black uppercase text-gray-500 mb-1 ml-1">Address Line 2</label>
                            <input type="text" name="address_line2" value={form.address_line2 || ''} onChange={handleChange} className="w-full border border-gray-400 p-2 font-bold text-sm uppercase focus:bg-yellow-50 outline-none" />
                        </div>
                        <div>
                            <label className="block text-[10px] font-black uppercase text-gray-500 mb-1 ml-1">Area / Locality</label>
                            <input type="text" name="area" value={form.area || ''} onChange={handleChange} className="w-full border border-gray-400 p-2 font-bold text-sm uppercase focus:bg-yellow-50 outline-none" />
                        </div>
                        <div>
                            <label className="block text-[10px] font-black uppercase text-gray-500 mb-1 ml-1">Pincode</label>
                            <input type="text" name="pincode" value={form.pincode || ''} onChange={handleChange} className="w-full border border-gray-400 p-2 font-bold text-sm focus:bg-yellow-50 outline-none" />
                        </div>
                        <div>
                            <label className="block text-[10px] font-black uppercase text-gray-500 mb-1 ml-1">District</label>
                            <select name="district" value={form.district || ''} onChange={handleChange} disabled={!form.state} className="w-full border border-gray-400 p-2 font-bold text-sm focus:bg-yellow-50 outline-none disabled:bg-gray-100">
                                <option value="">Select District</option>
                                {form.state && STATE_DISTRICT_MAP[form.state]?.map(d => <option key={d} value={d}>{d}</option>)}
                            </select>
                        </div>
                        <div>
                            <label className="block text-[10px] font-black uppercase text-gray-500 mb-1 ml-1">State</label>
                            <select name="state" value={form.state || ''} onChange={handleChange} className="w-full border border-gray-400 p-2 font-bold text-sm focus:bg-yellow-50 outline-none">
                                <option value="">Select State</option>
                                {states.map(s => <option key={s} value={s}>{s}</option>)}
                            </select>
                        </div>
                    </div>
                </section>

                <section className="space-y-4">
                    <h4 className="text-[11px] font-black text-primary uppercase tracking-[0.2em] border-b border-gray-200 pb-1 mb-4">Banking & Settlements</h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label className="block text-[10px] font-black uppercase text-gray-500 mb-1 ml-1">UPI ID for QR</label>
                            <input type="text" name="payment_details.upi_id" value={form.payment_details.upi_id || ''} onChange={handleChange} placeholder="e.g. supplier@upi" className="w-full border border-gray-400 p-2 font-bold text-sm focus:bg-yellow-50 outline-none" />
                        </div>
                        <div>
                            <label className="block text-[10px] font-black uppercase text-gray-500 mb-1 ml-1">Bank Name</label>
                            <input type="text" name="payment_details.bank_name" value={form.payment_details.bank_name || ''} onChange={handleChange} className="w-full border border-gray-400 p-2 font-bold text-sm focus:bg-yellow-50 outline-none" />
                        </div>
                        <div>
                            <label className="block text-[10px] font-black uppercase text-gray-500 mb-1 ml-1">A/c Number</label>
                            <input type="text" name="payment_details.account_number" value={form.payment_details.account_number || ''} onChange={handleChange} className="w-full border border-gray-400 p-2 font-bold text-sm focus:bg-yellow-50 outline-none" />
                        </div>
                        <div>
                            <label className="block text-[10px] font-black uppercase text-gray-500 mb-1 ml-1">IFSC Code</label>
                            <input type="text" name="payment_details.ifsc_code" value={form.payment_details.ifsc_code || ''} onChange={handleChange} className="w-full border border-gray-400 p-2 font-bold text-sm uppercase focus:bg-yellow-50 outline-none" />
                        </div>
                    </div>
                </section>

                <section className="p-4 bg-primary/5 border border-primary/10">
                    <h4 className="text-[11px] font-black text-primary uppercase tracking-[0.2em] mb-4">Opening Balance Information</h4>
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-[10px] font-black uppercase text-gray-500 mb-1 ml-1">Opening Amount (₹)</label>
                            <input type="number" name="opening_balance" value={form.opening_balance || 0} onChange={handleChange} className="w-full border border-gray-400 p-2 font-black text-base text-red-700 outline-none focus:bg-yellow-50" />
                        </div>
                        <div>
                            <label className="block text-[10px] font-black uppercase text-gray-500 mb-1 ml-1">Opening Date</label>
                            <input type="date" value={asOfDate} onChange={e => setAsOfDate(e.target.value)} className="w-full border border-gray-400 p-2 font-bold text-sm outline-none" />
                        </div>
                    </div>
                </section>
            </div>
            <div className="flex justify-end p-5 bg-gray-100 border-t border-gray-300 gap-3">
                <button onClick={onClose} className="px-6 py-2 text-[10px] font-black uppercase border border-gray-400 bg-white hover:bg-red-50 text-red-600 transition-colors">Cancel</button>
                <button onClick={handleSubmit} className="px-14 py-2 tally-button-primary shadow-xl tracking-widest text-[11px]">Update Ledger</button>
            </div>
        </Modal>
    );
};

export const RecordPaymentModal: React.FC<{
    isOpen: boolean;
    onClose: () => void;
    supplier: Supplier;
    onRecord: (supplierId: string, amount: number, date: string, desc: string) => void;
}> = ({ isOpen, onClose, supplier, onRecord }) => {
    const [amount, setAmount] = useState<number>(0);
    const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
    const [desc, setDesc] = useState('Supplier Payment');

    const handleSubmit = () => {
        if (amount <= 0) {
            alert('Please enter a valid payment amount.');
            return;
        }
        onRecord(supplier.id, amount, date, desc);
        onClose();
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={`Record Payment: ${supplier.name}`} widthClass="max-w-md">
            <div className="p-6 space-y-6" onKeyDown={handleEnterToNextField}>
                <div className="bg-primary/5 p-4 text-center border border-primary/10">
                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Outstanding Balance</p>
                    <p className="text-3xl font-black text-red-600">₹{getOutstandingBalance(supplier).toFixed(2)}</p>
                </div>
                <div>
                    <label className="block text-[10px] font-black uppercase text-gray-500 mb-1 ml-1">Payment Amount (₹) *</label>
                    <input type="number" value={amount} onChange={e => setAmount(parseFloat(e.target.value) || 0)} autoFocus className="w-full border border-gray-400 p-3 font-black text-2xl text-emerald-700 focus:bg-yellow-50 outline-none no-spinner" placeholder="0.00" />
                </div>
                <div>
                    <label className="block text-[10px] font-black uppercase text-gray-500 mb-1 ml-1">Payment Date *</label>
                    <input type="date" value={date} onChange={e => setDate(e.target.value)} className="w-full border border-gray-400 p-2 font-bold text-sm outline-none" />
                </div>
                <div>
                    <label className="block text-[10px] font-black uppercase text-gray-500 mb-1 ml-1">Narration / Description</label>
                    <input type="text" value={desc} onChange={e => setDesc(e.target.value)} className="w-full border border-gray-400 p-2 font-bold text-sm uppercase focus:bg-yellow-50 outline-none" />
                </div>
            </div>
            <div className="flex justify-end p-5 bg-gray-100 border-t border-gray-300">
                <button onClick={onClose} className="px-6 py-2 text-[10px] font-black uppercase border border-gray-400 bg-white hover:bg-red-50 text-red-600 transition-colors">Cancel</button>
                <button onClick={handleSubmit} className="ml-3 px-12 py-2 tally-button-primary shadow-xl">Post Payment (Ent)</button>
            </div>
        </Modal>
    );
};

export default AddSupplierModal;
