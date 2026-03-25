import React, { useState, useMemo } from 'react';
import Card from '../components/Card';
import { Customer, RegisteredPharmacy, Transaction, TransactionLedgerItem } from '../types';
import { getOutstandingBalance } from '../utils/helpers';
import { fuzzyMatch } from '../utils/search';
import { handleEnterToNextField } from '../utils/navigation';
import { numberToWords } from '../utils/numberToWords';

const uniformTextStyle = 'text-2xl font-normal tracking-tight uppercase leading-tight';

interface BankOption {
    id: string;
    bankName: string;
    accountName: string;
    accountNumber: string;
    isDefault: boolean;
}


interface ReceivableInvoiceRow {
    id: string;
    date: string;
    invoiceAmount: number;
    received: number;
    balance: number;
    paymentDate: string;
    paymentMode: string;
    bankName: string;
    voucherRef: string;
    latestPaymentEntry?: TransactionLedgerItem;
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
        entryCategory?: 'invoice_payment' | 'down_payment';
    }) => Promise<void>;
    onRecordDownPaymentAdjustment: (args: {
        customerId: string;
        date: string;
        downPaymentId: string;
        referenceInvoiceId: string;
        referenceInvoiceNumber?: string;
        amount: number;
        description?: string;
    }) => Promise<void>;
    currentUser: RegisteredPharmacy | null;
}

const escapeHtml = (value: string): string => value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');

const formatDisplayDate = (value?: string): string => {
    if (!value) return '-';
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return value;
    return parsed.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
};

const AccountReceivable: React.FC<AccountReceivableProps> = ({ customers, transactions, bankOptions, onRecordPayment, onRecordDownPaymentAdjustment, currentUser }) => {
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
    const [selectedInvoiceId, setSelectedInvoiceId] = useState('');
    const [amount, setAmount] = useState<number | ''>('');
    const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
    const [description, setDescription] = useState('Payment Received');
    const [paymentMode, setPaymentMode] = useState('Bank');
    const [bankAccountId, setBankAccountId] = useState('');
    const [showPaymentForm, setShowPaymentForm] = useState(false);
    const [showDownPaymentForm, setShowDownPaymentForm] = useState(false);
    const [adjustAgainstInvoice, setAdjustAgainstInvoice] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [invoiceAdjustments, setInvoiceAdjustments] = useState<Record<string, number>>({});

    const defaultBank = useMemo(() => bankOptions.find(b => b.isDefault), [bankOptions]);

    const filteredCustomers = useMemo(() => {
        if (!Array.isArray(customers)) return [];
        return customers
            .filter(c => c && c.is_active !== false)
            .filter(c => fuzzyMatch(c.name || '', searchTerm) || fuzzyMatch(c.phone || '', searchTerm))
            .sort((a, b) => getOutstandingBalance(b) - getOutstandingBalance(a));
    }, [customers, searchTerm]);

    const invoiceRows = useMemo(() => {
        if (!selectedCustomer || !Array.isArray(transactions)) return [] as ReceivableInvoiceRow[];

        const sales: ReceivableInvoiceRow[] = transactions
            .filter(t => t && t.status !== 'cancelled' && (t.customerId === selectedCustomer.id || (t.customerName || '').trim().toLowerCase() === (selectedCustomer.name || '').trim().toLowerCase()))
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
                latestPaymentEntry: undefined,
            }));

        const mapByInvoice = new Map(sales.map(s => [s.id, { ...s }]));
        const ledger = Array.isArray(selectedCustomer.ledger) ? selectedCustomer.ledger : [];

        for (const entry of ledger) {
            if (!entry || entry.type !== 'payment') continue;
            const invoiceId = entry.referenceInvoiceId || '';
            const target = invoiceId && mapByInvoice.get(invoiceId);
            if (target) {
                const adjustedAmount = Number(entry.adjustedAmount || 0);
                const effectiveAmount = adjustedAmount > 0 ? adjustedAmount : Number(entry.credit || 0);
                target.received += effectiveAmount;
                target.balance = Number((target.invoiceAmount - target.received).toFixed(2));
                target.paymentDate = entry.date || target.paymentDate;
                target.paymentMode = entry.paymentMode || target.paymentMode;
                target.bankName = entry.bankName || target.bankName;
                target.voucherRef = entry.journalEntryNumber || entry.journalEntryId || target.voucherRef;
                target.latestPaymentEntry = entry;
            }
        }

        return Array.from(mapByInvoice.values()).sort((a, b) => {
            const timeA = new Date(a.date).getTime();
            const timeB = new Date(b.date).getTime();
            return (Number.isNaN(timeB) ? 0 : timeB) - (Number.isNaN(timeA) ? 0 : timeA);
        });
    }, [selectedCustomer, transactions]);

    const ledgerRows = useMemo(() => {
        if (!selectedCustomer) return [];
        const ledger = Array.isArray(selectedCustomer.ledger) ? selectedCustomer.ledger : [];
        return [...ledger]
            .filter(Boolean)
            .sort((a, b) => {
                const timeA = new Date(a.date).getTime();
                const timeB = new Date(b.date).getTime();
                return (Number.isNaN(timeB) ? 0 : timeB) - (Number.isNaN(timeA) ? 0 : timeA);
            });
    }, [selectedCustomer]);

    const receiptHistoryRows = useMemo(
        () => ledgerRows.filter(item => item.type === 'payment' && (Number(item.credit || 0) > 0 || Number(item.adjustedAmount || 0) > 0)),
        [ledgerRows]
    );
    const downPaymentRows = useMemo(() => ledgerRows.filter(item => item.type === 'payment' && item.entryCategory === 'down_payment' && Number(item.credit || 0) > 0), [ledgerRows]);
    const availableAdvanceBalance = useMemo(() => {
        const totalAdvance = downPaymentRows.reduce((sum, row) => sum + Number(row.credit || 0), 0);
        const totalAdjusted = ledgerRows
            .filter(item => item.entryCategory === 'down_payment_adjustment')
            .reduce((sum, item) => sum + Number(item.adjustedAmount || 0), 0);
        return Number((totalAdvance - totalAdjusted).toFixed(2));
    }, [downPaymentRows, ledgerRows]);

    const printVoucher = (entry: TransactionLedgerItem) => {
        if (!selectedCustomer) return;
        const popup = window.open('', '_blank', 'width=900,height=700');
        if (!popup) return;

        const voucherNumber = entry.journalEntryNumber || entry.journalEntryId || 'Pending Voucher Number';
        const voucherDate = formatDisplayDate(entry.date);
        const paymentModeText = entry.paymentMode || 'Bank';
        const bankAccount = entry.bankName || bankOptions.find(option => option.id === entry.bankAccountId)?.bankName || 'N/A';
        const amountReceived = Number(entry.credit || 0);
        const receiptAgainstInvoice = entry.referenceInvoiceNumber || entry.referenceInvoiceId || '-';
        const narration = entry.description || 'Payment Received';
        const companyName = currentUser?.pharmacy_name || 'Pharmacy';
        const companyAddress = [currentUser?.address, currentUser?.address_line2, currentUser?.district, currentUser?.state, currentUser?.pincode].filter(Boolean).join(', ');
        const authorizedSignatory = currentUser?.authorized_signatory || currentUser?.manager_name || currentUser?.full_name || 'Authorized Signatory';

        popup.document.write(`
            <html>
                <head>
                    <title>Receipt Voucher - ${escapeHtml(voucherNumber)}</title>
                    <style>
                        body { font-family: Arial, sans-serif; margin: 28px; color: #111827; }
                        .voucher { border: 1px solid #d1d5db; padding: 24px; }
                        .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 1px solid #d1d5db; padding-bottom: 16px; margin-bottom: 16px; }
                        .title { font-size: 20px; font-weight: 700; letter-spacing: 0.8px; text-transform: uppercase; }
                        .meta { text-align: right; font-size: 12px; line-height: 1.7; }
                        table { width: 100%; border-collapse: collapse; }
                        th, td { border: 1px solid #d1d5db; padding: 8px 10px; font-size: 12px; vertical-align: top; }
                        th { background: #f3f4f6; text-transform: uppercase; letter-spacing: 0.4px; text-align: left; }
                        .label-col { width: 35%; font-weight: 700; background: #f9fafb; }
                        .amount-row td { font-size: 14px; font-weight: 700; }
                        .amount-words { margin-top: 12px; font-size: 12px; font-style: italic; }
                        .signatory { margin-top: 56px; display: flex; justify-content: flex-end; }
                        .signatory-box { text-align: center; min-width: 220px; }
                        .signatory-line { border-top: 1px solid #111827; margin-top: 36px; padding-top: 8px; font-size: 12px; font-weight: 700; text-transform: uppercase; }
                    </style>
                </head>
                <body>
                    <div class="voucher">
                        <div class="header">
                            <div>
                                <div class="title">Payment Received Voucher</div>
                                <div style="font-size:12px; margin-top:6px; font-weight:600;">${escapeHtml(companyName)}</div>
                                <div style="font-size:11px; margin-top:2px; color:#374151;">${escapeHtml(companyAddress || '-')}</div>
                            </div>
                            <div class="meta">
                                <div><strong>Voucher No.:</strong> ${escapeHtml(voucherNumber)}</div>
                                <div><strong>Voucher Date:</strong> ${escapeHtml(voucherDate)}</div>
                            </div>
                        </div>

                        <table>
                            <tr><td class="label-col">Customer Name</td><td>${escapeHtml(selectedCustomer.name)}</td></tr>
                            <tr><td class="label-col">Customer Code / ID</td><td>${escapeHtml(selectedCustomer.id)}</td></tr>
                            <tr><td class="label-col">Receipt Against Invoice No.</td><td>${escapeHtml(receiptAgainstInvoice)}</td></tr>
                            <tr><td class="label-col">Payment Mode</td><td>${escapeHtml(paymentModeText)}</td></tr>
                            <tr><td class="label-col">Bank / Cash Account</td><td>${escapeHtml(bankAccount)}</td></tr>
                            <tr class="amount-row"><td class="label-col">Amount Received</td><td>₹${escapeHtml(amountReceived.toFixed(2))}</td></tr>
                            <tr><td class="label-col">Narration / Remarks</td><td>${escapeHtml(narration)}</td></tr>
                        </table>
                        <div class="amount-words">Amount in words: ${escapeHtml(numberToWords(amountReceived))}</div>

                        <div class="signatory">
                            <div class="signatory-box">
                                <div class="signatory-line">Authorized Signatory</div>
                                <div style="font-size:12px; margin-top:4px;">${escapeHtml(authorizedSignatory)}</div>
                            </div>
                        </div>
                    </div>
                    <script>
                        window.onload = function () { window.print(); };
                    </script>
                </body>
            </html>
        `);
        popup.document.close();
    };

    const openPaymentPanel = () => {
        setShowPaymentForm(true);
        setShowDownPaymentForm(false);
        setAmount('');
        setDescription('Payment Received');
        setSelectedInvoiceId('');
        setBankAccountId(defaultBank?.id || '');
    };

    const openDownPaymentPanel = () => {
        setShowDownPaymentForm(true);
        setShowPaymentForm(false);
        setAmount('');
        setDescription('Advance Received');
        setSelectedInvoiceId('');
        setAdjustAgainstInvoice(false);
        setInvoiceAdjustments({});
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
                entryCategory: 'invoice_payment',
            });
            setShowPaymentForm(false);
            setAmount('');
            setDescription('Payment Received');
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleDownPaymentSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedCustomer || !amount || amount <= 0 || !bankAccountId) return;

        const enteredAmount = Number(amount);
        const allocations = Object.entries(invoiceAdjustments)
            .map(([invoiceId, allocated]) => ({ invoiceId, allocated: Number(allocated || 0) }))
            .filter(({ allocated }) => allocated > 0);
        const totalAllocated = allocations.reduce((sum, item) => sum + item.allocated, 0);
        if (adjustAgainstInvoice && totalAllocated > enteredAmount) return;

        setIsSubmitting(true);
        try {
            await onRecordPayment({
                customerId: selectedCustomer.id,
                amount: enteredAmount,
                date,
                description: description || 'Advance Received',
                paymentMode,
                bankAccountId,
                entryCategory: 'down_payment',
            });
            const downPaymentId = `DP-${Date.now()}`;
            for (const allocation of allocations) {
                const invoice = invoiceRows.find(row => row.id === allocation.invoiceId);
                if (!invoice) continue;
                await onRecordDownPaymentAdjustment({
                    customerId: selectedCustomer.id,
                    date,
                    downPaymentId,
                    referenceInvoiceId: invoice.id,
                    referenceInvoiceNumber: invoice.id,
                    amount: allocation.allocated,
                    description: 'Advance adjusted against invoice',
                });
            }
            setShowDownPaymentForm(false);
            setAmount('');
            setDescription('Advance Received');
            setAdjustAgainstInvoice(false);
            setInvoiceAdjustments({});
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
                                <button 
                                    key={c.id} 
                                    onClick={() => { setSelectedCustomer(c); setShowPaymentForm(false); }} 
                                    className={`w-full text-left p-4 transition-all group ${isSelected ? 'bg-primary text-white shadow-lg' : 'hover:bg-primary hover:text-white'}`}
                                >
                                    <div className="flex justify-between items-start">
                                        <div className="min-w-0 flex-1">
                                            <p className={`${uniformTextStyle} truncate ${isSelected ? 'text-white' : 'group-hover:text-white'}`}>{c.name}</p>
                                            <p className={`${uniformTextStyle} !text-base mt-1 ${isSelected ? 'text-white/70' : 'text-gray-500 group-hover:text-white/70'}`}>{c.phone || 'No Phone'}</p>
                                        </div>
                                        <div className="text-right ml-2">
                                            <p className={`${uniformTextStyle} ${isSelected ? 'text-white' : (balance > 0 ? 'text-red-700 font-black group-hover:text-white' : 'text-emerald-700 font-black group-hover:text-white')}`}>₹{balance.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</p>
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
                                    <p className="text-xs font-black uppercase text-emerald-700 mt-1">Available Advance: ₹{availableAdvanceBalance.toFixed(2)}</p>
                                </div>
                                <div className="flex gap-2">
                                    <button className="px-6 py-2 tally-button-primary text-xs font-black uppercase" onClick={openPaymentPanel}>Payment</button>
                                    <button className="px-6 py-2 tally-button-primary text-xs font-black uppercase" onClick={openDownPaymentPanel}>Down Payment</button>
                                </div>
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

                            {showDownPaymentForm && (
                                <form onSubmit={handleDownPaymentSubmit} className="border border-gray-300 p-4 grid grid-cols-3 gap-3">
                                    <input type="text" disabled value={selectedCustomer.name} className="border border-gray-300 p-2 text-xs font-bold bg-gray-100" />
                                    <input type="number" required value={amount} onChange={e => setAmount(parseFloat(e.target.value) || '')} className="border border-gray-300 p-2 text-xs font-bold" placeholder="Down payment amount" />
                                    <input type="date" required value={date} onChange={e => setDate(e.target.value)} className="border border-gray-300 p-2 text-xs font-bold" />
                                    <select value={paymentMode} onChange={e => setPaymentMode(e.target.value)} className="border border-gray-300 p-2 text-xs font-bold">
                                        <option>Bank</option><option>Cash</option><option>UPI</option>
                                    </select>
                                    <select required value={bankAccountId} onChange={e => setBankAccountId(e.target.value)} className="border border-gray-300 p-2 text-xs font-bold">
                                        <option value="">Select Bank / Cash Account</option>
                                        {bankOptions.map(b => <option key={b.id} value={b.id}>{b.bankName} - {b.accountNumber}</option>)}
                                    </select>
                                    <input type="text" value={description} onChange={e => setDescription(e.target.value)} className="border border-gray-300 p-2 text-xs font-bold" placeholder="Reference / note" />
                                    <label className="col-span-3 inline-flex items-center gap-2 text-xs font-black uppercase">
                                        <input type="checkbox" checked={adjustAgainstInvoice} onChange={e => setAdjustAgainstInvoice(e.target.checked)} />
                                        Adjust Against Invoice
                                    </label>
                                    {adjustAgainstInvoice && invoiceRows.filter(inv => inv.balance > 0).map(inv => (
                                        <div key={inv.id} className="col-span-3 grid grid-cols-3 gap-3">
                                            <div className="border border-gray-200 p-2 text-xs font-bold">{inv.id} | Pending ₹{inv.balance.toFixed(2)}</div>
                                            <input
                                                type="number"
                                                min={0}
                                                max={inv.balance}
                                                value={invoiceAdjustments[inv.id] ?? ''}
                                                onChange={e => setInvoiceAdjustments(prev => ({ ...prev, [inv.id]: parseFloat(e.target.value) || 0 }))}
                                                className="border border-gray-300 p-2 text-xs font-bold"
                                                placeholder="Adjust amount"
                                            />
                                        </div>
                                    ))}
                                    <div className="col-span-3 flex justify-end gap-2">
                                        <button type="button" onClick={() => setShowDownPaymentForm(false)} className="px-4 py-2 border border-gray-400 text-xs font-black uppercase">Cancel</button>
                                        <button type="submit" disabled={isSubmitting} className="px-4 py-2 tally-button-primary text-xs font-black uppercase">{isSubmitting ? 'Posting...' : 'Post Down Payment'}</button>
                                    </div>
                                </form>
                            )}

                            <div>
                                <p className="text-[10px] font-black uppercase tracking-wider mb-2">Invoice wise receivable</p>
                                <div className="overflow-auto border border-gray-200">
                                    <table className="min-w-full text-xs">
                                        <thead className="bg-gray-100 uppercase">
                                            <tr>
                                                <th className="p-2 text-left">Invoice</th><th className="p-2 text-left">Invoice Amount</th><th className="p-2 text-left">Amount Received</th><th className="p-2 text-left">Balance</th><th className="p-2 text-left">Payment Date</th><th className="p-2 text-left">Payment Mode</th><th className="p-2 text-left">Bank</th><th className="p-2 text-left">Journal/Voucher</th><th className="p-2 text-left">Print Voucher</th>
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
                                                    <td className="p-2">
                                                        {row.latestPaymentEntry ? (
                                                            <button type="button" onClick={() => printVoucher(row.latestPaymentEntry!)} className="px-2 py-1 border border-gray-300 font-bold uppercase text-[10px] hover:bg-gray-100">Print</button>
                                                        ) : (
                                                            '-'
                                                        )}
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>

                            <div>
                                <p className="text-[10px] font-black uppercase tracking-wider mb-2">Receipt / Payment history</p>
                                <div className="overflow-auto border border-gray-200">
                                    <table className="min-w-full text-xs">
                                        <thead className="bg-gray-100 uppercase"><tr><th className="p-2 text-left">Date</th><th className="p-2 text-left">Type</th><th className="p-2 text-left">Receipt Against</th><th className="p-2 text-left">Payment Mode</th><th className="p-2 text-left">Bank/Cash Account</th><th className="p-2 text-left">Narration</th><th className="p-2 text-left">Amount</th><th className="p-2 text-left">Voucher No.</th><th className="p-2 text-left">Print Voucher</th></tr></thead>
                                        <tbody>
                                            {receiptHistoryRows.length === 0 ? (
                                                <tr><td className="p-3 text-center text-gray-500" colSpan={9}>No payment receipts posted yet.</td></tr>
                                            ) : receiptHistoryRows.map(item => (
                                                <tr key={item.id} className="border-t">
                                                    <td className="p-2">{formatDisplayDate(item.date)}</td>
                                                    <td className="p-2">{item.entryCategory === 'down_payment' ? 'DOWN PAYMENT' : item.entryCategory === 'down_payment_adjustment' ? 'DP ADJUSTMENT' : 'PAYMENT'}</td>
                                                    <td className="p-2">{item.referenceInvoiceNumber || item.referenceInvoiceId || '-'}</td>
                                                    <td className="p-2">{item.paymentMode || '-'}</td>
                                                    <td className="p-2">{item.bankName || '-'}</td>
                                                    <td className="p-2">{item.entryCategory === 'down_payment' ? 'Advance Received' : item.description}</td>
                                                    <td className="p-2 font-bold">₹{Number(item.adjustedAmount || item.credit || 0).toFixed(2)}</td>
                                                    <td className="p-2">{item.journalEntryNumber || item.journalEntryId || '-'}</td>
                                                    <td className="p-2"><button type="button" onClick={() => printVoucher(item)} className="px-2 py-1 border border-gray-300 font-bold uppercase text-[10px] hover:bg-gray-100">Print</button></td>
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
