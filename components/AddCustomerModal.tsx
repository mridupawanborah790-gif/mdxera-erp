
import React, { useState, useEffect, useMemo } from 'react';
import Modal from './Modal';
import ConfirmModal from './ConfirmModal';
import type { Customer, OrganizationMember } from '../types';
import { handleEnterToNextField } from '../utils/navigation'; 
import { lookupPincode } from '../utils/pincode'; 

const Toggle: React.FC<{ label: string; enabled: boolean; setEnabled: (enabled: boolean) => void }> = ({ label, enabled, setEnabled }) => (
    <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-app-text-secondary">{label}</span>
        <button type="button" onClick={() => setEnabled(!enabled)} className={`${enabled ? 'bg-[var(--modal-header-bg-light)]' : 'bg-gray-200 dark:bg-gray-600'} relative inline-flex items-center h-6 rounded-full w-11 transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[var(--modal-header-bg-light)]`}>
            <span className={`${enabled ? 'translate-x-6' : 'translate-x-1'} inline-block w-4 h-4 transform bg-white rounded-full transition-transform`}/>
        </button>
    </div>
);

interface AddCustomerModalProps {
    isOpen: boolean;
    onClose: () => void;
    onAdd: (customer: Omit<Customer, 'id' | 'ledger'>, openingBalance: number, asOfDate: string) => void;
    teamMembers?: OrganizationMember[]; 
    organizationId: string;
    defaultControlGlId?: string;
}

const CUSTOMER_GROUP_OPTIONS = [
    'Sundry Debtors',
    'Cash Customers',
    'Corporate Customers',
    'Retail Customers',
    'Government Customers',
] as const;

const initialState = {
    name: '',
    phone: '',
    address: '',
    area: '',
    pincode: '',
    district: '',
    state: '',
    customerType: 'regular' as 'regular' | 'retail',
    customerGroup: 'Sundry Debtors',
    gstNumber: '',
    drugLicense: '',
    panNumber: '',
    openingBalance: 0,
    asOfDate: new Date().toISOString().split('T')[0],
    // Renamed isActive to is_active
    is_active: true,
    defaultDiscount: 0,
    defaultRateTier: 'none' as 'none' | 'rateA' | 'rateB' | 'rateC',
    assignedStaffId: '', 
    assignedStaffName: '',
    organization_id: '',
    controlGlId: '',
    controlGlCode: '',
    controlGlName: '',
    enableCreditLimit: false,
    creditLimit: 0,
    creditDays: 0,
    creditStatus: 'active' as 'active' | 'blocked',
    creditControlMode: 'hard_block' as 'warning_only' | 'hard_block',
    allowOverride: false,
    overrideApprovalRequired: false,
};

const AddCustomerModal: React.FC<AddCustomerModalProps> = ({ isOpen, onClose, onAdd, teamMembers = [], organizationId, defaultControlGlId }) => {
    const [formData, setFormData] = useState(initialState);
    const [isPincodeLoading, setIsPincodeLoading] = useState(false);
    const [showConfirmClose, setShowConfirmClose] = useState(false);

    const effectiveControlGlId = useMemo(() => defaultControlGlId || '', [defaultControlGlId]);

    const isDirty = useMemo(() => {
        return (
            formData.name !== initialState.name ||
            formData.phone !== initialState.phone ||
            formData.address !== initialState.address ||
            formData.gstNumber !== initialState.gstNumber ||
            formData.openingBalance !== initialState.openingBalance
        );
    }, [formData]);

    useEffect(() => {
        if (isOpen) setFormData({ 
            ...initialState, 
            organization_id: organizationId, 
            controlGlId: effectiveControlGlId,
            controlGlCode: '',
            controlGlName: ''
        });
    }, [isOpen, organizationId, effectiveControlGlId]);

    const handleCloseAttempt = () => {
        if (isDirty) {
            setShowConfirmClose(true);
        } else {
            onClose();
        }
    };

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        const { name, value, type } = e.target;

        if (name === 'pincode') {
            const cleaned = value.replace(/\D/g, '').slice(0, 6);
            setFormData(prev => ({ ...prev, pincode: cleaned }));

            if (cleaned.length === 6) {
                setIsPincodeLoading(true);
                lookupPincode(cleaned).then(res => {
                    if (res) {
                        setFormData(prev => ({ ...prev, district: res.district, state: res.state }));
                    }
                    setIsPincodeLoading(false);
                });
            }
        } else if (name === 'assignedStaffId') {
            const member = teamMembers.find(m => m.id === value);
            setFormData(prev => ({ ...prev, assignedStaffId: value, assignedStaffName: member?.name || '' }));
        } else {
            setFormData(prev => ({ ...prev, [name]: type === 'number' ? parseFloat(value) || 0 : value }));
        }
    };

    const handleSubmit = () => {
        if (!formData.name.trim()) {
            alert("Customer Name is required");
            return;
        }
        if (!organizationId) {
            alert("Error: Missing organization context. Please refresh.");
            return;
        }
        if (!formData.customerGroup.trim()) {
            alert("Customer Group is required");
            return;
        }
        if (formData.enableCreditLimit) {
            if (!Number.isFinite(formData.creditLimit) || formData.creditLimit <= 0) {
                alert("Credit Limit is required and must be greater than 0 when credit limit is enabled");
                return;
            }
        }
        const { openingBalance, asOfDate, ...customerData } = formData;

        // Clean empty UUID strings which cause Postgres errors on nullable UUID columns
        const cleanData = { 
            ...customerData, 
            organization_id: organizationId 
        };

        if (!cleanData.assignedStaffId) {
            delete (cleanData as any).assignedStaffId;
        }

        onAdd(cleanData, openingBalance, asOfDate);
        onClose();
    };

    return (
        <>
            <Modal isOpen={isOpen} onClose={handleCloseAttempt} title="Add New Customer">
                <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto" onKeyDown={handleEnterToNextField}>
                     <div>
                        <label className="block text-sm font-medium text-app-text-secondary">Customer Name <span className="text-red-500">*</span></label>
                        <input name="name" type="text" value={formData.name} onChange={handleChange} className="mt-1 block w-full p-2 border border-app-border rounded-md bg-input-bg focus:ring-[var(--modal-header-bg-light)] focus:border-[var(--modal-header-bg-light)]" placeholder="Full Name"/>
                     </div>

                     <div className="grid grid-cols-2 gap-4">
                         <div>
                            <label className="block text-sm font-medium text-app-text-secondary">Phone Number</label>
                            <input name="phone" type="text" value={formData.phone} onChange={handleChange} className="mt-1 block w-full p-2 border border-app-border rounded-md bg-input-bg focus:ring-[var(--modal-header-bg-light)] focus:border-[var(--modal-header-bg-light)]"/>
                         </div>
                         <div>
                            <label className="block text-sm font-medium text-app-text-secondary">Customer Type</label>
                            <select 
                                name="customerType" 
                                value={formData.customerType} 
                                onChange={handleChange} 
                                className="mt-1 block w-full p-2 border border-app-border rounded-md bg-input-bg focus:ring-[var(--modal-header-bg-light)] focus:border-[var(--modal-header-bg-light)]"
                            >
                                <option value="regular">General</option>
                                <option value="retail">Retailer</option>
                            </select>
                         </div>
                     </div>

                     <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                         <div>
                            <label className="block text-sm font-medium text-app-text-secondary">Customer Group <span className="text-red-500">*</span></label>
                            <select
                                name="customerGroup"
                                value={formData.customerGroup}
                                onChange={handleChange}
                                required
                                className="mt-1 block w-full p-2 border border-app-border rounded-md bg-input-bg focus:ring-[var(--modal-header-bg-light)] focus:border-[var(--modal-header-bg-light)]"
                            >
                                {CUSTOMER_GROUP_OPTIONS.map(group => (
                                    <option key={group} value={group}>{group}</option>
                                ))}
                            </select>
                         </div>
                         <div>
                            <label className="block text-sm font-medium text-app-text-secondary">Customer Control GL</label>
                            <input
                                type="text"
                                value={formData.controlGlCode ? `${formData.controlGlCode} - ${formData.controlGlName}` : (effectiveControlGlId ? `Mapped (${effectiveControlGlId})` : 'Auto-map from Set of Books')}
                                readOnly
                                className="mt-1 block w-full p-2 border border-app-border rounded-md bg-gray-100 dark:bg-gray-800"
                            />
                         </div>
                     </div>

                     <div>
                        <label className="block text-sm font-medium text-app-text-secondary">Assign Staff Member</label>
                        <select 
                            name="assignedStaffId" 
                            value={formData.assignedStaffId} 
                            onChange={handleChange} 
                            className="mt-1 block w-full p-2 border border-app-border rounded-md bg-input-bg focus:ring-[var(--modal-header-bg-light)] focus:border-[var(--modal-header-bg-light)]"
                        >
                            <option value="">— No Assignment —</option>
                            {teamMembers.map(member => (
                                <option key={member.id} value={member.id}>{member.name} ({member.role})</option>
                            ))}
                        </select>
                        <p className="text-[10px] text-app-text-tertiary mt-1">Assign a primary salesperson or manager to this customer account.</p>
                     </div>

                     <div className="p-4 bg-gray-50 dark:bg-gray-800/50 rounded-lg border border-app-border space-y-3">
                        <p className="text-xs font-bold text-app-text-secondary uppercase tracking-wide">Address Details</p>
                        <div>
                            <label className="block text-sm font-medium text-app-text-secondary">Building / Door / Street</label>
                            <input name="address" type="text" value={formData.address} onChange={handleChange} className="mt-1 block w-full p-2 border border-app-border rounded-md bg-input-bg focus:ring-[var(--modal-header-bg-light)] focus:border-[var(--modal-header-bg-light)]" placeholder="Address line"/>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-app-text-secondary">Area / Locality</label>
                            <input name="area" type="text" value={formData.area} onChange={handleChange} className="mt-1 block w-full p-2 border border-app-border rounded-md bg-input-bg focus:ring-[var(--modal-header-bg-light)] focus:border-[var(--modal-header-bg-light)]" placeholder="Neighborhood"/>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <div>
                                <label className="block text-sm font-medium text-app-text-secondary flex items-center">
                                    Pin Number
                                    {isPincodeLoading && <svg className="animate-spin ml-2 h-3 w-3 text-[var(--modal-header-bg-light)] dark:text(--modal-header-bg-dark)]" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>}
                                </label>
                                <input name="pincode" type="text" value={formData.pincode} onChange={handleChange} className="mt-1 block w-full p-2 border border-app-border rounded-md bg-input-bg focus:ring-[var(--modal-header-bg-light)] focus:border-[var(--modal-header-bg-light)]" placeholder="6 digits"/>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-app-text-secondary">District</label>
                                <input name="district" type="text" value={formData.district} onChange={handleChange} className="mt-1 block w-full p-2 border border-app-border rounded-md bg-input-bg focus:ring-[var(--modal-header-bg-light)] focus:border-[var(--modal-header-bg-light)]"/>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-app-text-secondary">State</label>
                                <input name="state" type="text" value={formData.state} onChange={handleChange} className="mt-1 block w-full p-2 border border-app-border rounded-md bg-input-bg focus:ring-[var(--modal-header-bg-light)] focus:border-[var(--modal-header-bg-light)]"/>
                            </div>
                        </div>
                     </div>

                    <div className="p-4 bg-gray-50 dark:bg-gray-800/50 rounded-lg border border-app-border space-y-3">
                        <p className="text-xs font-bold text-app-text-secondary uppercase tracking-wide">License & Tax Details</p>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-medium text-app-text-secondary">GST Number</label>
                                <input name="gstNumber" type="text" value={formData.gstNumber} onChange={handleChange} className="mt-1 block w-full p-2 border border-app-border rounded-md bg-input-bg focus:ring-[var(--modal-header-bg-light)] focus:border-[var(--modal-header-bg-light)]" placeholder="GSTIN"/>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-app-text-secondary">PAN Number</label>
                                <input name="panNumber" type="text" value={formData.panNumber} onChange={handleChange} className="mt-1 block w-full p-2 border border-app-border rounded-md bg-input-bg focus:ring-[var(--modal-header-bg-light)] focus:border-[var(--modal-header-bg-light)]" placeholder="PAN Number"/>
                            </div>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-app-text-secondary">Drug License No.</label>
                            <input name="drugLicense" type="text" value={formData.drugLicense} onChange={handleChange} className="mt-1 block w-full p-2 border border-app-border rounded-md bg-input-bg focus:ring-[var(--modal-header-bg-light)] focus:border-[var(--modal-header-bg-light)]" placeholder="D.L. Number"/>
                        </div>
                    </div>


                    <div className="p-4 bg-gray-50 dark:bg-gray-800/50 rounded-lg border border-app-border space-y-3">
                        <p className="text-xs font-bold text-app-text-secondary uppercase tracking-wide">Credit Control</p>
                        <Toggle label="Enable Credit Limit" enabled={formData.enableCreditLimit === true} setEnabled={(enabled) => setFormData(prev => ({ ...prev, enableCreditLimit: enabled }))} />
                        {formData.enableCreditLimit && (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-app-text-secondary">Credit Limit (₹) <span className="text-red-500">*</span></label>
                                    <input name="creditLimit" type="number" min="0" step="0.01" value={formData.creditLimit} onChange={handleChange} className="mt-1 block w-full p-2 border border-app-border rounded-md bg-input-bg focus:ring-[var(--modal-header-bg-light)] focus:border-[var(--modal-header-bg-light)]" placeholder="0.00"/>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-app-text-secondary">Credit Days</label>
                                    <input name="creditDays" type="number" min="0" value={formData.creditDays} onChange={handleChange} className="mt-1 block w-full p-2 border border-app-border rounded-md bg-input-bg focus:ring-[var(--modal-header-bg-light)] focus:border-[var(--modal-header-bg-light)]" placeholder="0"/>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-app-text-secondary">Credit Status</label>
                                    <select name="creditStatus" value={formData.creditStatus} onChange={handleChange} className="mt-1 block w-full p-2 border border-app-border rounded-md bg-input-bg focus:ring-[var(--modal-header-bg-light)] focus:border-[var(--modal-header-bg-light)]">
                                        <option value="active">Active</option>
                                        <option value="blocked">Blocked</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-app-text-secondary">Credit Control Mode</label>
                                    <select name="creditControlMode" value={formData.creditControlMode} onChange={handleChange} className="mt-1 block w-full p-2 border border-app-border rounded-md bg-input-bg focus:ring-[var(--modal-header-bg-light)] focus:border-[var(--modal-header-bg-light)]">
                                        <option value="hard_block">Hard Block</option>
                                        <option value="warning_only">Warning Only</option>
                                    </select>
                                </div>
                                <div>
                                    <Toggle label="Allow Override" enabled={formData.allowOverride === true} setEnabled={(enabled) => setFormData(prev => ({ ...prev, allowOverride: enabled }))} />
                                </div>
                                <div>
                                    <Toggle label="Override Approval Required" enabled={formData.overrideApprovalRequired === true} setEnabled={(enabled) => setFormData(prev => ({ ...prev, overrideApprovalRequired: enabled }))} />
                                </div>
                            </div>
                        )}
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-app-text-secondary">Default Discount (%)</label>
                            <input 
                                name="defaultDiscount" 
                                type="number" 
                                min="0" 
                                max="100" 
                                value={formData.defaultDiscount} 
                                onChange={handleChange} 
                                className="mt-1 block w-full p-2 border border-app-border rounded-md bg-input-bg focus:ring-[var(--modal-header-bg-light)] focus:border-[var(--modal-header-bg-light)] font-semibold text-primary" 
                                placeholder="0"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-app-text-secondary">Default Rate Tier</label>
                            <select
                                name="defaultRateTier"
                                value={formData.defaultRateTier || 'none'}
                                onChange={handleChange}
                                disabled={formData.customerType !== 'retail'}
                                className="mt-1 block w-full p-2 border border-app-border rounded-md bg-input-bg focus:ring-[var(--modal-header-bg-light)] focus:border-[var(--modal-header-bg-light)] disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                <option value="none">None</option>
                                <option value="rateA">Rate A</option>
                                <option value="rateB">Rate B</option>
                                <option value="rateC">Rate C</option>
                            </select>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-app-text-secondary">Opening Balance</label>
                            <input name="openingBalance" type="number" value={formData.openingBalance} onChange={handleChange} className="mt-1 block w-full p-2 border border-app-border rounded-md bg-input-bg focus:ring-[var(--modal-header-bg-light)] focus:border-[var(--modal-header-bg-light)]" placeholder="0.00"/>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-app-text-secondary">As of Date</label>
                            <input name="asOfDate" type="date" value={formData.asOfDate} onChange={handleChange} className="mt-1 block w-full p-2 border border-app-border rounded-md bg-input-bg focus:ring-[var(--modal-header-bg-light)] focus:border-[var(--modal-header-bg-light)]"/>
                        </div>
                    </div>
                </div>
                <div className="flex justify-end p-5 bg-[var(--modal-footer-bg-light)] dark:bg-[var(--modal-footer-bg-dark)] border-t border-[var(--modal-footer-border-light)] dark:border(--modal-footer-border-dark)]">
                    <button onClick={handleCloseAttempt} className="px-4 py-2 text-sm font-semibold bg-card-bg border border-app-border rounded-lg hover:bg-[var(--modal-content-bg-light)] dark:hover:bg-[var(--modal-content-bg-dark)]">Cancel</button>
                    <button onClick={handleSubmit} className="ml-3 px-4 py-2 text-sm font-semibold text-white bg-[var(--modal-header-bg-light)] dark:bg-[var(--modal-header-bg-dark)] rounded-lg hover:bg-primary-dark">Save Customer</button>
                </div>
            </Modal>

            <ConfirmModal
                isOpen={showConfirmClose}
                onClose={() => setShowConfirmClose(false)}
                onConfirm={() => {
                    setShowConfirmClose(false);
                    onClose();
                }}
                title="Discard Changes"
                message="You have unsaved data. Are you sure you want to close? All data entered will be lost."
                confirmLabel="Yes, Discard"
                cancelLabel="No, Stay"
            />
        </>
    );
};

export default AddCustomerModal;