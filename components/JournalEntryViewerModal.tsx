import React, { useEffect, useMemo, useState } from 'react';
import Modal from './Modal';
import { RegisteredPharmacy } from '../types';
import { supabase } from '../services/supabaseClient';

interface JournalEntryViewerModalProps {
    isOpen: boolean;
    onClose: () => void;
    invoiceId?: string;
    invoiceNumber?: string;
    documentType: 'SALES' | 'PURCHASE';
    currentUser: RegisteredPharmacy | null;
    isPosted: boolean;
}

interface JournalLine {
    id: string;
    glCode: string;
    glName: string;
    debit: number;
    credit: number;
}

interface JournalHeader {
    id: string;
    entryNumber: string;
    postingDate: string;
    status: string;
    company: string;
    setOfBooks: string;
    documentReference: string;
}

const normalizeNumber = (value: any): number => Number(value || 0);

const isMissingTableError = (error: any, tableName: string): boolean => {
    const message = String(error?.message || '').toLowerCase();
    return error?.code === 'PGRST205' && message.includes(tableName.toLowerCase());
};

const JournalEntryViewerModal: React.FC<JournalEntryViewerModalProps> = ({
    isOpen,
    onClose,
    invoiceId,
    invoiceNumber,
    documentType,
    currentUser,
    isPosted
}) => {
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [emptyMessage, setEmptyMessage] = useState<string | null>(null);
    const [entries, setEntries] = useState<JournalHeader[]>([]);
    const [selectedEntryId, setSelectedEntryId] = useState<string>('');
    const [lines, setLines] = useState<JournalLine[]>([]);

    const canView = useMemo(() => Boolean(currentUser), [currentUser]);
    const selectedHeader = useMemo(() => entries.find((entry) => entry.id === selectedEntryId) || null, [entries, selectedEntryId]);

    const referenceType = documentType === 'SALES' ? 'SALES_BILL' : 'PURCHASE_BILL';
    const referenceCandidates = useMemo(
        () => Array.from(new Set([invoiceId, invoiceNumber].filter(Boolean).map(String))),
        [invoiceId, invoiceNumber]
    );

    useEffect(() => {
        if (!isOpen) return;
        if (!canView) {
            setError('You do not have permission to view journal entries.');
            setLines([]);
            setEntries([]);
            return;
        }
        if (!invoiceId) {
            setEmptyMessage('Journal not generated yet.');
            setLines([]);
            setEntries([]);
            return;
        }
        if (!isPosted) {
            setEmptyMessage('Journal not generated yet.');
            setLines([]);
            setEntries([]);
            return;
        }

        const load = async () => {
            setIsLoading(true);
            setError(null);
            setEmptyMessage(null);
            try {
                const queryByReferenceType = async (candidate: string) => supabase
                    .from('journal_entry_header')
                    .select('*')
                    .eq('reference_type', referenceType)
                    .eq('reference_id', candidate)
                    .order('posting_date', { ascending: false })
                    .order('created_at', { ascending: false });

                let headerRows: any[] = [];
                let headerError: any = null;

                for (const candidate of referenceCandidates) {
                    const response = await queryByReferenceType(candidate);
                    if (response.error) {
                        headerError = response.error;
                        break;
                    }
                    if (response.data?.length) {
                        headerRows = response.data;
                        break;
                    }
                }

                if (isMissingTableError(headerError, 'journal_entry_header')) {
                    setEntries([]);
                    setLines([]);
                    setEmptyMessage('Journal module is not configured in this environment yet. Please create the accounting journal tables and refresh schema cache.');
                    return;
                }

                let fallbackRows: any[] = headerRows || [];
                if (!headerError && !fallbackRows.length) {
                    const documentTypes = [documentType, referenceType];
                    for (const candidate of referenceCandidates) {
                        for (const docTypeCandidate of documentTypes) {
                            const fallbackResponse = await supabase
                                .from('journal_entry_header')
                                .select('*')
                                .eq('reference_document_id', candidate)
                                .eq('document_type', docTypeCandidate)
                                .order('posting_date', { ascending: false })
                                .order('created_at', { ascending: false });

                            if (fallbackResponse.error) {
                                headerError = fallbackResponse.error;
                                break;
                            }

                            if (fallbackResponse.data?.length) {
                                fallbackRows = fallbackResponse.data;
                                break;
                            }
                        }

                        if (headerError || fallbackRows.length) break;
                    }
                }

                if (headerError) throw headerError;

                const normalizedHeaders = (fallbackRows || []).map((row: any) => ({
                    id: String(row.id),
                    entryNumber: String(row.journal_entry_number || row.entry_number || row.id || '—'),
                    postingDate: String(row.posting_date || ''),
                    status: String(row.status || 'Posted'),
                    company: String(row.company || row.company_name || '—'),
                    setOfBooks: String(row.set_of_books || row.set_of_books_id || '—'),
                    documentReference: String(row.document_reference || invoiceNumber || '—')
                })) as JournalHeader[];

                if (!normalizedHeaders.length) {
                    setEntries([]);
                    setLines([]);
                    setEmptyMessage('Journal entry not found for this document. Please check posting status or re-post.');
                    return;
                }

                setEntries(normalizedHeaders);
                const firstEntry = normalizedHeaders[0];
                setSelectedEntryId((prev) => prev || firstEntry.id);
            } catch (e: any) {
                setError(e?.message || 'Unable to fetch journal entry.');
                setLines([]);
            } finally {
                setIsLoading(false);
            }
        };

        load();
    }, [isOpen, invoiceId, documentType, canView, isPosted, referenceType, invoiceNumber]);

    useEffect(() => {
        if (!isOpen || !selectedEntryId || !isPosted) return;
        const loadLines = async () => {
            setIsLoading(true);
            try {
                let lineRows: any[] = [];

                const byHeaderId = await supabase
                    .from('journal_entry_lines')
                    .select('*')
                    .eq('journal_entry_id', selectedEntryId)
                    .order('id', { ascending: true });

                if (isMissingTableError(byHeaderId.error, 'journal_entry_lines')) {
                    setLines([]);
                    setEmptyMessage('Journal lines table is missing in this environment. Please run accounting journal migrations and refresh schema cache.');
                    return;
                }

                if (!byHeaderId.error && byHeaderId.data?.length) {
                    lineRows = byHeaderId.data;
                } else {
                    const documentTypes = [documentType, referenceType];
                    for (const candidate of referenceCandidates) {
                        for (const docTypeCandidate of documentTypes) {
                            const byReference = await supabase
                                .from('journal_entry_lines')
                                .select('*')
                                .eq('reference_document_id', candidate)
                                .eq('document_type', docTypeCandidate)
                                .order('id', { ascending: true });

                            if (byReference.error) throw byReference.error;

                            if (byReference.data?.length) {
                                lineRows = byReference.data.filter((row: any) => String(row.journal_entry_id || '') === selectedEntryId || !row.journal_entry_id);
                                if (lineRows.length) break;
                            }
                        }

                        if (lineRows.length) break;
                    }
                }

                const mapped: JournalLine[] = (lineRows || []).map((row: any, idx: number) => ({
                    id: String(row.id || idx),
                    glCode: String(row.gl_code || row.account_code || row.ledger_code || ''),
                    glName: String(row.gl_name || row.account_name || row.ledger_name || ''),
                    debit: normalizeNumber(row.debit || row.debit_amount),
                    credit: normalizeNumber(row.credit || row.credit_amount),
                }));

                setLines(mapped);
            } catch (e: any) {
                setError(e?.message || 'Unable to fetch journal entry.');
                setLines([]);
            } finally {
                setIsLoading(false);
            }
        };

        loadLines();
    }, [isOpen, selectedEntryId, documentType, isPosted, referenceCandidates, referenceType]);

    const totals = useMemo(() => {
        const totalDebit = lines.reduce((sum, row) => sum + row.debit, 0);
        const totalCredit = lines.reduce((sum, row) => sum + row.credit, 0);
        return {
            totalDebit,
            totalCredit,
            balanced: Math.abs(totalDebit - totalCredit) < 0.005,
        };
    }, [lines]);

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="View Journal Entry" widthClass="max-w-5xl">
            <div className="p-4 space-y-4 overflow-auto text-xs print:p-0">
                <div id="journal-print-area" className="space-y-4 print:p-8 print:bg-white">
                    <div className="hidden print:block mb-6 border-b-2 border-gray-800 pb-4">
                        <h1 className="text-xl font-bold uppercase">Accounting Journal Entry</h1>
                        <p className="text-[10px] text-gray-500 italic">Generated from {currentUser?.pharmacy_name || 'ERP System'}</p>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3 print:grid-cols-3">
                        <div className="border border-gray-200 p-2"><p className="text-gray-500 uppercase text-[10px]">Company</p><p className="font-bold">{selectedHeader?.company || '—'}</p></div>
                        <div className="border border-gray-200 p-2"><p className="text-gray-500 uppercase text-[10px]">Set of Books</p><p className="font-bold">{selectedHeader?.setOfBooks || '—'}</p></div>
                        <div className="border border-gray-200 p-2"><p className="text-gray-500 uppercase text-[10px]">Document Type</p><p className="font-bold">{documentType === 'SALES' ? 'Sales' : 'Purchase'}</p></div>
                        <div className="border border-gray-200 p-2"><p className="text-gray-500 uppercase text-[10px]">Document / Voucher No</p><p className="font-bold">{invoiceNumber || '—'}</p></div>
                        <div className="border border-gray-200 p-2"><p className="text-gray-500 uppercase text-[10px]">Posting Date</p><p className="font-bold">{selectedHeader?.postingDate ? new Date(selectedHeader.postingDate).toLocaleDateString() : '—'}</p></div>
                        <div className="border border-gray-200 p-2"><p className="text-gray-500 uppercase text-[10px]">Status</p><p className="font-bold">{selectedHeader?.status || (isPosted ? 'Posted' : 'Draft')}</p></div>
                    </div>

                    {!!entries.length && (
                        <div className="border border-gray-200 bg-gray-50 p-2 flex flex-wrap items-center gap-2 no-print">
                            <span className="text-[11px] font-bold uppercase text-gray-600">Journal Entry No(s)</span>
                            {entries.map((entry) => (
                                <button
                                    key={entry.id}
                                    type="button"
                                    onClick={() => setSelectedEntryId(entry.id)}
                                    className={`px-2 py-1 border text-[11px] font-bold ${selectedEntryId === entry.id ? 'bg-primary text-white border-primary' : 'bg-white border-gray-300 text-gray-700'}`}
                                    title={entry.status.toLowerCase().includes('revers') ? 'Reversal Entry' : 'Journal Entry'}
                                >
                                    {entry.entryNumber} ({entry.status})
                                </button>
                            ))}
                        </div>
                    )}

                    <div className="hidden print:block py-2 bg-gray-100 border-y border-gray-300">
                        <span className="text-[11px] font-bold uppercase px-2">Journal ID: {selectedHeader?.entryNumber}</span>
                    </div>

                    {isLoading && <div className="p-4 border border-blue-200 bg-blue-50 text-blue-700 no-print">Loading accounting entry...</div>}
                    {!isLoading && error && <div className="p-4 border border-red-200 bg-red-50 text-red-700 no-print">{error}</div>}
                    {!isLoading && !error && emptyMessage && <div className="p-4 border border-amber-200 bg-amber-50 text-amber-800 no-print">{emptyMessage}</div>}

                    {!isLoading && !error && !emptyMessage && (
                        <>
                            <div className="overflow-x-auto border border-gray-200 print:border-gray-800">
                                <table className="min-w-full text-xs">
                                    <thead className="bg-gray-100 uppercase print:bg-gray-200">
                                        <tr className="print:border-b-2 print:border-gray-800">
                                            <th className="p-2 text-left">GL Code</th>
                                            <th className="p-2 text-left">GL Name</th>
                                            <th className="p-2 text-right">Debit</th>
                                            <th className="p-2 text-right">Credit</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {lines.map((line) => (
                                            <tr key={line.id} className="border-t print:border-gray-300">
                                                <td className="p-2 font-mono">{line.glCode || '—'}</td>
                                                <td className="p-2">{line.glName || '—'}</td>
                                                <td className="p-2 text-right font-mono">{line.debit.toFixed(2)}</td>
                                                <td className="p-2 text-right font-mono">{line.credit.toFixed(2)}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 print:grid-cols-3">
                                <div className="border border-gray-200 p-2 print:border-gray-800"><p className="text-gray-500 uppercase text-[10px]">Total Debit</p><p className="font-bold">{totals.totalDebit.toFixed(2)}</p></div>
                                <div className="border border-gray-200 p-2 print:border-gray-800"><p className="text-gray-500 uppercase text-[10px]">Total Credit</p><p className="font-bold">{totals.totalCredit.toFixed(2)}</p></div>
                                <div className={`border p-2 ${totals.balanced ? 'border-emerald-200 bg-emerald-50 print:bg-white print:border-gray-800' : 'border-red-200 bg-red-50'}`}><p className="text-gray-500 uppercase text-[10px]">Must Balance</p><p className="font-bold">{totals.balanced ? 'Balanced' : 'Not Balanced'}</p></div>
                            </div>
                        </>
                    )}

                    <div className="hidden print:block pt-12">
                        <div className="flex justify-between">
                            <div className="text-center">
                                <div className="w-40 border-b border-black"></div>
                                <p className="text-[10px] mt-1 font-bold uppercase">Prepared By</p>
                            </div>
                            <div className="text-center">
                                <div className="w-40 border-b border-black"></div>
                                <p className="text-[10px] mt-1 font-bold uppercase">Authorized Signatory</p>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="flex flex-wrap justify-end gap-2 pt-2 border-t border-gray-200 no-print">
                    <button type="button" onClick={() => window.print()} className="px-3 py-1 border border-gray-300 font-bold uppercase hover:bg-gray-50">Print Journal</button>
                    <button type="button" disabled className="px-3 py-1 border border-gray-200 text-gray-400 font-bold uppercase cursor-not-allowed" title="Open full journal entry from accounting module">Open Full Journal Entry</button>
                    <button type="button" onClick={() => window.print()} className="px-3 py-1 border border-gray-300 font-bold uppercase hover:bg-gray-50">Export to PDF</button>
                </div>
            </div>

            <style>{`
                @media print {
                    @page {
                        margin: 10mm;
                        size: A4 portrait;
                    }
                    /* Hide EVERYTHING in the app */
                    #root, .no-print, header, footer, sidebar, nav {
                        display: none !important;
                    }
                    /* Hide modal chrome (overlays, headers, buttons) */
                    div[class*="fixed"], div[class*="bg-black/40"] {
                        background: none !important;
                        position: static !important;
                        display: block !important;
                        padding: 0 !important;
                        margin: 0 !important;
                    }
                    div[class*="shadow-"], button {
                        display: none !important;
                    }
                    /* The container for the modal content needs to be stripped of its styling */
                    div[class*="bg-[var(--modal-bg-light)]"] {
                        border: none !important;
                        box-shadow: none !important;
                        display: block !important;
                        width: 100% !important;
                        max-width: none !important;
                        max-height: none !important;
                        position: static !important;
                    }
                    /* Reset the print area to be the ONLY thing visible */
                    #journal-print-area {
                        display: block !important;
                        visibility: visible !important;
                        width: 100% !important;
                        color: #000 !important;
                        background: #fff !important;
                        padding: 0 !important;
                        margin: 0 !important;
                    }
                    #journal-print-area * {
                        visibility: visible !important;
                        color: #000 !important;
                    }
                    /* Ensure table data is visible and structured */
                    #journal-print-area table {
                        width: 100% !important;
                        border-collapse: collapse !important;
                        margin-bottom: 20px !important;
                    }
                    #journal-print-area th, #journal-print-area td {
                        border: 1px solid #000 !important;
                        padding: 8px !important;
                        text-align: left !important;
                    }
                    #journal-print-area .text-right {
                        text-align: right !important;
                    }
                    /* Fix grid layout for print */
                    .print\\:grid-cols-3 {
                        display: flex !important;
                        flex-wrap: wrap !important;
                        gap: 10px !important;
                    }
                    .print\\:grid-cols-3 > div {
                        flex: 1 1 30% !important;
                        border: 1px solid #000 !important;
                    }
                    .hidden.print\\:block {
                        display: block !important;
                    }
                }
            `}</style>
        </Modal>
    );
};

export default JournalEntryViewerModal;
