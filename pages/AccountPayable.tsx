
import React, { useState, useMemo, useEffect } from 'react';
import Card from '../components/Card';
import { Distributor, RegisteredPharmacy } from '../types';
import { getOutstandingBalance } from '../utils/helpers';
import { fuzzyMatch } from '../utils/search';
import { handleEnterToNextField } from '../utils/navigation';

// Standardized typography matching POS screen "Product Selection Matrix"
const uniformTextStyle = "text-2xl font-normal tracking-tight uppercase leading-tight";

interface AccountPayableProps {
    distributors: Distributor[];
    onRecordPayment: (distributorId: string, amount: number, date: string, description: string) => void;
    currentUser: RegisteredPharmacy | null;
}

const AccountPayable: React.FC<AccountPayableProps> = ({ distributors, onRecordPayment, currentUser }) => {
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedDistributor, setSelectedDistributor] = useState<Distributor | null>(null);
    const [amount, setAmount] = useState<number | ''>('');
    const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
    const [description, setDescription] = useState('Supplier Payment');
    const [isSubmitting, setIsSubmitting] = useState(false);

    const filteredDistributors = useMemo(() => {
        const lower = searchTerm.toLowerCase();
        return distributors
            /* Fix: Rename d.isActive to d.is_active */
            .filter(d => d.is_active !== false)
            /* Fix: Rename d.gstNumber to d.gst_number */
            .filter(d => fuzzyMatch(d.name, searchTerm) || fuzzyMatch(d.gst_number, searchTerm))
            .sort((a, b) => getOutstandingBalance(b) - getOutstandingBalance(a));
    }, [distributors, searchTerm]);

    const handleSelectDistributor = (d: Distributor) => {
        setSelectedDistributor(d);
        const balance = getOutstandingBalance(d);
        setAmount(balance > 0 ? balance : '');
        setDescription('Supplier Payment');
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedDistributor || !amount || amount <= 0) return;

        setIsSubmitting(true);
        try {
            await onRecordPayment(selectedDistributor.id, Number(amount), date, description);
            setSelectedDistributor(null);
            setAmount('');
            setSearchTerm('');
            setDescription('Supplier Payment');
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <main className="flex-1 overflow-hidden flex flex-col page-fade-in bg-app-bg" onKeyDown={handleEnterToNextField}>
            <div className="bg-primary text-white h-7 flex items-center px-4 justify-between border-b border-gray-600 shadow-md flex-shrink-0">
                <span className="text-[10px] font-black uppercase tracking-widest">Sundry Creditors (Payable)</span>
                <span className="text-[10px] font-black uppercase text-accent">Total Creditors: {distributors.length}</span>
            </div>

            <div className="p-4 flex-1 flex gap-4 min-h-0 overflow-hidden">
                <Card className="w-1/3 flex flex-col p-0 tally-border overflow-hidden bg-white">
                    <div className="p-3 border-b border-gray-400 bg-gray-50 flex-shrink-0">
                        <label className="text-[10px] font-bold text-gray-500 uppercase block mb-1">Search Supplier</label>
                        <input 
                            type="text"
                            value={searchTerm}
                            onChange={e => setSearchTerm(e.target.value)}
                            placeholder="Name or GSTIN..."
                            className="w-full border border-gray-400 p-2 text-sm font-bold focus:bg-yellow-50 outline-none"
                        />
                    </div>
                    <div className="flex-1 overflow-y-auto divide-y divide-gray-200">
                        {filteredDistributors.map(d => {
                            const balance = getOutstandingBalance(d);
                            const isSelected = selectedDistributor?.id === d.id;
                            return (
                                <button
                                    key={d.id}
                                    onClick={() => handleSelectDistributor(d)}
                                    className={`w-full text-left p-4 transition-all ${isSelected ? 'bg-accent text-black' : 'hover:bg-gray-100'}`}
                                >
                                    <div className="flex justify-between items-start">
                                        <div className="min-w-0 flex-1">
                                            <p className={`${uniformTextStyle} truncate`}>{d.name}</p>
                                            {/* Fix: Rename d.gstNumber to d.gst_number */}
                                            <p className={`${uniformTextStyle} !text-base mt-1 ${isSelected ? 'opacity-60' : 'text-gray-500'}`}>{d.gst_number || 'NO GSTIN'}</p>
                                        </div>
                                        <div className="text-right ml-2">
                                            <p className={`${uniformTextStyle} ${balance > 0 ? 'text-red-700' : 'text-emerald-700'}`}>
                                                ₹{balance.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                                            </p>
                                        </div>
                                    </div>
                                </button>
                            );
                        })}
                    </div>
                </Card>

                <Card className="flex-1 p-8 tally-border bg-white overflow-y-auto">
                    {selectedDistributor ? (
                        <form onSubmit={handleSubmit} className="max-w-xl mx-auto space-y-8">
                            <div className="pb-4 border-b border-gray-300">
                                <p className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] mb-1">Active Ledger Selection</p>
                                <h2 className={`${uniformTextStyle} !text-4xl text-primary`}>{selectedDistributor.name}</h2>
                                <div className="mt-4 flex gap-4 text-xs font-black uppercase">
                                    <span className="text-gray-400">Current Balance: <span className="text-red-600 text-lg">₹{getOutstandingBalance(selectedDistributor).toFixed(2)}</span></span>
                                </div>
                            </div>

                            <div className="grid grid-cols-1 gap-6">
                                <div>
                                    <label className="text-xs font-black text-gray-500 uppercase block mb-2 tracking-widest">Payment Amount (₹)</label>
                                    <input 
                                        type="number" 
                                        required
                                        autoFocus
                                        value={amount}
                                        onChange={e => setAmount(parseFloat(e.target.value) || '')}
                                        className="w-full border-4 border-gray-400 p-6 text-5xl font-black focus:bg-yellow-50 focus:border-primary outline-none text-red-700 no-spinner shadow-inner"
                                        placeholder="0.00"
                                    />
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="text-[10px] font-bold text-gray-500 uppercase block mb-1">Date of Payment</label>
                                        <input 
                                            type="date" 
                                            required
                                            value={date}
                                            onChange={e => setDate(e.target.value)}
                                            className="w-full border border-gray-400 p-3 text-base font-black outline-none focus:bg-yellow-50"
                                        />
                                    </div>
                                    <div>
                                        <label className="text-[10px] font-bold text-gray-500 uppercase block mb-1">Narration / Remark</label>
                                        <input 
                                            type="text" 
                                            value={description}
                                            onChange={e => setDescription(e.target.value)}
                                            className="w-full border border-gray-400 p-3 text-base font-black uppercase outline-none focus:bg-yellow-50"
                                            placeholder="SUPPLIER PAYMENT"
                                        />
                                    </div>
                                </div>
                            </div>

                            <div className="pt-6 flex justify-end gap-4">
                                <button type="button" tabIndex={-1} onClick={() => setSelectedDistributor(null)} className="px-8 py-3 tally-border bg-white font-black uppercase text-xs hover:bg-gray-100 transition-colors">Discard</button>
                                <button 
                                    type="submit"
                                    tabIndex={-1}
                                    disabled={isSubmitting || !amount || Number(amount) <= 0}
                                    className="px-14 py-4 tally-button-primary shadow-2xl uppercase text-sm font-black tracking-widest"
                                >
                                    {isSubmitting ? 'Posting Ledger...' : 'Accept Voucher (Ent)'}
                                </button>
                            </div>
                        </form>
                    ) : (
                        <div className="h-full flex flex-col items-center justify-center text-center opacity-30">
                            <svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="mb-4"><rect x="3" y="9" width="18" height="10" rx="2"/><path d="M7 9V5a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v4"/><circle cx="12" cy="14" r="2"/></svg>
                            <p className="text-2xl font-black uppercase tracking-[0.2em]">Select Supplier to post Payment</p>
                            <p className="text-sm font-bold mt-2">Search and click on a creditor from the left panel</p>
                        </div>
                    )}
                </Card>
            </div>
        </main>
    );
};

export default AccountPayable;
