import React, { useState, useEffect } from 'react';
import Modal from './Modal';
import { BusinessRole } from '../types';

interface InviteUserModalProps {
    isOpen: boolean;
    onClose: () => void;
    onInvite: (payload: {
        name: string;
        username: string;
        password: string;
        department: string;
        mobile: string;
        email: string;
        isActive: boolean;
        assignedRoleIds: string[];
    }) => void;
    availableRoles?: BusinessRole[];
}

const InviteUserModal: React.FC<InviteUserModalProps> = ({ isOpen, onClose, onInvite, availableRoles = [] }) => {
    const [name, setName] = useState('');
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [department, setDepartment] = useState('');
    const [mobile, setMobile] = useState('');
    const [email, setEmail] = useState('');
    const [isActive, setIsActive] = useState(true);
    const [assignedRoleIds, setAssignedRoleIds] = useState<string[]>([]);

    useEffect(() => {
        if (!isOpen) return;
        setName('');
        setUsername('');
        setPassword('');
        setDepartment('');
        setMobile('');
        setEmail('');
        setIsActive(true);
        setAssignedRoleIds(availableRoles[0]?.id ? [availableRoles[0].id] : []);
    }, [isOpen, availableRoles]);

    const toggleRole = (roleId: string) => {
        setAssignedRoleIds((prev) => (prev.includes(roleId) ? prev.filter((id) => id !== roleId) : [...prev, roleId]));
    };

    const handleSubmit = () => {
        if (!name.trim() || !username.trim() || !password.trim()) {
            alert('Name, username and password are required.');
            return;
        }

        onInvite({
            name,
            username,
            password,
            department,
            mobile,
            email: email || username,
            isActive,
            assignedRoleIds,
        });
        onClose();
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Add Business User" widthClass="max-w-3xl">
            <div className="p-6 space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <input value={name} onChange={(e) => setName(e.target.value)} className="w-full p-2 border-2 border-gray-300 font-bold text-sm uppercase" placeholder="Name" />
                    <input value={username} onChange={(e) => setUsername(e.target.value)} className="w-full p-2 border-2 border-gray-300 font-bold text-sm" placeholder="Username / Login" />
                    <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} className="w-full p-2 border-2 border-gray-300 font-bold text-sm" placeholder="Password" />
                    <input value={department} onChange={(e) => setDepartment(e.target.value)} className="w-full p-2 border-2 border-gray-300 font-bold text-sm uppercase" placeholder="Department" />
                    <input value={mobile} onChange={(e) => setMobile(e.target.value)} className="w-full p-2 border-2 border-gray-300 font-bold text-sm" placeholder="Mobile" />
                    <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="w-full p-2 border-2 border-gray-300 font-bold text-sm" placeholder="Email" />
                </div>

                <label className="flex items-center gap-2 text-xs font-black uppercase text-gray-600">
                    <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
                    Is Active
                </label>

                <div>
                    <p className="text-[10px] font-black uppercase text-gray-500 mb-2">Assign Multiple Roles</p>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2 max-h-48 overflow-auto border border-gray-200 p-3">
                        {availableRoles.map((role) => (
                            <label key={role.id} className="flex items-center gap-2 text-xs font-bold uppercase">
                                <input type="checkbox" checked={assignedRoleIds.includes(role.id)} onChange={() => toggleRole(role.id)} />
                                <span>{role.name}</span>
                            </label>
                        ))}
                        {!availableRoles.length && <p className="text-xs text-gray-500">No custom roles available.</p>}
                    </div>
                </div>
            </div>
            <div className="flex justify-end p-4 bg-gray-100 border-t border-gray-300 space-x-2 flex-shrink-0">
                <button onClick={onClose} className="px-6 py-2 text-[10px] font-black uppercase border border-gray-400 bg-white hover:bg-red-50 text-red-600 transition-colors">Discard</button>
                <button onClick={handleSubmit} className="px-10 py-2 text-[10px] font-black uppercase text-white bg-primary rounded-none shadow-xl hover:bg-primary-dark transition-all">Register User</button>
            </div>
        </Modal>
    );
};

export default InviteUserModal;
