import React, { useState, useEffect, useCallback } from 'react';
import Card from '../components/Card';
import InviteUserModal from '../components/InviteUserModal';
import ConfirmModal from '../components/ConfirmModal';
import { RegisteredPharmacy, OrganizationMember, UserRole } from '../types';
import { fetchTeamMembers, addTeamMember, updateMemberRole, removeTeamMember } from '../services/storageService';

interface TeamManagementProps {
    currentUser: RegisteredPharmacy;
    addNotification: (message: string, type?: 'success' | 'error') => void;
}

const TeamManagement: React.FC<TeamManagementProps> = ({ currentUser, addNotification }) => {
    const [members, setMembers] = useState<OrganizationMember[]>([]);
    const [isInviteModalOpen, setIsInviteModalOpen] = useState(false);
    const [isConfirmOpen, setIsConfirmOpen] = useState(false);
    const [memberToRemove, setMemberToRemove] = useState<OrganizationMember | null>(null);
    const [isLoading, setIsLoading] = useState(true);

    const loadMembers = useCallback(async () => {
        setIsLoading(true);
        try {
            const data = await fetchTeamMembers(currentUser);
            setMembers(data);
        } catch (err) {
            addNotification("Failed to fetch team members", "error");
        } finally {
            setIsLoading(false);
        }
    }, [currentUser, addNotification]);

    useEffect(() => {
        loadMembers();
    }, [loadMembers]);

    const handleAddMember = async (payload: {
        name: string;
        username: string;
        password: string;
        department: string;
        mobile: string;
        email: string;
        isActive: boolean;
        assignedRoleIds: string[];
    }) => {
        try {
            await addTeamMember(payload.email, 'viewer', payload.name, payload.password, currentUser.organization_id, {
                department: payload.department,
                employeeId: payload.username,
                company: payload.mobile,
                assignedRoles: payload.assignedRoleIds,
                status: payload.isActive ? 'active' : 'suspended',
                isLocked: !payload.isActive,
            });
            addNotification(`User ${payload.name} invited successfully.`, 'success');
            loadMembers();
        } catch (err: any) {
            addNotification(err.message || "Failed to invite user.", "error");
        }
    };

    const handleRoleChange = async (userId: string, newRole: UserRole) => {
        try {
            await updateMemberRole(userId, newRole);
            addNotification("Role updated successfully.", "success");
            loadMembers();
        } catch (err) {
            addNotification("Failed to update role.", "error");
        }
    };

    const handleRemoveRequest = (member: OrganizationMember) => {
        if (member.id === currentUser.user_id) {
            addNotification("You cannot remove yourself.", "error");
            return;
        }
        setMemberToRemove(member);
        setIsConfirmOpen(true);
    };

    const handleConfirmRemove = async () => {
        if (!memberToRemove) return;
        try {
            await removeTeamMember(memberToRemove.id);
            addNotification(`User ${memberToRemove.name} removed.`, "success");
            loadMembers();
        } catch (err) {
            addNotification("Failed to remove user.", "error");
        } finally {
            setIsConfirmOpen(false);
            setMemberToRemove(null);
        }
    };

    return (
        <main className="flex-1 overflow-hidden flex flex-col page-fade-in bg-app-bg">
            <div className="bg-primary text-white h-7 flex items-center px-4 justify-between border-b border-gray-600 shadow-md flex-shrink-0">
                <span className="text-[10px] font-black uppercase tracking-widest">Security Control (User Assignment)</span>
                <span className="text-[10px] font-black uppercase text-accent">Multi-user Access</span>
            </div>

            <div className="p-4 flex-1 flex flex-col gap-4 overflow-y-auto">
                <div className="flex justify-between items-center px-2">
                    <div className="flex flex-col">
                        <h2 className="text-2xl font-black text-gray-900 uppercase tracking-tighter">Organization Team</h2>
                        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Manage access levels for pharmacy staff</p>
                    </div>
                    <button 
                        onClick={() => setIsInviteModalOpen(true)} 
                        className="px-8 py-2.5 tally-button-primary shadow-xl text-[11px] font-black uppercase tracking-widest flex items-center gap-2"
                    >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                        F2: Add User
                    </button>
                </div>

                <Card className="p-0 tally-border bg-white !rounded-none overflow-hidden shadow-md">
                    <div className="p-3 border-b border-gray-400 bg-gray-50 flex justify-between items-center flex-shrink-0">
                        <span className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Registered Member Directory</span>
                        {isLoading && <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin"></div>}
                    </div>
                    
                    <div className="overflow-x-auto">
                        <table className="min-w-full border-collapse">
                            <thead className="bg-[#e1e1e1] border-b border-gray-400">
                                <tr className="text-[10px] font-black uppercase text-gray-700">
                                    <th className="p-3 border-r border-gray-400 w-12 text-center">#</th>
                                    <th className="p-3 border-r border-gray-400 text-left">Full Name</th>
                                    <th className="p-3 border-r border-gray-400 text-left">Email Identity</th>
                                    <th className="p-3 border-r border-gray-400 text-left w-48">Access Level (Role)</th>
                                    <th className="p-3 border-r border-gray-400 text-center w-32">Status</th>
                                    <th className="p-3 text-right w-32">Manage</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-200">
                                {members.map((member, idx) => (
                                    <tr key={member.id} className={`hover:bg-accent transition-colors group ${member.id === currentUser.user_id ? 'bg-blue-50/30' : ''}`}>
                                        <td className="p-3 border-r border-gray-200 text-center text-gray-400">{idx + 1}</td>
                                        <td className="p-3 border-r border-gray-200 font-black text-gray-900 uppercase">
                                            {member.name}
                                            {member.id === currentUser.user_id && <span className="ml-2 text-[8px] bg-primary text-white px-1.5 py-0.5 rounded-none">YOU</span>}
                                        </td>
                                        <td className="p-3 border-r border-gray-200 font-mono text-[11px] text-gray-600">{member.email}</td>
                                        <td className="p-3 border-r border-gray-200">
                                            <select 
                                                value={member.role}
                                                onChange={(e) => handleRoleChange(member.id, e.target.value as UserRole)}
                                                disabled={member.id === currentUser.user_id}
                                                className="w-full bg-transparent border-none font-bold uppercase text-[11px] text-primary focus:ring-0 cursor-pointer disabled:cursor-not-allowed"
                                            >
                                                <option value="owner">Owner</option>
                                                <option value="admin">Administrator</option>
                                                <option value="manager">Manager</option>
                                                <option value="purchase">Purchase Manager</option>
                                                <option value="clerk">Sales Clerk</option>
                                                <option value="viewer">Viewer</option>
                                            </select>
                                        </td>
                                        <td className="p-3 border-r border-gray-200 text-center">
                                            <span className={`px-2 py-0.5 text-[9px] font-black uppercase border ${
                                                member.status === 'active' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-amber-50 text-amber-700 border-amber-200'
                                            }`}>
                                                {member.status}
                                            </span>
                                        </td>
                                        <td className="p-3 text-right">
                                            <button 
                                                onClick={() => handleRemoveRequest(member)}
                                                className={`text-[10px] font-black uppercase tracking-widest ${
                                                    member.id === currentUser.user_id ? 'opacity-20 cursor-not-allowed' : 'text-red-600 hover:underline'
                                                }`}
                                            >
                                                Suspend
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </Card>
            </div>

            <InviteUserModal 
                isOpen={isInviteModalOpen} 
                onClose={() => setIsInviteModalOpen(false)} 
                onInvite={handleAddMember} 
            />

            <ConfirmModal 
                isOpen={isConfirmOpen} 
                onClose={() => setIsConfirmOpen(false)} 
                onConfirm={handleConfirmRemove} 
                title="Revoke Access" 
                message={`Are you sure you want to suspend access for ${memberToRemove?.name}? This user will be unable to log in.`} 
            />
        </main>
    );
};

export default TeamManagement;