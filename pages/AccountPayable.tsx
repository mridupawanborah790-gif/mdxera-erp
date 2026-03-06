import React, { useState, useMemo, useEffect } from 'react';
import Card from '../components/Card';
import { Distributor, Purchase, RegisteredPharmacy, TransactionLedgerItem } from '../types';
import { getOutstandingBalance } from '../utils/helpers';
import { fuzzyMatch } from '../utils/search';
import { handleEnterToNextField } from '../utils/navigation';
import { numberToWords } from '../utils/numberToWords';
import { supabase } from '../services/supabaseClient';

const uniformTextStyle = 'text-2xl font-normal tracking-tight uppercase leading-tight';

interface BankOption {
    id: string;
    bankName: string;
    accountName: string;
    accountNumber: string;
    isDefault: boolean;
}

interface PayableInvoiceRow {
    id: string;
    date: string;
    invoiceNumber: string;
    invoiceAmount: number;
    paid: number;
    balance: number;
    paymentDate: string;
    paymentMode: string;
    bankName: string;
    voucherRef: string;
    latestPaymentEntry?: TransactionLedgerItem;
}

interface LedgerVoucherMeta {
    journalEntryId?: string;
    journalEntryNumber?: string;
    referenceInvoiceNumber?: string;
}

interface AccountPayableProps {
    distributors: Distributor[];
    purchases: Purchase[];
    bankOptions: BankOption[];
    onRecordPayment: (args: {
        supplierId: string;
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

const getPaymentAmount = (entry: TransactionLedgerItem): number => {
    const creditAmount = Number(entry.credit || 0);
    if (creditAmount > 0) return creditAmount;
    return Number(entry.debit || 0);
};

const AccountPayable: React.FC<AccountPayableProps> = ({ distributors, purchases, bankOptions, onRecordPayment, currentUser }) => {
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedDistributor, setSelectedDistributor] = useState<Distributor | null>(null);
    const [selectedInvoiceId, setSelectedInvoiceId] = useState('');
    const [amount, setAmount] = useState<number | ''>('');
    const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
    const [description, setDescription] = useState('Supplier Payment');
    const [paymentMode, setPaymentMode] = useState('Bank');
    const [bankAccountId, setBankAccountId] = useState('');
    const [showPaymentForm, setShowPaymentForm] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [ledgerVoucherMap, setLedgerVoucherMap] = useState<Record<string, LedgerVoucherMeta>>({});

    const defaultBank = useMemo(() => bankOptions.find(b => b.isDefault), [bankOptions]);

    const filteredDistributors = useMemo(() => {
        return distributors
            .filter(d => d.is_active !== false)
            .filter(d => fuzzyMatch(d.name, searchTerm) || fuzzyMatch(d.gst_number, searchTerm))
            .sort((a, b) => getOutstandingBalance(b) - getOutstandingBalance(a));
    }, [distributors, searchTerm]);

    useEffect(() => {
        let isMounted = true;

        const hydrateLedgerVoucherDetails = async () => {
            if (!selectedDistributor || !currentUser || !navigator.onLine) {
                if (isMounted) setLedgerVoucherMap({});
                return;
            }

            const paymentEntries = (selectedDistributor.ledger || []).filter((entry) => entry.type === 'payment' && getPaymentAmount(entry) > 0);
            if (paymentEntries.length === 0) {
                if (isMounted) setLedgerVoucherMap({});
                return;
            }

            const referenceIds = Array.from(new Set([
                selectedDistributor.id,
                ...paymentEntries.map((entry) => entry.referenceInvoiceId || '').filter(Boolean),
            ]));

            const { data, error } = await supabase
                .from('journal_entry_header')
                .select('id, journal_entry_number, reference_id, reference_document_id, document_reference, posting_date, total_debit, total_credit')
                .eq('organization_id', currentUser.organization_id)
                .eq('reference_type', 'SUPPLIER_PAYMENT')
                .in('reference_id', referenceIds)
                .order('posting_date', { ascending: false });

            if (error || !isMounted) return;

            const rows = data || [];
            const byId = new Map(rows.map((row: any) => [String(row.id), row]));
            const byReferenceDocumentId = new Map<string, any[]>();
            for (const row of rows) {
                const key = String(row.reference_document_id || row.reference_id || '');
                if (!key) continue;
                const existing = byReferenceDocumentId.get(key) || [];
                existing.push(row);
                byReferenceDocumentId.set(key, existing);
            }

            const resolved: Record<string, LedgerVoucherMeta> = {};
            for (const entry of paymentEntries) {
                const amount = getPaymentAmount(entry);
                const entryDate = String(entry.date || '').split('T')[0];
                const byJournalId = entry.journalEntryId ? byId.get(String(entry.journalEntryId)) : undefined;
                const candidatePool = byJournalId
                    ? [byJournalId]
                    : (byReferenceDocumentId.get(String(entry.referenceInvoiceId || selectedDistributor.id)) || []).concat(byReferenceDocumentId.get(selectedDistributor.id) || []);

                const exactMatch = candidatePool.find((row: any) => {
                    const postingDate = String(row.posting_date || '').split('T')[0];
                    const rowAmount = Number(row.total_credit || row.total_debit || 0);
                    return postingDate === entryDate && Math.abs(rowAmount - amount) < 0.01;
                }) || candidatePool[0];

                if (!exactMatch) continue;
                resolved[entry.id] = {
                    journalEntryId: String(exactMatch.id),
                    journalEntryNumber: String(exactMatch.journal_entry_number || ''),
                    referenceInvoiceNumber: String(exactMatch.document_reference || entry.referenceInvoiceNumber || ''),
                };
            }

            setLedgerVoucherMap(resolved);
        };

        hydrateLedgerVoucherDetails();
        return () => {
            isMounted = false;
        };
    }, [selectedDistributor, currentUser]);

    const invoiceRows = useMemo(() => {
        if (!selectedDistributor) return [] as PayableInvoiceRow[];

        const supplierName = (selectedDistributor.name || '').trim().toLowerCase();
        const supplierPurchases: PayableInvoiceRow[] = purchases
            .filter(p => p.status !== 'cancelled' && (p.supplier || '').trim().toLowerCase() === supplierName)
            .map(p => ({
                id: p.id,
                date: p.date,
                invoiceNumber: p.invoiceNumber || p.id,
                invoiceAmount: Number(p.totalAmount || 0),
                paid: 0,
                balance: Number(p.totalAmount || 0),
                paymentDate: '-',
                paymentMode: 'Credit',
                bankName: '-',
                voucherRef: '-',
                latestPaymentEntry: undefined,
            }));

        const mapByInvoice = new Map(supplierPurchases.map(item => [item.id, { ...item }]));

        for (const entry of selectedDistributor.ledger || []) {
            if (entry.type !== 'payment') continue;
            const invoiceId = entry.referenceInvoiceId || '';
            const target = invoiceId && mapByInvoice.get(invoiceId);
            if (!target) continue;

            const resolvedMeta = ledgerVoucherMap[entry.id];
            const normalizedEntry = {
                ...entry,
                journalEntryId: entry.journalEntryId || resolvedMeta?.journalEntryId,
                journalEntryNumber: entry.journalEntryNumber || resolvedMeta?.journalEntryNumber,
                referenceInvoiceNumber: entry.referenceInvoiceNumber || resolvedMeta?.referenceInvoiceNumber,
            };

            target.paid += getPaymentAmount(normalizedEntry);
            target.balance = Number((target.invoiceAmount - target.paid).toFixed(2));
            target.paymentDate = normalizedEntry.date || target.paymentDate;
            target.paymentMode = normalizedEntry.paymentMode || target.paymentMode;
            target.bankName = normalizedEntry.bankName || target.bankName;
            target.voucherRef = normalizedEntry.journalEntryNumber || normalizedEntry.journalEntryId || target.voucherRef;
            target.latestPaymentEntry = normalizedEntry;
        }

        return Array.from(mapByInvoice.values()).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    }, [selectedDistributor, purchases, ledgerVoucherMap]);

    const ledgerRows = useMemo(() => {
        if (!selectedDistributor) return [];
        return [...(selectedDistributor.ledger || [])]
            .map((entry) => {
                const resolvedMeta = ledgerVoucherMap[entry.id];
                return {
                    ...entry,
                    journalEntryId: entry.journalEntryId || resolvedMeta?.journalEntryId,
                    journalEntryNumber: entry.journalEntryNumber || resolvedMeta?.journalEntryNumber,
                    referenceInvoiceNumber: entry.referenceInvoiceNumber || resolvedMeta?.referenceInvoiceNumber,
                };
            })
            .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    }, [selectedDistributor, ledgerVoucherMap]);

    const paymentRows = useMemo(() => ledgerRows.filter(item => item.type === 'payment' && getPaymentAmount(item) > 0), [ledgerRows]);

    const printVoucher = (entry: TransactionLedgerItem) => {
        if (!selectedDistributor) return;
        const popup = window.open('', '_blank', 'width=900,height=700');
        if (!popup) return;

        const voucherNumber = entry.journalEntryNumber || entry.journalEntryId || 'Pending Voucher Number';
        const voucherDate = formatDisplayDate(entry.date);
        const paymentModeText = entry.paymentMode || 'Bank';
        const bankAccount = entry.bankName || bankOptions.find(option => option.id === entry.bankAccountId)?.bankName || 'N/A';
        const amountPaid = getPaymentAmount(entry);
        const narration = entry.description || 'Supplier payment posted';
        const paymentAgainstInvoice = entry.referenceInvoiceNumber || entry.referenceInvoiceId || '-';

        const companyName = currentUser?.pharmacy_name || 'Company';
        const companyAddress = [currentUser?.address, currentUser?.district, currentUser?.state, currentUser?.pincode].filter(Boolean).join(', ');
        const authorizedSignatory = currentUser?.manager_name || currentUser?.full_name || 'Authorized Signatory';

        popup.document.write(`
            <html>
                <head>
                    <title>Payment Voucher ${escapeHtml(voucherNumber)}</title>
                    <style>
                        body { font-family: Arial, sans-serif; margin: 20px; color: #111827; }
                        .voucher { border: 1px solid #111827; padding: 20px; max-width: 840px; margin: 0 auto; }
                        .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 18px; }
                        .title { font-size: 22px; font-weight: 700; text-transform: uppercase; }
                        .meta { text-align: right; font-size: 13px; line-height: 1.6; }
                        table { width: 100%; border-collapse: collapse; margin-top: 14px; }
                        td { border: 1px solid #d1d5db; padding: 10px; font-size: 13px; vertical-align: top; }
                        .label-col { width: 34%; font-weight: 700; background: #f9fafb; }
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
                                <div class="title">Supplier Payment Voucher</div>
                                <div style="font-size:12px; margin-top:6px; font-weight:600;">${escapeHtml(companyName)}</div>
                                <div style="font-size:11px; margin-top:2px; color:#374151;">${escapeHtml(companyAddress || '-')}</div>
                            </div>
                            <div class="meta">
                                <div><strong>Voucher No.:</strong> ${escapeHtml(voucherNumber)}</div>
                                <div><strong>Voucher Date:</strong> ${escapeHtml(voucherDate)}</div>
                            </div>
                        </div>

                        <table>
                            <tr><td class="label-col">Supplier Name</td><td>${escapeHtml(selectedDistributor.name)}</td></tr>
                            <tr><td class="label-col">Supplier Code / ID</td><td>${escapeHtml(selectedDistributor.id)}</td></tr>
                            <tr><td class="label-col">Payment Against Invoice No.</td><td>${escapeHtml(paymentAgainstInvoice)}</td></tr>
                            <tr><td class="label-col">Payment Mode</td><td>${escapeHtml(paymentModeText)}</td></tr>
                            <tr><td class="label-col">Bank / Cash Account</td><td>${escapeHtml(bankAccount)}</td></tr>
                            <tr class="amount-row"><td class="label-col">Amount Paid</td><td>₹${escapeHtml(amountPaid.toFixed(2))}</td></tr>
                            <tr><td class="label-col">Narration / Remarks</td><td>${escapeHtml(narration)}</td></tr>
                        </table>
                        <div class="amount-words">Amount in words: ${escapeHtml(numberToWords(amountPaid))}</div>

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
        setAmount('');
        setDescription('Supplier Payment');
        setSelectedInvoiceId('');
        setBankAccountId(defaultBank?.id || '');
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedDistributor || !amount || amount <= 0 || !bankAccountId) return;
        const invoice = invoiceRows.find(i => i.id === selectedInvoiceId);

        setIsSubmitting(true);
        try {
            await onRecordPayment({
                supplierId: selectedDistributor.id,
                amount: Number(amount),
                date,
                description,
                paymentMode,
                bankAccountId,
                referenceInvoiceId: invoice?.id,
                referenceInvoiceNumber: invoice?.invoiceNumber,
            });
            setShowPaymentForm(false);
            setAmount('');
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
                        <label className="text-[10px] font-bold text-gray-500 uppercase block mb-1">Search Ledger</label>
                        <input type="text" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} placeholder="Name or GSTIN..." className="w-full border border-gray-400 p-2 text-sm font-bold focus:bg-yellow-50 outline-none" />
                    </div>
                    <div className="flex-1 overflow-y-auto divide-y divide-gray-200">
                        {filteredDistributors.map(d => {
                            const balance = getOutstandingBalance(d);
                            const isSelected = selectedDistributor?.id === d.id;
                            return (
                                <button key={d.id} onClick={() => { setSelectedDistributor(d); setShowPaymentForm(false); }} className={`w-full text-left p-4 transition-all ${isSelected ? 'bg-accent text-black' : 'hover:bg-gray-100'}`}>
                                    <div className="flex justify-between items-start">
                                        <div className="min-w-0 flex-1">
                                            <p className={`${uniformTextStyle} truncate`}>{d.name}</p>
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

                <Card className="flex-1 p-6 tally-border bg-white overflow-y-auto">
                    {selectedDistributor ? (
                        <div className="space-y-6">
                            <div className="pb-4 border-b border-gray-300 flex items-start justify-between gap-4">
                                <div>
                                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] mb-1">Active Ledger Selection</p>
                                    <h2 className={`${uniformTextStyle} !text-4xl text-primary`}>{selectedDistributor.name}</h2>
                                    <div className="mt-2 text-xs font-black uppercase text-gray-500">Current Payable: <span className="text-red-600 text-lg">₹{getOutstandingBalance(selectedDistributor).toFixed(2)}</span></div>
                                </div>
                                <button type="button" onClick={openPaymentPanel} className="px-4 py-2 tally-button-primary text-xs uppercase font-black tracking-wider">Add Payment</button>
                            </div>

                            {showPaymentForm && (
                                <form onSubmit={handleSubmit} className="border border-gray-300 p-4 bg-gray-50 space-y-4">
                                    <p className="text-[10px] font-black uppercase tracking-wider text-gray-500">Record Supplier Payment</p>
                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                        <div>
                                            <label className="text-[10px] font-bold text-gray-500 uppercase block mb-1">Payment Against Invoice</label>
                                            <select value={selectedInvoiceId} onChange={e => setSelectedInvoiceId(e.target.value)} className="w-full border border-gray-400 p-2 text-sm font-bold outline-none focus:bg-yellow-50">
                                                <option value="">Unallocated / On Account</option>
                                                {invoiceRows.map(row => (
                                                    <option key={row.id} value={row.id}>{row.invoiceNumber} • Balance ₹{row.balance.toFixed(2)}</option>
                                                ))}
                                            </select>
                                        </div>
                                        <div>
                                            <label className="text-[10px] font-bold text-gray-500 uppercase block mb-1">Payment Amount (₹)</label>
                                            <input type="number" required value={amount} onChange={e => setAmount(parseFloat(e.target.value) || '')} className="w-full border border-gray-400 p-2 text-sm font-bold outline-none focus:bg-yellow-50" placeholder="0.00" />
                                        </div>
                                        <div>
                                            <label className="text-[10px] font-bold text-gray-500 uppercase block mb-1">Payment Date</label>
                                            <input type="date" required value={date} onChange={e => setDate(e.target.value)} className="w-full border border-gray-400 p-2 text-sm font-bold outline-none focus:bg-yellow-50" />
                                        </div>
                                    </div>
                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                        <div>
                                            <label className="text-[10px] font-bold text-gray-500 uppercase block mb-1">Payment Mode</label>
                                            <select value={paymentMode} onChange={e => setPaymentMode(e.target.value)} className="w-full border border-gray-400 p-2 text-sm font-bold outline-none focus:bg-yellow-50">
                                                <option value="Bank">Bank</option>
                                                <option value="Cash">Cash</option>
                                                <option value="UPI">UPI</option>
                                                <option value="Cheque">Cheque</option>
                                                <option value="NEFT/RTGS">NEFT/RTGS</option>
                                            </select>
                                        </div>
                                        <div>
                                            <label className="text-[10px] font-bold text-gray-500 uppercase block mb-1">Bank / Cash Account</label>
                                            <select required value={bankAccountId} onChange={e => setBankAccountId(e.target.value)} className="w-full border border-gray-400 p-2 text-sm font-bold outline-none focus:bg-yellow-50">
                                                <option value="">Select Bank / Cash Account</option>
                                                {bankOptions.map(option => (
                                                    <option key={option.id} value={option.id}>{option.bankName} • {option.accountNumber || option.accountName}</option>
                                                ))}
                                            </select>
                                            {!defaultBank && <p className="text-[10px] mt-1 text-amber-700">No default bank configured. Select from Bank Master.</p>}
                                        </div>
                                        <div>
                                            <label className="text-[10px] font-bold text-gray-500 uppercase block mb-1">Narration / Remark</label>
                                            <input type="text" value={description} onChange={e => setDescription(e.target.value)} className="w-full border border-gray-400 p-2 text-sm font-bold uppercase outline-none focus:bg-yellow-50" placeholder="SUPPLIER PAYMENT" />
                                        </div>
                                    </div>
                                    <div className="flex justify-end gap-2">
                                        <button type="button" onClick={() => setShowPaymentForm(false)} className="px-3 py-2 border border-gray-300 font-bold uppercase text-[10px] hover:bg-white">Discard</button>
                                        <button type="submit" disabled={isSubmitting || !amount || Number(amount) <= 0 || !bankAccountId} className="px-4 py-2 tally-button-primary font-black uppercase text-xs">
                                            {isSubmitting ? 'Posting...' : 'Post Supplier Payment'}
                                        </button>
                                    </div>
                                </form>
                            )}

                            <div>
                                <p className="text-[10px] font-black uppercase tracking-wider mb-2">Invoice-wise supplier payable tracking</p>
                                <div className="overflow-auto border border-gray-200">
                                    <table className="min-w-full text-xs">
                                        <thead className="bg-gray-100 uppercase"><tr><th className="p-2 text-left">Date</th><th className="p-2 text-left">Invoice</th><th className="p-2 text-left">Invoice Amount</th><th className="p-2 text-left">Amount Paid</th><th className="p-2 text-left">Outstanding</th><th className="p-2 text-left">Last Payment Date</th><th className="p-2 text-left">Payment Mode</th><th className="p-2 text-left">Bank</th><th className="p-2 text-left">Voucher</th><th className="p-2 text-left">Print</th></tr></thead>
                                        <tbody>
                                            {invoiceRows.length === 0 ? (
                                                <tr><td className="p-3 text-center text-gray-500" colSpan={10}>No purchase invoices found for this supplier.</td></tr>
                                            ) : invoiceRows.map(row => (
                                                <tr key={row.id} className="border-t">
                                                    <td className="p-2">{formatDisplayDate(row.date)}</td>
                                                    <td className="p-2">{row.invoiceNumber}</td>
                                                    <td className="p-2">₹{row.invoiceAmount.toFixed(2)}</td>
                                                    <td className="p-2">₹{row.paid.toFixed(2)}</td>
                                                    <td className="p-2 font-bold">₹{row.balance.toFixed(2)}</td>
                                                    <td className="p-2">{formatDisplayDate(row.paymentDate)}</td>
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
                                <p className="text-[10px] font-black uppercase tracking-wider mb-2">Supplier payment history / voucher history</p>
                                <div className="overflow-auto border border-gray-200">
                                    <table className="min-w-full text-xs">
                                        <thead className="bg-gray-100 uppercase"><tr><th className="p-2 text-left">Date</th><th className="p-2 text-left">Payment Against</th><th className="p-2 text-left">Payment Mode</th><th className="p-2 text-left">Bank/Cash Account</th><th className="p-2 text-left">Narration</th><th className="p-2 text-left">Amount</th><th className="p-2 text-left">Voucher No.</th><th className="p-2 text-left">Print Voucher</th></tr></thead>
                                        <tbody>
                                            {paymentRows.length === 0 ? (
                                                <tr><td className="p-3 text-center text-gray-500" colSpan={8}>No supplier payments posted yet.</td></tr>
                                            ) : paymentRows.map(item => (
                                                <tr key={item.id} className="border-t">
                                                    <td className="p-2">{formatDisplayDate(item.date)}</td>
                                                    <td className="p-2">{item.referenceInvoiceNumber || item.referenceInvoiceId || '-'}</td>
                                                    <td className="p-2">{item.paymentMode || '-'}</td>
                                                    <td className="p-2">{item.bankName || '-'}</td>
                                                    <td className="p-2">{item.description}</td>
                                                    <td className="p-2 font-bold">₹{getPaymentAmount(item).toFixed(2)}</td>
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
                                                    <td className="p-2">{formatDisplayDate(item.date)}</td>
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
                            <p className="text-2xl font-black uppercase tracking-[0.2em]">Select Ledger to review payables</p>
                        </div>
                    )}
                </Card>
            </div>
        </main>
    );
};

export default AccountPayable;
