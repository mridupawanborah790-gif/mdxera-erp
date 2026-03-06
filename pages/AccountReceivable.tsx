import React, { useState, useMemo } from 'react';
import Card from '../components/Card';
import { Customer, RegisteredPharmacy, Transaction } from '../types';
import { getOutstandingBalance } from '../utils/helpers';
import { fuzzyMatch } from '../utils/search';
import { handleEnterToNextField } from '../utils/navigation';

const uniformTextStyle = 'text-2xl font-normal tracking-tight uppercase leading-tight';

interface BankOption {
    id: string;
    bankName: string;
    accountName: string;
    accountNumber: string;
    isDefault: boolean;
}

interface AccountReceivableProps {
    customers: Customer[];
    transactions: Transaction[];
    bankOptions: BankOption[];
    onRecordPayment: (args: {
        customerId: string;
        amount: number;
        date: string;
        description: string;
        paymentMode: string;
        bankAccountId: string;
        referenceInvoiceId?: string;
        referenceInvoiceNumber?: string;
    }) => Promise<void>;
    currentUser: RegisteredPharmacy | null;
}

const AccountReceivable: React.FC<AccountReceivableProps> = ({ customers, transactions, bankOptions, onRecordPayment }) => {
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
    const [selectedInvoiceId, setSelectedInvoiceId] = useState('');
    const [amount, setAmount] = useState<number | ''>('');
    const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
    const [description, setDescription] = useState('Payment Received');
    const [paymentMode, setPaymentMode] = useState('Bank');
    const [bankAccountId, setBankAccountId] = useState('');
    const [showPaymentForm, setShowPaymentForm] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);

    const defaultBank = useMemo(() => bankOptions.find(b => b.isDefault), [bankOptions]);

    const filteredCustomers = useMemo(() => {
        return customers
            .filter(c => c.is_active !== false)
            .filter(c => fuzzyMatch(c.name, searchTerm) || fuzzyMatch(c.phone, searchTerm))
            .sort((a, b) => getOutstandingBalance(b) - getOutstandingBalance(a));
    }, [customers, searchTerm]);

    const invoiceRows = useMemo(() => {
        if (!selectedCustomer) return [] as Array<{ id: string; date: string; invoiceAmount: number; received: number; balance: number; paymentDate: string; paymentMode: string; bankName: string; voucherRef: string }>;

        const sales = transactions
            .filter(t => t.status !== 'cancelled' && (t.customerId === selectedCustomer.id || (t.customerName || '').trim().toLowerCase() === (selectedCustomer.name || '').trim().toLowerCase()))
            .map(t => ({
                id: t.id,
                date: t.date,
                invoiceAmount: Number(t.total || 0),
                received: 0,
                balance: Number(t.total || 0),
                paymentDate: '-',
                paymentMode: String(t.paymentMode || 'Credit'),
                bankName: '-',
                voucherRef: '-',
            }));

        const mapByInvoice = new Map(sales.map(s => [s.id, { ...s }]));

        for (const entry of selectedCustomer.ledger || []) {
            if (entry.type !== 'payment') continue;
            const invoiceId = entry.referenceInvoiceId || '';
            const target = invoiceId && mapByInvoice.get(invoiceId);
            if (target) {
                target.received += Number(entry.credit || 0);
                target.balance = Number((target.invoiceAmount - target.received).toFixed(2));
                target.paymentDate = entry.date || target.paymentDate;
                target.paymentMode = entry.paymentMode || target.paymentMode;
                target.bankName = entry.bankName || target.bankName;
                target.voucherRef = entry.journalEntryNumber || entry.journalEntryId || target.voucherRef;
            }
        }

        return Array.from(mapByInvoice.values()).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    }, [selectedCustomer, transactions]);

    const ledgerRows = useMemo(() => {
        if (!selectedCustomer) return [];
        return [...(selectedCustomer.ledger || [])].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    }, [selectedCustomer]);

    const openPaymentPanel = () => {
        setShowPaymentForm(true);
        setAmount('');
        setDescription('Payment Received');
        setSelectedInvoiceId('');
        setBankAccountId(defaultBank?.id || '');
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedCustomer || !amount || amount <= 0 || !bankAccountId) return;
        const invoice = invoiceRows.find(i => i.id === selectedInvoiceId);

        setIsSubmitting(true);
        try {
            await onRecordPayment({
                customerId: selectedCustomer.id,
                amount: Number(amount),
                date,
                description,
                paymentMode,
                bankAccountId,
                referenceInvoiceId: invoice?.id,
                referenceInvoiceNumber: invoice?.id,
            });
            setShowPaymentForm(false);
            setAmount('');
            setDescription('Payment Received');
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <main className="flex-1 overflow-hidden flex flex-col page-fade-in bg-app-bg" onKeyDown={handleEnterToNextField}>
            <div className="bg-primary text-white h-7 flex items-center px-4 justify-between border-b border-gray-600 shadow-md flex-shrink-0">
                <span className="text-[10px] font-black uppercase tracking-widest">Sundry Debtors (Receivable)</span>
                <span className="text-[10px] font-black uppercase text-accent">Total Debtors: {customers.length}</span>
            </div>

            <div className="p-4 flex-1 flex gap-4 min-h-0 overflow-hidden">
                <Card className="w-1/3 flex flex-col p-0 tally-border overflow-hidden bg-white">
                    <div className="p-3 border-b border-gray-400 bg-gray-50 flex-shrink-0">
                        <label className="text-[10px] font-bold text-gray-500 uppercase block mb-1">Search Ledger</label>
                        <input type="text" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} placeholder="Name or Phone..." className="w-full border border-gray-400 p-2 text-sm font-bold focus:bg-yellow-50 outline-none" />
                    </div>
                    <div className="flex-1 overflow-y-auto divide-y divide-gray-200">
                        {filteredCustomers.map(c => {
                            const balance = getOutstandingBalance(c);
                            const isSelected = selectedCustomer?.id === c.id;
                            return (
                                <button key={c.id} onClick={() => { setSelectedCustomer(c); setShowPaymentForm(false); }} className={`w-full text-left p-4 transition-all ${isSelected ? 'bg-accent text-black' : 'hover:bg-gray-100'}`}>
                                    <div className="flex justify-between items-start">
                                        <div className="min-w-0 flex-1">
                                            <p className={`${uniformTextStyle} truncate`}>{c.name}</p>
                                            <p className={`${uniformTextStyle} !text-base mt-1 ${isSelected ? 'opacity-60' : 'text-gray-500'}`}>{c.phone || 'No Phone'}</p>
                                        </div>
                                        <div className="text-right ml-2">
                                            <p className={`${uniformTextStyle} ${balance > 0 ? 'text-red-700' : 'text-emerald-700'}`}>₹{balance.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</p>
                                        </div>
                                    </div>
                                </button>
                            );
                        })}
                    </div>
                </Card>

                <Card className="flex-1 p-6 tally-border bg-white overflow-y-auto">
                    {selectedCustomer ? (
                        <div className="space-y-4">
                            <div className="flex items-start justify-between">
                                <div>
                                    <h2 className={`${uniformTextStyle} !text-3xl text-primary`}>{selectedCustomer.name}</h2>
                                    <p className="text-xs font-black uppercase text-gray-500">Outstanding: ₹{getOutstandingBalance(selectedCustomer).toFixed(2)}</p>
                                </div>
                                <button className="px-6 py-2 tally-button-primary text-xs font-black uppercase" onClick={openPaymentPanel}>Payment</button>
                            </div>

                            {showPaymentForm && (
                                <form onSubmit={handleSubmit} className="border border-gray-300 p-4 grid grid-cols-3 gap-3">
                                    <select value={selectedInvoiceId} onChange={e => setSelectedInvoiceId(e.target.value)} className="border border-gray-300 p-2 text-xs font-bold">
                                        <option value="">Select Invoice (optional)</option>
                                        {invoiceRows.map(inv => <option key={inv.id} value={inv.id}>{inv.id} | Balance ₹{inv.balance.toFixed(2)}</option>)}
                                    </select>
                                    <input type="number" required value={amount} onChange={e => setAmount(parseFloat(e.target.value) || '')} className="border border-gray-300 p-2 text-xs font-bold" placeholder="Amount received" />
                                    <input type="date" required value={date} onChange={e => setDate(e.target.value)} className="border border-gray-300 p-2 text-xs font-bold" />
                                    <select value={paymentMode} onChange={e => setPaymentMode(e.target.value)} className="border border-gray-300 p-2 text-xs font-bold">
                                        <option>Bank</option><option>Cash</option><option>UPI</option><option>Card</option>
                                    </select>
                                    <select required value={bankAccountId} onChange={e => setBankAccountId(e.target.value)} className="border border-gray-300 p-2 text-xs font-bold">
                                        <option value="">Select Bank / Cash Account</option>
                                        {bankOptions.map(b => <option key={b.id} value={b.id}>{b.bankName} - {b.accountNumber}</option>)}
                                    </select>
                                    <input type="text" value={description} onChange={e => setDescription(e.target.value)} className="border border-gray-300 p-2 text-xs font-bold" placeholder="Narration" />
                                    <div className="col-span-3 flex justify-end gap-2">
                                        <button type="button" onClick={() => setShowPaymentForm(false)} className="px-4 py-2 border border-gray-400 text-xs font-black uppercase">Cancel</button>
                                        <button type="submit" disabled={isSubmitting} className="px-4 py-2 tally-button-primary text-xs font-black uppercase">{isSubmitting ? 'Posting...' : 'Post Payment'}</button>
                                    </div>
                                </form>
                            )}

                            <div>
                                <p className="text-[10px] font-black uppercase tracking-wider mb-2">Invoice wise receivable</p>
                                <div className="overflow-auto border border-gray-200">
                                    <table className="min-w-full text-xs">
                                        <thead className="bg-gray-100 uppercase">
                                            <tr>
                                                <th className="p-2 text-left">Invoice</th><th className="p-2 text-left">Invoice Amount</th><th className="p-2 text-left">Amount Received</th><th className="p-2 text-left">Balance</th><th className="p-2 text-left">Payment Date</th><th className="p-2 text-left">Payment Mode</th><th className="p-2 text-left">Bank</th><th className="p-2 text-left">Journal/Voucher</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {invoiceRows.map(row => (
                                                <tr key={row.id} className="border-t">
                                                    <td className="p-2 font-bold">{row.id}</td>
                                                    <td className="p-2">₹{row.invoiceAmount.toFixed(2)}</td>
                                                    <td className="p-2 text-emerald-700">₹{row.received.toFixed(2)}</td>
                                                    <td className="p-2 text-red-700">₹{row.balance.toFixed(2)}</td>
                                                    <td className="p-2">{row.paymentDate}</td>
                                                    <td className="p-2">{row.paymentMode}</td>
                                                    <td className="p-2">{row.bankName}</td>
                                                    <td className="p-2">{row.voucherRef}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>

                            <div>
                                <p className="text-[10px] font-black uppercase tracking-wider mb-2">Complete ledger transactions (including accounting-linked payment entries)</p>
                                <div className="overflow-auto border border-gray-200">
                                    <table className="min-w-full text-xs">
                                        <thead className="bg-gray-100 uppercase"><tr><th className="p-2 text-left">Date</th><th className="p-2 text-left">Type</th><th className="p-2 text-left">Description</th><th className="p-2 text-left">Debit</th><th className="p-2 text-left">Credit</th><th className="p-2 text-left">Balance</th><th className="p-2 text-left">Voucher</th></tr></thead>
                                        <tbody>
                                            {ledgerRows.map(item => (
                                                <tr key={item.id} className="border-t">
                                                    <td className="p-2">{item.date}</td>
                                                    <td className="p-2 uppercase">{item.type}</td>
                                                    <td className="p-2">{item.description}</td>
                                                    <td className="p-2">₹{Number(item.debit || 0).toFixed(2)}</td>
                                                    <td className="p-2">₹{Number(item.credit || 0).toFixed(2)}</td>
                                                    <td className="p-2 font-bold">₹{Number(item.balance || 0).toFixed(2)}</td>
                                                    <td className="p-2">{item.journalEntryNumber || item.journalEntryId || '-'}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div className="h-full flex flex-col items-center justify-center text-center opacity-30">
                            <p className="text-2xl font-black uppercase tracking-[0.2em]">Select Ledger to review receivables</p>
                        </div>
                    )}
                </Card>
            </div>
        </main>
    );
};

export default AccountReceivable;
