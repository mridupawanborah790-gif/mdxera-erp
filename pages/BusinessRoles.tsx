import React, { useState, useMemo, useEffect } from 'react';
import Card from '../components/Card';
import AddBusinessRoleModal from '../components/AddBusinessRoleModal';
import ConfirmModal from '../components/ConfirmModal';
import { BusinessRole, RegisteredPharmacy, WorkCenter } from '../types';
import { getData, saveData, deleteData } from '../services/storageService';

const uniformTextStyle = "text-2xl font-normal tracking-tight uppercase leading-tight";

const DEFAULT_WORK_CENTERS: WorkCenter[] = [
    {
        id: 'sales',
        name: 'Sales & Distribution',
        views: [
            { id: 'pos', name: 'POS Billing', assigned: false },
            { id: 'returns', name: 'Sales Returns', assigned: false },
            { id: 'history', name: 'Sales History', assigned: false },
            { id: 'challans', name: 'Sales Challans', assigned: false },
        ]
    },
    {
        id: 'purchasing',
        name: 'Purchasing',
        views: [
            { id: 'pur_entry', name: 'Purchase Entry', assigned: false },
            { id: 'orders', name: 'Purchase Orders', assigned: false },
            { id: 'suppliers', name: 'Supplier Management', assigned: false },
            { id: 'pur_history', name: 'Purchase History', assigned: false },
        ]
    },
    {
        id: 'inventory',
        name: 'Inventory Management',
        views: [
            { id: 'inv_list', name: 'Current Inventory', assigned: false },
            { id: 'audit', name: 'Stock Audit', assigned: false },
            { id: 'master', name: 'Material Master', assigned: false },
        ]
    },
    {
        id: 'finance',
        name: 'Finance & GST',
        views: [
            { id: 'ar', name: 'Account Receivable', assigned: false },
            { id: 'ap', name: 'Account Payable', assigned: false },
            { id: 'gst', name: 'GST Center', assigned: false },
            { id: 'reports', name: 'Management Reports', assigned: false },
        ]
    }
];

interface BusinessRolesProps {
    currentUser: RegisteredPharmacy;
    addNotification: (message: string, type?: 'success' | 'error') => void;
}

const BusinessRoles: React.FC<BusinessRolesProps> = ({ currentUser, addNotification }) => {
    const [roles, setRoles] = useState<BusinessRole[]>([]);
    const [selectedRole, setSelectedRole] = useState<BusinessRole | null>(null);
    const [isAddModalOpen, setIsAddModalOpen] = useState(false);
    const [roleToEdit, setRoleToEdit] = useState<BusinessRole | null>(null);
    const [isConfirmOpen, setIsConfirmOpen] = useState(false);
    const [roleToRemove, setRoleToRemove] = useState<BusinessRole | null>(null);
    const [isLoading, setIsLoading] = useState(true);

    const loadRoles = async () => {
        setIsLoading(true);
        try {
            const data = await getData('business_roles', [], currentUser);
            setRoles(data);
            if (data.length > 0 && !selectedRole) {
                setSelectedRole(data[0]);
            }
        } catch (err) {
            addNotification("Failed to fetch business roles", "error");
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        loadRoles();
    }, []);

    const handleSaveRole = async (roleData: Omit<BusinessRole, 'id'> | BusinessRole) => {
        try {
            const saved = await saveData('business_roles', roleData, currentUser);
            addNotification(`Role '${saved.name}' saved successfully.`, 'success');
            loadRoles();
        } catch (err) {
            addNotification("Failed to save business role.", "error");
        }
    };

    const handleDeleteClick = (role: BusinessRole) => {
        if (role.isSystemRole) {
            addNotification("System roles cannot be deleted.", "error");
            return;
        }
        setRoleToRemove(role);
        setIsConfirmOpen(true);
    };

    const handleConfirmDelete = async () => {
        if (!roleToRemove) return;
        try {
            await deleteData('business_roles', roleToRemove.id);
            addNotification(`Role '${roleToRemove.name}' deleted.`, "success");
            loadRoles();
            if (selectedRole?.id === roleToRemove.id) setSelectedRole(null);
        } catch (err) {
            addNotification("Failed to delete role.", "error");
        } finally {
            setIsConfirmOpen(false);
            setRoleToRemove(null);
        }
    };

    return (
        <main className="flex-1 overflow-hidden flex flex-col page-fade-in bg-app-bg">
            <div className="bg-primary text-white h-7 flex items-center px-4 justify-between border-b border-gray-600 shadow-md flex-shrink-0">
                <span className="text-[10px] font-black uppercase tracking-widest">Access Control Matrix (Business Roles)</span>
                <span className="text-[10px] font-black uppercase text-accent">Total Templates: {roles.length}</span>
            </div>

            <div className="p-4 flex-1 flex gap-4 overflow-hidden">
                {/* Sidebar: Role List */}
                <Card className="w-1/3 flex flex-col p-0 tally-border overflow-hidden bg-white">
                    <div className="p-3 border-b border-gray-400 bg-gray-50 flex justify-between items-center flex-shrink-0">
                        <span className="text-[10px] font-black uppercase text-gray-500 tracking-widest">Role Directory</span>
                        <button 
                            onClick={() => { setRoleToEdit(null); setIsAddModalOpen(true); }}
                            className="bg-primary text-white px-3 py-1 text-[9px] font-black uppercase hover:bg-primary-dark transition-all"
                        >
                            + Create Role (F2)
                        </button>
                    </div>
                    <div className="flex-1 overflow-y-auto divide-y divide-gray-200">
                        {roles.map(role => (
                            <button
                                key={role.id}
                                onClick={() => setSelectedRole(role)}
                                className={`w-full text-left p-4 transition-all border-l-[8px] ${selectedRole?.id === role.id ? 'bg-accent text-black border-primary' : 'border-transparent hover:bg-gray-100'}`}
                            >
                                <div className="flex justify-between items-center mb-1">
                                    <p className={`${uniformTextStyle} truncate pr-2`}>{role.name}</p>
                                    {role.isSystemRole && <span className="text-[7px] font-black uppercase bg-gray-200 px-1 py-0.5">System</span>}
                                </div>
                                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest truncate">{role.description || 'No description provided'}</p>
                            </button>
                        ))}
                        {roles.length === 0 && (
                            <div className="p-10 text-center text-gray-300 font-black uppercase tracking-widest italic text-xs">No custom roles defined</div>
                        )}
                    </div>
                </Card>

                {/* Main: Role Details & View Selection Preview */}
                <Card className="flex-1 p-0 tally-border bg-white overflow-hidden flex flex-col shadow-inner">
                    {selectedRole ? (
                        <div className="flex flex-col h-full overflow-hidden">
                            <div className="p-6 bg-slate-50 border-b border-gray-400 flex justify-between items-start flex-shrink-0">
                                <div>
                                    <h3 className={`${uniformTextStyle} !text-4xl text-primary`}>{selectedRole.name}</h3>
                                    <p className="text-sm font-bold text-gray-500 uppercase mt-3 tracking-widest">{selectedRole.description || 'General Business Role Template'}</p>
                                </div>
                                <div className="flex gap-2">
                                    <button 
                                        onClick={() => handleDeleteClick(selectedRole)}
                                        className="px-4 py-2 border-2 border-red-500 text-red-600 font-black text-[10px] uppercase hover:bg-red-50 transition-colors"
                                    >
                                        Delete
                                    </button>
                                    <button 
                                        onClick={() => { setRoleToEdit(selectedRole); setIsAddModalOpen(true); }}
                                        className="px-6 py-2 tally-button-primary text-[10px] shadow-lg"
                                    >
                                        Alter Role
                                    </button>
                                </div>
                            </div>
                            
                            <div className="flex-1 overflow-auto p-8 custom-scrollbar bg-slate-50/30">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                    {selectedRole.workCenters.map(wc => (
                                        <div key={wc.id} className="bg-white border-2 border-gray-200 rounded-none p-4 shadow-sm">
                                            <div className="flex justify-between items-center border-b-2 border-gray-100 pb-2 mb-3">
                                                <h4 className="text-xs font-black uppercase text-primary tracking-[0.2em]">{wc.name}</h4>
                                                <span className="text-[8px] font-black text-gray-300 uppercase tracking-tighter">Module Cluster</span>
                                            </div>
                                            <div className="space-y-1.5">
                                                {wc.views.map(view => (
                                                    <div key={view.id} className="flex items-center gap-3">
                                                        <div className={`w-3 h-3 rounded-none border-2 flex-shrink-0 ${view.assigned ? 'bg-emerald-600 border-emerald-600' : 'bg-gray-100 border-gray-300'}`}>
                                                            {view.assigned && <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="4"><polyline points="20 6 9 17 4 12"/></svg>}
                                                        </div>
                                                        <span className={`text-[11px] font-bold uppercase ${view.assigned ? 'text-gray-900' : 'text-gray-400 line-through opacity-50'}`}>{view.name}</span>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div className="h-full flex flex-col items-center justify-center text-gray-300 opacity-30">
                            <svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" className="mb-6"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                            <p className="text-2xl font-black uppercase tracking-[0.3em]">Select Role Template</p>
                            <p className="text-sm font-bold mt-2 uppercase">Define reusable permission sets for your staff</p>
                        </div>
                    )}
                </Card>
            </div>

            <AddBusinessRoleModal 
                isOpen={isAddModalOpen}
                onClose={() => { setIsAddModalOpen(false); setRoleToEdit(null); }}
                onSave={handleSaveRole}
                roleToEdit={roleToEdit}
                organizationId={currentUser.organization_id}
                availableWorkCenters={DEFAULT_WORK_CENTERS}
            />

            <ConfirmModal 
                isOpen={isConfirmOpen}
                onClose={() => setIsConfirmOpen(false)}
                onConfirm={handleConfirmDelete}
                title="Delete Business Role"
                message={`Are you sure you want to delete the role '${roleToRemove?.name}'? This action cannot be undone.`}
            />
        </main>
    );
};

export default BusinessRoles;