
import React, { useEffect, useRef } from 'react';
import Modal from './Modal';

interface SimpleMappingConfirmModalProps {
    isOpen: boolean;
    onClose: () => void;
    distributorName: string;
    typedProductName: string;
    masterProductName: string;
    onConfirmLink: (shouldAutoApply: boolean) => void;
    disabled?: boolean;
}

const SimpleMappingConfirmModal: React.FC<SimpleMappingConfirmModalProps> = ({
    isOpen,
    onClose,
    distributorName,
    typedProductName,
    masterProductName,
    onConfirmLink,
    disabled = false,
}) => {
    const containerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (isOpen) {
            // Focus the container to capture keyboard events immediately
            setTimeout(() => containerRef.current?.focus(), 50);
        }
    }, [isOpen]);

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !disabled) {
            e.preventDefault();
            onConfirmLink(true);
        } else if (e.key === 'Escape') {
            e.preventDefault();
            onClose();
        }
    };

    if (!isOpen) return null;

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Nomenclature Sync Confirmation" widthClass="max-w-md">
            <div 
                ref={containerRef}
                tabIndex={0}
                onKeyDown={handleKeyDown}
                className="flex flex-col h-full bg-white dark:bg-zinc-950 outline-none font-normal"
            >
                <div className="p-10 text-center rounded-none">
                    <div className="w-20 h-20 bg-primary/10 text-primary rounded-none mx-auto flex items-center justify-center mb-8 border-2 border-primary/20">
                        <svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
                    </div>
                    
                    <div className="space-y-6">
                        <div>
                            <p className="text-[10px] font-normal text-gray-400 uppercase tracking-[0.25em] leading-none mb-2">Supplier Nomenclature</p>
                            <p className="text-base font-normal text-primary uppercase font-mono tracking-tight break-words px-4">"{typedProductName}"</p>
                        </div>
                        
                        <div className="flex justify-center items-center py-2">
                            <div className="w-12 h-px bg-gray-200"></div>
                            <span className="mx-4 text-gray-300">▼</span>
                            <div className="w-12 h-px bg-gray-200"></div>
                        </div>

                        <div>
                            <p className="text-[10px] font-normal text-gray-400 uppercase tracking-[0.25em] leading-none mb-2">Master Catalog SKU</p>
                            <p className="text-xl font-normal text-emerald-600 uppercase tracking-tighter leading-tight break-words px-4">"{masterProductName}"</p>
                        </div>
                    </div>
                    
                    <div className="mt-10 p-4 bg-primary/5 dark:bg-zinc-900 border border-primary/10 rounded-none text-center">
                        <p className="text-[9px] font-normal text-primary/60 uppercase tracking-[0.3em]">
                            Sync Rule for: {distributorName}
                        </p>
                        {disabled ? (
                            <p className="text-[9px] text-red-500 mt-1 font-normal">Registration required to activate sync rule.</p>
                        ) : (
                            <p className="text-[8px] text-gray-400 mt-1 font-normal">This will automate mapping for future bills from this vendor.</p>
                        )}
                    </div>
                </div>
                
                <div className="flex justify-stretch p-0 border-t border-app-border rounded-none font-normal">
                    <button
                        onClick={onClose}
                        className="flex-1 py-5 text-[11px] font-normal uppercase tracking-[0.25em] text-gray-400 bg-white dark:bg-zinc-900 border-r border-app-border hover:bg-gray-50 transition-all"
                    >
                        Discard (Esc)
                    </button>
                    <button
                        onClick={() => onConfirmLink(true)}
                        disabled={disabled}
                        className={`flex-[2] py-5 text-[11px] font-normal uppercase tracking-[0.25em] text-white transition-all transform active:scale-95 ${disabled ? 'bg-gray-300 cursor-not-allowed' : 'bg-primary hover:bg-primary-dark shadow-[0_-10px_30px_rgba(0,0,0,0.1)]'}`}
                    >
                        {disabled ? 'Registration Required' : 'Accept & Link ↵'}
                    </button>
                </div>
            </div>
        </Modal>
    );
};

export default SimpleMappingConfirmModal;
