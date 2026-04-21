
import React, { useState, useEffect } from 'react';
import Modal from '../../../core/components/Modal';
import type { Supplier, Distributor } from '../../../core/types/types';
import { handleEnterToNextField } from '../../../core/utils/navigation';
import { STATE_DISTRICT_MAP } from '../../../core/utils/constants';
// Added missing import for getOutstandingBalance
import { getOutstandingBalance } from '../../../core/utils/helpers';

const states = Object.keys(STATE_DISTRICT_MAP).sort();

export const AddDistributorModal: React.FC<{
    isOpen: boolean; 
    onClose: () => void; 
    onAdd: (data: Omit<Supplier, 'id' | 'ledger' | 'organization_id'>, balance: number, date: string) => void;
    organizationId: string;
    prefillData?: { name?: string; gstNumber?: string; phone?: string; address?: string };
}> = ({ isOpen, onClose, onAdd, organizationId, prefillData }) => {
    const initialState = {
        name: '',
        gstNumber: '',
        panNumber: '',
        phone: '',
        email: '',
        address: '',
        state: '',
        district: '',
        drugLicense: '',
        upiId: '',
        accountNumber: '',
        ifscCode: '',
        openingBalance: 0,
        asOfDate: new Date().toISOString().split('T')[0],
    };
    const [form, setForm] = useState(initialState);

    useEffect(() => {
        if (isOpen) {
            setForm({
                ...initialState,
                name: prefillData?.name || '',
                gstNumber: prefillData?.gstNumber || '',
                phone: prefillData?.phone || '',
                address: prefillData?.address || '',
            });
        }
    }, [isOpen, prefillData]);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        const { name, value, type } = e.target;
        if (name === 'state') {
             setForm(prev => ({ ...prev, state: value, district: '' }));
        } else {
             setForm(prev => ({ ...prev, [name]: type === 'number' ? parseFloat(value) || 0 : value }));
        }
    };

    const handleSubmit = () => {
        if (!form.name.trim()) {
            alert('Supplier name is mandatory.');
            return;
        }

        /* Fix: Mapped local form state properties to correctly named Supplier interface properties */
        const distributorData: Omit<Supplier, 'id' | 'ledger' | 'organization_id'> = {
            name: form.name.trim(),
            gst_number: form.gstNumber.trim(),
            pan_number: form.panNumber.trim(),
            phone: form.phone.trim(),
            email: form.email.trim(),
            address: form.address.trim(),
            state: form.state,
            district: form.district,
            drug_license: form.drugLicense.trim(),
            is_active: true,
            opening_balance: form.openingBalance,
            payment_details: { 
                upi_id: form.upiId.trim(), 
                account_number: form.accountNumber.trim(), 
                ifsc_code: form.ifscCode.trim() 
            }
        };
        
        onAdd(distributorData, form.openingBalance, form.asOfDate);
        onClose();
        setForm(initialState);
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Register Supplier Ledger">
            <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-4 overflow-y-auto max-h-[70vh]" onKeyDown={handleEnterToNextField}>
                <div className="md:col-span-2">
                    <label className="block text-[10px] font-black uppercase text-gray-500 mb-1 ml-1">Supplier Name *</label>
                    <input type="text" name="name" value={form.name} onChange={handleChange} autoFocus className="w-full border border-gray-400 p-2 font-bold text-sm uppercase focus:bg-yellow-50 outline-none" />
                </div>
                <div className="md:col-span-2">
                    <label className="block text-[10px] font-black uppercase text-gray-500 mb-1 ml-1">Physical Address</label>
                    <input type="text" name="address" value={form.address} onChange={handleChange} className="w-full border border-gray-400 p-2 font-bold text-sm uppercase focus:bg-yellow-50 outline-none" />
                </div>
                <div>
                    <label className="block text-[10px] font-black uppercase text-gray-500 mb-1 ml-1">State</label>
                    <select name="state" value={form.state} onChange={handleChange} className="w-full border border-gray-400 p-2 font-bold text-sm focus:bg-yellow-50 outline-none">
                        <option value="">Select State</option>
                        {states.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                </div>
                <div>
                    <label className="block text-[10px] font-black uppercase text-gray-500 mb-1 ml-1">District</label>
                    <select name="district" value={form.district} onChange={handleChange} disabled={!form.state} className="w-full border border-gray-400 p-2 font-bold text-sm focus:bg-yellow-50 outline-none disabled:opacity-50">
                        <option value="">Select District</option>
                        {form.state && STATE_DISTRICT_MAP[form.state]?.map(d => <option key={d} value={d}>{d}</option>)}
                    </select>
                </div>
                <div>
                    <label className="block text-[10px] font-black uppercase text-gray-500 mb-1 ml-1">Mobile / Phone</label>
                    <input type="text" name="phone" value={form.phone} onChange={handleChange} className="w-full border border-gray-400 p-2 font-bold text-sm focus:bg-yellow-50 outline-none" />
                </div>
                <div>
                    <label className="block text-[10px] font-black uppercase text-gray-500 mb-1 ml-1">Email ID</label>
                    <input type="email" name="email" value={form.email} onChange={handleChange} className="w-full border border-gray-400 p-2 font-bold text-sm focus:bg-yellow-50 outline-none" />
                </div>
                <div>
                    <label className="block text-[10px] font-black uppercase text-gray-500 mb-1 ml-1">GSTIN</label>
                    <input type="text" name="gstNumber" value={form.gstNumber} onChange={handleChange} className="w-full border border-gray-400 p-2 font-bold text-sm uppercase focus:bg-yellow-50 outline-none" />
                </div>
                <div>
                    <label className="block text-[10px] font-black uppercase text-gray-500 mb-1 ml-1">PAN Number</label>
                    <input type="text" name="panNumber" value={form.panNumber} onChange={handleChange} className="w-full border border-gray-400 p-2 font-bold text-sm uppercase focus:bg-yellow-50 outline-none" />
                </div>
                
                <div className="md:col-span-2 mt-4">
                    <h4 className="text-[11px] font-black text-primary uppercase tracking-[0.2em] border-b border-gray-200 pb-1 mb-4">Banking & Settlements</h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="md:col-span-2">
                            <label className="block text-[10px] font-black uppercase text-gray-500 mb-1 ml-1">UPI ID for QR</label>
                            <input type="text" name="upiId" value={form.upiId} onChange={handleChange} placeholder="e.g. supplier@upi" className="w-full border border-gray-400 p-2 font-bold text-sm focus:bg-yellow-50 outline-none" />
                        </div>
                        <div>
                            <label className="block text-[10px] font-black uppercase text-gray-500 mb-1 ml-1">Bank Name</label>
                            <input type="text" name="bank_account_name" value={form.accountNumber} onChange={handleChange} className="w-full border border-gray-400 p-2 font-bold text-sm focus:bg-yellow-50 outline-none" />
                        </div>
                        <div>
                            <label className="block text-[10px] font-black uppercase text-gray-500 mb-1 ml-1">IFSC Code</label>
                            <input type="text" name="ifscCode" value={form.ifscCode} onChange={handleChange} className="w-full border border-gray-400 p-2 font-bold text-sm uppercase focus:bg-yellow-50 outline-none" />
                        </div>
                    </div>
                </div>

                <div className="md:col-span-2 mt-4 bg-primary/5 p-4 border border-primary/10">
                    <h4 className="text-[11px] font-black text-primary uppercase tracking-[0.2em] mb-4">Opening Balance Adjustment</h4>
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-[10px] font-black uppercase text-gray-500 mb-1 ml-1">Balance Amount (₹)</label>
                            <input type="number" name="openingBalance" value={form.openingBalance} onChange={handleChange} className="w-full border border-gray-400 p-2 font-black text-base text-red-700 outline-none" />
                        </div>
                        <div>
                            <label className="block text-[10px] font-black uppercase text-gray-500 mb-1 ml-1">Effective Date</label>
                            <input type="date" name="asOfDate" value={form.asOfDate} onChange={handleChange} className="w-full border border-gray-400 p-2 font-bold text-sm outline-none" />
                        </div>
                    </div>
                </div>
            </div>
            <div className="flex justify-end p-5 bg-gray-100 border-t border-gray-300">
                <button onClick={onClose} className="px-6 py-2 text-[10px] font-black uppercase border border-gray-400 bg-white hover:bg-red-50 text-red-600 transition-colors">Cancel</button>
                <button onClick={handleSubmit} className="ml-3 px-12 py-2 tally-button-primary shadow-xl">Accept (Ent)</button>
            </div>
        </Modal>
    );
};

export const EditDistributorModal: React.FC<{
    isOpen: boolean;
    onClose: () => void;
    onSave: (distributor: Distributor) => void;
    distributor: Distributor;
}> = ({ isOpen, onClose, onSave, distributor }) => {
    const [form, setForm] = useState(distributor);

    useEffect(() => {
        if (isOpen) setForm(distributor);
    }, [isOpen, distributor]);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        const { name, value, type } = e.target;
        if (name === 'state') {
            setForm(prev => ({ ...prev, state: value, district: '' }));
        } else {
            setForm(prev => ({ ...prev, [name]: type === 'number' ? parseFloat(value) || 0 : value }));
        }
    };

    const handleSubmit = () => {
        if (!form.name.trim()) {
            alert('Supplier name is mandatory.');
            return;
        }
        onSave(form);
        onClose();
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={`Alter Supplier: ${distributor.name}`}>
            <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-4 overflow-y-auto max-h-[70vh]" onKeyDown={handleEnterToNextField}>
                <div className="md:col-span-2">
                    <label className="block text-[10px] font-black uppercase text-gray-500 mb-1 ml-1">Supplier Name *</label>
                    <input type="text" name="name" value={form.name} onChange={handleChange} autoFocus className="w-full border border-gray-400 p-2 font-bold text-sm uppercase focus:bg-yellow-50 outline-none" />
                </div>
                <div className="md:col-span-2">
                    <label className="block text-[10px] font-black uppercase text-gray-500 mb-1 ml-1">Physical Address</label>
                    <input type="text" name="address" value={form.address || ''} onChange={handleChange} className="w-full border border-gray-400 p-2 font-bold text-sm uppercase focus:bg-yellow-50 outline-none" />
                </div>
                <div>
                    <label className="block text-[10px] font-black uppercase text-gray-500 mb-1 ml-1">State</label>
                    <select name="state" value={form.state || ''} onChange={handleChange} className="w-full border border-gray-400 p-2 font-bold text-sm focus:bg-yellow-50 outline-none">
                        <option value="">Select State</option>
                        {states.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                </div>
                <div>
                    <label className="block text-[10px] font-black uppercase text-gray-500 mb-1 ml-1">District</label>
                    <select name="district" value={form.district || ''} onChange={handleChange} disabled={!form.state} className="w-full border border-gray-400 p-2 font-bold text-sm focus:bg-yellow-50 outline-none disabled:opacity-50">
                        <option value="">Select District</option>
                        {form.state && STATE_DISTRICT_MAP[form.state]?.map(d => <option key={d} value={d}>{d}</option>)}
                    </select>
                </div>
                <div>
                    <label className="block text-[10px] font-black uppercase text-gray-500 mb-1 ml-1">Mobile / Phone</label>
                    <input type="text" name="phone" value={form.phone || ''} onChange={handleChange} className="w-full border border-gray-400 p-2 font-bold text-sm focus:bg-yellow-50 outline-none" />
                </div>
                <div>
                    <label className="block text-[10px] font-black uppercase text-gray-500 mb-1 ml-1">Email ID</label>
                    <input type="email" name="email" value={form.email || ''} onChange={handleChange} className="w-full border border-gray-400 p-2 font-bold text-sm focus:bg-yellow-50 outline-none" />
                </div>
                <div>
                    <label className="block text-[10px] font-black uppercase text-gray-500 mb-1 ml-1">GSTIN</label>
                    {/* Fix: Rename dist.gstNumber to dist.gst_number */}
                    <input type="text" name="gst_number" value={form.gst_number || ''} onChange={handleChange} className="w-full border border-gray-400 p-2 font-bold text-sm uppercase focus:bg-yellow-50 outline-none" />
                </div>
                <div>
                    <label className="block text-[10px] font-black uppercase text-gray-500 mb-1 ml-1">PAN Number</label>
                    {/* Fix: Rename dist.panNumber to dist.pan_number */}
                    <input type="text" name="pan_number" value={form.pan_number || ''} onChange={handleChange} className="w-full border border-gray-400 p-2 font-bold text-sm uppercase focus:bg-yellow-50 outline-none" />
                </div>
                <div className="md:col-span-2 mt-4 bg-primary/5 p-4 border border-primary/10">
                    <h4 className="text-[11px] font-black text-primary uppercase tracking-[0.2em] mb-4">Opening Balance Information</h4>
                    <div className="grid grid-cols-1 gap-4">
                        <div>
                            <label className="block text-[10px] font-black uppercase text-gray-500 mb-1 ml-1">Initial Balance (₹)</label>
                            <input type="number" name="opening_balance" value={form.opening_balance || 0} onChange={handleChange} className="w-full border border-gray-400 p-2 font-black text-base text-red-700 outline-none focus:bg-yellow-50" />
                            <p className="text-[9px] text-gray-400 mt-1 uppercase font-bold">This value is used if the transaction ledger is empty.</p>
                        </div>
                    </div>
                </div>
            </div>
            <div className="flex justify-end p-5 bg-gray-100 border-t border-gray-300">
                <button onClick={onClose} className="px-6 py-2 text-[10px] font-black uppercase border border-gray-400 bg-white hover:bg-red-50 text-red-600 transition-colors">Cancel</button>
                <button onClick={handleSubmit} className="ml-3 px-12 py-2 tally-button-primary shadow-xl">Update Ledger (Ent)</button>
            </div>
        </Modal>
    );
};

export const RecordPaymentModal: React.FC<{
    isOpen: boolean;
    onClose: () => void;
    distributor: Distributor;
    onRecord: (distId: string, amount: number, date: string, desc: string) => void;
}> = ({ isOpen, onClose, distributor, onRecord }) => {
    const [amount, setAmount] = useState<number>(0);
    const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
    const [desc, setDesc] = useState('Supplier Payment');

    const handleSubmit = () => {
        if (amount <= 0) {
            alert('Please enter a valid payment amount.');
            return;
        }
        onRecord(distributor.id, amount, date, desc);
        onClose();
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={`Record Payment: ${distributor.name}`} widthClass="max-w-md">
            <div className="p-6 space-y-6" onKeyDown={handleEnterToNextField}>
                <div className="bg-primary/5 p-4 text-center border border-primary/10">
                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Outstanding Balance</p>
                    {/* Fixed: Use imported getOutstandingBalance utility */}
                    <p className="text-3xl font-black text-red-600">₹{getOutstandingBalance(distributor).toFixed(2)}</p>
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

export default AddDistributorModal;
