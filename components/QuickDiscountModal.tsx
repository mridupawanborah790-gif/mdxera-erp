
import React, { useState, useEffect, useRef } from 'react';
import Modal from './Modal';
import { DiscountRule, DiscCalculationBase } from '../types';

interface QuickDiscountModalProps {
    isOpen: boolean;
    onClose: () => void;
    rule: DiscountRule;
    currentValue?: number;
    onApply: (value: number, type: 'flat' | 'percentage') => void;
}

const QuickDiscountModal: React.FC<QuickDiscountModalProps> = ({ isOpen, onClose, rule, currentValue, onApply }) => {
    const [inputValue, setInputValue] = useState<string>(currentValue?.toString() || '');
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (isOpen) {
            setInputValue(currentValue?.toString() || '');
            setTimeout(() => {
                inputRef.current?.focus();
                inputRef.current?.select();
            }, 50);
        }
    }, [isOpen, currentValue]);

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            const num = parseFloat(inputValue) || 0;
            onApply(num, rule.type === 'percentage' ? 'percentage' : 'flat');
            onClose();
        } else if (e.key === 'Escape') {
            onClose();
        }
    };

    if (!isOpen) return null;

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={`Apply ${rule.name}`} widthClass="max-w-xs">
            <div className="p-6 bg-white dark:bg-zinc-900">
                <div className="mb-4">
                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">
                        {rule.level.toUpperCase()} LEVEL {rule.type.toUpperCase()}
                    </p>
                    <label className="block text-sm font-bold text-primary uppercase">Enter {rule.type === 'percentage' ? 'Percent (%)' : 'Amount (₹)'}</label>
                </div>
                <input 
                    ref={inputRef}
                    type="number"
                    value={inputValue}
                    onChange={e => setInputValue(e.target.value)}
                    onKeyDown={handleKeyDown}
                    className="w-full border-4 border-primary p-4 text-4xl font-black text-center focus:bg-yellow-50 outline-none no-spinner"
                    placeholder="0.00"
                />
                <div className="mt-6 flex justify-between gap-4">
                    <button onClick={onClose} className="flex-1 py-2 text-xs font-black uppercase border border-gray-300 hover:bg-gray-50">Cancel</button>
                    <button 
                        onClick={() => {
                            const num = parseFloat(inputValue) || 0;
                            onApply(num, rule.type === 'percentage' ? 'percentage' : 'flat');
                            onClose();
                        }}
                        className="flex-1 py-2 text-xs font-black uppercase bg-primary text-white shadow-lg hover:bg-primary-dark"
                    >
                        Apply
                    </button>
                </div>
                <p className="text-[9px] text-gray-400 mt-4 text-center font-bold uppercase tracking-tighter">Press ENTER to accept</p>
            </div>
        </Modal>
    );
};

export default QuickDiscountModal;
