
import React, { useState, useEffect } from 'react';
import Modal from './Modal';
import { BusinessRole, WorkCenter, RegisteredPharmacy } from '../types';

interface AddBusinessRoleModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: (role: Omit<BusinessRole, 'id'> | BusinessRole) => void;
    roleToEdit?: BusinessRole | null;
    organizationId: string;
    availableWorkCenters: WorkCenter[];
}

const AddBusinessRoleModal: React.FC<AddBusinessRoleModalProps> = ({ 
    isOpen, onClose, onSave, roleToEdit, organizationId, availableWorkCenters 
}) => {
    const [name, setName] = useState('');
    const [description, setDescription] = useState('');
    const [workCenters, setWorkCenters] = useState<WorkCenter[]>([]);

    useEffect(() => {
        if (isOpen) {
            if (roleToEdit) {
                setName(roleToEdit.name);
                setDescription(roleToEdit.description);
                setWorkCenters(JSON.parse(JSON.stringify(roleToEdit.workCenters)));
            } else {
                setName('');
                setDescription('');
                setWorkCenters(JSON.parse(JSON.stringify(availableWorkCenters)));
            }
        }
    }, [isOpen, roleToEdit, availableWorkCenters]);

    const handleToggleView = (wcIdx: number, vIdx: number) => {
        const newWc = [...workCenters];
        newWc[wcIdx].views[vIdx].assigned = !newWc[wcIdx].views[vIdx].assigned;
        setWorkCenters(newWc);
    };

    const handleSubmit = () => {
        if (!name.trim()) {
            alert("Role name is required");
            return;
        }

        const payload = {
            organization_id: organizationId,
            name: name.trim(),
            description: description.trim(),
            workCenters: workCenters,
            // Fixed: isActive -> is_active
            is_active: true,
            isSystemRole: false
        };

        if (roleToEdit) {
            onSave({ ...payload, id: roleToEdit.id });
        } else {
            onSave(payload);
        }
        onClose();
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={roleToEdit ? "Alter Business Role" : "Create Business Role"} widthClass="max-w-4xl">
            <div className="flex flex-col h-full overflow-hidden bg-white dark:bg-zinc-950">
                <div className="p-6 border-b border-gray-200 bg-slate-50">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div>
                            <label className="block text-[10px] font-black uppercase text-gray-500 mb-1 ml-1 tracking-widest">Role Identification Name</label>
                            <input 
                                type="text" 
                                value={name} 
                                onChange={e => setName(e.target.value)}
                                className="w-full p-2 border-2 border-gray-400 font-bold text-sm uppercase focus:bg-yellow-50 outline-none"
                                placeholder="e.g. SENIOR PHARMACIST"
                                autoFocus
                            />
                        </div>
                        <div>
                            <label className="block text-[10px] font-black uppercase text-gray-500 mb-1 ml-1 tracking-widest">Description / Purpose</label>
                            <input 
                                type="text" 
                                value={description} 
                                onChange={e => setDescription(e.target.value)}
                                className="w-full p-2 border-2 border-gray-400 font-bold text-sm focus:bg-yellow-50 outline-none"
                                placeholder="Define what this role is for..."
                            />
                        </div>
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto p-6 space-y-6">
                    <h4 className="text-[11px] font-black uppercase tracking-[0.25em] text-primary border-b border-primary pb-2">Access Rights & Permissions Matrix</h4>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {workCenters.map((wc, wcIdx) => (
                            <div key={wc.id} className="border border-gray-300 rounded-none overflow-hidden bg-white shadow-sm">
                                <div className="bg-gray-100 p-2.5 border-b border-gray-300 flex items-center justify-between">
                                    <span className="text-xs font-black uppercase text-primary">{wc.name}</span>
                                    <span className="text-[8px] font-bold text-gray-400 uppercase">Work Center</span>
                                </div>
                                <div className="p-2 space-y-1">
                                    {wc.views.map((view, vIdx) => (
                                        <button 
                                            key={view.id}
                                            onClick={() => handleToggleView(wcIdx, vIdx)}
                                            className={`w-full flex items-center justify-between p-2 text-left transition-all ${view.assigned ? 'bg-emerald-50 text-emerald-800' : 'hover:bg-gray-50 text-gray-500'}`}
                                        >
                                            <span className="text-[11px] font-bold uppercase">{view.name}</span>
                                            <div className={`w-4 h-4 border-2 flex items-center justify-center ${view.assigned ? 'bg-emerald-600 border-emerald-600' : 'bg-white border-gray-300'}`}>
                                                {view.assigned && <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="4"><polyline points="20 6 9 17 4 12"/></svg>}
                                            </div>
                                        </button>
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                <div className="p-4 bg-gray-100 border-t border-gray-300 flex justify-end gap-3 flex-shrink-0">
                    <button onClick={onClose} className="px-8 py-2 text-[10px] font-black uppercase tracking-widest text-gray-500 hover:text-black">Discard</button>
                    <button onClick={handleSubmit} className="px-12 py-3 bg-primary text-white text-[11px] font-black uppercase tracking-[0.2em] shadow-xl hover:bg-primary-dark transition-all transform active:scale-95">Accept & Save Role</button>
                </div>
            </div>
        </Modal>
    );
};

export default AddBusinessRoleModal;
