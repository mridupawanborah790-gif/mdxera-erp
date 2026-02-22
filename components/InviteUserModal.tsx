
import React, { useState, useEffect } from 'react';
import Modal from './Modal';
import { UserRole, BusinessRole } from '../types';

interface InviteUserModalProps {
    isOpen: boolean;
    onClose: () => void;
    onInvite: (email: string, role: string, name: string, password: string) => void;
    availableRoles?: BusinessRole[];
}

const InviteUserModal: React.FC<InviteUserModalProps> = ({ isOpen, onClose, onInvite, availableRoles = [] }) => {
    const [email, setEmail] = useState('');
    const [name, setName] = useState('');
    const [password, setPassword] = useState('');
    const [role, setRole] = useState('');

    useEffect(() => {
        if (isOpen) {
            setEmail('');
            setName('');
            setPassword('');
            // Default to first role if available, or empty string
            setRole(availableRoles.length > 0 ? availableRoles[0].name : '');
        }
    }, [isOpen, availableRoles]);

    const handleSubmit = () => {
        if (!email.trim() || !name.trim() || !password.trim() || !role) {
            alert("All fields including Role are required.");
            return;
        }
        onInvite(email, role, name, password);
        onClose();
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Add Team Member" widthClass="max-w-md">
            <div className="p-6 space-y-4">
                <div className="bg-blue-50 border border-blue-200 rounded-none p-3 text-[11px] text-blue-800 font-bold uppercase tracking-tight">
                    Register a new business user identity. They will inherit the permissions defined in the selected Business Role template.
                </div>
                <div>
                    <label className="block text-[10px] font-black uppercase text-gray-500 mb-1 ml-1 tracking-widest">Full Legal Name</label>
                    <input 
                        type="text" 
                        value={name} 
                        onChange={e => setName(e.target.value)} 
                        className="block w-full p-2 border-2 border-gray-300 rounded-none bg-input-bg font-bold text-sm uppercase focus:bg-yellow-50 outline-none"
                        placeholder="e.g. JOHN SMITH"
                    />
                </div>
                <div>
                    <label className="block text-[10px] font-black uppercase text-gray-500 mb-1 ml-1 tracking-widest">Email Identity (Username)</label>
                    <input 
                        type="email" 
                        value={email} 
                        onChange={e => setEmail(e.target.value)} 
                        className="block w-full p-2 border-2 border-gray-300 rounded-none bg-input-bg font-bold text-sm focus:bg-yellow-50 outline-none"
                        placeholder="e.g. smith@pharmacy.com"
                    />
                </div>
                <div>
                    <label className="block text-[10px] font-black uppercase text-gray-500 mb-1 ml-1 tracking-widest">Access Password</label>
                    <input 
                        type="password" 
                        value={password} 
                        onChange={e => setPassword(e.target.value)} 
                        className="block w-full p-2 border-2 border-gray-300 rounded-none bg-input-bg font-bold text-sm focus:bg-yellow-50 outline-none"
                        placeholder="••••••••"
                    />
                </div>
                <div>
                    <label className="block text-[10px] font-black uppercase text-gray-500 mb-1 ml-1 tracking-widest">Assigned Business Role</label>
                    <select 
                        value={role} 
                        onChange={e => setRole(e.target.value)} 
                        className="block w-full p-2 border-2 border-gray-300 rounded-none bg-input-bg font-black text-xs uppercase focus:bg-yellow-50 outline-none"
                    >
                        <option value="" disabled>— Select Role Template —</option>
                        {availableRoles.length > 0 ? (
                            availableRoles.map(br => (
                                <option key={br.id} value={br.name}>{br.name}</option>
                            ))
                        ) : (
                            <>
                                <option value="admin">Administrator</option>
                                <option value="manager">Operations Manager</option>
                                <option value="purchase">Purchase Manager</option>
                                <option value="clerk">Sales Clerk</option>
                                <option value="viewer">Standard Viewer</option>
                            </>
                        )}
                    </select>
                    <p className="text-[9px] text-app-text-tertiary mt-2 font-bold uppercase italic">
                        {availableRoles.length > 0 
                            ? "Roles are synchronized from the Access Control Matrix."
                            : "Define custom roles in Utilities & Setup > Business Roles."}
                    </p>
                </div>
            </div>
            <div className="flex justify-end p-4 bg-gray-100 border-t border-gray-300 space-x-2 flex-shrink-0">
                <button onClick={onClose} className="px-6 py-2 text-[10px] font-black uppercase border border-gray-400 bg-white hover:bg-red-50 text-red-600 transition-colors">
                    Discard
                </button>
                <button onClick={handleSubmit} className="px-10 py-2 text-[10px] font-black uppercase text-white bg-primary rounded-none shadow-xl hover:bg-primary-dark transition-all">
                    Register User
                </button>
            </div>
        </Modal>
    );
};

export default InviteUserModal;
