
import React, { useState } from 'react';
import Modal from './Modal';

interface MobileSyncModalProps {
    isOpen: boolean;
    onClose: () => void;
    sessionId: string | null;
    orgId: string;
}

const MobileSyncModal: React.FC<MobileSyncModalProps> = ({ isOpen, onClose, sessionId, orgId }) => {
    const [copied, setCopied] = useState(false);

    if (!isOpen || !sessionId) return null;

    // Use origin + pathname to get a clean base URL without trailing files or existing query params
    const baseUrl = window.location.origin + window.location.pathname;
    const syncUrl = `${baseUrl}?sync_session=${sessionId}&org_id=${orgId}`;
    
    // Using a public QR code API
    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(syncUrl)}`;

    const handleCopyLink = () => {
        navigator.clipboard.writeText(syncUrl);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Magic Mobile Link" widthClass="max-w-md">
            <div className="p-8 flex flex-col items-center text-center rounded-none">
                <div className="w-16 h-16 bg-primary/10 text-primary rounded-none flex items-center justify-center mb-6 ring-8 ring-primary/5">
                    <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect x="5" y="2" width="14" height="20" rx="2" ry="2"/><line x1="12" y1="18" x2="12.01" y2="18"/></svg>
                </div>
                
                <h3 className="text-xl font-black text-gray-900 dark:text-white uppercase tracking-tight mb-2">Sync Your Phone</h3>
                <p className="text-sm text-gray-500 font-medium leading-relaxed mb-8 px-4">
                    Scan this QR code with your mobile camera to snap and transfer bill photos directly to this screen instantly.
                </p>

                <div className="p-4 bg-white rounded-none border-4 border-primary/20 shadow-2xl relative group mb-6">
                    <img src={qrUrl} alt="Sync QR" className="w-56 h-56 rendering-pixelated" />
                    <div className="absolute inset-0 border-2 border-primary/10 rounded-none animate-pulse pointer-events-none"></div>
                </div>

                <button 
                    onClick={handleCopyLink}
                    className={`mb-6 px-4 py-2 text-[10px] font-black uppercase border-2 transition-all ${copied ? 'bg-emerald-50 border-emerald-500 text-white' : 'bg-white border-gray-300 text-gray-500 hover:border-primary hover:text-primary'}`}
                >
                    {copied ? 'Link Copied!' : 'Copy Manual Link'}
                </button>

                <div className="flex items-center gap-3 bg-slate-50 dark:bg-slate-800 px-4 py-2 rounded-none border border-app-border">
                    <div className="w-2 h-2 bg-green-500 rounded-none animate-ping"></div>
                    <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Waiting for mobile capture...</span>
                </div>

                <button 
                    onClick={onClose}
                    className="mt-8 text-xs font-bold text-gray-400 hover:text-primary uppercase tracking-tighter transition-colors"
                >
                    Dismiss Link
                </button>
            </div>
        </Modal>
    );
};

export default MobileSyncModal;
